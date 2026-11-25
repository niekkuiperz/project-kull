// Invoer van ontvangsten (F-08 t/m F-13).

import { esc, euro, datum, opties, nieuwId, meldingen, TEKST, leesGetal, gebruiktVoorTekst } from './hulp.js';
import { controleerOntvangst, stelLenerVoor } from '../engine/administratie.js';
import { plusDagen } from '../engine/datum.js';
import { naarCenten, formatEuro } from '../engine/geld.js';
import { MARGE_VOORUIT_DAGEN } from '../engine/verwerking.js';

const euroInvoer = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

function openTermijnen(app, leningId, rond) {
  const r = app.verwerking.resultaten.get(leningId);
  if (!r) return [];
  const horizon = plusDagen(rond || app.peildatum, MARGE_VOORUIT_DAGEN);
  return r.termijnen.filter((t) => t.open > 0 && t.status !== 'vervallen' && t.vervaldatum <= horizon).slice(0, 4);
}

function verwachtTekst(app, lening, rond) {
  const open = openTermijnen(app, lening.id, rond);
  if (!open.length) {
    const volgende = app.verwerking.resultaten.get(lening.id)?.termijnen.find((t) => t.open > 0 && t.status === 'gepland');
    return volgende ? `Volgende termijn ${formatEuro(volgende.open)} op ${volgende.vervaldatum.split('-').reverse().join('-')}` : 'Geen termijn verwacht';
  }
  const t = open[0];
  return `Verwacht ${formatEuro(t.open)} (termijn ${t.vervaldatum.split('-').reverse().join('-')}${open.length > 1 ? `, ${open.length} termijnen open` : ''})`;
}

export function toon(app, root, [id], _route, query) {
  const bewerk = id ? app.data.ontvangsten.find((o) => o.id === id) : null;
  if (id && !bewerk) { root.innerHTML = '<div class="melding fout">Deze ontvangst bestaat niet (meer).</div><p><a href="#/invoer">Naar invoer</a></p>'; return; }
  if (!app.kanBewerken()) {
    root.innerHTML = `<h1>Ontvangsten</h1>${lijstHtml(app, query)}`;
    bindLijst(app, root);
    return;
  }
  const voorLening = query?.get('lening') ? app.data.leningen.find((l) => l.id === query.get('lening')) : null;
  const o = bewerk ? structuredClone(bewerk) : {
    id: null,
    datum: sessionStorage.getItem('invoer.datum') || app.peildatum,
    bedrag: '',
    lener_id: voorLening?.lener_ids[0] || '',
    tegenrekening: '',
    omschrijving: '',
    regels: voorLening ? [{ lening_id: voorLening.id, bedrag: '' }] : [],
  };

  root.innerHTML = `
    ${bewerk ? '<p><a href="#/invoer">&larr; Naar invoer</a></p>' : ''}
    <h1>${bewerk ? 'Ontvangst wijzigen' : 'Ontvangst invoeren'}</h1>
    ${bewerk ? herkomstHtml(bewerk) : ''}
    ${bewerk ? '' : '<p class="sub">Neem de bijschrijvingen over uit internetbankieren. Alleen leningbetalingen; andere bijschrijvingen blijven buiten de administratie.</p>'}
    <div id="meldingen"></div>
    <form id="ontvangst-form" class="formulier">
      <div class="rij3">
        <label>Datum bijschrijving<input name="datum" type="date" value="${esc(o.datum)}" max="${esc(app.peildatum)}" required></label>
        <label>Bedrag (€)<input name="bedrag" inputmode="decimal" value="${esc(euroInvoer(naarCenten(o.bedrag)))}" required autocomplete="off"></label>
        <label>Tegenrekening (IBAN, optioneel)<input name="tegenrekening" value="${esc(o.tegenrekening || '')}" autocomplete="off"><span class="hint" id="herkend"></span></label>
      </div>
      <div class="rij3">
        <label>Lener<select name="lener_id" required>${opties([...app.data.leners].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')).map((l) => ({ waarde: l.id, tekst: l.naam })), o.lener_id, { leeg: 'Kies lener' })}</select></label>
        <label class="breed">Omschrijving<input name="omschrijving" value="${esc(o.omschrijving || '')}" autocomplete="off"></label>
      </div>
      <div id="regels"></div>
      <div id="bevestig"></div>
      <div class="knoppen">
        <button class="knop" type="submit">${bewerk ? 'Wijziging opslaan' : 'Opslaan'}</button>
        ${bewerk ? '<button class="knop gevaar" type="button" id="verwijder">Verwijderen</button>' : ''}
      </div>
    </form>
    ${bewerk ? verwerkingHtml(app, bewerk) : `<section><h2>Ingevoerde ontvangsten</h2>${lijstHtml(app, query)}</section>`}`;

  const form = root.querySelector('#ontvangst-form');
  const regelsEl = root.querySelector('#regels');
  let regels = o.regels.map((r) => ({ ...r }));
  let bevestigd = false;

  const leningenVan = (lenerId) => app.data.leningen
    .filter((l) => l.lener_ids.includes(lenerId) && ((l.status || 'lopend') === 'lopend' || regels.some((r) => r.lening_id === l.id)))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'nl', { numeric: true }));

  const tekenRegels = () => {
    const lenerId = form.lener_id.value;
    if (!lenerId) { regelsEl.innerHTML = ''; return; }
    const lijst = leningenVan(lenerId);
    if (!lijst.length) { regelsEl.innerHTML = '<div class="melding waarschuwing">Deze lener heeft geen lopende lening.</div>'; return; }
    // Eén lening: die is automatisch gekozen.
    if (lijst.length === 1 && !regels.length) regels = [{ lening_id: lijst[0].id, bedrag: '' }];
    const rond = form.datum.value || app.peildatum;
    regelsEl.innerHTML = `<fieldset><legend>Verdeling over leningen</legend>
      ${lijst.length > 1 ? '<p class="hint">Vink de lening(en) aan waarvoor deze betaling is. Betaalt de lener meerdere leningen in één keer, verdeel het bedrag dan.</p>' : ''}
      <table class="tabel compact regels"><thead><tr><th>Lening</th><th>Verwacht</th><th class="getal">Bedrag (€)</th><th>Rente en aflossing</th></tr></thead><tbody>
      ${lijst.map((l) => {
        const r = regels.find((x) => x.lening_id === l.id);
        const handmatig = r && ((r.rente !== null && r.rente !== undefined) || (r.aflossing !== null && r.aflossing !== undefined));
        return `<tr data-lening="${esc(l.id)}">
          <td><label class="vinkje"><input type="checkbox" class="kies" ${r ? 'checked' : ''}> ${esc(l.nummer)} <span class="klein">${esc(TEKST.aflossingsvorm[l.aflossingsvorm])}</span></label></td>
          <td class="klein">${esc(verwachtTekst(app, l, rond))}</td>
          <td class="getal"><input class="regel-bedrag smal" inputmode="decimal" value="${r ? esc(euroInvoer(naarCenten(r.bedrag))) : ''}" ${r ? '' : 'disabled'} placeholder="${lijst.length === 1 ? 'zelfde als bedrag' : ''}"></td>
          <td>
            <label class="klein keuze-label" ${handmatig ? 'hidden' : ''}>Bij te veel betaald<select class="keuze" ${r ? '' : 'disabled'}>${opties(Object.entries(TEKST.keuze).map(([waarde, tekst]) => ({ waarde, tekst })), r?.keuze || '')}</select></label>
            <label class="vinkje klein"><input type="checkbox" class="handmatig" ${handmatig ? 'checked' : ''} ${r ? '' : 'disabled'}> zelf verdelen</label>
            <span class="split" ${handmatig ? '' : 'hidden'}>
              rente <input class="regel-rente smal" inputmode="decimal" value="${handmatig ? esc(euroInvoer(naarCenten(r.rente ?? 0))) : ''}">
              aflossing <input class="regel-aflossing smal" inputmode="decimal" value="${handmatig ? esc(euroInvoer(naarCenten(r.aflossing ?? 0))) : ''}">
              <button type="button" class="link voorstel">voorstel: rente eerst</button>
            </span>
          </td>
        </tr>`;
      }).join('')}
      </tbody></table>
      <p class="hint">Laat "zelf verdelen" uit: dan verdeelt het systeem het bedrag zelf. Klopt het precies, dan gaat het naar de open termijn(en). Is het meer, dan gaat het naar de open termijnen, oudste eerst, elke volle termijn volgens het schema; wat overblijft gebeurt volgens "Bij te veel betaald". Is het minder dan de oudste open termijn, dan komt het bij "te beoordelen".</p>
    </fieldset>`;
  };

  const leesRegels = () => {
    const uit = [];
    regelsEl.querySelectorAll('tr[data-lening]').forEach((tr) => {
      if (!tr.querySelector('.kies').checked) return;
      const r = { lening_id: tr.dataset.lening, bedrag: leesGetal(tr.querySelector('.regel-bedrag').value) };
      if (tr.querySelector('.handmatig').checked) {
        r.rente = leesGetal(tr.querySelector('.regel-rente').value) ?? 0;
        r.aflossing = leesGetal(tr.querySelector('.regel-aflossing').value) ?? 0;
      } else if (tr.querySelector('.keuze').value) {
        r.keuze = tr.querySelector('.keuze').value;
      }
      uit.push(r);
    });
    return uit;
  };

  tekenRegels();

  form.addEventListener('change', (e) => {
    bevestigd = false;
    root.querySelector('#bevestig').innerHTML = '';
    if (e.target.name === 'lener_id') { regels = []; tekenRegels(); }
    if (e.target.name === 'datum') { regels = leesRegels(); tekenRegels(); }
    if (e.target.classList.contains('kies')) {
      const tr = e.target.closest('tr');
      tr.querySelectorAll('.regel-bedrag, .handmatig, .keuze').forEach((el) => { el.disabled = !e.target.checked; });
    }
    if (e.target.classList.contains('handmatig')) {
      e.target.closest('tr').querySelector('.split').hidden = !e.target.checked;
      e.target.closest('tr').querySelector('.keuze-label').hidden = e.target.checked;
    }
  });

  form.tegenrekening.addEventListener('input', () => {
    const lener = stelLenerVoor(form.tegenrekening.value, app.data.leners);
    const hint = root.querySelector('#herkend');
    if (lener) {
      hint.textContent = `Herkend: ${lener.naam}`;
      if (form.lener_id.value !== lener.id) { form.lener_id.value = lener.id; regels = []; tekenRegels(); }
    } else hint.textContent = '';
  });

  regelsEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('voorstel')) return;
    // Rente eerst: vul de open rente van de oudste termijnen, de rest is aflossing.
    const tr = e.target.closest('tr');
    const bedrag = naarCenten(leesGetal(tr.querySelector('.regel-bedrag').value) ?? leesGetal(form.bedrag.value)) || 0;
    const open = openTermijnen(app, tr.dataset.lening, form.datum.value);
    let rente = open.reduce((s, t) => s + Math.max(0, t.rente - t.ontvangen_rente), 0);
    if (bewerk) {
      const eigen = app.verwerking.resultaten.get(tr.dataset.lening)?.ontvangsten.find((x) => x.ontvangst_id === bewerk.id);
      if (eigen && !['te_beoordelen', 'teruggestort', 'voor_start'].includes(eigen.wijze)) rente += eigen.rente;
    }
    rente = Math.min(rente, bedrag);
    tr.querySelector('.regel-rente').value = euroInvoer(rente);
    tr.querySelector('.regel-aflossing').value = euroInvoer(bedrag - rente);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const melding = root.querySelector('#meldingen');
    const bedrag = leesGetal(form.bedrag.value);
    let nieuweRegels = leesRegels();
    if (nieuweRegels.length === 1 && nieuweRegels[0].bedrag === null) nieuweRegels[0].bedrag = bedrag;
    const fouten = [];
    if (Number.isNaN(bedrag)) fouten.push('Bedrag is geen geldig getal.');
    if (nieuweRegels.some((r) => Number.isNaN(r.bedrag) || Number.isNaN(r.rente) || Number.isNaN(r.aflossing))) fouten.push('Een van de bedragen in de verdeling is geen geldig getal.');
    nieuweRegels = nieuweRegels.map((r) => ({ ...r, bedrag: r.bedrag ?? 0 }));
    const kandidaat = {
      ...(bewerk || {}),
      id: bewerk?.id || nieuwId('ontv'),
      datum: form.datum.value,
      bedrag,
      lener_id: form.lener_id.value,
      tegenrekening: form.tegenrekening.value.trim(),
      omschrijving: form.omschrijving.value.trim(),
      regels: nieuweRegels,
      ingevoerd_door: bewerk?.ingevoerd_door || app.gebruiker.naam,
      ingevoerd_op: bewerk?.ingevoerd_op || new Date().toISOString(),
      ...(bewerk ? { gewijzigd_door: app.gebruiker.naam, gewijzigd_op: new Date().toISOString() } : {}),
    };
    const c = fouten.length ? { fouten, waarschuwingen: [] } : controleerOntvangst(kandidaat, app.data, app.peildatum);
    if (c.fouten.length) { melding.innerHTML = meldingen(c.fouten); window.scrollTo(0, 0); return; }
    if (c.waarschuwingen.length && !bevestigd) {
      melding.innerHTML = meldingen([], c.waarschuwingen);
      root.querySelector('#bevestig').innerHTML = '<div class="melding waarschuwing"><strong>Controleer de waarschuwing hierboven.</strong> Klopt het toch? Klik dan nogmaals op opslaan.</div>';
      bevestigd = true;
      return;
    }
    melding.innerHTML = '';
    // Nieuwe tegenrekening onthouden bij de lener (F-11).
    const iban = kandidaat.tegenrekening;
    const ok = await app.wijzig((d) => {
      if (bewerk) d.ontvangsten[d.ontvangsten.findIndex((x) => x.id === bewerk.id)] = kandidaat;
      else d.ontvangsten.push(kandidaat);
      if (iban && !stelLenerVoor(iban, d.leners)) {
        d.leners.find((l) => l.id === kandidaat.lener_id)?.tegenrekeningen.push(iban);
      }
    });
    if (!ok) return;
    sessionStorage.setItem('invoer.datum', kandidaat.datum);
    const uitkomst = kandidaat.regels.map((r) => app.verwerking.resultaten.get(r.lening_id)?.ontvangsten.find((x) => x.ontvangst_id === kandidaat.id && x.regel === kandidaat.regels.indexOf(r)));
    const teBeoordelen = uitkomst.some((u) => u?.wijze === 'te_beoordelen' || u?.wijze === 'deels');
    const { toast } = await import('../app.js');
    toast(teBeoordelen ? 'Opgeslagen. Het bedrag wijkt af: deze ontvangst (of het restant) staat bij "te beoordelen".' : 'Opgeslagen en verwerkt.', teBeoordelen ? 'waarschuwing' : 'ok');
    if (bewerk) app.ga(teBeoordelen ? `#/invoer/${kandidaat.id}` : '#/invoer');
    else toon(app, root, [], null, new URLSearchParams());
  });

  root.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm(`Ontvangst van ${formatEuro(naarCenten(bewerk.bedrag))} op ${bewerk.datum.split('-').reverse().join('-')} verwijderen?`)) return;
    const ok = await app.wijzig((d) => { d.ontvangsten = d.ontvangsten.filter((x) => x.id !== bewerk.id); }, 'Ontvangst verwijderd');
    if (ok) app.ga('#/invoer');
  });

  bindLijst(app, root);
}

// W-010: wie heeft deze ontvangst ingevoerd en wie het laatst gewijzigd.
function herkomstHtml(o) {
  const moment = (iso) => (iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const delen = [];
  if (o.ingevoerd_door || o.ingevoerd_op) delen.push(`Ingevoerd door ${esc(o.ingevoerd_door || 'onbekend')}${o.ingevoerd_op ? ` op ${esc(moment(o.ingevoerd_op))}` : ''}`);
  if (o.gewijzigd_door || o.gewijzigd_op) delen.push(`laatst gewijzigd door ${esc(o.gewijzigd_door || 'onbekend')}${o.gewijzigd_op ? ` op ${esc(moment(o.gewijzigd_op))}` : ''}`);
  return delen.length ? `<p class="sub">${delen.join('; ')}.</p>` : '';
}

function verwerkingHtml(app, o) {
  const rijen = o.regels.map((r, i) => {
    const lening = app.data.leningen.find((l) => l.id === r.lening_id);
    const res = app.verwerking.resultaten.get(r.lening_id)?.ontvangsten.find((x) => x.ontvangst_id === o.id && x.regel === i);
    if (!lening || !res) return '';
    const open = openTermijnen(app, lening.id, o.datum);
    const leeg = ['te_beoordelen', 'teruggestort', 'voor_start'].includes(res.wijze);
    const extra = [
      res.extra_aflossing ? `waarvan extra aflossing ${euro(res.extra_aflossing)}` : '',
      res.restant ? `restant ${euro(res.restant)} te beoordelen` : '',
      res.teruggestort ? `teruggestort ${euro(res.teruggestort)}` : '',
      gebruiktVoor(app, lening.id, o.id, i),
    ].filter(Boolean).join('<br>');
    return `<tr class="${res.wijze === 'te_beoordelen' || res.wijze === 'deels' ? 'ernst-hoog' : ''}">
      <td><a href="#/lening/${esc(lening.id)}">${esc(lening.nummer)}</a></td>
      <td class="getal">${euro(res.bedrag)}</td>
      <td>${esc(TEKST.wijze[res.wijze])}${res.reden ? `<br><span class="klein">${esc(res.reden)}</span>` : ''}${extra ? `<br><span class="klein">${extra}</span>` : ''}</td>
      <td class="getal">${leeg ? '' : euro(res.rente)}</td>
      <td class="getal">${leeg ? '' : euro(res.aflossing)}</td>
      <td class="klein">${open.map((t) => `${datum(t.vervaldatum)}: rente ${euro(t.rente - t.ontvangen_rente)}, aflossing ${euro(t.aflossing - t.ontvangen_aflossing)}`).join('<br>') || 'geen'}</td>
    </tr>`;
  }).join('');
  return `<section><h2>Verwerking</h2>
    <table class="tabel compact"><thead><tr><th>Lening</th><th class="getal">Bedrag</th><th>Verwerking</th><th class="getal">Rente</th><th class="getal">Aflossing</th><th>Nu nog open (oudste termijnen)</th></tr></thead><tbody>${rijen}</tbody></table>
    <p class="hint">Te beoordelen? Kies hierboven bij "Bij te veel betaald" wat er met het restant gebeurt, of zet "zelf verdelen" aan en vul rente en aflossing in volgens de afspraak met de lener. Sla daarna op. Twijfel je, overleg dan eerst met de lener.</p></section>`;
}

// W-019: voor welke termijnen deze ontvangst(regel) is gebruikt.
function gebruiktVoor(app, leningId, ontvangstId, regel) {
  const tekst = gebruiktVoorTekst(app.verwerking.resultaten.get(leningId), ontvangstId, regel);
  return tekst ? `voor ${tekst}` : '';
}

function lijstHtml(app, query) {
  const { data } = app;
  const maand = query?.get('maand') || sessionStorage.getItem('invoer.maand') || app.peildatum.slice(0, 7);
  const lenerNaam = (id) => data.leners.find((l) => l.id === id)?.naam || '?';
  const status = new Map();
  for (const r of app.verwerking.resultaten.values()) {
    for (const o of r.ontvangsten) {
      const huidig = status.get(o.ontvangst_id);
      if (!huidig || o.wijze === 'te_beoordelen' || o.wijze === 'deels') status.set(o.ontvangst_id, o.wijze === 'deels' ? 'te_beoordelen' : o.wijze);
    }
  }
  const teBeoordelen = data.ontvangsten.filter((o) => status.get(o.id) === 'te_beoordelen').sort((a, b) => a.datum.localeCompare(b.datum));
  const inMaand = data.ontvangsten.filter((o) => o.datum.startsWith(maand)).sort((a, b) => b.datum.localeCompare(a.datum));
  const maanden = [...new Set([app.peildatum.slice(0, 7), ...data.ontvangsten.map((o) => o.datum.slice(0, 7))])].sort().reverse();
  const totaal = inMaand.reduce((s, o) => s + naarCenten(o.bedrag), 0);
  const rij = (o) => `<tr class="${status.get(o.id) === 'te_beoordelen' ? 'ernst-hoog' : ''}">
    <td>${datum(o.datum)}</td>
    <td>${esc(lenerNaam(o.lener_id))}</td>
    <td>${o.regels.map((r) => esc(data.leningen.find((l) => l.id === r.lening_id)?.nummer || '?')).join(', ')}</td>
    <td class="getal">${euro(naarCenten(o.bedrag))}</td>
    <td>${esc(TEKST.wijze[status.get(o.id)] || '')}</td>
    <td class="klein">${esc(o.ingevoerd_door || '')}${o.gewijzigd_door ? `<br><span class="hint">gewijzigd door ${esc(o.gewijzigd_door)}</span>` : ''}</td>
    <td>${app.kanBewerken() ? `<a class="knop klein secundair" href="#/invoer/${esc(o.id)}">Wijzigen</a>` : ''}</td>
  </tr>`;
  const kop = '<thead><tr><th>Datum</th><th>Lener</th><th>Lening</th><th class="getal">Bedrag</th><th>Verwerking</th><th>Door</th><th></th></tr></thead>';
  return `
    ${teBeoordelen.length ? `<h3>Te beoordelen (${teBeoordelen.length})</h3><table class="tabel">${kop}<tbody>${teBeoordelen.map(rij).join('')}</tbody></table>` : ''}
    <div class="filters"><label>Maand <select id="maand">${opties(maanden.map((m) => ({ waarde: m, tekst: new Date(`${m}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) })), maand)}</select></label>
      <span>${inMaand.length} ontvangsten, samen ${euro(totaal)}</span></div>
    ${inMaand.length ? `<table class="tabel">${kop}<tbody>${inMaand.map(rij).join('')}</tbody></table>` : '<p class="leeg">Geen ontvangsten in deze maand.</p>'}`;
}

function bindLijst(app, root) {
  root.querySelector('#maand')?.addEventListener('change', (e) => {
    sessionStorage.setItem('invoer.maand', e.target.value);
    app.toon();
  });
}
