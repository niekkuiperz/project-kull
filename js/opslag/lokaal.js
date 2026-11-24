// Lokale opslag in de browser (localStorage). Bedoeld om de app uit te
// proberen zonder hosting. Gegevens staan dan alleen in deze browser op deze
// computer: maak regelmatig een exportbestand als back-up.

import { legeAdministratie } from '../engine/administratie.js';

const SLEUTEL = 'leningadministratie.v1';
const MAX_HISTORIE = 15;
const WENSEN = 'leningadministratie.wensen';

export class ConflictFout extends Error {}

export class LokaleOpslag {
  constructor() {
    this.modus = 'lokaal';
  }

  lees() {
    try {
      const ruw = localStorage.getItem(SLEUTEL);
      return ruw ? JSON.parse(ruw) : null;
    } catch {
      return null;
    }
  }

  schrijf(inhoud) {
    localStorage.setItem(SLEUTEL, JSON.stringify(inhoud));
  }

  async gebruiker() {
    return { naam: 'Lokaal', rol: 'beheerder' };
  }

  async laad() {
    const inhoud = this.lees();
    if (!inhoud) return { data: legeAdministratie(), versie: 0 };
    return { data: inhoud.data, versie: inhoud.versie };
  }

  async bewaar(data, vorigeVersie, door) {
    const inhoud = this.lees() || { versie: 0, data: null, historie: [] };
    if (inhoud.versie !== vorigeVersie) {
      throw new ConflictFout('De gegevens zijn intussen in een ander tabblad gewijzigd. Herlaad de pagina.');
    }
    const versie = inhoud.versie + 1;
    const historie = [{ versie, opgeslagen_op: new Date().toISOString(), door, data }, ...(inhoud.historie || [])].slice(0, MAX_HISTORIE);
    try {
      this.schrijf({ versie, data, historie });
    } catch {
      // Browseropslag vol: bewaar dan zonder oude versies.
      this.schrijf({ versie, data, historie: historie.slice(0, 1) });
    }
    return versie;
  }

  async historie() {
    const inhoud = this.lees();
    return (inhoud?.historie || []).map((h) => ({ versie: h.versie, opgeslagen_op: h.opgeslagen_op, door: h.door }));
  }

  async laadVersie(versie) {
    const h = (this.lees()?.historie || []).find((x) => x.versie === versie);
    if (!h) throw new Error('Deze versie is niet meer beschikbaar.');
    return h.data;
  }

  async wisAlles() {
    localStorage.removeItem(SLEUTEL);
    localStorage.removeItem(WENSEN);
  }

  // ---- Wensen (W-006), in de proefmodus alleen in deze browser --------------
  leesWensen() {
    try { return JSON.parse(localStorage.getItem(WENSEN) || '[]'); } catch { return []; }
  }

  async dienWensIn(tekst) {
    const t = String(tekst || '').trim();
    if (t.length < 5) throw new Error('Beschrijf je wens in ten minste een paar woorden.');
    if (t.length > 2000) throw new Error('tekst is te lang.');
    const lijst = this.leesWensen();
    const id = lijst.reduce((m, w) => Math.max(m, w.id), 0) + 1;
    lijst.unshift({ id, tijd: new Date().toISOString(), naam: 'Lokaal', tekst: t, status: 'nieuw' });
    localStorage.setItem(WENSEN, JSON.stringify(lijst));
    return { ok: true };
  }

  async wensen() {
    return this.leesWensen();
  }

  async zetWensStatus(id, status) {
    const lijst = this.leesWensen();
    const w = lijst.find((x) => x.id === id);
    if (!w) throw new Error('Deze wens bestaat niet.');
    w.status = status;
    localStorage.setItem(WENSEN, JSON.stringify(lijst));
    return { ok: true };
  }
}
