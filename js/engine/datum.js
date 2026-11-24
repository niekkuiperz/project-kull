// Datumfuncties op ISO-strings (JJJJ-MM-DD). Alle rekenwerk in UTC, zodat
// zomertijd en tijdzones geen dagen verschuiven.

export function naarUTC(iso) {
  const [j, m, d] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, d);
}

export function vanUTC(ms) {
  const d = new Date(ms);
  const j = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dag = String(d.getUTCDate()).padStart(2, '0');
  return `${j}-${m}-${dag}`;
}

export function isGeldig(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return vanUTC(naarUTC(iso)) === iso;
}

// W-015: alleen reële datums. Een datumveld in de browser accepteert ook een
// jaartal van zes cijfers; dat is altijd een tikfout.
export const MIN_DATUM = '2000-01-01';
export const MAX_DATUM = '2200-12-31';
export function binnenBereik(iso) {
  return isGeldig(iso) && iso >= MIN_DATUM && iso <= MAX_DATUM;
}

export function plusDagen(iso, n) {
  return vanUTC(naarUTC(iso) + n * 86400000);
}

function dagenInMaand(j, m) {
  // m is 1-12
  return new Date(Date.UTC(j, m, 0)).getUTCDate();
}

// Telt n maanden op. De dag wordt afgekapt op het einde van de maand
// (31 januari + 1 maand = 28 of 29 februari). Met ankerDag blijft een reeks
// op dezelfde dag uitkomen (31 jan, 28 feb, 31 mrt) in plaats van te verschuiven.
export function plusMaanden(iso, n, ankerDag) {
  const [j, m, d] = iso.split('-').map(Number);
  const totaal = (j * 12 + (m - 1)) + n;
  const nj = Math.floor(totaal / 12);
  const nm = (totaal % 12) + 1;
  const dag = Math.min(ankerDag ?? d, dagenInMaand(nj, nm));
  return `${nj}-${String(nm).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
}

export const PERIODES_PER_JAAR = { week: 52, maand: 12, kwartaal: 4, jaar: 1 };

// De k-de termijndatum vanaf een anker (k = 0 geeft het anker zelf).
// Valt het anker op de laatste dag van een maand (30 april, 28 februari), dan
// blijft de reeks op de laatste dag van de maand (31 mei, 30 juni, ...). W-013.
export function termijnDatum(anker, frequentie, k) {
  const ankerDag = anker === eindeMaand(anker) ? 31 : Number(anker.slice(8, 10));
  switch (frequentie) {
    case 'week': return plusDagen(anker, 7 * k);
    case 'maand': return plusMaanden(anker, k, ankerDag);
    case 'kwartaal': return plusMaanden(anker, 3 * k, ankerDag);
    case 'jaar': return plusMaanden(anker, 12 * k, ankerDag);
    default: throw new Error(`Onbekende termijnfrequentie: ${frequentie}`);
  }
}

export function eenPeriodeNa(iso, frequentie) {
  return termijnDatum(iso, frequentie, 1);
}

export function vandaag() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dag = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dag}`;
}

export function formatDatum(iso) {
  if (!iso) return '';
  const [j, m, d] = iso.split('-');
  return `${d}-${m}-${j}`;
}

// Laatste dag van de maand waarin iso valt.
export function eindeMaand(iso) {
  return plusDagen(plusMaanden(`${iso.slice(0, 7)}-01`, 1), -1);
}

// W-013: voorstel voor de eerste vervaldatum. Rente wordt in de regel aan het
// einde van de maand betaald: de eerste termijn valt op het einde van de maand
// waarin de eerste volle periode eindigt (start 1-6, per maand: 30-6; start
// 12-4, per maand: 31-5; start 1-1, per kwartaal: 31-3). Bij weektermijnen
// geen voorstel.
export function voorstelEersteVervaldatum(ingangsdatum, frequentie) {
  if (!isGeldig(ingangsdatum) || !['maand', 'kwartaal', 'jaar'].includes(frequentie)) return null;
  return eindeMaand(plusDagen(eenPeriodeNa(ingangsdatum, frequentie), -1));
}
