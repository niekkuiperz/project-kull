// Lokale opslag in de browser (localStorage). Bedoeld om de app uit te
// proberen zonder hosting. Gegevens staan dan alleen in deze browser op deze
// computer: maak regelmatig een exportbestand als back-up.

import { legeAdministratie } from '../engine/administratie.js';

const SLEUTEL = 'leningadministratie.v1';
const MAX_HISTORIE = 15;

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
  }
}
