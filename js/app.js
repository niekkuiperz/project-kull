import { CONFIG } from './config.js';
import { LokaleOpslag, ConflictFout } from './opslag/lokaal.js';
import { verwerkAlles, legeAdministratie } from './engine/administratie.js';
import { vandaag } from './engine/datum.js';
import { esc } from './ui/hulp.js';
import * as dashboard from './ui/dashboard.js';
import * as leners from './ui/leners.js';
import * as leningen from './ui/leningen.js';
import * as leningkaart from './ui/leningkaart.js';
import * as invoer from './ui/invoer.js';
import * as rapporten from './ui/rapporten.js';
import * as instellingen from './ui/instellingen.js';
import * as hulpScherm from './ui/help.js';
import * as gebruikers from './ui/gebruikers.js';
import * as account from './ui/account.js';
import { toonInloggen } from './ui/inloggen.js';
import { ServerOpslag, SessieVerlopen } from './opslag/server.js';

const ROUTES = [
  { patroon: /^#\/?$/, scherm: dashboard },
  { patroon: /^#\/overzicht$/, scherm: dashboard },
  { patroon: /^#\/leners(?:\/([\w-]+))?$/, scherm: leners },
  { patroon: /^#\/leningen$/, scherm: leningen },
  { patroon: /^#\/leningen\/(nieuw|[\w-]+)$/, scherm: leningen, bewerk: true },
  { patroon: /^#\/lening\/([\w-]+)$/, scherm: leningkaart },
  { patroon: /^#\/invoer(?:\/([\w-]+))?$/, scherm: invoer },
  { patroon: /^#\/rapporten$/, scherm: rapporten },
  { patroon: /^#\/instellingen$/, scherm: instellingen },
  { patroon: /^#\/help$/, scherm: hulpScherm },
  { patroon: /^#\/gebruikers$/, scherm: gebruikers },
  { patroon: /^#\/account$/, scherm: account },
];

function normaliseer(data) {
  const d = data || legeAdministratie();
  d.geldgevers ||= legeAdministratie().geldgevers;
  d.leners ||= [];
  d.leningen ||= [];
  d.ontvangsten ||= [];
  for (const l of d.leningen) l.wijzigingen ||= [];
  for (const l of d.leners) l.tegenrekeningen ||= [];
  return d;
}

export const app = {
  opslag: null,
  data: null,
  versie: 0,
  gebruiker: null,
  verwerking: null,
  peildatum: vandaag(),
  root: null,

  kanBewerken() {
    return this.gebruiker?.rol === 'beheerder' || this.gebruiker?.rol === 'eigenaar';
  },

  herbereken() {
    this.verwerking = verwerkAlles(this.data, this.peildatum);
  },

  // Voert een wijziging uit op een kopie, slaat op en werkt pas daarna het
  // scherm bij. Mislukt het opslaan, dan blijft de oude stand staan.
  async wijzig(aanpassing, melding) {
    if (!this.kanBewerken()) throw new Error('Je hebt alleen leesrechten.');
    const kopie = structuredClone(this.data);
    aanpassing(kopie);
    try {
      this.versie = await this.opslag.bewaar(kopie, this.versie, this.gebruiker?.naam || '');
      this.data = kopie;
      this.herbereken();
      if (melding) toast(melding);
      return true;
    } catch (e) {
      toast(e.message, 'fout');
      if (e instanceof ConflictFout || e instanceof SessieVerlopen) setTimeout(() => location.reload(), 4000);
      return false;
    }
  },

  async vervangAlles(nieuweData, melding) {
    return this.wijzig((d) => {
      const n = normaliseer(structuredClone(nieuweData));
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, n);
    }, melding);
  },

  ga(hash) {
    if (location.hash === hash) this.toon();
    else location.hash = hash;
  },

  toon() {
    const [hash, query] = (location.hash || '#/').split('?');
    const route = ROUTES.find((r) => r.patroon.test(hash));
    const main = document.getElementById('inhoud');
    document.querySelectorAll('nav a').forEach((a) => {
      const doel = a.getAttribute('href');
      a.classList.toggle('actief', doel === hash || (doel !== '#/' && hash.startsWith(doel)) || (doel === '#/' && hash === '#/overzicht'));
    });
    if (!route) {
      main.innerHTML = '<h1>Pagina niet gevonden</h1>';
      return;
    }
    const params = hash.match(route.patroon).slice(1);
    const fout = (e) => {
      console.error(e);
      main.innerHTML = `<div class="melding fout">Er ging iets mis bij het tonen van deze pagina: ${esc(e.message)}</div>`;
      if (e instanceof SessieVerlopen) setTimeout(() => location.reload(), 3000);
    };
    try {
      Promise.resolve(route.scherm.toon(this, main, params, route, new URLSearchParams(query || ''))).catch(fout);
    } catch (e) {
      fout(e);
    }
    window.scrollTo(0, 0);
  },
};

export function toast(tekst, soort = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = tekst;
  el.className = `toast zichtbaar ${soort}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, soort === 'fout' ? 7000 : 3000);
}

function toonKop() {
  const info = document.getElementById('gebruiker');
  const modus = app.opslag.modus === 'lokaal'
    ? '<span class="label waarschuwing" title="Gegevens staan alleen in deze browser">Lokaal op deze computer</span>'
    : '<span class="label">Gedeelde database</span>';
  const rol = { beheerder: 'beheerder', eigenaar: 'bewerken', lezer: 'alleen lezen' }[app.gebruiker.rol] || app.gebruiker.rol;
  const server = app.opslag.modus === 'server';
  info.innerHTML = `${modus} ${server ? `<a href="#/account">${esc(app.gebruiker.naam)}</a>` : `<span>${esc(app.gebruiker.naam)}</span>`} <span>(${esc(rol)})</span>${server ? ' <button type="button" class="link" id="uitloggen">Uitloggen</button>' : ''}`;
  document.getElementById('nav-gebruikers').hidden = !(server && app.gebruiker.rol === 'beheerder');
  document.getElementById('uitloggen')?.addEventListener('click', async () => {
    await app.opslag.uitloggen();
    location.reload();
  });
  document.body.classList.toggle('alleen-lezen', !app.kanBewerken());
}

async function start() {
  const main = document.getElementById('inhoud');
  try {
    if (CONFIG.api) {
      app.opslag = new ServerOpslag(CONFIG.api);
      await toonInloggen(app.opslag, main);
    } else {
      app.opslag = new LokaleOpslag();
    }
    app.gebruiker = await app.opslag.gebruiker();
    const { data, versie } = await app.opslag.laad();
    app.data = normaliseer(data);
    app.versie = versie;
    app.herbereken();
    toonKop();
    document.querySelector('nav').hidden = false;
    window.addEventListener('hashchange', () => app.toon());
    app.toon();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="melding fout"><strong>De administratie kon niet worden geladen.</strong><p>${esc(e.message)}</p></div>`;
    if (e instanceof SessieVerlopen) setTimeout(() => location.reload(), 3000);
  }
}

start();
