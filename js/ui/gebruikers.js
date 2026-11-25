// Gebruikersbeheer voor de beheerder: toevoegen, rol wijzigen, blokkeren,
// wachtwoord of tweestapsverificatie herstellen, en het logboek.

import { esc, opties, meldingen } from './hulp.js';

const ROLLEN = [
  { waarde: 'beheerder', tekst: 'Beheerder (alles, ook gebruikers)' },
  { waarde: 'eigenaar', tekst: 'Bewerken' },
  { waarde: 'lezer', tekst: 'Alleen lezen' },
];
const ROL_KORT = { beheerder: 'Beheerder', eigenaar: 'Bewerken', lezer: 'Alleen lezen' };

const tijd = (iso) => (iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : 'nooit');

function tijdelijkHtml(naam, wachtwoord) {
  return `<div class="melding info"><strong>Tijdelijk wachtwoord voor ${esc(naam)}:</strong>
    <p class="tijdelijk"><code>${esc(wachtwoord)}</code></p>
    Geef dit persoonlijk of telefonisch door, niet per e-mail. Het is maar één keer zichtbaar.
    Bij het inloggen koppelt ${esc(naam)} eerst de authenticator-app en kiest daarna een eigen wachtwoord.</div>`;
}

export async function toon(app, root) {
  if (app.opslag.modus !== 'server' || app.gebruiker.rol !== 'beheerder') {
    root.innerHTML = '<p>Alleen de beheerder kan gebruikers beheren.</p>';
    return;
  }
  root.innerHTML = '<h1>Gebruikers</h1><p class="leeg">Laden...</p>';
  let lijst;
  let logboek;
  try {
    [lijst, logboek] = await Promise.all([app.opslag.gebruikers(), app.opslag.gebeurtenissen()]);
  } catch (e) {
    root.innerHTML = `<h1>Gebruikers</h1>${meldingen([e.message])}`;
    return;
  }

  root.innerHTML = `
    <h1>Gebruikers</h1>
    <div id="meldingen"></div>
    <table class="tabel">
      <thead><tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Status</th><th>Laatst ingelogd</th><th></th></tr></thead>
      <tbody>${lijst.map((g) => `<tr data-id="${g.id}">
        <td>${esc(g.naam)}${g.id === app.gebruiker.id ? ' <span class="label">jij</span>' : ''}</td>
        <td>${esc(g.email)}</td>
        <td>${g.id === app.gebruiker.id ? esc(ROL_KORT[g.rol]) : `<select class="rol">${opties(ROLLEN, g.rol)}</select>`}</td>
        <td>${g.actief ? '' : '<span class="label hoog">Geblokkeerd</span> '}${g.tweestaps ? '' : '<span class="label middel">App nog niet gekoppeld</span> '}${g.moet_wachtwoord_wijzigen ? '<span class="label info">Tijdelijk wachtwoord</span>' : ''}</td>
        <td class="klein">${esc(tijd(g.laatste_login))}</td>
        <td>${g.id === app.gebruiker.id ? '' : `
          <button type="button" class="link" data-actie="blokkeer">${g.actief ? 'Blokkeren' : 'Deblokkeren'}</button> &middot;
          <button type="button" class="link" data-actie="wachtwoord">Nieuw wachtwoord</button> &middot;
          <button type="button" class="link" data-actie="tweestaps">App opnieuw koppelen</button> &middot;
          <button type="button" class="link gevaar" data-actie="verwijder">Verwijderen</button>`}</td>
      </tr>`).join('')}</tbody>
    </table>

    <section>
      <h2>Gebruiker toevoegen</h2>
      <form id="nieuw" class="formulier">
        <div class="rij3">
          <label>Naam<input name="naam" required></label>
          <label>E-mailadres<input name="email" type="email" required></label>
          <label>Rol<select name="rol">${opties(ROLLEN, 'lezer')}</select></label>
        </div>
        <button class="knop" type="submit">Toevoegen</button>
      </form>
    </section>

    <section>
      <h2>Logboek</h2>
      <p class="hint">Inlogpogingen en wijzigingen in accounts, nieuwste eerst.</p>
      <table class="tabel compact">
        <thead><tr><th>Tijd</th><th>Wie</th><th>Wat</th><th>IP-adres</th></tr></thead>
        <tbody>${logboek.map((r) => `<tr class="${/mislukt/.test(r.soort) ? 'ernst-hoog' : ''}"><td class="klein">${esc(tijd(r.tijd))}</td><td>${esc(r.naam || '')}</td><td>${esc(r.omschrijving)}</td><td class="klein">${esc(r.ip || '')}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;

  const melding = root.querySelector('#meldingen');
  const metFout = async (fn) => {
    try {
      await fn();
    } catch (e) {
      melding.innerHTML = meldingen([e.message]);
      window.scrollTo(0, 0);
    }
  };

  root.querySelector('#nieuw').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    metFout(async () => {
      const r = await app.opslag.voegGebruikerToe({ naam: f.naam.value.trim(), email: f.email.value.trim(), rol: f.rol.value });
      const naam = f.naam.value.trim();
      await toon(app, root);
      root.querySelector('#meldingen').innerHTML = tijdelijkHtml(naam, r.tijdelijk_wachtwoord);
    });
  });

  root.querySelectorAll('select.rol').forEach((sel) => sel.addEventListener('change', () => {
    const id = Number(sel.closest('tr').dataset.id);
    metFout(async () => {
      await app.opslag.wijzigGebruiker({ id, rol: sel.value });
      await toon(app, root);
    });
  }));

  root.querySelector('tbody').addEventListener('click', (e) => {
    const actie = e.target.dataset.actie;
    if (!actie) return;
    const id = Number(e.target.closest('tr').dataset.id);
    const g = lijst.find((x) => x.id === id);
    metFout(async () => {
      if (actie === 'blokkeer') {
        if (g.actief && !confirm(`${g.naam} blokkeren? Een open sessie stopt direct.`)) return;
        await app.opslag.wijzigGebruiker({ id, actief: !g.actief });
        await toon(app, root);
      } else if (actie === 'wachtwoord') {
        if (!confirm(`Nieuw tijdelijk wachtwoord maken voor ${g.naam}? Het oude werkt dan niet meer.`)) return;
        const r = await app.opslag.herstelGebruiker({ id, wachtwoord: true });
        await toon(app, root);
        root.querySelector('#meldingen').innerHTML = tijdelijkHtml(g.naam, r.tijdelijk_wachtwoord);
      } else if (actie === 'tweestaps') {
        if (!confirm(`De authenticator-app van ${g.naam} ontkoppelen? Bij de volgende keer inloggen koppelt ${g.naam} de app opnieuw.`)) return;
        await app.opslag.herstelGebruiker({ id, tweestaps: true });
        await toon(app, root);
      } else if (actie === 'verwijder') {
        // W-020: definitief. De naam blijft in versiebeheer, ontvangsten
        // en logboek; e-mailadres, wachtwoord en app-koppeling verdwijnen.
        if (!confirm(`${g.naam} definitief verwijderen?\n\nHet account (e-mailadres, wachtwoord en koppeling met de app) verdwijnt en een open sessie stopt direct. De naam blijft zichtbaar in het logboek en bij wat ${g.naam} heeft ingevoerd.\n\nGaat het om tijdelijk niet meewerken, kies dan liever Blokkeren.`)) return;
        await app.opslag.verwijderGebruiker(id);
        await toon(app, root);
        app.toast(`${g.naam} is verwijderd`);
      }
    });
  });
}
