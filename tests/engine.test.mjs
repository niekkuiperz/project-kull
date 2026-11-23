import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termijnDatum, plusMaanden, isGeldig } from '../js/engine/datum.js';
import { leesBedrag } from '../js/engine/geld.js';
import { verwerkLening } from '../js/engine/verwerking.js';
import {
  verwerkAlles, jaaroverzichtGeldgevers, jaaroverzichtLener, controleerOntvangst, stelLenerVoor, legeAdministratie,
} from '../js/engine/administratie.js';
import { testdata } from '../js/testdata.js';

const basis = {
  id: 'l1', nummer: 'L-1', lener_ids: ['a'], geldgever_id: 'prive', betaalwijze: 'samen',
  ingangsdatum: '2026-01-01', frequentie: 'maand',
};
const som = (lijst, veld) => lijst.reduce((s, x) => s + x[veld], 0);

test('datums: maandreeks blijft op het einde van de maand', () => {
  assert.equal(termijnDatum('2026-01-31', 'maand', 1), '2026-02-28');
  assert.equal(termijnDatum('2026-01-31', 'maand', 2), '2026-03-31');
  assert.equal(termijnDatum('2024-01-31', 'maand', 1), '2024-02-29');
  assert.equal(termijnDatum('2026-01-05', 'week', 2), '2026-01-19');
  assert.equal(termijnDatum('2026-01-15', 'kwartaal', 1), '2026-04-15');
  assert.equal(plusMaanden('2026-12-15', 1), '2027-01-15');
  assert.equal(isGeldig('2026-02-30'), false);
});

test('bedragen lezen in Nederlandse notatie', () => {
  assert.equal(leesBedrag('1.234,56'), 1234.56);
  assert.equal(leesBedrag('860,66'), 860.66);
  assert.equal(leesBedrag('100.5'), 100.5);
  assert.equal(leesBedrag('12,345'), null);
  assert.equal(leesBedrag('12.000'), 12000);
  assert.equal(leesBedrag('1.250.000'), 1250000);
});

test('invoervelden: duizendtallen en percentages', async () => {
  const { leesGetal } = await import('../js/ui/hulp.js');
  assert.equal(leesGetal('12.000'), 12000);
  assert.equal(leesGetal('12.000,50'), 12000.5);
  assert.equal(leesGetal('12000'), 12000);
  assert.equal(leesGetal('437,50'), 437.5);
  assert.equal(leesGetal('437.50'), 437.5);
  assert.equal(leesGetal('3.125', { duizendtallen: false }), 3.125);
  assert.equal(leesGetal('3,5', { duizendtallen: false }), 3.5);
  assert.equal(leesGetal(''), null);
  assert.ok(Number.isNaN(leesGetal('twaalf')));
});

test('annuïtair: 10.000 tegen 6% in 12 maanden geeft 860,66 per maand', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', einddatum: '2027-01-01' };
  const r = verwerkLening(l, [], '2026-01-01');
  assert.equal(r.termijnen.length, 12);
  assert.equal(r.termijnen[0].vervaldatum, '2026-02-01');
  assert.equal(r.termijnen[0].rente, 5000);
  assert.equal(r.termijnen[0].totaal, 86066);
  assert.equal(som(r.termijnen, 'aflossing'), 1000000);
  // laatste termijn wijkt door afronding hooguit enkele centen af
  assert.ok(Math.abs(r.termijnen[11].totaal - 86066) <= 5);
});

test('lineair: 12.000 tegen 3% in 12 maanden', () => {
  const l = { ...basis, hoofdsom: 12000, rente: 3, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  const r = verwerkLening(l, [], '2026-01-01');
  assert.equal(r.termijnen[0].aflossing, 100000);
  assert.equal(r.termijnen[0].rente, 3000);
  assert.equal(r.termijnen[11].rente, 250);
  assert.equal(som(r.termijnen, 'aflossing'), 1200000);
});

test('aflossingsvrij per kwartaal: alleen rente, hoofdsom op de einddatum', () => {
  const l = { ...basis, hoofdsom: 50000, rente: 4, aflossingsvorm: 'aflossingsvrij', frequentie: 'kwartaal', einddatum: '2028-01-01' };
  const r = verwerkLening(l, [], '2026-01-01');
  assert.equal(r.termijnen.length, 8);
  assert.ok(r.termijnen.slice(0, 7).every((t) => t.rente === 50000 && t.aflossing === 0));
  assert.equal(r.termijnen[7].totaal, 5050000);
});

test('ontvangst gelijk aan termijn wordt automatisch verdeeld; afwijkend bedrag niet', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', einddatum: '2027-01-01' };
  const regels = [
    { ontvangst_id: 'o1', datum: '2026-02-01', bedrag: 860.66 },
    { ontvangst_id: 'o2', datum: '2026-03-02', bedrag: 900 },
  ];
  const r = verwerkLening(l, regels, '2026-03-10');
  const [o1, o2] = r.ontvangsten;
  assert.equal(o1.wijze, 'automatisch');
  assert.equal(o1.rente, 5000);
  assert.equal(o1.aflossing, 81066);
  assert.equal(o2.wijze, 'te_beoordelen');
  assert.equal(o2.verwacht, 86066);
  assert.equal(r.saldo, 1000000 - 81066);
  assert.equal(r.termijnen[0].status, 'voldaan');
  assert.equal(r.termijnen[1].status, 'verlopen');
});

test('handmatige verdeling met extra aflossing', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', einddatum: '2027-01-01' };
  const regels = [{ ontvangst_id: 'o1', datum: '2026-02-01', bedrag: 2000, rente: 50, aflossing: 1950 }];
  const r = verwerkLening(l, regels, '2026-02-05');
  const o = r.ontvangsten[0];
  assert.equal(o.wijze, 'handmatig');
  assert.equal(o.extra_aflossing, 195000 - 81066);
  assert.equal(r.saldo, 1000000 - 195000);
  assert.equal(r.termijnen[0].status, 'voldaan');
});

test('achterstand pas een maand na de vervaldatum', () => {
  const l = { ...basis, hoofdsom: 12000, rente: 0, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  assert.equal(verwerkLening(l, [], '2026-02-20').termijnen[0].status, 'verlopen');
  assert.equal(verwerkLening(l, [], '2026-03-01').termijnen[0].status, 'verlopen');
  assert.equal(verwerkLening(l, [], '2026-03-02').termijnen[0].status, 'achterstand');
});

test('inhaalbetaling van twee termijnen wordt herkend', () => {
  const l = { ...basis, hoofdsom: 12000, rente: 0, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  const r = verwerkLening(l, [{ ontvangst_id: 'o1', datum: '2026-03-05', bedrag: 2000 }], '2026-03-10');
  assert.equal(r.ontvangsten[0].wijze, 'automatisch');
  assert.equal(r.termijnen[0].status, 'voldaan');
  assert.equal(r.termijnen[1].status, 'voldaan');
});

test('termijn vooruit betaald hoort bij de komende termijn', () => {
  const l = { ...basis, hoofdsom: 12000, rente: 0, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  const r = verwerkLening(l, [{ ontvangst_id: 'o1', datum: '2026-01-28', bedrag: 1000 }], '2026-01-30');
  assert.equal(r.ontvangsten[0].wijze, 'automatisch');
  assert.equal(r.termijnen[0].status, 'voldaan');
});

test('rente en aflossing apart betaald', () => {
  const l = { ...basis, betaalwijze: 'apart', hoofdsom: 12000, rente: 3, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  const r = verwerkLening(l, [
    { ontvangst_id: 'o1', datum: '2026-02-01', bedrag: 30 },
    { ontvangst_id: 'o2', datum: '2026-02-03', bedrag: 1000 },
  ], '2026-02-10');
  assert.deepEqual(r.ontvangsten.map((o) => o.wijze), ['automatisch', 'automatisch']);
  assert.equal(r.ontvangsten[0].rente, 3000);
  assert.equal(r.ontvangsten[1].aflossing, 100000);
  assert.equal(r.termijnen[0].status, 'voldaan');
});

test('beginstand: schema loopt pas vanaf de beginstand', () => {
  const l = {
    ...basis, ingangsdatum: '2016-01-01', hoofdsom: 100000, rente: 3, aflossingsvorm: 'annuitair', einddatum: '2036-01-01',
    beginstand: { datum: '2026-01-01', saldo: 55000 },
  };
  const r = verwerkLening(l, [{ ontvangst_id: 'oud', datum: '2025-12-01', bedrag: 554.6 }], '2026-01-01');
  // de termijn van 1 januari valt na de beginstand (saldo per begin van de dag)
  assert.equal(r.termijnen[0].vervaldatum, '2026-01-01');
  assert.equal(r.termijnen.length, 121);
  assert.equal(som(r.termijnen, 'aflossing'), 5500000);
  assert.equal(r.ontvangsten[0].wijze, 'voor_start');
  assert.equal(r.saldo, 5500000);
});

test('renteherziening: nieuwe rente vanaf de wijzigingsdatum', () => {
  const l = {
    ...basis, hoofdsom: 12000, rente: 2, aflossingsvorm: 'aflossingsvrij', einddatum: '2027-01-01',
    wijzigingen: [{ id: 'w1', datum: '2026-06-01', rente: 5 }],
  };
  const r = verwerkLening(l, [], '2026-01-01');
  assert.equal(r.termijnen.find((t) => t.vervaldatum === '2026-06-01').rente, 2000);
  assert.equal(r.termijnen.find((t) => t.vervaldatum === '2026-07-01').rente, 5000);
  assert.equal(r.termijnen.length, 12);
});

test('extra opname verhoogt het saldo en het schema', () => {
  const l = {
    ...basis, hoofdsom: 10000, rente: 0, aflossingsvorm: 'aflossingsvrij', einddatum: '2027-01-01',
    wijzigingen: [{ id: 'w1', datum: '2026-06-15', extra_opname: 5000 }],
  };
  const r = verwerkLening(l, [], '2026-07-01');
  assert.equal(r.saldo, 1500000);
  assert.equal(r.termijnen[r.termijnen.length - 1].aflossing, 1500000);
});

test('vrij aflossen: rente over het werkelijke saldo', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'vrij', einddatum: null };
  const regels = [
    { ontvangst_id: 'o1', datum: '2026-02-01', bedrag: 50 },
    { ontvangst_id: 'o2', datum: '2026-02-10', bedrag: 4000, rente: 0, aflossing: 4000 },
    { ontvangst_id: 'o3', datum: '2026-03-01', bedrag: 50 },
  ];
  const r = verwerkLening(l, regels, '2026-03-05');
  assert.equal(r.termijnen[0].rente, 5000);
  // periode feb-mrt begint op 1 februari, vóór de aflossing van 10 februari
  assert.equal(r.termijnen[1].rente, 5000);
  assert.equal(r.termijnen[2].rente, 3000);
  assert.equal(r.ontvangsten[0].wijze, 'automatisch');
  assert.equal(r.ontvangsten[1].extra_aflossing, 400000);
  assert.equal(r.saldo, 600000);
});

test('wekelijkse termijnen', () => {
  const l = { ...basis, hoofdsom: 520, rente: 0, aflossingsvorm: 'lineair', frequentie: 'week', ingangsdatum: '2026-01-05', einddatum: '2027-01-04' };
  const r = verwerkLening(l, [], '2026-01-05');
  assert.equal(r.termijnen.length, 52);
  assert.equal(r.termijnen[0].totaal, 1000);
});

test('kwijtschelding sluit de lening af', () => {
  const l = { ...basis, hoofdsom: 5000, rente: 0, aflossingsvorm: 'aflossingsvrij', einddatum: '2030-01-01', kwijtschelding_datum: '2026-06-30' };
  const r = verwerkLening(l, [], '2026-07-15');
  assert.equal(r.saldo, 0);
  assert.equal(r.termijnen[0].status, 'vervallen');
});

test('jaaroverzicht sluit: begin + nieuw - afgelost - kwijt = eind', () => {
  const peildatum = '2026-11-20';
  const v = verwerkAlles(testdata, peildatum);
  const overzicht = jaaroverzichtGeldgevers(testdata, v, 2026);
  for (const g of overzicht) {
    for (const rij of g.rijen) assert.ok(rij.klopt, `${rij.lening.nummer} sluit niet`);
  }
  const totaalEind = overzicht.reduce((s, g) => s + g.totaal.eind, 0);
  const saldi = [...v.resultaten.values()].reduce((s, r) => s + r.saldo, 0);
  // er liggen in de testdata geen mutaties na de peildatum
  assert.equal(totaalEind, saldi);
});

test('testdata: signalen voor achterstand, afwijking en dubbele invoer', () => {
  const v = verwerkAlles(testdata, '2026-11-20');
  const soorten = new Set(v.aandacht.map((a) => a.soort));
  for (const s of ['achterstand', 'beoordelen', 'dubbel']) assert.ok(soorten.has(s), `signaal ${s} ontbreekt`);
  const lener = testdata.leners[0];
  const per = jaaroverzichtLener(testdata, v, 2026, lener.id);
  assert.ok(per.rijen.length > 0);
});

test('invoercontrole: dubbele invoer en splitsing', () => {
  const data = legeAdministratie();
  data.leners.push({ id: 'a', naam: 'A', tegenrekeningen: ['NL01 TEST 0123 4567 89'] });
  data.leningen.push({ ...basis, hoofdsom: 1000, rente: 0, aflossingsvorm: 'lineair', einddatum: '2027-01-01' });
  data.ontvangsten.push({ id: 'o1', datum: '2026-02-01', bedrag: 100, lener_id: 'a', regels: [{ lening_id: 'l1', bedrag: 100 }] });
  const nieuw = { id: 'o2', datum: '2026-02-01', bedrag: 100, lener_id: 'a', regels: [{ lening_id: 'l1', bedrag: 100 }] };
  const c = controleerOntvangst(nieuw, data, '2026-03-01');
  assert.equal(c.fouten.length, 0);
  assert.equal(c.waarschuwingen.length, 1);
  const fout = controleerOntvangst({ ...nieuw, bedrag: 150 }, data, '2026-03-01');
  assert.ok(fout.fouten.some((f) => f.includes('telt niet op')));
  assert.equal(stelLenerVoor('nl01test0123456789', data.leners).id, 'a');
});

// ---------------------------------------------------------------------------
// Versie 1.1: W-001 (extra aflossing), W-002 (gedeeltelijke kwijtschelding),
// W-005 (einddatum niet altijd verplicht).
// ---------------------------------------------------------------------------
// Fictieve aflossingsvrije lening: 48.000 tegen 2% = 80 rente per maand.
const vrijeLening = {
  ...basis, hoofdsom: 48000, rente: 2, aflossingsvorm: 'aflossingsvrij',
  ingangsdatum: '2021-03-05', eerste_vervaldatum: '2021-04-12', einddatum: null,
  beginstand: { datum: '2026-01-01', saldo: 48000 },
};
const renteOp = (r, d) => r.termijnen.find((t) => t.vervaldatum === d)?.rente;
const maandRente = (tot, bedrag) => {
  const regels = [];
  for (let m = 1; m <= tot; m += 1) {
    const d = `2026-${String(m).padStart(2, '0')}-12`;
    regels.push({ ontvangst_id: `r${m}`, datum: d, bedrag });
  }
  return regels;
};

test('W-005: aflossingsvrij zonder einddatum geeft doorlopende rentetermijnen', () => {
  const r = verwerkLening(vrijeLening, [], '2026-12-31');
  assert.equal(r.signalen.filter((s) => s.ernst === 'fout').length, 0);
  assert.equal(renteOp(r, '2026-01-12'), 8000);
  assert.equal(renteOp(r, '2026-12-12'), 8000);
  assert.equal(som(r.termijnen, 'aflossing'), 0);
});

test('W-005: annuïtair met vast bedrag zonder einddatum loopt tot de lening is afgelost', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', termijnbedrag: 860.66, einddatum: null };
  const r = verwerkLening(l, [], '2026-01-01');
  assert.equal(r.termijnen.length, 12);
  assert.equal(som(r.termijnen, 'aflossing'), 1000000);
});

test('W-005: lineair en annuïtair zonder vast bedrag blijven een einddatum vragen', () => {
  for (const vorm of ['lineair', 'annuitair']) {
    const r = verwerkLening({ ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: vorm, einddatum: null }, [], '2026-06-01');
    assert.ok(r.signalen.some((s) => s.ernst === 'fout' && /Einddatum ontbreekt/.test(s.tekst)), vorm);
  }
});

test('W-005: te laag vast termijnbedrag zonder einddatum geeft een waarschuwing, geen eindeloos schema', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', termijnbedrag: 50, einddatum: null };
  const r = verwerkLening(l, [], '2026-06-01');
  assert.ok(r.signalen.some((s) => /niet hoger dan de rente/.test(s.tekst)));
  assert.ok(r.termijnen.length < 12);
});

test('W-001: extra aflossing bij aflossingsvrij verlaagt de rente vanaf de volgende termijn', () => {
  const regels = [
    ...maandRente(5, 80),
    { ontvangst_id: 'extra', datum: '2026-06-01', bedrag: 8000, rente: 0, aflossing: 8000 },
    { ontvangst_id: 'r6', datum: '2026-06-12', bedrag: 80 },
    { ontvangst_id: 'r7', datum: '2026-07-12', bedrag: 66.67 },
  ];
  const r = verwerkLening(vrijeLening, regels, '2026-12-31');
  assert.equal(renteOp(r, '2026-05-12'), 8000);
  assert.equal(renteOp(r, '2026-06-12'), 8000); // saldo aan het begin van de periode was 48.000
  assert.equal(renteOp(r, '2026-07-12'), 6667);
  assert.equal(renteOp(r, '2026-12-12'), 6667);
  assert.equal(r.saldo, 4000000);
  assert.ok(r.ontvangsten.every((o) => o.wijze !== 'te_beoordelen'), JSON.stringify(r.ontvangsten.filter((o) => o.wijze === 'te_beoordelen')));
});

test('W-001: extra aflossing op dezelfde dag als een wijziging telt mee in de herberekening', () => {
  const l = { ...vrijeLening, wijzigingen: [{ id: 'w1', datum: '2026-06-01', rente: 2 }] };
  const regels = [{ ontvangst_id: 'extra', datum: '2026-06-01', bedrag: 8000, rente: 0, aflossing: 8000 }];
  const r = verwerkLening(l, regels, '2026-07-31');
  // De wijziging start op 1-6 met het saldo na de aflossing; de eerste periode
  // van een nieuwe afspraak telt als volle periode (bestaande regel).
  assert.equal(renteOp(r, '2026-06-12'), 6667);
  assert.equal(renteOp(r, '2026-07-12'), 6667);
});

test('W-001: extra aflossing bij annuïtair zonder vast bedrag verlaagt het termijnbedrag, einddatum blijft', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', einddatum: '2027-01-01' };
  const voor = verwerkLening(l, [], '2026-01-01');
  const regels = [
    { ontvangst_id: 't1', datum: '2026-02-01', bedrag: 860.66 },
    { ontvangst_id: 'x', datum: '2026-02-15', bedrag: 2000, rente: 0, aflossing: 2000 },
  ];
  const r = verwerkLening(l, regels, '2026-03-31');
  const laatste = r.termijnen[r.termijnen.length - 1];
  assert.equal(laatste.vervaldatum, '2027-01-01');
  assert.equal(renteOp(r, '2026-03-01'), Math.round((1000000 - voor.termijnen[0].aflossing) * 0.005)); // periode begon vóór de extra aflossing
  const april = r.termijnen.find((t) => t.vervaldatum === '2026-04-01');
  assert.ok(april.totaal < 86066 - 15000, `nieuw termijnbedrag ${april.totaal}`);
  assert.equal(som(r.termijnen, 'aflossing') + 200000, 1000000);
});

test('W-001: extra aflossing bij annuïtair met vast bedrag verkort de looptijd', () => {
  const l = { ...basis, hoofdsom: 10000, rente: 6, aflossingsvorm: 'annuitair', termijnbedrag: 860.66, einddatum: '2027-01-01' };
  const regels = [{ ontvangst_id: 'x', datum: '2026-01-15', bedrag: 2000, rente: 0, aflossing: 2000 }];
  const r = verwerkLening(l, regels, '2026-02-28');
  assert.ok(r.termijnen.length < 12);
  assert.ok(r.termijnen.slice(1, -1).every((t) => t.totaal === 86066));
  assert.equal(som(r.termijnen, 'aflossing') + 200000, 1000000);
});

test('W-001: extra aflossing bij lineair verlaagt de aflossing per termijn, einddatum blijft', () => {
  const l = { ...basis, hoofdsom: 12000, rente: 0, aflossingsvorm: 'lineair', einddatum: '2027-01-01' };
  const regels = [{ ontvangst_id: 'x', datum: '2026-01-15', bedrag: 1100, rente: 0, aflossing: 1100 }];
  const r = verwerkLening(l, regels, '2026-02-28');
  assert.equal(r.termijnen[0].aflossing, 100000); // termijn van 1-2: periode begon vóór de extra aflossing
  assert.equal(r.termijnen[1].aflossing, 90000); // (12.000 - 1.000 - 1.100) / 11
  assert.equal(r.termijnen[r.termijnen.length - 1].vervaldatum, '2027-01-01');
  assert.equal(som(r.termijnen, 'aflossing') + 110000, 1200000);
});

test('W-002: gedeeltelijke kwijtschelding verlaagt saldo en rente en telt als kwijtgescholden', () => {
  const l = { ...vrijeLening, wijzigingen: [{ id: 'w1', datum: '2026-06-01', kwijtschelding: 8000, toelichting: 'schenking' }] };
  const r = verwerkLening(l, maandRente(5, 80), '2026-12-31');
  const kw = r.mutaties.filter((m) => m.soort === 'kwijtschelding');
  assert.deepEqual(kw.map((m) => [m.datum, m.centen]), [['2026-06-01', 800000]]);
  assert.equal(r.saldo, 4000000);
  assert.equal(renteOp(r, '2026-05-12'), 8000);
  assert.equal(renteOp(r, '2026-06-12'), 6667);
  assert.equal(r.mutaties.filter((m) => m.soort === 'aflossing').length, 0);
});

test('W-002: kwijtschelding in het jaaroverzicht als kwijtgescholden, niet als afgelost', () => {
  const data = legeAdministratie();
  data.leners.push({ id: 'a', naam: 'Lener A', tegenrekeningen: [] });
  data.leningen.push({ ...vrijeLening, status: 'lopend', wijzigingen: [{ id: 'w1', datum: '2026-06-01', kwijtschelding: 8000 }] });
  const v = verwerkAlles(data, '2026-12-31');
  const jo = jaaroverzichtGeldgevers(data, v, 2026);
  const rij = jo.flatMap((g) => g.rijen)[0];
  assert.equal(rij.kwijtgescholden, 800000);
  assert.equal(rij.afgelost, 0);
  assert.equal(rij.eind, 4000000);
  assert.ok(rij.klopt);
});

test('W-002: kwijtschelding hoger dan het saldo wordt begrensd en gemeld', () => {
  const l = { ...basis, hoofdsom: 1000, rente: 0, aflossingsvorm: 'vrij', wijzigingen: [{ id: 'w1', datum: '2026-03-01', kwijtschelding: 1500 }] };
  const r = verwerkLening(l, [], '2026-12-31');
  assert.equal(r.saldo, 0);
  assert.ok(r.signalen.some((s) => /hoger dan het saldo/.test(s.tekst)));
});

test('W-013: voorstel eerste vervaldatum aan het einde van de maand', async () => {
  const { voorstelEersteVervaldatum, termijnDatum: td } = await import('../js/engine/datum.js');
  assert.equal(voorstelEersteVervaldatum('2026-06-01', 'maand'), '2026-06-30');
  assert.equal(voorstelEersteVervaldatum('2022-04-12', 'maand'), '2022-05-31');
  assert.equal(voorstelEersteVervaldatum('2026-01-01', 'kwartaal'), '2026-03-31');
  assert.equal(voorstelEersteVervaldatum('2026-01-01', 'jaar'), '2026-12-31');
  assert.equal(voorstelEersteVervaldatum('2026-01-31', 'maand'), '2026-02-28');
  assert.equal(voorstelEersteVervaldatum('2026-01-01', 'week'), null);
  // De reeks blijft daarna op de laatste dag van de maand.
  assert.deepEqual([1, 2, 3].map((k) => td('2026-06-30', 'maand', k)), ['2026-07-31', '2026-08-31', '2026-09-30']);
});
