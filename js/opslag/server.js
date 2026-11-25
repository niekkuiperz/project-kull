// Opslag via de eigen PHP-backend (map api/). Elke keer opslaan maakt een
// nieuwe versie; wie wat mag, bepaalt de server.

import { ConflictFout } from './lokaal.js';

export class SessieVerlopen extends Error {}

export class ServerOpslag {
  constructor(adres) {
    this.modus = 'server';
    this.adres = adres;
    this.csrf = null;
    this.stap = null;
    this.gebruikerInfo = null;
    this.appNaam = 'Project Kull';
  }

  async verzoek(actie, { methode = 'GET', gegevens, extra = '' } = {}) {
    const opties = { method: methode, credentials: 'same-origin', headers: {} };
    if (methode === 'POST') {
      opties.headers['Content-Type'] = 'application/json';
      opties.headers['X-CSRF'] = this.csrf || '';
      opties.body = JSON.stringify(gegevens || {});
    }
    let antwoord;
    try {
      antwoord = await fetch(`${this.adres}?actie=${encodeURIComponent(actie)}${extra}`, opties);
    } catch {
      throw new Error('Geen verbinding met de server. Controleer je internetverbinding.');
    }
    let json = {};
    try {
      json = await antwoord.json();
    } catch {
      throw new Error(`De server gaf een onverwacht antwoord (${antwoord.status}). Staat de backend goed geïnstalleerd?`);
    }
    if (json.csrf) this.csrf = json.csrf;
    if (json.stap) this.stap = json.stap;
    if (!antwoord.ok) {
      if (antwoord.status === 409 && /conflict/i.test(json.fout || '')) {
        throw new ConflictFout('Iemand anders heeft intussen iets opgeslagen. Je wijziging is niet bewaard: de pagina wordt herladen, voer hem daarna opnieuw in.');
      }
      if (antwoord.status === 401 && this.stap === 'klaar') throw new SessieVerlopen('Je sessie is verlopen. Log opnieuw in.');
      throw new Error(json.fout || `Fout ${antwoord.status}`);
    }
    return json;
  }

  // ---- Inloggen -------------------------------------------------------------
  async sessie() {
    const s = await this.verzoek('sessie');
    this.gebruikerInfo = s.gebruiker;
    this.appNaam = s.app_naam || this.appNaam;
    return s;
  }

  installeren(gegevens) { return this.verzoek('installeren', { methode: 'POST', gegevens }); }
  inloggen(email, wachtwoord) { return this.verzoek('inloggen', { methode: 'POST', gegevens: { email, wachtwoord } }); }
  startKoppelen() { return this.verzoek('totp_start', { methode: 'POST' }); }
  bevestigKoppelen(code) { return this.verzoek('totp_bevestigen', { methode: 'POST', gegevens: { code } }); }
  verifieer(code) { return this.verzoek('totp', { methode: 'POST', gegevens: { code } }); }
  wijzigWachtwoord(nieuw, huidig) { return this.verzoek('wachtwoord', { methode: 'POST', gegevens: { nieuw, huidig } }); }

  async uitloggen() {
    try { await this.verzoek('uitloggen', { methode: 'POST' }); } catch { /* sessie was al weg */ }
  }

  async gebruiker() {
    const s = await this.sessie();
    if (s.stap !== 'klaar' || !s.gebruiker) throw new SessieVerlopen('Je bent niet ingelogd.');
    return s.gebruiker;
  }

  // ---- Gegevens ---------------------------------------------------------------
  async laad() {
    const r = await this.verzoek('laad');
    return { data: r.data, versie: r.versie };
  }

  async bewaar(data, vorigeVersie) {
    const r = await this.verzoek('opslaan', { methode: 'POST', gegevens: { vorige: vorigeVersie, data } });
    return r.versie;
  }

  async historie() {
    return (await this.verzoek('historie')).versies;
  }

  async laadVersie(versie) {
    return (await this.verzoek('versie', { extra: `&id=${Number(versie)}` })).data;
  }

  // ---- Gebruikersbeheer (beheerder) -----------------------------------------
  async gebruikers() { return (await this.verzoek('gebruikers')).gebruikers; }
  voegGebruikerToe(gegevens) { return this.verzoek('gebruiker_toevoegen', { methode: 'POST', gegevens }); }
  wijzigGebruiker(gegevens) { return this.verzoek('gebruiker_wijzigen', { methode: 'POST', gegevens }); }
  herstelGebruiker(gegevens) { return this.verzoek('gebruiker_herstel', { methode: 'POST', gegevens }); }
  verwijderGebruiker(id) { return this.verzoek('gebruiker_verwijderen', { methode: 'POST', gegevens: { id } }); }
  async gebeurtenissen() { return (await this.verzoek('gebeurtenissen')).gebeurtenissen; }

  // ---- Wensen (W-006) --------------------------------------------------------
  dienWensIn(tekst) { return this.verzoek('wens_indienen', { methode: 'POST', gegevens: { tekst } }); }
  async wensen() { return (await this.verzoek('wensen')).wensen; }
  zetWensStatus(id, status) { return this.verzoek('wens_status', { methode: 'POST', gegevens: { id, status } }); }
}
