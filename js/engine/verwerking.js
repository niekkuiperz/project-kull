// Rekenkern van de leningadministratie.
//
// Uitgangspunten (zie ook README, paragraaf "Rekenregels"):
// - Afspraken en betalingen staan los van elkaar. Uit de afspraken volgt een
//   schema van verwachte termijnen; de ontvangsten worden daartegen afgezet.
// - Een ontvangst die precies overeenkomt met de open termijn(en) wordt
//   automatisch verdeeld over rente en aflossing volgens het schema (F-12).
//   Wijkt het bedrag af, dan wordt de ontvangst NIET verdeeld maar gemeld als
//   "te beoordelen". Pas na een handmatige verdeling telt hij mee.
// - Achterstand: een termijn die een maand na de vervaldatum niet volledig is
//   ontvangen (F-15).
// - Rente per periode = jaarrente / aantal termijnen per jaar, over het saldo
//   aan het begin van de periode (nominale methode). De eerste periode telt
//   altijd als volle periode.

import {
  PERIODES_PER_JAAR, termijnDatum, eenPeriodeNa, plusDagen, plusMaanden,
} from './datum.js';
import { naarCenten } from './geld.js';

// Een ontvangst mag zoveel dagen vóór de vervaldatum binnenkomen en toch bij
// die termijn horen (iemand betaalt de termijn van 1 maart al op 27 februari).
export const MARGE_VOORUIT_DAGEN = 45;

export const AFLOSSINGSVORMEN = ['annuitair', 'lineair', 'aflossingsvrij'];

// Tot en met versie 1.1.0 bestond ook "vrij aflossen". Die vorm is opgegaan in
// aflossingsvrij: daar verlaagt een extra aflossing al de rente vanaf de
// volgende termijn en is de einddatum niet verplicht. Oude gegevens met 'vrij'
// worden als aflossingsvrij gelezen.
export function normaliseerVorm(vorm) {
  return vorm === 'vrij' ? 'aflossingsvrij' : vorm;
}
export const FREQUENTIES = ['week', 'maand', 'kwartaal', 'jaar'];

// ---------------------------------------------------------------------------
// Segmenten: de oorspronkelijke afspraak plus elke wijziging (F-04) vormen
// opeenvolgende stukken met elk hun eigen voorwaarden.
// ---------------------------------------------------------------------------
export function maakSegmenten(lening) {
  const start = lening.beginstand?.datum || lening.ingangsdatum;
  const anker = lening.eerste_vervaldatum || eenPeriodeNa(lening.ingangsdatum, lening.frequentie);
  const basis = {
    rente: Number(lening.rente || 0),
    aflossingsvorm: normaliseerVorm(lening.aflossingsvorm),
    frequentie: lening.frequentie,
    einddatum: lening.einddatum || null,
    termijnbedrag: naarCenten(lening.termijnbedrag),
    anker,
  };
  const segmenten = [{
    start,
    beginbedrag: lening.beginstand ? naarCenten(lening.beginstand.saldo) : naarCenten(lening.hoofdsom),
    opname: 0,
    kwijtschelding: 0,
    params: basis,
    wijziging: null,
    isBeginstand: Boolean(lening.beginstand),
  }];
  const wijzigingen = [...(lening.wijzigingen || [])]
    .filter((w) => w.datum > start)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const heeft = (x) => x !== undefined && x !== null && x !== '';
  let vorige = basis;
  for (const w of wijzigingen) {
    const params = { ...vorige };
    if (heeft(w.rente)) params.rente = Number(w.rente);
    if (w.aflossingsvorm) params.aflossingsvorm = normaliseerVorm(w.aflossingsvorm);
    if (w.einddatum) params.einddatum = w.einddatum;
    if (heeft(w.termijnbedrag)) {
      params.termijnbedrag = naarCenten(w.termijnbedrag);
    } else if (w.aflossingsvorm || w.einddatum || heeft(w.rente)) {
      // Een nieuwe rente of looptijd betekent een nieuw termijnbedrag, tenzij
      // er uitdrukkelijk een vast bedrag is afgesproken.
      params.termijnbedrag = w.termijnbedrag_behouden ? vorige.termijnbedrag : null;
    }
    if (w.frequentie && w.frequentie !== vorige.frequentie) {
      params.frequentie = w.frequentie;
      params.anker = eenPeriodeNa(w.datum, w.frequentie);
    }
    segmenten.push({
      start: w.datum,
      beginbedrag: null, // volgt uit het verloop van het vorige segment
      opname: naarCenten(w.extra_opname) || 0,
      kwijtschelding: naarCenten(w.kwijtschelding) || 0,
      params,
      wijziging: w,
    });
    vorige = params;
  }
  return segmenten;
}

// inclusief: een termijn die precies op de startdatum vervalt hoort erbij.
// Dat geldt voor een beginstand (saldo per het begin van die dag; de termijn
// van die dag wordt dus nog betaald), niet voor een nieuwe lening of wijziging.
function termijnDatums(params, start, grens, inclusief) {
  const datums = [];
  const { anker, frequentie, einddatum } = params;
  for (let k = 0; k < 20000; k += 1) {
    const d = termijnDatum(anker, frequentie, k);
    if (inclusief ? d < start : d <= start) continue;
    if (einddatum && d > einddatum) break;
    if (!einddatum && d > grens) break;
    datums.push(d);
  }
  if (einddatum && einddatum > start && (datums.length === 0 || datums[datums.length - 1] < einddatum)) {
    datums.push(einddatum); // laatste (korte) periode eindigt op de einddatum
  }
  return datums;
}

// Zonder einddatum is een schema alleen te berekenen bij aflossingsvrij
// (doorlopende rentetermijnen) en annuïtair met een vast
// termijnbedrag (de looptijd volgt dan uit het bedrag). W-005.
export function einddatumNodig(params) {
  const vorm = normaliseerVorm(params.aflossingsvorm);
  return vorm === 'lineair' || (vorm === 'annuitair' && !params.termijnbedrag);
}

// Verste datum waarvoor termijnen worden gemaakt bij annuïtair met een vast
// termijnbedrag en zonder einddatum.
const VERSTE_DATUM = '2199-12-31';

function nieuweTermijn(segment, vervaldatum, rente, aflossing) {
  return {
    segment, vervaldatum, rente, aflossing,
    ontvangen_rente: 0, ontvangen_aflossing: 0, betalingen: [],
  };
}

// Genereert de verwachte termijnen van één segment.
function genereerTermijnen(segment, segIndex, P, volgende, grensVrij, signalen) {
  const { params } = segment;
  const ppy = PERIODES_PER_JAAR[params.frequentie];
  const i = params.rente / 100 / ppy;
  const vorm = params.aflossingsvorm;
  const termijnen = [];

  if (P <= 0) return termijnen;

  if (einddatumNodig(params) && !params.einddatum) {
    signalen.push({ soort: 'gegevens', ernst: 'fout', tekst: 'Einddatum ontbreekt; zonder einddatum is bij deze aflossingsvorm geen schema te berekenen.' });
    return termijnen;
  }
  const open = !params.einddatum;

  if (params.einddatum && params.einddatum <= segment.start) {
    // Looptijd is al verstreken: het hele saldo is opeisbaar op de einddatum.
    termijnen.push(nieuweTermijn(segIndex, params.einddatum, 0, P));
    return termijnen;
  }

  // Annuïtair met vast bedrag en zonder einddatum: termijnen tot de lening is
  // afgelost. Kan het bedrag de rente niet dekken, dan alleen tot de grens.
  const onbegrensd = open && vorm === 'annuitair' && params.termijnbedrag > Math.round(P * i);
  const datums = termijnDatums(params, segment.start, onbegrensd ? VERSTE_DATUM : grensVrij, segment.isBeginstand);
  const n = datums.length;
  if (n === 0) return termijnen;

  if (vorm === 'annuitair') {
    let betaling = params.termijnbedrag;
    if (!betaling) {
      betaling = i === 0 ? Math.round(P / n) : Math.round((P * i) / (1 - Math.pow(1 + i, -n)));
    }
    let B = P;
    let gemeld = false;
    for (let k = 0; k < n && B > 0; k += 1) {
      const rente = Math.round(B * i);
      let afl = betaling - rente;
      if (afl <= 0 && (afl < 0 || open)) {
        afl = 0;
        if (!gemeld) {
          signalen.push({ soort: 'gegevens', ernst: 'waarschuwing', tekst: 'Het vaste termijnbedrag is niet hoger dan de rente; er wordt niets afgelost.' });
          gemeld = true;
        }
      }
      if ((!open && k === n - 1) || afl > B) afl = B;
      // Zonder einddatum: een afrondingsrestje van hooguit een euro gaat mee
      // in deze termijn in plaats van een extra termijn van een paar cent.
      if (open && afl > 0 && B - afl <= 100) afl = B;
      termijnen.push(nieuweTermijn(segIndex, datums[k], rente, afl));
      B -= afl;
    }
  } else if (vorm === 'lineair') {
    const a = Math.round(P / n);
    let B = P;
    for (let k = 0; k < n && B > 0; k += 1) {
      const rente = Math.round(B * i);
      const afl = k === n - 1 ? B : Math.min(a, B);
      termijnen.push(nieuweTermijn(segIndex, datums[k], rente, afl));
      B -= afl;
    }
  } else if (vorm === 'aflossingsvrij') {
    for (let k = 0; k < n; k += 1) {
      const rente = Math.round(P * i);
      const laatste = !open && k === n - 1;
      if (rente > 0 || laatste) termijnen.push(nieuweTermijn(segIndex, datums[k], rente, laatste ? P : 0));
    }
  } else {
    signalen.push({ soort: 'gegevens', ernst: 'fout', tekst: `Onbekende aflossingsvorm: ${vorm}` });
  }

  return volgende ? termijnen.filter((t) => t.vervaldatum <= volgende) : termijnen;
}

const openRente = (t) => t.rente - t.ontvangen_rente;
const openAflossing = (t) => t.aflossing - t.ontvangen_aflossing;
const openTotaal = (t) => openRente(t) + openAflossing(t);

// Probeert een ontvangst zonder handmatige verdeling te koppelen aan de open
// termijnen. Geeft {rente, aflossing} terug, of null als het bedrag niet past.
function automatischeVerdeling(centen, open, betaalwijze) {
  if (open.length === 0) return null;
  if (betaalwijze === 'apart') {
    const tR = open.find((t) => openRente(t) > 0);
    const tA = open.find((t) => openAflossing(t) > 0);
    if (tR && centen === openRente(tR)) return { rente: centen, aflossing: 0 };
    if (tA && centen === openAflossing(tA)) return { rente: 0, aflossing: centen };
    if (tR && tR === tA && centen === openTotaal(tR)) {
      return { rente: openRente(tR), aflossing: openAflossing(tR) };
    }
    return null;
  }
  // Rente en aflossing samen: één termijn, of een inhaalbetaling die precies
  // de oudste paar open termijnen dekt.
  let r = 0;
  let a = 0;
  for (let k = 0; k < Math.min(open.length, 6); k += 1) {
    r += openRente(open[k]);
    a += openAflossing(open[k]);
    if (centen === r + a) return { rente: r, aflossing: a };
    if (r + a > centen) break;
  }
  return null;
}

// Verdeelt rente en aflossing over de open termijnen, oudste eerst.
// Bij een handmatige verdeling gaat aflossing alleen naar termijnen die al
// vervallen zijn of waarvan deze ontvangst ook de rente betaalt. Zo wordt een
// extra aflossing niet stilletjes als "vooruitbetaalde termijn" geboekt, maar
// als extra aflossing die het saldo verlaagt.
function verdeel(ontvangst, rente, aflossing, open, beperkt) {
  let restR = rente;
  const renteHier = new Map();
  for (const t of open) {
    const x = Math.min(restR, Math.max(0, openRente(t)));
    if (x > 0) {
      renteHier.set(t, x);
      restR -= x;
    }
  }
  let restA = aflossing;
  for (const t of open) {
    const mag = !beperkt || t.vervaldatum <= ontvangst.datum || renteHier.has(t);
    const y = mag ? Math.min(restA, Math.max(0, openAflossing(t))) : 0;
    const x = renteHier.get(t) || 0;
    if (x > 0 || y > 0) {
      t.ontvangen_rente += x;
      t.ontvangen_aflossing += y;
      t.betalingen.push({ ontvangst_id: ontvangst.ontvangst_id, datum: ontvangst.datum, rente: x, aflossing: y });
      restA -= y;
    }
  }
  return { overschot_rente: restR, extra_aflossing: restA };
}

function verwerkOntvangst(o, termijnen, betaalwijze) {
  const horizon = plusDagen(o.datum, MARGE_VOORUIT_DAGEN);
  const open = termijnen
    .filter((t) => t.vervaldatum <= horizon && openTotaal(t) > 0)
    .sort((x, y) => x.vervaldatum.localeCompare(y.vervaldatum));
  const resultaat = {
    ontvangst_id: o.ontvangst_id,
    regel: o.regel,
    datum: o.datum,
    bedrag: o.centen,
    rente: 0,
    aflossing: 0,
    extra_aflossing: 0,
    overschot_rente: 0,
    wijze: 'te_beoordelen',
    reden: '',
    verwacht: open.length ? openTotaal(open[0]) : null,
  };

  let verdeling;
  if (o.rente_centen !== null || o.aflossing_centen !== null) {
    const r = o.rente_centen ?? 0;
    const a = o.aflossing_centen ?? 0;
    if (r < 0 || a < 0 || r + a !== o.centen) {
      resultaat.reden = 'De handmatige verdeling over rente en aflossing telt niet op tot het bedrag.';
      return resultaat;
    }
    verdeling = { rente: r, aflossing: a };
    resultaat.wijze = 'handmatig';
  } else {
    verdeling = automatischeVerdeling(o.centen, open, betaalwijze);
    if (!verdeling) {
      resultaat.reden = open.length
        ? 'Het bedrag wijkt af van de verwachte termijn.'
        : 'Er staat geen termijn open waar deze ontvangst bij past.';
      return resultaat;
    }
    resultaat.wijze = 'automatisch';
  }

  resultaat.rente = verdeling.rente;
  resultaat.aflossing = verdeling.aflossing;
  Object.assign(resultaat, verdeel(o, verdeling.rente, verdeling.aflossing, open, resultaat.wijze === 'handmatig'));
  return resultaat;
}

// W-001: na een extra aflossing wordt het schema opnieuw berekend over het
// lagere saldo. De termijn waarin de extra aflossing valt, blijft zoals hij
// was (rente over het saldo aan het begin van de periode); vanaf de volgende
// termijn geldt het nieuwe saldo. Termijnen die
// al (deels) betaald zijn, blijven staan.
// - annuïtair zonder vast bedrag: nieuw termijnbedrag, zelfde einddatum;
// - annuïtair met vast bedrag: zelfde bedrag, kortere looptijd;
// - lineair: lagere aflossing per termijn, zelfde einddatum;
// - aflossingsvrij: lagere rente.
function herberekenNaExtra({ seg, segIndex, P, segTermijnen, extra, datum, volgende, grensVrij, signalen, termijnen }) {
  const eerste = segTermijnen.find((t) => t.vervaldatum >= datum);
  if (!eerste) return segTermijnen;
  let vanaf = eerste.vervaldatum;
  for (const t of segTermijnen) {
    if (t.betalingen.length && t.vervaldatum > vanaf) vanaf = t.vervaldatum;
  }
  const behouden = segTermijnen.filter((t) => t.vervaldatum <= vanaf);
  const weg = segTermijnen.filter((t) => t.vervaldatum > vanaf);
  if (!weg.length) return segTermijnen;
  for (const t of weg) termijnen.splice(termijnen.indexOf(t), 1);
  const rest = P - behouden.reduce((s, t) => s + t.aflossing, 0) - extra;
  const nieuw = rest > 0
    ? genereerTermijnen({ ...seg, start: vanaf, isBeginstand: false }, segIndex, rest, volgende, grensVrij, [], signalen)
    : [];
  termijnen.push(...nieuw);
  return [...behouden, ...nieuw];
}

// Saldo aan het einde van dag d (alle mutaties t/m d).
export function saldoEindeDag(mutaties, d) {
  return mutaties.filter((m) => m.datum <= d).reduce((s, m) => s + teken(m) * m.centen, 0);
}

// Saldo aan het begin van dag d. Een beginstand op d telt mee: die geldt per
// het begin van die dag.
export function saldoBeginDag(mutaties, d) {
  return mutaties
    .filter((m) => m.datum < d || (m.soort === 'beginstand' && m.datum === d))
    .reduce((s, m) => s + teken(m) * m.centen, 0);
}

function teken(m) {
  switch (m.soort) {
    case 'verstrekking': case 'opname': case 'beginstand': return 1;
    case 'aflossing': case 'kwijtschelding': return -1;
    default: return 0; // rente raakt het saldo niet
  }
}

// ---------------------------------------------------------------------------
// Hoofdfunctie: verwerkt één lening met haar ontvangstregels tot de peildatum.
// regels: [{ontvangst_id, regel, datum, bedrag, rente, aflossing}] in euro's.
// ---------------------------------------------------------------------------
export function verwerkLening(lening, regels, peildatum) {
  const signalen = [];
  const mutaties = [];
  const segmenten = maakSegmenten(lening);
  const startDatum = segmenten[0].start;
  const betaalwijze = lening.betaalwijze || 'samen';

  if (lening.beginstand) {
    mutaties.push({ datum: startDatum, soort: 'beginstand', centen: segmenten[0].beginbedrag });
  } else {
    mutaties.push({ datum: lening.ingangsdatum, soort: 'verstrekking', centen: segmenten[0].beginbedrag });
  }

  const ontvangsten = regels
    .map((r) => ({
      ontvangst_id: r.ontvangst_id,
      regel: r.regel ?? 0,
      datum: r.datum,
      centen: naarCenten(r.bedrag),
      rente_centen: naarCenten(r.rente),
      aflossing_centen: naarCenten(r.aflossing),
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || String(a.ontvangst_id).localeCompare(String(b.ontvangst_id)));

  const verwerkt = [];
  let idx = 0;
  while (idx < ontvangsten.length && ontvangsten[idx].datum < startDatum) {
    const o = ontvangsten[idx];
    verwerkt.push({
      ontvangst_id: o.ontvangst_id, regel: o.regel, datum: o.datum, bedrag: o.centen,
      rente: 0, aflossing: 0, extra_aflossing: 0, overschot_rente: 0,
      wijze: 'voor_start',
      reden: lening.beginstand
        ? 'Ontvangst ligt vóór de beginstand en telt niet mee (al verwerkt in het beginsaldo).'
        : 'Ontvangst ligt vóór de ingangsdatum van de lening.',
    });
    idx += 1;
  }

  const laatsteOntvangst = ontvangsten.length ? ontvangsten[ontvangsten.length - 1].datum : peildatum;
  const termijnen = [];
  let P = segmenten[0].beginbedrag;
  let resterend = ontvangsten.slice(idx);

  for (let k = 0; k < segmenten.length; k += 1) {
    const seg = segmenten[k];
    const volgende = segmenten[k + 1]?.start ?? null;
    if (k > 0) {
      if (seg.opname > 0) {
        mutaties.push({ datum: seg.start, soort: 'opname', centen: seg.opname });
        P += seg.opname;
      }
      if (seg.kwijtschelding > 0) {
        // Gedeeltelijke kwijtschelding of schenking (W-002): verlaagt het
        // saldo, telt niet als ontvangen aflossing.
        const x = Math.min(seg.kwijtschelding, Math.max(0, saldoEindeDag(mutaties, seg.start)));
        if (x > 0) mutaties.push({ datum: seg.start, soort: 'kwijtschelding', centen: x });
        if (x < seg.kwijtschelding) {
          signalen.push({ soort: 'gegevens', ernst: 'waarschuwing', tekst: `De kwijtschelding van ${seg.start.split('-').reverse().join('-')} is hoger dan het saldo op die dag; alleen het saldo is kwijtgescholden.` });
        }
        P = Math.max(0, P - x);
      }
    }
    // Ontvangsten tot de volgende wijziging. Een extra aflossing op de dag van
    // de wijziging zelf hoort er ook bij: die moet meetellen in het saldo
    // waarover de nieuwe afspraak wordt berekend (W-001).
    const hoortBij = (o) => volgende === null || o.datum < volgende
      || (o.datum === volgende && o.aflossing_centen > 0);
    const venster = resterend.filter(hoortBij);
    resterend = resterend.filter((o) => !hoortBij(o));
    const grensVrij = eenPeriodeNa(peildatum > laatsteOntvangst ? peildatum : laatsteOntvangst, seg.params.frequentie);
    let segTermijnen = genereerTermijnen(seg, k, P, volgende, grensVrij, signalen);
    termijnen.push(...segTermijnen);

    let extra = 0;
    for (const o of venster) {
      const res = verwerkOntvangst(o, termijnen, betaalwijze);
      verwerkt.push(res);
      extra += res.extra_aflossing;
      if (res.wijze === 'automatisch' || res.wijze === 'handmatig') {
        if (res.rente > 0) mutaties.push({ datum: o.datum, soort: 'rente', centen: res.rente, ontvangst_id: o.ontvangst_id });
        if (res.aflossing > 0) mutaties.push({ datum: o.datum, soort: 'aflossing', centen: res.aflossing, ontvangst_id: o.ontvangst_id });
      }
      if (res.extra_aflossing > 0) {
        segTermijnen = herberekenNaExtra({
          seg, segIndex: k, P, segTermijnen, extra, datum: o.datum, volgende, grensVrij, signalen, termijnen,
        });
      }
    }
    // Contractueel restant als vertrekpunt voor de volgende afspraak.
    P = Math.max(0, P - segTermijnen.reduce((s, t) => s + t.aflossing, 0) - extra);
  }

  if (lening.kwijtschelding_datum) {
    const rest = saldoEindeDag(mutaties, lening.kwijtschelding_datum);
    if (rest > 0) mutaties.push({ datum: lening.kwijtschelding_datum, soort: 'kwijtschelding', centen: rest });
  }

  mutaties.sort((a, b) => a.datum.localeCompare(b.datum));

  // Datum waarop het saldo voor het eerst nul of lager werd.
  let lopend = 0;
  let nulDatum = null;
  for (const m of mutaties) {
    lopend += teken(m) * m.centen;
    if (lopend <= 0 && teken(m) < 0 && !nulDatum) nulDatum = m.datum;
    if (lopend > 0) nulDatum = null;
  }

  termijnen.sort((a, b) => a.vervaldatum.localeCompare(b.vervaldatum) || a.segment - b.segment);
  termijnen.forEach((t, n) => {
    t.nr = n + 1;
    t.totaal = t.rente + t.aflossing;
    t.ontvangen = t.ontvangen_rente + t.ontvangen_aflossing;
    t.open = t.totaal - t.ontvangen;
    t.status = termijnStatus(t, peildatum, nulDatum);
    const laatste = t.betalingen[t.betalingen.length - 1];
    t.laat_betaald = t.open <= 0 && laatste ? laatste.datum > t.vervaldatum : false;
  });

  const saldo = saldoEindeDag(mutaties, peildatum);
  const uniek = signalen.filter((x, n) => signalen.findIndex((y) => y.tekst === x.tekst) === n);
  return { lening, termijnen, ontvangsten: verwerkt, mutaties, saldo, nulDatum, signalen: uniek };
}

function termijnStatus(t, peildatum, nulDatum) {
  if (t.open <= 0) return 'voldaan';
  if (nulDatum && t.vervaldatum > nulDatum) return 'vervallen';
  if (t.vervaldatum > peildatum) return t.ontvangen > 0 ? 'deels' : 'gepland';
  if (peildatum > plusMaanden(t.vervaldatum, 1)) return 'achterstand';
  return t.ontvangen > 0 ? 'te_laag' : 'verlopen';
}

export const STATUS_TEKST = {
  voldaan: 'Voldaan',
  gepland: 'Gepland',
  deels: 'Deels vooruit betaald',
  verlopen: 'Verlopen, nog niet ontvangen',
  te_laag: 'Verlopen, te weinig ontvangen',
  achterstand: 'Achterstand',
  vervallen: 'Niet meer van toepassing',
};
