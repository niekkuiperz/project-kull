import { esc, euro, nieuwId, formData, meldingen, veiligeUrl } from './hulp.js';
import { normaliseerIban } from '../engine/administratie.js';

export function toon(app, root, [id]) {
  if (id) return toonFormulier(app, root, id);
  const { data } = app;
  const { totalen } = app.verwerking;
  const rijen = [...data.leners].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  root.innerHTML = `
    <div class="kop-met-knop"><h1>Leners</h1>${app.kanBewerken() ? '<a class="knop" href="#/leners/nieuw">Nieuwe lener</a>' : ''}</div>
    ${rijen.length ? `<table class="tabel">
      <thead><tr><th>Naam</th><th>Bekende tegenrekeningen</th><th class="getal">Leningen</th><th class="getal">Saldo</th></tr></thead>
      <tbody>${rijen.map((l) => {
        const n = data.leningen.filter((x) => x.lener_ids.includes(l.id));
        return `<tr>
          <td><a href="#/leners/${esc(l.id)}">${esc(l.naam)}</a></td>
          <td class="klein">${l.tegenrekeningen.map(esc).join('<br>')}</td>
          <td class="getal">${n.length}</td>
          <td class="getal">${euro(totalen.perLener[l.id] || 0)}</td>
        </tr>`;
      }).join('')}</tbody></table>` : '<p class="leeg">Nog geen leners.</p>'}`;
}

function toonFormulier(app, root, id) {
  const nieuw = id === 'nieuw';
  const l = nieuw ? { naam: '', adres: '', email: '', telefoon: '', tegenrekeningen: [], map_url: '', notities: '' } : app.data.leners.find((x) => x.id === id);
  if (!l) { root.innerHTML = '<p>Lener niet gevonden.</p>'; return; }
  const leningen = nieuw ? [] : app.data.leningen.filter((x) => x.lener_ids.includes(l.id));
  const ro = !app.kanBewerken() ? 'disabled' : '';

  root.innerHTML = `
    <p><a href="#/leners">&larr; Alle leners</a></p>
    <h1>${nieuw ? 'Nieuwe lener' : esc(l.naam)}</h1>
    <div id="meldingen"></div>
    <form id="lener-form" class="formulier">
      <fieldset ${ro}>
        <label>Naam<input name="naam" required value="${esc(l.naam)}" autocomplete="off"></label>
        <label>Adres<textarea name="adres" rows="2">${esc(l.adres)}</textarea></label>
        <div class="rij2">
          <label>E-mail<input name="email" type="email" value="${esc(l.email)}"></label>
          <label>Telefoon<input name="telefoon" value="${esc(l.telefoon)}"></label>
        </div>
        <label>Bekende tegenrekeningen (één IBAN per regel)
          <textarea name="tegenrekeningen" rows="3" placeholder="NL00 BANK 0123 4567 89">${esc(l.tegenrekeningen.join('\n'))}</textarea>
          <span class="hint">Helpt bij het herkennen van betalingen tijdens het invoeren.</span>
        </label>
        <label>Map met contracten en akten (link)<input name="map_url" type="url" value="${esc(l.map_url || '')}" placeholder="https://..."></label>
        <label>Notities<textarea name="notities" rows="3">${esc(l.notities)}</textarea></label>
        <div class="knoppen">
          <button class="knop" type="submit">Opslaan</button>
          ${!nieuw && !leningen.length ? '<button class="knop gevaar" type="button" id="verwijder">Verwijderen</button>' : ''}
        </div>
      </fieldset>
    </form>
    ${!nieuw ? `<section><h2>Leningen</h2>
      ${leningen.length ? `<ul>${leningen.map((n) => `<li><a href="#/lening/${esc(n.id)}">${esc(n.nummer)}</a> (${esc(n.status || 'lopend')}) ${euro(app.verwerking.resultaten.get(n.id).saldo)}</li>`).join('')}</ul>` : '<p class="leeg">Geen leningen.</p>'}
      ${veiligeUrl(l.map_url) ? `<p><a href="${esc(veiligeUrl(l.map_url))}" target="_blank" rel="noopener noreferrer">Open map met documenten</a></p>` : ''}
      <p><a href="#/rapporten">Jaaroverzicht voor deze lener</a></p>
    </section>` : ''}`;

  root.querySelector('#lener-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const fouten = [];
    const naam = String(f.naam || '').trim();
    if (!naam) fouten.push('Naam is verplicht.');
    if (f.map_url && !veiligeUrl(f.map_url)) fouten.push('De link naar de map moet beginnen met http:// of https://.');
    const rekeningen = String(f.tegenrekeningen || '').split('\n').map((t) => t.trim()).filter(Boolean);
    for (const r of rekeningen) {
      const andere = app.data.leners.find((x) => x.id !== l.id && x.tegenrekeningen.some((t) => normaliseerIban(t) === normaliseerIban(r)));
      if (andere) fouten.push(`Rekening ${r} staat al bij ${andere.naam}.`);
    }
    if (fouten.length) { root.querySelector('#meldingen').innerHTML = meldingen(fouten); return; }
    const nieuweId = nieuw ? nieuwId('lener') : l.id;
    const record = { ...l, id: nieuweId, naam, adres: f.adres || '', email: f.email || '', telefoon: f.telefoon || '', tegenrekeningen: rekeningen, map_url: f.map_url || '', notities: f.notities || '' };
    const ok = await app.wijzig((d) => {
      if (nieuw) d.leners.push(record);
      else d.leners[d.leners.findIndex((x) => x.id === l.id)] = record;
    }, 'Lener opgeslagen');
    if (ok) app.ga(`#/leners/${nieuweId}`);
  });

  root.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm(`${l.naam} verwijderen?`)) return;
    const ok = await app.wijzig((d) => { d.leners = d.leners.filter((x) => x.id !== l.id); }, 'Lener verwijderd');
    if (ok) app.ga('#/leners');
  });
}
