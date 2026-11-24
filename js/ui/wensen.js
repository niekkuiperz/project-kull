// W-006: iedere gebruiker kan een wens indienen voor een volgende versie.
// Alleen beheerders zien de ingediende wensen en zetten ze op gezien of
// afgehandeld. Wensen staan los van de administratie: ook wie alleen mag
// lezen kan er een indienen.

import { esc, opties, meldingen } from './hulp.js';

const STATUS = { nieuw: 'Nieuw', gezien: 'Gezien', afgehandeld: 'Afgehandeld' };
const tijd = (iso) => new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });

export const isBeheerder = (app) => app.gebruiker?.rol === 'beheerder';

// Aantal nieuwe wensen voor de melding in het menu; 0 als het niet lukt.
export async function telNieuweWensen(app) {
  if (!isBeheerder(app)) return 0;
  try {
    return (await app.opslag.wensen()).filter((w) => w.status === 'nieuw').length;
  } catch {
    return 0;
  }
}

export async function werkMeldingBij(app) {
  const a = document.getElementById('nav-wensen');
  if (!a) return;
  const n = await telNieuweWensen(app);
  a.innerHTML = n ? `Wensen <span class="teller" title="${n} nieuwe ${n === 1 ? 'wens' : 'wensen'}">${n}</span>` : 'Wensen';
}

export async function toon(app, root) {
  const beheerder = isBeheerder(app);
  root.innerHTML = `
    <h1>Wensen</h1>
    <p>Mis je iets in Kuparium, werkt iets onhandig of klopt er iets niet? Beschrijf het hier. ${beheerder ? 'Wensen van alle gebruikers staan hieronder.' : 'Je wens gaat naar de beheerder; alleen de beheerder ziet ingediende wensen.'}</p>
    <div id="meldingen"></div>
    <form id="wens-form" class="formulier smal">
      <label>Je wens<textarea name="tekst" rows="5" maxlength="2000" required placeholder="Bijvoorbeeld: bij een ontvangst wil ik direct zien welke termijn nog openstaat."></textarea>
        <span class="hint">Noem liever geen bedragen of persoonlijke gegevens van leners; beschrijf wat je wilt kunnen.</span></label>
      <div class="knoppen"><button class="knop" type="submit">Wens indienen</button></div>
    </form>
    ${beheerder ? '<h2>Ingediende wensen</h2><div id="wensenlijst"><p class="leeg">Laden...</p></div>' : ''}`;

  const form = root.querySelector('#wens-form');
  const melding = root.querySelector('#meldingen');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tekst = form.tekst.value.trim();
    if (tekst.length < 5) { melding.innerHTML = meldingen(['Beschrijf je wens in ten minste een paar woorden.']); return; }
    try {
      await app.opslag.dienWensIn(tekst);
      form.reset();
      melding.innerHTML = '';
      app.toast('Bedankt, je wens is ingediend');
      if (beheerder) { await tekenLijst(app, root); werkMeldingBij(app); }
    } catch (err) {
      melding.innerHTML = meldingen([err.message]);
    }
  });

  if (beheerder) await tekenLijst(app, root);
}

async function tekenLijst(app, root) {
  const vak = root.querySelector('#wensenlijst');
  let lijst;
  try {
    lijst = await app.opslag.wensen();
  } catch (err) {
    vak.innerHTML = meldingen([err.message]);
    return;
  }
  if (!lijst.length) { vak.innerHTML = '<p class="leeg">Nog geen wensen ingediend.</p>'; return; }
  vak.innerHTML = `<table class="tabel">
    <thead><tr><th>Ingediend</th><th>Door</th><th>Wens</th><th>Status</th></tr></thead>
    <tbody>${lijst.map((w) => `<tr class="${w.status === 'nieuw' ? 'nadruk' : ''}">
      <td>${esc(tijd(w.tijd))}</td><td>${esc(w.naam)}</td><td class="wenstekst">${esc(w.tekst)}</td>
      <td><select data-wens="${esc(w.id)}" aria-label="Status">${opties(Object.entries(STATUS).map(([waarde, tekst]) => ({ waarde, tekst })), w.status)}</select></td>
    </tr>`).join('')}</tbody></table>`;
  vak.querySelectorAll('select[data-wens]').forEach((s) => s.addEventListener('change', async () => {
    try {
      await app.opslag.zetWensStatus(Number(s.dataset.wens), s.value);
      s.closest('tr').classList.toggle('nadruk', s.value === 'nieuw');
      app.toast('Status bijgewerkt');
      werkMeldingBij(app);
    } catch (err) {
      app.toast(err.message, 'fout');
    }
  }));
}
