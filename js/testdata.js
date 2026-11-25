// FICTIEVE testgegevens. Namen, bedragen en rekeningnummers zijn verzonnen en
// dienen alleen om de berekeningen en signaleringen te kunnen beproeven.

import { verwerkLening } from './engine/verwerking.js';
import { plusDagen } from './engine/datum.js';

const leners = [
  { id: 'p1', naam: 'Fam. Jansen (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 01'], notities: '' },
  { id: 'p2', naam: 'De Vries Holding (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 02', 'NL00 TEST 0000 0000 22'], notities: 'Betaalt soms vanaf de privérekening van de directeur.' },
  { id: 'p3', naam: 'Fam. Bakker (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 03'], notities: '' },
  { id: 'p4', naam: 'J. Visser (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 04'], notities: '' },
  { id: 'p5', naam: 'E. Mulder (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 05'], notities: 'Lening voor eigen woning: jaaroverzicht nodig voor de aangifte.' },
  { id: 'p6', naam: 'K. Peters (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: [], notities: '' },
  { id: 'p7', naam: 'Hendriks Bouw (fictief)', email: '', telefoon: '', adres: '', tegenrekeningen: ['NL00 TEST 0000 0000 07'], notities: '' },
];

const std = {
  contractsoort: 'onderhands', rentetype: 'vast', herzieningsdatum: null, betaalwijze: 'samen', hypothecair: false,
  zekerheden: '', bijzonderheden: '', eigen_woning: false, status: 'lopend', document_url: '', eerste_vervaldatum: null,
  termijnbedrag: null, wijzigingen: [], kwijtschelding_datum: null,
};

const leningen = [
  { ...std, id: 'n1', nummer: 'L-001', lener_ids: ['p1'], geldgever_id: 'prive', hoofdsom: 25000, rente: 4, aflossingsvorm: 'annuitair', frequentie: 'maand', ingangsdatum: '2021-03-01', einddatum: '2031-03-01', beginstand: { datum: '2025-12-31', saldo: 13450 } },
  { ...std, id: 'n2', nummer: 'L-002', lener_ids: ['p2'], geldgever_id: 'bv', hoofdsom: 60000, rente: 5, aflossingsvorm: 'lineair', frequentie: 'kwartaal', ingangsdatum: '2024-01-01', einddatum: '2034-01-01', beginstand: { datum: '2025-12-31', saldo: 54000 } },
  { ...std, id: 'n3', nummer: 'L-003', lener_ids: ['p3'], geldgever_id: 'prive', hoofdsom: 150000, rente: 3.5, aflossingsvorm: 'aflossingsvrij', frequentie: 'maand', ingangsdatum: '2019-06-01', einddatum: '2039-06-01', contractsoort: 'notarieel', hypothecair: true, zekerheden: 'Recht van hypotheek op de woning', beginstand: { datum: '2025-12-31', saldo: 150000 } },
  { ...std, id: 'n4', nummer: 'L-004', lener_ids: ['p4'], geldgever_id: 'prive', hoofdsom: 10000, rente: 2, aflossingsvorm: 'aflossingsvrij', frequentie: 'jaar', ingangsdatum: '2025-01-01', einddatum: null, beginstand: { datum: '2025-12-31', saldo: 8000 } },
  { ...std, id: 'n5', nummer: 'L-005', lener_ids: ['p5'], geldgever_id: 'prive', hoofdsom: 200000, rente: 2.5, aflossingsvorm: 'annuitair', frequentie: 'maand', ingangsdatum: '2026-03-01', einddatum: '2056-03-01', eigen_woning: true, contractsoort: 'notarieel', beginstand: null },
  { ...std, id: 'n6', nummer: 'L-006', lener_ids: ['p2'], geldgever_id: 'bv', hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', frequentie: 'maand', ingangsdatum: '2025-07-01', einddatum: '2028-07-01', beginstand: { datum: '2025-12-31', saldo: 8540 } },
  { ...std, id: 'n7', nummer: 'L-007', lener_ids: ['p6'], geldgever_id: 'prive', hoofdsom: 5000, rente: 0, aflossingsvorm: 'lineair', frequentie: 'jaar', ingangsdatum: '2020-01-01', einddatum: '2025-01-01', status: 'afgelost', beginstand: { datum: '2025-12-31', saldo: 0 } },
  { ...std, id: 'n8', nummer: 'L-008', lener_ids: ['p7'], geldgever_id: 'bv', hoofdsom: 30000, rente: 4, rentetype: 'variabel', herzieningsdatum: '2027-01-01', aflossingsvorm: 'aflossingsvrij', frequentie: 'kwartaal', ingangsdatum: '2023-01-01', einddatum: '2033-01-01', beginstand: { datum: '2025-12-31', saldo: 30000 }, wijzigingen: [{ id: 'w1', datum: '2026-07-01', rente: 4.5, toelichting: 'Renteherziening per 1 juli 2026' }] },
];

// Bouwt ontvangsten op basis van het berekende schema.
function schema(id) {
  const lening = leningen.find((l) => l.id === id);
  return verwerkLening(lening, [], '2026-12-31').termijnen;
}

const ontvangsten = [];
let teller = 1;
function ontvangst(lenerId, datum, bedrag, regels, extra = {}) {
  ontvangsten.push({
    id: `t${teller++}`, datum, bedrag, lener_id: lenerId, tegenrekening: leners.find((l) => l.id === lenerId).tegenrekeningen[0] || '',
    omschrijving: extra.omschrijving || 'Termijn lening', regels, ingevoerd_door: 'testdata', ingevoerd_op: '2026-11-20T12:00:00Z',
  });
}
const euro = (c) => c / 100;
const tot = '2026-11-20';

// L-001: alles netjes op tijd.
for (const t of schema('n1').filter((x) => x.vervaldatum <= tot)) {
  ontvangst('p1', t.vervaldatum, euro(t.totaal), [{ lening_id: 'n1', bedrag: euro(t.totaal) }]);
}

// L-002 en L-006 (zelfde lener): in april één betaling voor beide (F-13);
// de kwartaaltermijn van oktober ontbreekt (achterstand).
const s2 = schema('n2');
const s6 = schema('n6');
const op = (s, d) => s.find((t) => t.vervaldatum === d);
ontvangst('p2', '2026-01-03', euro(op(s2, '2026-01-01').totaal), [{ lening_id: 'n2', bedrag: euro(op(s2, '2026-01-01').totaal) }]);
ontvangst('p2', '2026-04-02', euro(op(s2, '2026-04-01').totaal + op(s6, '2026-04-01').totaal), [
  { lening_id: 'n2', bedrag: euro(op(s2, '2026-04-01').totaal) },
  { lening_id: 'n6', bedrag: euro(op(s6, '2026-04-01').totaal) },
], { omschrijving: 'Rente en aflossing beide leningen' });
ontvangst('p2', '2026-07-01', euro(op(s2, '2026-07-01').totaal), [{ lening_id: 'n2', bedrag: euro(op(s2, '2026-07-01').totaal) }]);
for (const t of s6.filter((x) => x.vervaldatum <= tot && x.vervaldatum !== '2026-04-01')) {
  ontvangst('p2', plusDagen(t.vervaldatum, 2), euro(t.totaal), [{ lening_id: 'n6', bedrag: euro(t.totaal) }]);
}

// L-003: maandrente, in oktober een afwijkend bedrag (te beoordelen).
for (const t of schema('n3').filter((x) => x.vervaldatum <= tot)) {
  const bedrag = t.vervaldatum === '2026-10-01' ? 500 : euro(t.totaal);
  ontvangst('p3', t.vervaldatum, bedrag, [{ lening_id: 'n3', bedrag }]);
}

// L-004: aflossingsvrij zonder einddatum, jaarrente in januari en één handmatig verdeelde aflossing.
ontvangst('p4', '2026-01-05', 160, [{ lening_id: 'n4', bedrag: 160 }], { omschrijving: 'Rente 2025' });
ontvangst('p4', '2026-06-15', 1000, [{ lening_id: 'n4', bedrag: 1000, rente: 0, aflossing: 1000 }], { omschrijving: 'Extra aflossing' });

// L-005: nieuwe eigenwoninglening, juli per ongeluk twee keer ingevoerd.
for (const t of schema('n5').filter((x) => x.vervaldatum <= tot)) {
  ontvangst('p5', t.vervaldatum, euro(t.totaal), [{ lening_id: 'n5', bedrag: euro(t.totaal) }]);
  if (t.vervaldatum === '2026-07-01') ontvangst('p5', t.vervaldatum, euro(t.totaal), [{ lening_id: 'n5', bedrag: euro(t.totaal) }]);
}

// L-008: kwartaalrente, met renteherziening per 1 juli.
for (const t of schema('n8').filter((x) => x.vervaldatum <= tot)) {
  ontvangst('p7', plusDagen(t.vervaldatum, 5), euro(t.totaal), [{ lening_id: 'n8', bedrag: euro(t.totaal) }]);
}

export const testdata = {
  versie: 1,
  geldgevers: [
    { id: 'prive', naam: 'Privé (fictief)' },
    { id: 'bv', naam: 'BV (fictief)' },
  ],
  leners,
  leningen,
  ontvangsten,
};
