import { esc, euro, datum, opties, nieuwId, formData, meldingen, TEKST, lijstOpties, leesGetal } from './hulp.js';
import { controleerLening } from '../engine/administratie.js';
import { verwerkLening } from '../engine/verwerking.js';
import { isGeldig, voorstelEersteVervaldatum } from '../engine/datum.js';
import { formatEuro, naarCenten } from '../engine/geld.js';

export function toon(app, root, params, route) {
  if (route.bewerk) return toonFormulier(app, root, params[0]);
  return toonLijst(app, root);
}

function toonLijst(app, root) {
  const { data } = app;
  const zoek = new URLSearchParams(sessionStorage.getItem('leningen.filter') || 'status=lopend');
  const status = zoek.get('status') || 'lopend';
  const geldgever = zoek.get('geldgever') || '';
  const signalenPer = new Map();
  for (const s of app.verwerking.aandacht) {
    if (s.ernst === 'info') continue;
    signalenPer.set(s.lening_id, (signalenPer.get(s.lening_id) || 0) + 1);
  }
  const lenerNaam = (ids) => ids.map((i) => data.leners.find((l) => l.id === i)?.naam || '?').join(', ');
  const rijen = data.leningen
    .filter((l) => status === 'alle' || (l.status || 'lopend') === status)
    .filter((l) => !geldgever || l.geldgever_id === geldgever)
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'nl', { numeric: true }));

  root.innerHTML = `
    <div class="kop-met-knop"><h1>Leningen</h1>${app.kanBewerken() ? '<a class="knop" href="#/leningen/nieuw">Nieuwe lening</a>' : ''}</div>
    <form class="filters" id="filters">
      <label>Status <select name="status">${opties([{ waarde: 'lopend', tekst: 'Lopend' }, { waarde: 'afgelost', tekst: 'Afgelost' }, { waarde: 'kwijtgescholden', tekst: 'Kwijtgescholden' }, { waarde: 'alle', tekst: 'Alle' }], status)}</select></label>
      <label>Geldgever <select name="geldgever">${opties(data.geldgevers.map((g) => ({ waarde: g.id, tekst: g.naam })), geldgever, { leeg: 'Alle' })}</select></label>
    </form>
    ${rijen.length ? `<table class="tabel">
      <thead><tr><th>Lening</th><th>Lener(s)</th><th>Geldgever</th><th>Vorm</th><th class="getal">Hoofdsom</th><th class="getal">Rente</th><th class="getal">Saldo</th><th>Meldingen</th></tr></thead>
      <tbody>${rijen.map((l) => {
        const r = app.verwerking.resultaten.get(l.id);
        const n = signalenPer.get(l.id) || 0;
        return `<tr>
          <td><a href="#/lening/${esc(l.id)}">${esc(l.nummer)}</a></td>
          <td>${esc(lenerNaam(l.lener_ids))}</td>
          <td>${esc(data.geldgevers.find((g) => g.id === l.geldgever_id)?.naam || '')}</td>
          <td>${esc(TEKST.aflossingsvorm[l.aflossingsvorm])}, ${esc(TEKST.frequentie[l.frequentie].toLowerCase())}</td>
          <td class="getal">${euro(Math.round(l.hoofdsom * 100))}</td>
          <td class="getal">${esc(String(l.rente).replace('.', ','))}%</td>
          <td class="getal">${euro(r.saldo)}</td>
          <td>${n ? `<span class="label hoog">${n}</span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>` : '<p class="leeg">Geen leningen met dit filter.</p>'}`;

  root.querySelector('#filters').addEventListener('change', (e) => {
    sessionStorage.setItem('leningen.filter', new URLSearchParams(formData(e.currentTarget)).toString());
    toonLijst(app, root);
  });
}

const LEEG = {
  nummer: '', lener_ids: [], geldgever_id: '', contractsoort: 'onderhands', hoofdsom: '', ingangsdatum: '', einddatum: '',
  rente: '', rentetype: 'vast', herzieningsdatum: '', aflossingsvorm: 'annuitair', frequentie: 'maand', eerste_vervaldatum: '',
  termijnbedrag: '', betaalwijze: 'samen', hypothecair: false, zekerheden: '', bijzonderheden: '', eigen_woning: false,
  status: 'lopend', document_url: '', beginstand: null, wijzigingen: [], kwijtschelding_datum: '',
};

function volgendNummer(data) {
  const nrs = data.leningen.map((l) => Number(String(l.nummer).replace(/\D/g, ''))).filter(Number.isFinite);
  const n = (nrs.length ? Math.max(...nrs) : 0) + 1;
  return `L-${String(n).padStart(3, '0')}`;
}

function leesFormulier(form, basis, wijzigingen) {
  const f = formData(form);
  const lijst = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const l = {
    ...basis,
    nummer: String(f.nummer || '').trim(),
    lener_ids: lijst(f.lener_ids),
    geldgever_id: f.geldgever_id || '',
    contractsoort: f.contractsoort,
    hoofdsom: leesGetal(f.hoofdsom),
    ingangsdatum: f.ingangsdatum || '',
    einddatum: f.einddatum || null,
    rente: leesGetal(f.rente, { duizendtallen: false }) ?? 0,
    rentetype: f.rentetype,
    herzieningsdatum: f.herzieningsdatum || null,
    aflossingsvorm: f.aflossingsvorm,
    frequentie: f.frequentie,
    eerste_vervaldatum: f.eerste_vervaldatum || null,
    termijnbedrag: leesGetal(f.termijnbedrag),
    betaalwijze: f.betaalwijze,
    hypothecair: f.hypothecair === 'ja',
    zekerheden: f.zekerheden || '',
    bijzonderheden: f.bijzonderheden || '',
    eigen_woning: f.eigen_woning === 'ja',
    status: f.status,
    document_url: f.document_url || '',
    kwijtschelding_datum: f.status === 'kwijtgescholden' ? (f.kwijtschelding_datum || null) : null,
    beginstand: f.heeft_beginstand === 'ja' ? { datum: f.beginstand_datum || '', saldo: leesGetal(f.beginstand_saldo) } : null,
    wijzigingen,
  };
  return l;
}

function wijzigingenHtml(wijzigingen, ro) {
  if (!wijzigingen.length) return '<p class="leeg">Geen wijzigingen vastgelegd.</p>';
  return `<table class="tabel compact"><thead><tr><th>Ingangsdatum</th><th>Wat verandert</th><th>Toelichting</th><th></th></tr></thead><tbody>
    ${wijzigingen.map((w, i) => `<tr><td>${datum(w.datum)}</td><td>${esc(beschrijfWijziging(w))}</td><td>${esc(w.toelichting || '')}</td>
      <td>${ro ? '' : `<button type="button" class="link" data-verwijder-wijziging="${i}">Verwijderen</button>`}</td></tr>`).join('')}
  </tbody></table>`;
}

export function beschrijfWijziging(w) {
  const delen = [];
  if (w.rente !== null && w.rente !== undefined && w.rente !== '') delen.push(`rente ${String(w.rente).replace('.', ',')}%`);
  if (w.aflossingsvorm) delen.push(TEKST.aflossingsvorm[w.aflossingsvorm].toLowerCase());
  if (w.frequentie) delen.push(TEKST.frequentie[w.frequentie].toLowerCase());
  if (w.einddatum) delen.push(`einddatum ${w.einddatum.split('-').reverse().join('-')}`);
  const bedrag = (x) => formatEuro(naarCenten(x));
  if (w.termijnbedrag) delen.push(`termijnbedrag ${bedrag(w.termijnbedrag)}`);
  if (w.extra_opname) delen.push(`extra opname ${bedrag(w.extra_opname)}`);
  if (w.kwijtschelding) delen.push(`kwijtschelding of schenking ${bedrag(w.kwijtschelding)}`);
  return delen.join(', ') || 'herberekening';
}

function toonFormulier(app, root, id) {
  const { data } = app;
  const nieuw = id === 'nieuw';
  const bron = nieuw ? { ...LEEG, nummer: volgendNummer(data), geldgever_id: data.geldgevers[0]?.id } : data.leningen.find((x) => x.id === id);
  if (!bron) { root.innerHTML = '<p>Lening niet gevonden.</p>'; return; }
  const l = { ...LEEG, ...bron };
  let wijzigingen = structuredClone(l.wijzigingen || []);
  const ro = !app.kanBewerken();
  const v = (x) => esc(x ?? '');
  const getal = (x) => (x === null || x === undefined || x === '' ? '' : esc(String(x).replace('.', ',')));

  root.innerHTML = `
    <p><a href="${nieuw ? '#/leningen' : `#/lening/${esc(l.id)}`}">&larr; Terug</a></p>
    <h1>${nieuw ? 'Nieuwe lening' : `Lening ${esc(l.nummer)} bewerken`}</h1>
    <div id="meldingen"></div>
    <form id="lening-form" class="formulier" novalidate>
      <fieldset ${ro ? 'disabled' : ''}>
        <legend>Partijen</legend>
        <div class="rij3">
          <label>Lening-ID<input name="nummer" value="${v(l.nummer)}" required></label>
          <label>Geldgever<select name="geldgever_id">${opties(data.geldgevers.map((g) => ({ waarde: g.id, tekst: g.naam })), l.geldgever_id)}</select></label>
          <label>Soort contract<select name="contractsoort">${opties(lijstOpties(TEKST.contractsoort), l.contractsoort)}</select></label>
        </div>
        <div class="groep-label">Lener(s)</div>
        <div class="vinkjes">${data.leners.length ? data.leners.map((p) => `<label class="vinkje"><input type="checkbox" name="lener_ids" value="${esc(p.id)}" ${l.lener_ids.includes(p.id) ? 'checked' : ''}> ${esc(p.naam)}</label>`).join('') : '<span class="leeg">Leg eerst een lener vast onder Leners.</span>'}</div>
      </fieldset>

      <fieldset ${ro ? 'disabled' : ''}>
        <legend>Afspraken</legend>
        <div class="rij3">
          <label>Hoofdsom (€)<input name="hoofdsom" inputmode="decimal" value="${getal(l.hoofdsom)}" required></label>
          <label>Ingangsdatum<input name="ingangsdatum" type="date" value="${v(l.ingangsdatum)}" required></label>
          <label>Einddatum<input name="einddatum" type="date" value="${v(l.einddatum)}"><span class="hint">Niet nodig bij aflossingsvrij en bij annuïtair met een vast termijnbedrag.</span></label>
        </div>
        <div class="rij3">
          <label>Rente per jaar (%)<input name="rente" inputmode="decimal" value="${getal(l.rente)}"></label>
          <label>Rente<select name="rentetype">${opties([{ waarde: 'vast', tekst: 'Vast' }, { waarde: 'variabel', tekst: 'Variabel' }], l.rentetype)}</select></label>
          <label>Renteherzieningsdatum<input name="herzieningsdatum" type="date" value="${v(l.herzieningsdatum)}"></label>
        </div>
        <div class="rij3">
          <label>Aflossingsvorm<select name="aflossingsvorm">${opties(lijstOpties(TEKST.aflossingsvorm), l.aflossingsvorm)}</select></label>
          <label>Termijnen<select name="frequentie">${opties(lijstOpties(TEKST.frequentie), l.frequentie)}</select></label>
          <label>Betaling<select name="betaalwijze">${opties(lijstOpties(TEKST.betaalwijze), l.betaalwijze)}</select></label>
        </div>
        <div class="rij3">
          <label>Eerste vervaldatum<input name="eerste_vervaldatum" type="date" value="${v(l.eerste_vervaldatum)}"><span class="hint">${nieuw ? 'Wordt voorgesteld als einde van de maand; pas aan als het contract iets anders zegt.' : 'Leeg: één termijn na de ingangsdatum.'}</span></label>
          <label>Vast termijnbedrag (€)<input name="termijnbedrag" inputmode="decimal" value="${getal(l.termijnbedrag)}"><span class="hint">Alleen bij annuïtair als het contract een vast bedrag noemt. Leeg: berekend.</span></label>
          <span></span>
        </div>
      </fieldset>

      <fieldset ${ro ? 'disabled' : ''}>
        <legend>Zekerheden en bijzonderheden</legend>
        <div class="rij3">
          <label>Hypothecair<select name="hypothecair">${opties([{ waarde: 'nee', tekst: 'Nee' }, { waarde: 'ja', tekst: 'Ja' }], l.hypothecair ? 'ja' : 'nee')}</select></label>
          <label>Lening eigen woning<select name="eigen_woning">${opties([{ waarde: 'nee', tekst: 'Nee' }, { waarde: 'ja', tekst: 'Ja' }], l.eigen_woning ? 'ja' : 'nee')}</select><span class="hint">Lener heeft een jaaropgave nodig voor de aangifte.</span></label>
          <label>Status<select name="status">${opties(lijstOpties(TEKST.status), l.status)}</select></label>
        </div>
        <label class="kwijt" ${l.status === 'kwijtgescholden' ? '' : 'hidden'}>Datum kwijtschelding<input name="kwijtschelding_datum" type="date" value="${v(l.kwijtschelding_datum)}"></label>
        <label>Overige zekerheden<input name="zekerheden" value="${v(l.zekerheden)}"></label>
        <label>Bijzonderheden<textarea name="bijzonderheden" rows="2">${v(l.bijzonderheden)}</textarea></label>
        <label>Link naar contract of akte<input name="document_url" type="url" value="${v(l.document_url)}" placeholder="https://..."></label>
      </fieldset>

      <fieldset ${ro ? 'disabled' : ''}>
        <legend>Beginstand (overname uit de oude administratie)</legend>
        <label class="vinkje"><input type="checkbox" name="heeft_beginstand" value="ja" ${l.beginstand ? 'checked' : ''}> Deze lening liep al: start met een beginsaldo</label>
        <div class="rij3 beginstand" ${l.beginstand ? '' : 'hidden'}>
          <label>Datum beginstand<input name="beginstand_datum" type="date" value="${v(l.beginstand?.datum || '2026-01-01')}"></label>
          <label>Saldo op die datum (€)<input name="beginstand_saldo" inputmode="decimal" value="${getal(l.beginstand?.saldo)}"></label>
          <span class="hint">Het schema loopt vanaf deze datum. Ontvangsten van vóór die datum tellen niet mee.</span>
        </div>
      </fieldset>

      <fieldset ${ro ? 'disabled' : ''}>
        <legend>Wijzigingen in de afspraken</legend>
        <div id="wijzigingen">${wijzigingenHtml(wijzigingen, ro)}</div>
        ${ro ? '' : `<details class="nieuwe-wijziging"><summary>Wijziging toevoegen</summary>
          <p class="hint">Vul alleen in wat verandert. Vanaf de ingangsdatum wordt het schema opnieuw berekend over het dan resterende saldo.</p>
          <div class="rij3">
            <label>Ingangsdatum<input data-w="datum" type="date"></label>
            <label>Nieuwe rente (%)<input data-w="rente" inputmode="decimal"></label>
            <label>Nieuwe aflossingsvorm<select data-w="aflossingsvorm">${opties(lijstOpties(TEKST.aflossingsvorm), '', { leeg: 'Ongewijzigd' })}</select></label>
          </div>
          <div class="rij3">
            <label>Nieuwe einddatum<input data-w="einddatum" type="date"></label>
            <label>Nieuw vast termijnbedrag (€)<input data-w="termijnbedrag" inputmode="decimal"></label>
            <label>Extra opname (€)<input data-w="extra_opname" inputmode="decimal"></label>
          </div>
          <div class="rij3">
            <label>Kwijtschelding of schenking (€)<input data-w="kwijtschelding" inputmode="decimal"><span class="hint">Verlaagt het saldo zonder dat er geld binnenkomt. Telt in het jaaroverzicht als kwijtgescholden.</span></label>
            <span></span><span></span>
          </div>
          <label>Toelichting<input data-w="toelichting"></label>
          <button type="button" class="knop secundair" id="wijziging-toevoegen">Toevoegen</button>
        </details>`}
      </fieldset>

      <div id="voorbeeld"></div>
      ${ro ? '' : `<div class="knoppen">
        <button class="knop" type="submit">Opslaan</button>
        <button class="knop secundair" type="button" id="bereken">Schema berekenen</button>
        ${!nieuw && !data.ontvangsten.some((o) => o.regels.some((r) => r.lening_id === l.id)) ? '<button class="knop gevaar" type="button" id="verwijder">Verwijderen</button>' : ''}
      </div>`}
    </form>`;

  const form = root.querySelector('#lening-form');
  const melding = root.querySelector('#meldingen');

  // W-013: bij een nieuwe lening de eerste vervaldatum voorstellen als einde
  // van de maand, zolang de gebruiker hem niet zelf heeft aangepast.
  let voorgesteld = '';
  const stelVervaldatumVoor = () => {
    if (!nieuw) return;
    const veld = form.eerste_vervaldatum;
    if (veld.value && veld.value !== voorgesteld) return;
    const voorstel = voorstelEersteVervaldatum(form.ingangsdatum.value, form.frequentie.value) || '';
    veld.value = voorstel;
    voorgesteld = voorstel;
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'ingangsdatum' || e.target.name === 'frequentie') stelVervaldatumVoor();
    if (e.target.name === 'heeft_beginstand') form.querySelector('.beginstand').hidden = !e.target.checked;
    if (e.target.name === 'status') form.querySelector('.kwijt').hidden = e.target.value !== 'kwijtgescholden';
  });

  const tekenWijzigingen = () => {
    root.querySelector('#wijzigingen').innerHTML = wijzigingenHtml(wijzigingen, ro);
  };
  root.querySelector('#wijzigingen').addEventListener('click', (e) => {
    const i = e.target.dataset.verwijderWijziging;
    if (i !== undefined) { wijzigingen.splice(Number(i), 1); tekenWijzigingen(); }
  });
  root.querySelector('#wijziging-toevoegen')?.addEventListener('click', () => {
    const veld = (n) => root.querySelector(`[data-w="${n}"]`);
    const w = { id: nieuwId('wijz'), datum: veld('datum').value };
    const fouten = [];
    if (!isGeldig(w.datum)) fouten.push('Vul een geldige ingangsdatum voor de wijziging in.');
    for (const n of ['rente', 'termijnbedrag', 'extra_opname', 'kwijtschelding']) {
      const x = leesGetal(veld(n).value, { duizendtallen: n !== 'rente' });
      if (Number.isNaN(x)) fouten.push(`Ongeldig getal bij ${n.replace('_', ' ')}.`);
      else if (x !== null) w[n] = x;
    }
    if (veld('aflossingsvorm').value) w.aflossingsvorm = veld('aflossingsvorm').value;
    if (veld('einddatum').value) w.einddatum = veld('einddatum').value;
    w.toelichting = veld('toelichting').value;
    if (Object.keys(w).length <= 3) fouten.push('Vul in wat er verandert.');
    if (fouten.length) { melding.innerHTML = meldingen(fouten); return; }
    melding.innerHTML = '';
    wijzigingen.push(w);
    wijzigingen.sort((a, b) => a.datum.localeCompare(b.datum));
    root.querySelectorAll('[data-w]').forEach((el) => { el.value = ''; });
    tekenWijzigingen();
  });

  const controleer = () => {
    const kandidaat = leesFormulier(form, { ...l, id: l.id || 'nieuw' }, wijzigingen);
    const fouten = controleerLening(kandidaat, data);
    for (const [veld, naam] of [['hoofdsom', 'Hoofdsom'], ['termijnbedrag', 'Termijnbedrag']]) {
      if (Number.isNaN(kandidaat[veld])) fouten.push(`${naam} is geen geldig bedrag.`);
    }
    if (kandidaat.beginstand && Number.isNaN(kandidaat.beginstand.saldo)) fouten.push('Beginsaldo is geen geldig bedrag.');
    if (kandidaat.status === 'kwijtgescholden' && !kandidaat.kwijtschelding_datum) fouten.push('Vul de datum van de kwijtschelding in.');
    return { kandidaat, fouten };
  };

  root.querySelector('#bereken')?.addEventListener('click', () => {
    const { kandidaat, fouten } = controleer();
    if (fouten.length) { melding.innerHTML = meldingen(fouten); return; }
    melding.innerHTML = '';
    const r = verwerkLening(kandidaat, [], app.peildatum);
    const t = r.termijnen;
    const totRente = t.reduce((s, x) => s + x.rente, 0);
    root.querySelector('#voorbeeld').innerHTML = `<div class="melding info"><strong>Berekend schema:</strong> ${t.length} termijnen.
      ${t.length ? `Eerste termijn ${datum(t[0].vervaldatum)}: ${euro(t[0].totaal)} (rente ${euro(t[0].rente)}, aflossing ${euro(t[0].aflossing)}). Laatste termijn ${datum(t[t.length - 1].vervaldatum)}: ${euro(t[t.length - 1].totaal)}. Totale rente over de looptijd: ${euro(totRente)}.` : ''}
      ${r.signalen.map((s) => `<br>${esc(s.tekst)}`).join('')}
      <br>Vergelijk dit met het contract voordat je opslaat.</div>`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { kandidaat, fouten } = controleer();
    if (fouten.length) { melding.innerHTML = meldingen(fouten); window.scrollTo(0, 0); return; }
    const nieuweId = nieuw ? nieuwId('lening') : l.id;
    kandidaat.id = nieuweId;
    const ok = await app.wijzig((d) => {
      if (nieuw) d.leningen.push(kandidaat);
      else d.leningen[d.leningen.findIndex((x) => x.id === l.id)] = kandidaat;
    }, 'Lening opgeslagen');
    if (ok) app.ga(`#/lening/${nieuweId}`);
  });

  root.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm(`Lening ${l.nummer} verwijderen? Dit kan alleen omdat er nog geen ontvangsten op staan.`)) return;
    const ok = await app.wijzig((d) => { d.leningen = d.leningen.filter((x) => x.id !== l.id); }, 'Lening verwijderd');
    if (ok) app.ga('#/leningen');
  });
}
