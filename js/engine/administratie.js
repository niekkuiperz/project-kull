// Verwerkt de hele administratie: alle leningen, signaleringen ("aandacht
// nodig"), saldi en jaaroverzichten. Pure functies zonder opslag of scherm.

import { verwerkLening, saldoBeginDag, saldoEindeDag, AFLOSSINGSVORMEN, FREQUENTIES, einddatumNodig } from './verwerking.js';
import { plusDagen, isGeldig, formatDatum } from './datum.js';
import { naarCenten, formatEuro } from './geld.js';

export function legeAdministratie() {
  return {
    versie: 1,
    geldgevers: [
      { id: 'prive', naam: 'Privé' },
      { id: 'bv', naam: 'BV' },
    ],
    leners: [],
    leningen: [],
    ontvangsten: [],
  };
}

export function regelsPerLening(data) {
  const map = new Map();
  for (const o of data.ontvangsten) {
    (o.regels || []).forEach((r, i) => {
      if (!map.has(r.lening_id)) map.set(r.lening_id, []);
      map.get(r.lening_id).push({
        ontvangst_id: o.id, regel: i, datum: o.datum, bedrag: r.bedrag, rente: r.rente ?? null, aflossing: r.aflossing ?? null,
      });
    });
  }
  return map;
}

export function normaliseerIban(iban) {
  return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

// F-11: stelt op basis van een bekende tegenrekening een lener voor.
export function stelLenerVoor(iban, leners) {
  const n = normaliseerIban(iban);
  if (!n) return null;
  return leners.find((l) => (l.tegenrekeningen || []).some((t) => normaliseerIban(t) === n)) || null;
}

function lenerNamen(data, ids) {
  return (ids || []).map((id) => data.leners.find((l) => l.id === id)?.naam || '?').join(', ');
}

export function verwerkAlles(data, peildatum) {
  const regels = regelsPerLening(data);
  const resultaten = new Map();
  for (const lening of data.leningen) {
    resultaten.set(lening.id, verwerkLening(lening, regels.get(lening.id) || [], peildatum));
  }
  const aandacht = maakSignalen(data, resultaten, peildatum);
  return { resultaten, aandacht, totalen: maakTotalen(data, resultaten), peildatum };
}

function maakTotalen(data, resultaten) {
  const perGeldgever = Object.fromEntries(data.geldgevers.map((g) => [g.id, 0]));
  const perLener = Object.fromEntries(data.leners.map((l) => [l.id, 0]));
  let totaal = 0;
  let lopend = 0;
  for (const [id, r] of resultaten) {
    const lening = data.leningen.find((l) => l.id === id);
    perGeldgever[lening.geldgever_id] = (perGeldgever[lening.geldgever_id] || 0) + r.saldo;
    // Een gezamenlijke lening telt bij elke lener volledig mee (hoofdelijk).
    for (const lid of lening.lener_ids || []) perLener[lid] = (perLener[lid] || 0) + r.saldo;
    totaal += r.saldo;
    if ((lening.status || 'lopend') === 'lopend') lopend += 1;
  }
  return { perGeldgever, perLener, totaal, aantalLopend: lopend };
}

const ERNST_VOLGORDE = { hoog: 0, middel: 1, info: 2 };

function maakSignalen(data, resultaten, peildatum) {
  const lijst = [];
  const voeg = (s) => lijst.push(s);

  for (const lening of data.leningen) {
    const r = resultaten.get(lening.id);
    const basis = { lening_id: lening.id, lening_nummer: lening.nummer, leners: lenerNamen(data, lening.lener_ids) };
    const status = lening.status || 'lopend';

    for (const s of r.signalen) {
      voeg({ ...basis, ernst: s.ernst === 'fout' ? 'hoog' : 'middel', soort: 'gegevens', tekst: s.tekst, verschil: null });
    }

    if (r.saldo < 0) {
      voeg({ ...basis, ernst: 'hoog', soort: 'saldo', tekst: 'Er is meer afgelost dan er openstond.', verschil: -r.saldo });
    }
    if (status === 'lopend' && r.saldo === 0 && r.mutaties.some((m) => m.soort === 'aflossing' || m.soort === 'kwijtschelding')) {
      voeg({ ...basis, ernst: 'info', soort: 'status', tekst: 'Saldo is nul. Zet de status van deze lening op afgelost.', verschil: null });
    }
    if (status !== 'lopend' && r.saldo > 0) {
      voeg({ ...basis, ernst: 'middel', soort: 'status', tekst: `Status is ${status}, maar er staat nog ${formatEuro(r.saldo)} open.`, verschil: null });
    }

    if (status === 'lopend') {
      const achter = r.termijnen.filter((t) => t.status === 'achterstand');
      if (achter.length) {
        const bedrag = achter.reduce((s, t) => s + t.open, 0);
        voeg({
          ...basis, ernst: 'hoog', soort: 'achterstand',
          tekst: `${achter.length} termijn${achter.length > 1 ? 'en' : ''} in achterstand, oudste vervaldatum ${formatDatum(achter[0].vervaldatum)}.`,
          verschil: -bedrag,
        });
      }
      for (const t of r.termijnen.filter((x) => x.status === 'verlopen' || x.status === 'te_laag')) {
        voeg({
          ...basis, ernst: 'middel', soort: 'te_laat',
          tekst: t.status === 'te_laag'
            ? `Termijn van ${formatDatum(t.vervaldatum)} is te laag betaald.`
            : `Termijn van ${formatDatum(t.vervaldatum)} is nog niet ontvangen.`,
          verschil: -t.open,
        });
      }
    }

    for (const o of r.ontvangsten) {
      if (o.wijze === 'te_beoordelen') {
        voeg({
          ...basis, ernst: 'hoog', soort: 'beoordelen', ontvangst_id: o.ontvangst_id,
          tekst: `Ontvangst van ${formatEuro(o.bedrag)} op ${formatDatum(o.datum)}: ${o.reden} Verdeel hem handmatig over rente en aflossing.`,
          verschil: o.verwacht === null ? null : o.bedrag - o.verwacht,
        });
      } else if (o.wijze === 'voor_start') {
        voeg({ ...basis, ernst: 'info', soort: 'voor_start', ontvangst_id: o.ontvangst_id, tekst: `${formatDatum(o.datum)}: ${o.reden}`, verschil: null });
      }
      if (o.extra_aflossing > 0) {
        voeg({
          ...basis, ernst: 'info', soort: 'hoger', ontvangst_id: o.ontvangst_id,
          tekst: `Hoger dan verwacht: ${formatEuro(o.extra_aflossing)} van de ontvangst op ${formatDatum(o.datum)} is als extra aflossing verwerkt.${
            ['annuitair', 'lineair'].includes(lening.aflossingsvorm) ? ' Het schema van de volgende termijnen blijft gelijk; leg zo nodig een wijziging vast.' : ''}`,
          verschil: o.extra_aflossing,
        });
      }
      if (o.overschot_rente > 0) {
        voeg({
          ...basis, ernst: 'middel', soort: 'hoger', ontvangst_id: o.ontvangst_id,
          tekst: `Er is ${formatEuro(o.overschot_rente)} meer rente ontvangen dan er openstond (ontvangst ${formatDatum(o.datum)}).`,
          verschil: o.overschot_rente,
        });
      }
    }

    // F-17: naderende herziening of einddatum (90 dagen vooruit).
    const grens = plusDagen(peildatum, 90);
    if (status === 'lopend' && lening.herzieningsdatum && lening.herzieningsdatum >= peildatum && lening.herzieningsdatum <= grens) {
      voeg({ ...basis, ernst: 'info', soort: 'herziening', tekst: `Renteherziening op ${formatDatum(lening.herzieningsdatum)}.`, verschil: null });
    }
    if (status === 'lopend' && lening.einddatum && lening.einddatum >= peildatum && lening.einddatum <= grens) {
      voeg({ ...basis, ernst: 'info', soort: 'einde', tekst: `Lening loopt af op ${formatDatum(lening.einddatum)}.`, verschil: null });
    }
  }

  // F-09: dubbele invoer.
  for (const groep of zoekDubbele(data)) {
    const lening = data.leningen.find((l) => l.id === groep.lening_id);
    voeg({
      lening_id: groep.lening_id, lening_nummer: lening?.nummer, leners: lenerNamen(data, lening?.lener_ids),
      ernst: 'hoog', soort: 'dubbel', ontvangst_id: groep.ontvangst_ids[1],
      tekst: `Mogelijk dubbel ingevoerd: ${groep.ontvangst_ids.length} keer ${formatEuro(naarCenten(groep.bedrag))} op ${formatDatum(groep.datum)}.`,
      verschil: null,
    });
  }

  // Ontvangst toegewezen aan een lening van een andere lener.
  for (const o of data.ontvangsten) {
    for (const r of o.regels || []) {
      const lening = data.leningen.find((l) => l.id === r.lening_id);
      if (lening && o.lener_id && !(lening.lener_ids || []).includes(o.lener_id)) {
        voeg({
          lening_id: lening.id, lening_nummer: lening.nummer, leners: lenerNamen(data, lening.lener_ids), ernst: 'middel', soort: 'koppeling',
          ontvangst_id: o.id, tekst: `Ontvangst van ${formatDatum(o.datum)} staat op naam van ${lenerNamen(data, [o.lener_id])}, maar is geboekt op deze lening.`, verschil: null,
        });
      }
    }
  }

  return lijst.sort((a, b) => ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst]);
}

export function zoekDubbele(data, extra) {
  const groepen = new Map();
  const alle = extra ? [...data.ontvangsten.filter((o) => o.id !== extra.id), extra] : data.ontvangsten;
  for (const o of alle) {
    for (const r of o.regels || []) {
      const sleutel = `${r.lening_id}|${o.datum}|${naarCenten(r.bedrag)}`;
      if (!groepen.has(sleutel)) groepen.set(sleutel, { lening_id: r.lening_id, datum: o.datum, bedrag: r.bedrag, ontvangst_ids: [] });
      groepen.get(sleutel).ontvangst_ids.push(o.id);
    }
  }
  return [...groepen.values()].filter((g) => g.ontvangst_ids.length > 1);
}

// ---------------------------------------------------------------------------
// Invoercontrole
// ---------------------------------------------------------------------------
export function controleerLening(l, data) {
  const fouten = [];
  if (!l.nummer) fouten.push('Lening-ID is verplicht.');
  if (data.leningen.some((x) => x.id !== l.id && x.nummer === l.nummer)) fouten.push('Dit lening-ID bestaat al.');
  if (!l.lener_ids?.length) fouten.push('Kies minstens één lener.');
  if (!data.geldgevers.some((g) => g.id === l.geldgever_id)) fouten.push('Kies een geldgever.');
  if (!(Number(l.hoofdsom) > 0)) fouten.push('Hoofdsom moet groter zijn dan nul.');
  if (!isGeldig(l.ingangsdatum)) fouten.push('Ingangsdatum is ongeldig.');
  if (l.einddatum && !isGeldig(l.einddatum)) fouten.push('Einddatum is ongeldig.');
  if (l.einddatum && isGeldig(l.ingangsdatum) && l.einddatum <= l.ingangsdatum) fouten.push('Einddatum moet na de ingangsdatum liggen.');
  if (!AFLOSSINGSVORMEN.includes(l.aflossingsvorm)) fouten.push('Kies een aflossingsvorm.');
  if (!FREQUENTIES.includes(l.frequentie)) fouten.push('Kies een termijnfrequentie.');
  if (!l.einddatum && einddatumNodig({ aflossingsvorm: l.aflossingsvorm, termijnbedrag: naarCenten(l.termijnbedrag) })) {
    fouten.push('Einddatum is verplicht bij lineair en bij annuïtair zonder vast termijnbedrag.');
  }
  for (const w of l.wijzigingen || []) {
    if (w.kwijtschelding !== undefined && w.kwijtschelding !== null && !(Number(w.kwijtschelding) > 0)) {
      fouten.push('Een kwijtschelding of schenking moet groter zijn dan nul.');
    }
  }
  const rente = Number(l.rente);
  if (!Number.isFinite(rente) || rente < 0 || rente > 25) fouten.push('Rente moet tussen 0 en 25 procent liggen.');
  if (l.eerste_vervaldatum && !isGeldig(l.eerste_vervaldatum)) fouten.push('Eerste vervaldatum is ongeldig.');
  if (l.document_url && !/^https?:\/\/\S+$/i.test(String(l.document_url).trim())) fouten.push('De link naar het contract moet beginnen met http:// of https://.');
  if (l.beginstand) {
    if (!isGeldig(l.beginstand.datum)) fouten.push('Datum beginstand is ongeldig.');
    if (!(Number(l.beginstand.saldo) >= 0)) fouten.push('Beginsaldo moet nul of meer zijn.');
  }
  return fouten;
}

export function controleerOntvangst(o, data, peildatum) {
  const fouten = [];
  const waarschuwingen = [];
  if (!isGeldig(o.datum)) fouten.push('Datum is ongeldig.');
  else if (o.datum > peildatum) fouten.push('De datum ligt in de toekomst.');
  const bedrag = naarCenten(o.bedrag);
  if (!(bedrag > 0)) fouten.push('Bedrag moet groter zijn dan nul.');
  if (!o.lener_id) fouten.push('Kies een lener.');
  if (!o.regels?.length) fouten.push('Kies minstens één lening.');
  const som = (o.regels || []).reduce((s, r) => s + (naarCenten(r.bedrag) || 0), 0);
  if (o.regels?.length && som !== bedrag) fouten.push(`De verdeling over leningen (${formatEuro(som)}) telt niet op tot het bedrag (${formatEuro(bedrag)}).`);
  for (const r of o.regels || []) {
    const lening = data.leningen.find((l) => l.id === r.lening_id);
    if (!lening) { fouten.push('Onbekende lening in de verdeling.'); continue; }
    if (!(naarCenten(r.bedrag) > 0)) fouten.push(`Bedrag voor ${lening.nummer} moet groter zijn dan nul.`);
    const hr = r.rente !== null && r.rente !== undefined;
    const ha = r.aflossing !== null && r.aflossing !== undefined;
    if (hr || ha) {
      const s = (naarCenten(r.rente) || 0) + (naarCenten(r.aflossing) || 0);
      if (s !== naarCenten(r.bedrag)) fouten.push(`Rente plus aflossing voor ${lening.nummer} is niet gelijk aan het bedrag.`);
    }
    if (isGeldig(o.datum) && o.datum < (lening.beginstand?.datum || lening.ingangsdatum)) {
      waarschuwingen.push(`De datum ligt vóór de start van ${lening.nummer}; deze ontvangst telt daar niet mee.`);
    }
  }
  if (!fouten.length && zoekDubbele(data, o).some((g) => g.ontvangst_ids.includes(o.id))) {
    waarschuwingen.push('Er staat al een ontvangst met dezelfde lening, datum en hetzelfde bedrag. Controleer of dit geen dubbele invoer is.');
  }
  return { fouten, waarschuwingen };
}

// ---------------------------------------------------------------------------
// Rapportage
// ---------------------------------------------------------------------------
function cijfersJaar(r, jaar) {
  const begin = `${jaar}-01-01`;
  const eind = `${jaar}-12-31`;
  const inJaar = r.mutaties.filter((m) => m.datum >= begin && m.datum <= eind);
  const som = (soort) => inJaar.filter((m) => m.soort === soort).reduce((s, m) => s + m.centen, 0);
  const beginstandInJaar = inJaar.find((m) => m.soort === 'beginstand' && m.datum > begin);
  const rij = {
    begin: beginstandInJaar ? beginstandInJaar.centen : saldoBeginDag(r.mutaties, begin),
    nieuw: som('verstrekking') + som('opname'),
    afgelost: som('aflossing'),
    kwijtgescholden: som('kwijtschelding'),
    rente: som('rente'),
    eind: saldoEindeDag(r.mutaties, eind),
    opmerking: beginstandInJaar ? `Beginstand per ${formatDatum(beginstandInJaar.datum)}` : '',
  };
  rij.klopt = rij.begin + rij.nieuw - rij.afgelost - rij.kwijtgescholden === rij.eind;
  rij.onbeoordeeld = r.ontvangsten.filter((o) => o.wijze === 'te_beoordelen' && o.datum >= begin && o.datum <= eind).length;
  rij.actief = rij.begin !== 0 || rij.eind !== 0 || rij.nieuw !== 0 || rij.afgelost !== 0 || rij.rente !== 0 || rij.kwijtgescholden !== 0;
  return rij;
}

const leegTotaal = () => ({ begin: 0, nieuw: 0, afgelost: 0, kwijtgescholden: 0, rente: 0, eind: 0, onbeoordeeld: 0 });
function telOp(t, rij) {
  for (const k of Object.keys(t)) t[k] += rij[k];
}

// F-18: jaaroverzicht per geldgever voor de accountant.
export function jaaroverzichtGeldgevers(data, verwerking, jaar) {
  return data.geldgevers.map((g) => {
    const rijen = [];
    const totaal = leegTotaal();
    for (const lening of data.leningen.filter((l) => l.geldgever_id === g.id)) {
      const rij = cijfersJaar(verwerking.resultaten.get(lening.id), jaar);
      if (!rij.actief) continue;
      rijen.push({ lening, leners: lenerNamen(data, lening.lener_ids), ...rij });
      telOp(totaal, rij);
    }
    rijen.sort((a, b) => a.lening.nummer.localeCompare(b.lening.nummer, 'nl', { numeric: true }));
    return { geldgever: g, rijen, totaal };
  });
}

// F-20: jaaroverzicht per lener (o.a. voor de eigenwoninglening in de aangifte).
export function jaaroverzichtLener(data, verwerking, jaar, lenerId) {
  const rijen = [];
  const totaal = leegTotaal();
  for (const lening of data.leningen.filter((l) => (l.lener_ids || []).includes(lenerId))) {
    const rij = cijfersJaar(verwerking.resultaten.get(lening.id), jaar);
    if (!rij.actief) continue;
    const geldgever = data.geldgevers.find((g) => g.id === lening.geldgever_id);
    rijen.push({ lening, geldgever, ...rij });
    telOp(totaal, rij);
  }
  return { lener: data.leners.find((l) => l.id === lenerId), rijen, totaal };
}

export function naarCsv(kolommen, rijen) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Puntkomma als scheidingsteken: dat opent goed in een Nederlandse Excel.
  return [kolommen.map((k) => esc(k.titel)).join(';'), ...rijen.map((r) => kolommen.map((k) => esc(k.waarde(r))).join(';'))].join('\r\n');
}
