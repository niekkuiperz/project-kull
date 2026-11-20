import { esc, download, meldingen } from './hulp.js';
import { legeAdministratie } from '../engine/administratie.js';
import { vandaag } from '../engine/datum.js';

export function toon(app, root) {
  const lokaal = app.opslag.modus === 'lokaal';
  const bewerk = app.kanBewerken();
  root.innerHTML = `
    <h1>Instellingen</h1>
    <div id="meldingen"></div>

    <section>
      <h2>Opslag</h2>
      ${lokaal
        ? `<div class="melding waarschuwing"><strong>Lokale proefmodus.</strong> De gegevens staan alleen in deze browser op deze computer. Wis je de browsergegevens, dan ben je ze kwijt. Gebruik dit om uit te proberen; voor echt gebruik koppel je de gedeelde database (zie README).</div>`
        : '<p>Gegevens staan in de gedeelde database. Elke wijziging maakt een nieuwe versie; eerdere versies zijn hieronder terug te zetten.</p>'}
    </section>

    ${bewerk ? `<section>
      <h2>Geldgevers</h2>
      <form id="geldgevers" class="formulier smal">
        ${app.data.geldgevers.map((g) => `<label>Naam voor "${esc(g.id)}"<input name="${esc(g.id)}" value="${esc(g.naam)}" required></label>`).join('')}
        <button class="knop" type="submit">Opslaan</button>
      </form>
    </section>` : ''}

    <section>
      <h2>Back-up</h2>
      <p>Download regelmatig een volledige kopie en bewaar die op een tweede, losse plek (eis N-03). Het bestand bevat alle gegevens in leesbare vorm (JSON).</p>
      <div class="knoppen">
        <button class="knop" type="button" id="export">Download back-up</button>
        ${bewerk ? '<label class="knop secundair bestand">Back-up terugzetten<input type="file" id="import" accept="application/json,.json" hidden></label>' : ''}
      </div>
    </section>

    <section>
      <h2>Versiegeschiedenis</h2>
      <div id="historie"><p class="leeg">Laden...</p></div>
    </section>

    ${bewerk ? `<section>
      <h2>Testen</h2>
      <p>Laad een set verzonnen leningen en ontvangsten om de berekeningen en meldingen te bekijken. Dit vervangt alle huidige gegevens.</p>
      <div class="knoppen">
        <button class="knop secundair" type="button" id="testdata">Fictieve testgegevens laden</button>
        <button class="knop gevaar" type="button" id="leeg">Alles leegmaken</button>
      </div>
    </section>` : ''}`;

  const melding = root.querySelector('#meldingen');

  root.querySelector('#geldgevers')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await app.wijzig((d) => { for (const g of d.geldgevers) g.naam = String(f.get(g.id) || g.naam).trim(); }, 'Geldgevers opgeslagen');
  });

  root.querySelector('#export').addEventListener('click', () => {
    const inhoud = JSON.stringify({ soort: 'leningadministratie-backup', gemaakt_op: new Date().toISOString(), versie: app.versie, data: app.data }, null, 2);
    download(`leningadministratie-backup-${vandaag()}.json`, inhoud, 'application/json');
  });

  root.querySelector('#import')?.addEventListener('change', async (e) => {
    const bestand = e.target.files[0];
    if (!bestand) return;
    try {
      const json = JSON.parse(await bestand.text());
      const data = json.soort === 'leningadministratie-backup' ? json.data : json;
      if (!Array.isArray(data?.leningen) || !Array.isArray(data?.ontvangsten) || !Array.isArray(data?.leners)) throw new Error('Dit is geen back-up van de leningadministratie.');
      if (!confirm(`Back-up terugzetten met ${data.leningen.length} leningen en ${data.ontvangsten.length} ontvangsten? De huidige gegevens worden vervangen (de huidige stand blijft in de versiegeschiedenis).`)) return;
      if (await app.vervangAlles(data, 'Back-up teruggezet')) app.ga('#/');
    } catch (fout) {
      melding.innerHTML = meldingen([fout.message]);
    }
  });

  root.querySelector('#testdata')?.addEventListener('click', async () => {
    if (!confirm('Alle huidige gegevens vervangen door fictieve testgegevens?')) return;
    const { testdata } = await import('../testdata.js');
    if (await app.vervangAlles(testdata, 'Fictieve testgegevens geladen')) app.ga('#/');
  });

  root.querySelector('#leeg')?.addEventListener('click', async () => {
    if (!confirm('Alle leners, leningen en ontvangsten verwijderen? Download eerst een back-up als je die nog nodig hebt.')) return;
    if (await app.vervangAlles(legeAdministratie(), 'Administratie leeggemaakt')) app.ga('#/');
  });

  toonHistorie(app, root.querySelector('#historie'));
}

async function toonHistorie(app, el) {
  try {
    const lijst = await app.opslag.historie();
    if (!lijst.length) { el.innerHTML = '<p class="leeg">Nog geen opgeslagen versies.</p>'; return; }
    el.innerHTML = `${app.opslag.modus === 'lokaal' ? '<p class="hint">In de proefmodus worden alleen de laatste 15 versies bewaard.</p>' : ''}
      <table class="tabel compact"><thead><tr><th>Versie</th><th>Opgeslagen op</th><th>Door</th><th></th></tr></thead><tbody>
      ${lijst.map((h) => `<tr><td>${h.versie}</td><td>${esc(new Date(h.opgeslagen_op).toLocaleString('nl-NL'))}</td><td>${esc(h.door || '')}</td>
        <td>${h.versie === app.versie ? '<span class="label">huidig</span>' : app.kanBewerken() ? `<button type="button" class="link" data-versie="${h.versie}">Terugzetten</button>` : ''}</td></tr>`).join('')}
      </tbody></table>`;
    el.addEventListener('click', async (e) => {
      const v = e.target.dataset.versie;
      if (!v) return;
      if (!confirm(`Versie ${v} terugzetten? Dat wordt een nieuwe versie; niets gaat verloren.`)) return;
      const data = await app.opslag.laadVersie(Number(v));
      if (await app.vervangAlles(data, `Versie ${v} teruggezet`)) app.ga('#/');
    });
  } catch (e) {
    el.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`;
  }
}
