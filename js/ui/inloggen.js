// Inloggen met e-mail, wachtwoord en een code uit een authenticator-app (N-02).
// Wordt alleen gebruikt als de app aan Supabase is gekoppeld.

import { esc } from './hulp.js';

export async function toonInloggen(opslag, root) {
  if (await opslag.sessie()) {
    const status = await opslag.tweestapsStatus();
    if (status === 'klaar') return;
    await stapTweestaps(opslag, root, status);
    return;
  }
  await stapWachtwoord(opslag, root);
  await stapTweestaps(opslag, root, await opslag.tweestapsStatus());
}

function stapWachtwoord(opslag, root) {
  return new Promise((klaar) => {
    root.innerHTML = `<div class="inlog">
      <h1>Inloggen</h1>
      <form id="inlog" class="formulier">
        <label>E-mailadres<input name="email" type="email" autocomplete="username" required></label>
        <label>Wachtwoord<input name="wachtwoord" type="password" autocomplete="current-password" required></label>
        <div id="fout"></div>
        <button class="knop" type="submit">Verder</button>
      </form></div>`;
    root.querySelector('#inlog').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await opslag.inloggen(f.email.value.trim(), f.wachtwoord.value);
        klaar();
      } catch (fout) {
        root.querySelector('#fout').innerHTML = `<div class="melding fout">${esc(fout.message)}</div>`;
      }
    });
  });
}

async function stapTweestaps(opslag, root, status) {
  let factorId = null;
  let uitleg = '<p>Open je authenticator-app en vul de zescijferige code in.</p>';
  if (status === 'aanmelden') {
    const a = await opslag.startAanmelding();
    factorId = a.factorId;
    // Afhankelijk van de versie levert Supabase een SVG of al een data-URL.
    const qr = a.qr.startsWith('data:') ? a.qr : `data:image/svg+xml;utf8,${encodeURIComponent(a.qr)}`;
    uitleg = `<p>Tweestapsverificatie is verplicht. Scan deze code met een authenticator-app (bijvoorbeeld Microsoft Authenticator of Google Authenticator) en vul daarna de zescijferige code in.</p>
      <img class="qr" src="${esc(qr)}" alt="QR-code voor de authenticator-app">
      <p class="hint">Lukt scannen niet? Voer deze sleutel handmatig in: <code>${esc(a.geheim)}</code></p>`;
  }
  return new Promise((klaar) => {
    root.innerHTML = `<div class="inlog">
      <h1>Tweestapsverificatie</h1>
      ${uitleg}
      <form id="code" class="formulier">
        <label>Code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
        <div id="fout"></div>
        <button class="knop" type="submit">Inloggen</button>
      </form></div>`;
    root.querySelector('#code').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await opslag.verifieer(e.target.code.value.trim(), factorId);
        klaar();
      } catch (fout) {
        root.querySelector('#fout').innerHTML = `<div class="melding fout">${esc(fout.message)}</div>`;
      }
    });
  });
}
