import { esc, euro, datum, TEKST, veiligeUrl } from './hulp.js';
import { STATUS_TEKST } from '../engine/verwerking.js';
import { beschrijfWijziging } from './leningen.js';
import { signaalTabel } from './dashboard.js';
import { formatDatum } from '../engine/datum.js';

export function toon(app, root, [id]) {
  const { data } = app;
  const l = data.leningen.find((x) => x.id === id);
  if (!l) { root.innerHTML = '<p>Lening niet gevonden.</p>'; return; }
  const r = app.verwerking.resultaten.get(id);
  const leners = l.lener_ids.map((i) => data.leners.find((p) => p.id === i)).filter(Boolean);
  const geldgever = data.geldgevers.find((g) => g.id === l.geldgever_id);
  const signalen = app.verwerking.aandacht.filter((s) => s.lening_id === id);
  const alles = sessionStorage.getItem('kaart.alles') === 'ja';

  // Standaard: alle termijnen t/m vandaag plus de komende twaalf.
  const verleden = r.termijnen.filter((t) => t.vervaldatum <= app.peildatum);
  const toekomst = r.termijnen.filter((t) => t.vervaldatum > app.peildatum);
  const zichtbaar = alles ? r.termijnen : [...verleden, ...toekomst.slice(0, 12)];
  const verborgen = r.termijnen.length - zichtbaar.length;

  const ontvangstInfo = new Map(data.ontvangsten.map((o) => [o.id, o]));
  const rij = (label, waarde) => (waarde === '' || waarde === null || waarde === undefined ? '' : `<tr><th>${esc(label)}</th><td>${waarde}</td></tr>`);
  const achterstand = r.termijnen.filter((t) => t.status === 'achterstand').reduce((s, t) => s + t.open, 0);

  root.innerHTML = `
    <div class="geen-print knoppen-boven">
      <a href="#/leningen">&larr; Alle leningen</a>
      <span class="rechts">
        <button class="knop secundair" type="button" id="print">Afdrukken of PDF</button>
        ${app.kanBewerken() ? `<a class="knop secundair" href="#/leningen/${esc(l.id)}">Afspraken bewerken</a> <a class="knop" href="#/invoer?lening=${esc(l.id)}">Ontvangst invoeren</a>` : ''}
      </span>
    </div>
    <h1>Leningkaart ${esc(l.nummer)}</h1>
    <p class="sub">${leners.map((p) => `<a href="#/leners/${esc(p.id)}">${esc(p.naam)}</a>`).join(', ')} &middot; ${esc(geldgever?.naam || '')} &middot; ${esc(TEKST.status[l.status || 'lopend'])} &middot; stand per ${datum(app.peildatum)}</p>

    <div class="tegels">
      <div class="tegel"><div class="tegel-label">Openstaand saldo</div><div class="tegel-waarde">${euro(r.saldo)}</div></div>
      <div class="tegel ${achterstand ? 'tegel-alarm' : ''}"><div class="tegel-label">Achterstand</div><div class="tegel-waarde">${euro(achterstand)}</div></div>
      <div class="tegel"><div class="tegel-label">Rente ontvangen dit jaar</div><div class="tegel-waarde">${euro(r.mutaties.filter((m) => m.soort === 'rente' && m.datum.startsWith(app.peildatum.slice(0, 4))).reduce((s, m) => s + m.centen, 0))}</div></div>
    </div>

    <div class="twee-kolommen">
      <section>
        <h2>Afspraken</h2>
        <table class="kv">
          ${rij('Hoofdsom', euro(Math.round(l.hoofdsom * 100)))}
          ${rij('Ingangsdatum', datum(l.ingangsdatum))}
          ${rij('Einddatum', l.einddatum ? datum(l.einddatum) : 'Geen (vrij aflossen)')}
          ${rij('Rente', `${esc(String(l.rente).replace('.', ','))}% per jaar, ${esc(l.rentetype || 'vast')}${l.herzieningsdatum ? `, herziening ${datum(l.herzieningsdatum)}` : ''}`)}
          ${rij('Aflossing', `${esc(TEKST.aflossingsvorm[l.aflossingsvorm])}, ${esc(TEKST.frequentie[l.frequentie].toLowerCase())}`)}
          ${rij('Betaling', esc(TEKST.betaalwijze[l.betaalwijze || 'samen']))}
          ${rij('Vast termijnbedrag', l.termijnbedrag ? euro(Math.round(l.termijnbedrag * 100)) : '')}
          ${rij('Contract', esc(TEKST.contractsoort[l.contractsoort || 'onderhands']))}
          ${rij('Hypothecair', l.hypothecair ? 'Ja' : 'Nee')}
          ${rij('Eigen woning', l.eigen_woning ? 'Ja' : '')}
          ${rij('Zekerheden', esc(l.zekerheden))}
          ${rij('Bijzonderheden', esc(l.bijzonderheden))}
          ${rij('Beginstand', l.beginstand ? `${euro(Math.round(l.beginstand.saldo * 100))} per ${datum(l.beginstand.datum)}` : '')}
          ${rij('Kwijtgescholden per', l.kwijtschelding_datum ? datum(l.kwijtschelding_datum) : '')}
          ${rij('Document', veiligeUrl(l.document_url) ? `<a href="${esc(veiligeUrl(l.document_url))}" target="_blank" rel="noopener noreferrer">Contract of akte openen</a>` : (l.document_url ? 'Ongeldige link (alleen http of https)' : ''))}
        </table>
        ${l.wijzigingen?.length ? `<h3>Wijzigingen</h3><ul>${l.wijzigingen.map((w) => `<li>${datum(w.datum)}: ${esc(beschrijfWijziging(w))}${w.toelichting ? ` (${esc(w.toelichting)})` : ''}</li>`).join('')}</ul>` : ''}
      </section>
      <section>
        <h2>Meldingen</h2>
        ${signaalTabel(signalen, { metLening: false })}
      </section>
    </div>

    <section>
      <h2>Betalingshistorie</h2>
      ${r.ontvangsten.length ? `<table class="tabel">
        <thead><tr><th>Datum</th><th>Omschrijving</th><th class="getal">Bedrag</th><th class="getal">Rente</th><th class="getal">Aflossing</th><th>Verwerking</th></tr></thead>
        <tbody>${[...r.ontvangsten].reverse().map((o) => {
          const bron = ontvangstInfo.get(o.ontvangst_id);
          return `<tr class="${o.wijze === 'te_beoordelen' ? 'ernst-hoog' : ''}">
            <td>${datum(o.datum)}</td>
            <td>${esc(bron?.omschrijving || '')}${bron?.regels?.length > 1 ? ' <span class="label">gesplitst</span>' : ''}</td>
            <td class="getal">${euro(o.bedrag)}</td>
            <td class="getal">${o.wijze === 'te_beoordelen' || o.wijze === 'voor_start' ? '' : euro(o.rente)}</td>
            <td class="getal">${o.wijze === 'te_beoordelen' || o.wijze === 'voor_start' ? '' : euro(o.aflossing)}${o.extra_aflossing ? ` <span class="klein">(waarvan extra ${euro(o.extra_aflossing)})</span>` : ''}</td>
            <td>${app.kanBewerken() ? `<a href="#/invoer/${esc(o.ontvangst_id)}" class="geen-print-link">${esc(TEKST.wijze[o.wijze])}</a>` : esc(TEKST.wijze[o.wijze])}</td>
          </tr>`;
        }).join('')}</tbody></table>` : '<p class="leeg">Nog geen ontvangsten.</p>'}
    </section>

    <section>
      <h2>Termijnschema</h2>
      ${r.termijnen.length ? `<table class="tabel compact">
        <thead><tr><th class="getal">Nr</th><th>Vervaldatum</th><th class="getal">Rente</th><th class="getal">Aflossing</th><th class="getal">Termijn</th><th class="getal">Ontvangen</th><th class="getal">Open</th><th>Status</th></tr></thead>
        <tbody>${zichtbaar.map((t) => `<tr class="status-${t.status}">
          <td class="getal">${t.nr}</td>
          <td>${datum(t.vervaldatum)}</td>
          <td class="getal">${euro(t.rente)}</td>
          <td class="getal">${euro(t.aflossing)}</td>
          <td class="getal">${euro(t.totaal)}</td>
          <td class="getal">${t.ontvangen ? euro(t.ontvangen) : ''}</td>
          <td class="getal">${t.open > 0 && t.status !== 'gepland' && t.status !== 'vervallen' ? euro(t.open) : ''}</td>
          <td>${esc(STATUS_TEKST[t.status])}${t.laat_betaald ? ` <span class="klein">(betaald ${esc(formatDatum(t.betalingen[t.betalingen.length - 1].datum))})</span>` : ''}</td>
        </tr>`).join('')}</tbody></table>
        ${verborgen > 0 ? `<p class="geen-print"><button type="button" class="link" id="alles">Toon alle ${r.termijnen.length} termijnen</button></p>` : ''}
        ${alles && toekomst.length > 12 ? '<p class="geen-print"><button type="button" class="link" id="minder">Toon minder</button></p>' : ''}`
        : '<p class="leeg">Geen verwachte termijnen.</p>'}
      <p class="noot">Rente per termijn is jaarrente gedeeld door het aantal termijnen per jaar, over het saldo aan het begin van de periode. Vergelijk het schema met het contract.</p>
    </section>`;

  root.querySelector('#print').addEventListener('click', () => window.print());
  root.querySelector('#alles')?.addEventListener('click', () => { sessionStorage.setItem('kaart.alles', 'ja'); toon(app, root, [id]); });
  root.querySelector('#minder')?.addEventListener('click', () => { sessionStorage.removeItem('kaart.alles'); toon(app, root, [id]); });
}
