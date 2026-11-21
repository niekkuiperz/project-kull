// Inloggen bij de eigen server: wachtwoord, daarna een code uit een
// authenticator-app (tweestapsverificatie, eis N-02). Ook de eenmalige
// installatie en het verplicht wijzigen van een tijdelijk wachtwoord.

import { esc } from './hulp.js';
import { qrSvg } from './qr.js';

const MIN = 12;

function scherm(root, titel, inhoud) {
  root.innerHTML = `<div class="inlog"><h1>${esc(titel)}</h1>${inhoud}<div id="fout" role="alert"></div></div>`;
  return root.querySelector('form');
}

function toonFout(root, e) {
  root.querySelector('#fout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`;
}

function wachtOpFormulier(root, form, verwerk) {
  return new Promise((klaar) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const knop = form.querySelector('button[type=submit]');
      knop.disabled = true;
      try {
        klaar(await verwerk(form));
      } catch (fout) {
        toonFout(root, fout);
        knop.disabled = false;
      }
    });
  });
}

const WACHTWOORD_HINT = `<span class="hint">Minstens ${MIN} tekens. Een zin van een paar woorden is sterk en goed te onthouden.</span>`;

async function installeren(opslag, root) {
  const form = scherm(root, 'Installatie', `
    <p>Er is nog geen beheerder. Maak het eerste account aan met de installatiecode uit <code>api/config.php</code>.</p>
    <form class="formulier">
      <label>Installatiecode<input name="code" required autocomplete="off"></label>
      <label>Je naam<input name="naam" required autocomplete="name"></label>
      <label>E-mailadres<input name="email" type="email" required autocomplete="username"></label>
      <label>Wachtwoord<input name="wachtwoord" type="password" required minlength="${MIN}" autocomplete="new-password">${WACHTWOORD_HINT}</label>
      <button class="knop" type="submit">Account aanmaken</button>
    </form>`);
  return wachtOpFormulier(root, form, async (f) => (await opslag.installeren({
    code: f.code.value.trim(), naam: f.naam.value.trim(), email: f.email.value.trim(), wachtwoord: f.wachtwoord.value,
  })).stap);
}

async function inloggen(opslag, root) {
  const form = scherm(root, `Inloggen bij ${opslag.appNaam}`, `
    <form class="formulier">
      <label>E-mailadres<input name="email" type="email" required autocomplete="username"></label>
      <label>Wachtwoord<input name="wachtwoord" type="password" required autocomplete="current-password"></label>
      <button class="knop" type="submit">Verder</button>
    </form>`);
  return wachtOpFormulier(root, form, async (f) => (await opslag.inloggen(f.email.value.trim(), f.wachtwoord.value)).stap);
}

async function koppelen(opslag, root) {
  const { geheim, uri } = await opslag.startKoppelen();
  const leesbaar = geheim.match(/.{1,4}/g).join(' ');
  const form = scherm(root, 'Tweestapsverificatie instellen', `
    <p>Inloggen gaat voortaan met je wachtwoord <strong>en</strong> een code van zes cijfers uit een app op je telefoon.</p>
    <ol class="stappen">
      <li>Installeer een authenticator-app, bijvoorbeeld Microsoft Authenticator of Google Authenticator.</li>
      <li>Kies in de app "account toevoegen" en scan deze code:</li>
    </ol>
    <div class="qr">${qrSvg(uri)}</div>
    <p class="hint">Lukt scannen niet? Kies in de app "code handmatig invoeren" en typ: <code class="geheim">${esc(leesbaar)}</code></p>
    <form class="formulier">
      <label>Code uit de app<input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code"></label>
      <button class="knop" type="submit">Koppelen</button>
    </form>`);
  return wachtOpFormulier(root, form, async (f) => (await opslag.bevestigKoppelen(f.code.value.replace(/\s/g, ''))).stap);
}

async function code(opslag, root) {
  const form = scherm(root, 'Code uit de app', `
    <p>Open je authenticator-app en vul de code van zes cijfers in.</p>
    <form class="formulier">
      <label>Code<input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code" autofocus></label>
      <button class="knop" type="submit">Inloggen</button>
    </form>
    <p class="hint">Telefoon kwijt of nieuw? Vraag de beheerder om je tweestapsverificatie te herstellen.</p>`);
  return wachtOpFormulier(root, form, async (f) => (await opslag.verifieer(f.code.value.replace(/\s/g, ''))).stap);
}

async function nieuwWachtwoord(opslag, root) {
  const form = scherm(root, 'Kies je eigen wachtwoord', `
    <p>Je bent ingelogd met een tijdelijk wachtwoord. Kies nu een eigen wachtwoord.</p>
    <form class="formulier">
      <label>Nieuw wachtwoord<input name="nieuw" type="password" required minlength="${MIN}" autocomplete="new-password">${WACHTWOORD_HINT}</label>
      <label>Nogmaals<input name="nogmaals" type="password" required autocomplete="new-password"></label>
      <button class="knop" type="submit">Opslaan</button>
    </form>`);
  return wachtOpFormulier(root, form, async (f) => {
    if (f.nieuw.value !== f.nogmaals.value) throw new Error('De twee wachtwoorden zijn niet gelijk.');
    return (await opslag.wijzigWachtwoord(f.nieuw.value)).stap;
  });
}

const STAPPEN = {
  installeren, inloggen, totp_instellen: koppelen, totp: code, wachtwoord_wijzigen: nieuwWachtwoord,
};

// Doorloopt de inlogstappen tot de server "klaar" meldt.
export async function toonInloggen(opslag, root) {
  let { stap } = await opslag.sessie();
  for (let i = 0; i < 10 && stap !== 'klaar'; i += 1) {
    const volgende = STAPPEN[stap];
    if (!volgende) throw new Error(`Onbekende inlogstap: ${stap}`);
    stap = await volgende(opslag, root);
  }
}
