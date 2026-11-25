// Kleine hulpfuncties voor het opbouwen van schermen.

import { formatEuro } from '../engine/geld.js';
import { formatDatum } from '../engine/datum.js';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const euro = (centen) => esc(formatEuro(centen));
export const datum = (iso) => esc(formatDatum(iso));

export function opties(lijst, gekozen, { leeg } = {}) {
  const items = leeg !== undefined ? [{ waarde: '', tekst: leeg }, ...lijst] : lijst;
  return items
    .map((o) => `<option value="${esc(o.waarde)}"${String(o.waarde) === String(gekozen ?? '') ? ' selected' : ''}>${esc(o.tekst)}</option>`)
    .join('');
}

export function nieuwId(prefix) {
  const r = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
  return `${prefix}_${r}`;
}

export function formData(form) {
  const fd = new FormData(form);
  const uit = {};
  for (const [k, v] of fd.entries()) {
    if (k in uit) {
      uit[k] = Array.isArray(uit[k]) ? [...uit[k], v] : [uit[k], v];
    } else uit[k] = v;
  }
  return uit;
}

export function meldingen(fouten = [], waarschuwingen = []) {
  let html = '';
  if (fouten.length) html += `<div class="melding fout" role="alert"><strong>Niet opgeslagen:</strong><ul>${fouten.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  if (waarschuwingen.length) html += `<div class="melding waarschuwing" role="alert"><ul>${waarschuwingen.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  return html;
}

export const TEKST = {
  aflossingsvorm: { annuitair: 'Annuïtair', lineair: 'Lineair', aflossingsvrij: 'Aflossingsvrij' },
  frequentie: { week: 'Per week', maand: 'Per maand', kwartaal: 'Per kwartaal', jaar: 'Per jaar' },
  status: { lopend: 'Lopend', afgelost: 'Afgelost', kwijtgescholden: 'Kwijtgescholden' },
  contractsoort: { onderhands: 'Onderhandse akte', notarieel: 'Notariële akte' },
  betaalwijze: { samen: 'Rente en aflossing samen', apart: 'Rente en aflossing apart' },
  wijze: {
    automatisch: 'Automatisch verdeeld',
    handmatig: 'Handmatig verdeeld',
    termijnen: 'Verdeeld over termijnen',
    deels: 'Deels verwerkt, restant te beoordelen',
    te_beoordelen: 'Te beoordelen',
    teruggestort: 'Teruggestort, telt niet mee',
    voor_start: 'Telt niet mee',
  },
  // W-019: keuze bij een te hoog bedrag.
  keuze: {
    '': 'Volle termijnen; restant beoordelen',
    volgende: 'Restant naar de volgende termijn (rente eerst)',
    extra: 'Restant als extra aflossing',
    terug: 'Restant terugstorten',
    alles_extra: 'Alles boven de eerste termijn als extra aflossing',
    alles_terug: 'Hele bedrag terugstorten (telt niet mee)',
  },
  ernst: { hoog: 'Actie nodig', middel: 'Let op', info: 'Ter info' },
};

export function lijstOpties(obj) {
  return Object.entries(obj).map(([waarde, tekst]) => ({ waarde, tekst }));
}

export function download(bestandsnaam, inhoud, type) {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Leest een getal in Nederlandse notatie. Geeft null bij een leeg veld en NaN
// bij onzin. Bedragen (standaard): punt = duizendtal als er een komma staat of
// als de punt gevolgd wordt door groepen van precies drie cijfers
// ("12.000" is twaalfduizend). Voor percentages (duizendtallen: false) is een
// punt altijd een decimaalteken ("3.125" is 3,125%).
export function leesGetal(v, { duizendtallen = true } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  let t = String(v).trim().replace(/[\s€%]/g, '');
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (duizendtallen && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// Alleen gewone webadressen als link toestaan. Een "javascript:"- of "data:"-
// adres zou code kunnen uitvoeren bij wie erop klikt.
export function veiligeUrl(url) {
  const t = String(url || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : '';
}


// W-019: herleidbaarheid. Voor welke termijnen een ontvangst(regel) is
// gebruikt, als tekst: "termijn 7 en 8, deel van termijn 9".
export function gebruiktVoorTekst(resultaat, ontvangstId, regel) {
  if (!resultaat) return '';
  const hoort = (b) => b.ontvangst_id === ontvangstId && (b.regel === undefined || regel === undefined || b.regel === regel);
  const vol = [];
  const deel = [];
  for (const t of resultaat.termijnen) {
    const hier = t.betalingen.filter(hoort).reduce((s, b) => s + b.rente + b.aflossing, 0);
    if (hier <= 0) continue;
    (hier >= t.totaal ? vol : deel).push(t.nr);
  }
  const lijst = (nrs) => (nrs.length > 1 ? `${nrs.slice(0, -1).join(', ')} en ${nrs[nrs.length - 1]}` : `${nrs[0]}`);
  const delen = [];
  if (vol.length) delen.push(`termijn ${lijst(vol)}`);
  if (deel.length) delen.push(`deel van termijn ${lijst(deel)}`);
  return delen.join(', ');
}
