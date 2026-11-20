// Bedragen worden in de opslag als euro's bewaard (getal met maximaal twee
// decimalen). De rekenkern werkt in centen (gehele getallen), zodat er geen
// afrondingsverschillen van drijvende-kommagetallen ontstaan.

export function naarCenten(euro) {
  if (euro === null || euro === undefined || euro === '') return null;
  return Math.round(Number(euro) * 100);
}

export function naarEuro(centen) {
  return centen / 100;
}

const formatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

export function formatEuro(centen) {
  if (centen === null || centen === undefined) return '';
  return formatter.format(centen / 100);
}

// Leest een door een mens getypt bedrag: "1.234,56", "1234,56" of "1234.56".
export function leesBedrag(tekst) {
  if (typeof tekst === 'number') return Number.isFinite(tekst) ? tekst : null;
  if (!tekst) return null;
  let t = String(tekst).trim().replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "12.000"
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}
