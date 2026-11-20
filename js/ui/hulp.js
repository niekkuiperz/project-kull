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
  aflossingsvorm: { annuitair: 'Annuïtair', lineair: 'Lineair', aflossingsvrij: 'Aflossingsvrij', vrij: 'Vrij aflossen' },
  frequentie: { week: 'Per week', maand: 'Per maand', kwartaal: 'Per kwartaal', jaar: 'Per jaar' },
  status: { lopend: 'Lopend', afgelost: 'Afgelost', kwijtgescholden: 'Kwijtgescholden' },
  contractsoort: { onderhands: 'Onderhandse akte', notarieel: 'Notariële akte' },
  betaalwijze: { samen: 'Rente en aflossing samen', apart: 'Rente en aflossing apart' },
  wijze: { automatisch: 'Automatisch verdeeld', handmatig: 'Handmatig verdeeld', te_beoordelen: 'Te beoordelen', voor_start: 'Telt niet mee' },
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
