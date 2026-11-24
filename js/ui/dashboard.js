import { esc, euro, datum, TEKST } from './hulp.js';

export function signaalTabel(signalen, { metLening = true } = {}) {
  if (!signalen.length) return '<p class="leeg">Er is niets dat aandacht nodig heeft.</p>';
  return `<table class="tabel">
    <thead><tr><th>Soort</th>${metLening ? '<th>Lening</th><th>Lener</th>' : ''}<th>Melding</th><th class="getal">Verschil</th><th class="geen-print"></th></tr></thead>
    <tbody>${signalen.map((s) => `<tr class="ernst-${s.ernst}">
      <td><span class="label ${s.ernst}">${esc(TEKST.ernst[s.ernst])}</span></td>
      ${metLening ? `<td><a href="#/lening/${esc(s.lening_id)}">${esc(s.lening_nummer || '')}</a></td><td>${esc(s.leners || '')}</td>` : ''}
      <td>${esc(s.tekst)}</td>
      <td class="getal">${s.verschil === null || s.verschil === undefined ? '' : euro(s.verschil)}</td>
      <td class="geen-print">${actie(s)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function actie(s) {
  if (s.ontvangst_id && (s.soort === 'beoordelen' || s.soort === 'dubbel' || s.soort === 'koppeling')) {
    return `<a class="knop klein" href="#/invoer/${esc(s.ontvangst_id)}">${s.soort === 'beoordelen' ? 'Beoordelen' : 'Bekijken'}</a>`;
  }
  return `<a class="knop klein secundair" href="#/lening/${esc(s.lening_id)}">Leningkaart</a>`;
}

export function toon(app, root) {
  const { totalen, aandacht } = app.verwerking;
  const hoog = aandacht.filter((a) => a.ernst === 'hoog').length;
  const data = app.data;

  const tegels = [
    `<div class="tegel"><div class="tegel-label">Totaal uitstaand</div><div class="tegel-waarde">${euro(totalen.totaal)}</div></div>`,
    ...data.geldgevers.map((g) => `<div class="tegel"><div class="tegel-label">${esc(g.naam)}</div><div class="tegel-waarde">${euro(totalen.perGeldgever[g.id] || 0)}</div></div>`),
    `<div class="tegel"><div class="tegel-label">Lopende leningen</div><div class="tegel-waarde">${totalen.aantalLopend}</div></div>`,
    `<div class="tegel ${hoog ? 'tegel-alarm' : ''}"><div class="tegel-label">Actie nodig</div><div class="tegel-waarde">${hoog}</div></div>`,
  ].join('');

  const lenersMetSaldo = data.leners
    .map((l) => ({ l, saldo: totalen.perLener[l.id] || 0, aantal: data.leningen.filter((n) => n.lener_ids.includes(l.id) && (n.status || 'lopend') === 'lopend').length }))
    .filter((x) => x.aantal > 0 || x.saldo !== 0)
    .sort((a, b) => b.saldo - a.saldo);

  const leeg = !data.leningen.length;

  root.innerHTML = `
    <h1>Overzicht</h1>
    <p class="sub">Stand per ${datum(app.peildatum)}</p>
    ${leeg ? `<div class="melding info">Er staan nog geen leningen in de administratie. Begin bij <a href="#/leners">Leners</a> en daarna <a href="#/leningen">Leningen</a>, of laad fictieve testgegevens via <a href="#/instellingen">Instellingen</a>.</div>` : ''}
    <div class="tegels">${tegels}</div>
    <section>
      <h2>Aandacht nodig</h2>
      ${signaalTabel(aandacht)}
    </section>
    <section>
      <h2>Saldo per lener</h2>
      ${lenersMetSaldo.length ? `<table class="tabel">
        <thead><tr><th>Lener</th><th class="getal">Lopende leningen</th><th class="getal">Openstaand saldo</th></tr></thead>
        <tbody>${lenersMetSaldo.map((x) => `<tr><td><a href="#/leners/${esc(x.l.id)}">${esc(x.l.naam)}</a></td><td class="getal">${x.aantal}</td><td class="getal">${euro(x.saldo)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="noot">Een lening op naam van meer leners telt bij elke lener volledig mee; het totaal hierboven telt hem één keer.</p>` : '<p class="leeg">Nog geen leners met een lopende lening.</p>'}
    </section>`;
}
