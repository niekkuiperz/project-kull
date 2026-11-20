// Jaaroverzichten (F-18 voor de accountant, F-20 per lener).

import { esc, euro, datum, opties, download } from './hulp.js';
import { jaaroverzichtGeldgevers, jaaroverzichtLener, naarCsv } from '../engine/administratie.js';

const bedragCsv = (c) => (c / 100).toFixed(2).replace('.', ',');

export function toon(app, root) {
  const { data } = app;
  const huidig = Number(app.peildatum.slice(0, 4));
  const jaren = new Set([huidig]);
  for (const o of data.ontvangsten) jaren.add(Number(o.datum.slice(0, 4)));
  for (const l of data.leningen) jaren.add(Number((l.beginstand?.datum || l.ingangsdatum).slice(0, 4)));
  const jaar = Number(sessionStorage.getItem('rapport.jaar')) || huidig;
  const soort = sessionStorage.getItem('rapport.soort') || 'geldgever';
  const lenerId = sessionStorage.getItem('rapport.lener') || data.leners[0]?.id || '';

  root.innerHTML = `
    <h1 class="geen-print">Rapporten</h1>
    <form class="filters geen-print" id="keuze">
      <label>Overzicht <select name="soort">${opties([{ waarde: 'geldgever', tekst: 'Jaaroverzicht per geldgever (accountant)' }, { waarde: 'lener', tekst: 'Jaaroverzicht per lener' }], soort)}</select></label>
      <label>Jaar <select name="jaar">${opties([...jaren].sort((a, b) => b - a).map((j) => ({ waarde: j, tekst: String(j) })), jaar)}</select></label>
      ${soort === 'lener' ? `<label>Lener <select name="lener">${opties(data.leners.map((l) => ({ waarde: l.id, tekst: l.naam })), lenerId)}</select></label>` : ''}
      <button type="button" class="knop secundair" id="print">Afdrukken of PDF</button>
      ${soort === 'geldgever' ? '<button type="button" class="knop secundair" id="csv">Download voor Excel (CSV)</button>' : ''}
    </form>
    <div id="rapport"></div>`;

  const doel = root.querySelector('#rapport');
  if (soort === 'geldgever') toonGeldgevers(app, doel, jaar, root);
  else toonLener(app, doel, jaar, lenerId);

  root.querySelector('#keuze').addEventListener('change', (e) => {
    const f = e.currentTarget;
    sessionStorage.setItem('rapport.soort', f.soort.value);
    sessionStorage.setItem('rapport.jaar', f.jaar.value);
    if (f.lener) sessionStorage.setItem('rapport.lener', f.lener.value);
    toon(app, root);
  });
  root.querySelector('#print').addEventListener('click', () => window.print());
}

function waarschuwing(onbeoordeeld, jaar, peildatum, dubbel = 0) {
  const delen = [];
  if (dubbel) delen.push(`Er ${dubbel > 1 ? 'zijn' : 'is'} ${dubbel} melding${dubbel > 1 ? 'en' : ''} over mogelijk dubbele invoer. Een dubbele ontvangst telt mee in dit overzicht: los dat eerst op.`);
  if (onbeoordeeld) delen.push(`${onbeoordeeld} ontvangst${onbeoordeeld > 1 ? 'en' : ''} in ${jaar} ${onbeoordeeld > 1 ? 'zijn' : 'is'} nog niet beoordeeld en ${onbeoordeeld > 1 ? 'tellen' : 'telt'} niet mee. Los dat eerst op.`);
  if (`${jaar}-12-31` > peildatum) delen.push(`Het jaar ${jaar} is nog niet voorbij: dit is een tussenstand per ${peildatum.split('-').reverse().join('-')}.`);
  return delen.length ? `<div class="melding waarschuwing">${delen.map(esc).join('<br>')}</div>` : '';
}

function toonGeldgevers(app, doel, jaar, root) {
  const overzicht = jaaroverzichtGeldgevers(app.data, app.verwerking, jaar);
  const onbeoordeeld = overzicht.reduce((s, g) => s + g.totaal.onbeoordeeld, 0);
  const nietSluitend = overzicht.flatMap((g) => g.rijen.filter((r) => !r.klopt));
  doel.innerHTML = `
    <h1 class="alleen-print">Jaaroverzicht leningen ${jaar}</h1>
    <h2 class="geen-print">Jaaroverzicht ${jaar} per geldgever</h2>
    <p class="sub">Opgesteld op ${datum(app.peildatum)}. Bedragen in euro's.</p>
    ${waarschuwing(onbeoordeeld, jaar, app.peildatum, app.verwerking.aandacht.filter((a) => a.soort === 'dubbel').length)}
    ${nietSluitend.length ? `<div class="melding fout">Bij ${nietSluitend.map((r) => esc(r.lening.nummer)).join(', ')} sluit de aansluiting niet (begin + nieuw - afgelost - kwijtgescholden is niet gelijk aan eind). Controleer deze leningen.</div>` : ''}
    ${overzicht.map((g) => `<section class="pagina">
      <h3>${esc(g.geldgever.naam)}</h3>
      ${g.rijen.length ? `<table class="tabel compact">
        <thead><tr><th>Lening</th><th>Lener(s)</th><th class="getal">Saldo 1 jan</th><th class="getal">Nieuw verstrekt</th><th class="getal">Afgelost</th><th class="getal">Kwijtgescholden</th><th class="getal">Rente ontvangen</th><th class="getal">Saldo 31 dec</th></tr></thead>
        <tbody>${g.rijen.map((r) => `<tr>
          <td>${esc(r.lening.nummer)}</td>
          <td>${esc(r.leners)}${r.opmerking ? `<br><span class="klein">${esc(r.opmerking)}</span>` : ''}</td>
          <td class="getal">${euro(r.begin)}</td><td class="getal">${euro(r.nieuw)}</td><td class="getal">${euro(r.afgelost)}</td>
          <td class="getal">${r.kwijtgescholden ? euro(r.kwijtgescholden) : ''}</td><td class="getal">${euro(r.rente)}</td><td class="getal">${euro(r.eind)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="2">Totaal ${esc(g.geldgever.naam)}</th>
          <th class="getal">${euro(g.totaal.begin)}</th><th class="getal">${euro(g.totaal.nieuw)}</th><th class="getal">${euro(g.totaal.afgelost)}</th>
          <th class="getal">${g.totaal.kwijtgescholden ? euro(g.totaal.kwijtgescholden) : ''}</th><th class="getal">${euro(g.totaal.rente)}</th><th class="getal">${euro(g.totaal.eind)}</th></tr></tfoot>
      </table>` : '<p class="leeg">Geen leningen in dit jaar.</p>'}
    </section>`).join('')}`;

  root.querySelector('#csv')?.addEventListener('click', () => {
    const rijen = overzicht.flatMap((g) => g.rijen.map((r) => ({ ...r, geldgever: g.geldgever.naam })));
    const csv = naarCsv([
      { titel: 'Geldgever', waarde: (r) => r.geldgever },
      { titel: 'Lening', waarde: (r) => r.lening.nummer },
      { titel: 'Lener(s)', waarde: (r) => r.leners },
      { titel: 'Saldo 1 januari', waarde: (r) => bedragCsv(r.begin) },
      { titel: 'Nieuw verstrekt', waarde: (r) => bedragCsv(r.nieuw) },
      { titel: 'Afgelost', waarde: (r) => bedragCsv(r.afgelost) },
      { titel: 'Kwijtgescholden', waarde: (r) => bedragCsv(r.kwijtgescholden) },
      { titel: 'Rente ontvangen', waarde: (r) => bedragCsv(r.rente) },
      { titel: 'Saldo 31 december', waarde: (r) => bedragCsv(r.eind) },
      { titel: 'Opmerking', waarde: (r) => r.opmerking },
    ], rijen);
    download(`jaaroverzicht-leningen-${jaar}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  });
}

function toonLener(app, doel, jaar, lenerId) {
  if (!lenerId) { doel.innerHTML = '<p class="leeg">Nog geen leners.</p>'; return; }
  const o = jaaroverzichtLener(app.data, app.verwerking, jaar, lenerId);
  doel.innerHTML = `
    <h2>Jaaroverzicht ${jaar}: ${esc(o.lener.naam)}</h2>
    <p class="sub">Opgesteld op ${datum(app.peildatum)}.</p>
    ${waarschuwing(o.totaal.onbeoordeeld, jaar, app.peildatum, app.verwerking.aandacht.filter((a) => a.soort === 'dubbel' && o.rijen.some((r) => r.lening.id === a.lening_id)).length)}
    ${o.rijen.length ? `<table class="tabel">
      <thead><tr><th>Lening</th><th>Geldgever</th><th class="getal">Schuld 1 jan</th><th class="getal">Nieuw geleend</th><th class="getal">Afgelost</th><th class="getal">Betaalde rente</th><th class="getal">Schuld 31 dec</th></tr></thead>
      <tbody>${o.rijen.map((r) => `<tr>
        <td>${esc(r.lening.nummer)}${r.lening.eigen_woning ? ' <span class="label">eigen woning</span>' : ''}</td>
        <td>${esc(r.geldgever?.naam || '')}</td>
        <td class="getal">${euro(r.begin)}</td><td class="getal">${euro(r.nieuw)}</td><td class="getal">${euro(r.afgelost)}</td><td class="getal">${euro(r.rente)}</td><td class="getal">${euro(r.eind)}</td>
      </tr>`).join('')}</tbody></table>
      ${o.rijen.some((r) => r.lening.eigen_woning) ? '<p class="noot">Voor een lening voor de eigen woning vermeldt de lener de schuld en de betaalde rente in de eigen aangifte inkomstenbelasting. Laat de fiscale voorwaarden door de accountant bevestigen.</p>' : ''}` : '<p class="leeg">Geen leningen in dit jaar.</p>'}`;
}
