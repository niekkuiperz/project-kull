// Eigen account: wachtwoord wijzigen.

import { esc, meldingen } from './hulp.js';

export function toon(app, root) {
  if (app.opslag.modus !== 'server') {
    root.innerHTML = '<h1>Mijn account</h1><p>In de proefmodus zijn er geen accounts.</p>';
    return;
  }
  const g = app.gebruiker;
  root.innerHTML = `
    <h1>Mijn account</h1>
    <p>${esc(g.naam)} &middot; ${esc(g.email)}</p>
    <div id="meldingen"></div>
    <form id="ww" class="formulier smal">
      <h2>Wachtwoord wijzigen</h2>
      <label>Huidig wachtwoord<input name="huidig" type="password" required autocomplete="current-password"></label>
      <label>Nieuw wachtwoord<input name="nieuw" type="password" required minlength="12" autocomplete="new-password"><span class="hint">Minstens 12 tekens.</span></label>
      <label>Nogmaals<input name="nogmaals" type="password" required autocomplete="new-password"></label>
      <button class="knop" type="submit">Wijzigen</button>
    </form>
    <p class="hint">Nieuwe telefoon? Vraag de beheerder om "App opnieuw koppelen".</p>`;

  root.querySelector('#ww').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const melding = root.querySelector('#meldingen');
    if (f.nieuw.value !== f.nogmaals.value) { melding.innerHTML = meldingen(['De twee nieuwe wachtwoorden zijn niet gelijk.']); return; }
    try {
      await app.opslag.wijzigWachtwoord(f.nieuw.value, f.huidig.value);
      f.reset();
      melding.innerHTML = '<div class="melding info">Je wachtwoord is gewijzigd. Op andere apparaten moet je opnieuw inloggen.</div>';
    } catch (fout) {
      melding.innerHTML = meldingen([fout.message]);
    }
  });
}
