// Rooktest van de schermen in de proefmodus, met een onzichtbare Chrome.
// Gebruik: node tests/ui_rooktest.mjs http://127.0.0.1:PORT/ [map-voor-schermafdrukken]
// Vereist: google-chrome en een webserver die de repo serveert (proefmodus,
// dus js/config.js met api: ''). Faalt bij JavaScript-fouten of ontbrekende teksten.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const basis = process.argv[2] || 'http://127.0.0.1:8795/';
const schermMap = process.argv[3] || null;
const poort = 9333;
const profiel = mkdtempSync(join(tmpdir(), 'rooktest-'));
const chrome = spawn('google-chrome', [
  '--headless=new', `--remote-debugging-port=${poort}`, `--user-data-dir=${profiel}`,
  '--no-first-run', '--no-sandbox', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let doel;
for (let i = 0; i < 50 && !doel; i += 1) {
  await wacht(200);
  try {
    const lijst = await (await fetch(`http://127.0.0.1:${poort}/json`)).json();
    doel = lijst.find((t) => t.type === 'page');
  } catch { /* nog niet klaar */ }
}
if (!doel) { console.error('Chrome start niet'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(doel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let volgnr = 0;
const wachtend = new Map();
const fouten = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wachtend.has(m.id)) { wachtend.get(m.id)(m); wachtend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') fouten.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') fouten.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Page.javascriptDialogOpening') stuur('Page.handleJavaScriptDialog', { accept: true });
});
function stuur(method, params = {}) {
  const id = ++volgnr;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => wachtend.set(id, r));
}
async function js(expr) {
  const r = await stuur('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'fout in evaluatie');
  return r.result?.result?.value;
}
async function ga(hash) {
  await js(`location.hash = ${JSON.stringify(hash)}`);
  await wacht(400);
  return js('document.getElementById("inhoud").innerText');
}
async function foto(naam) {
  if (!schermMap) return;
  const r = await stuur('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(schermMap, `${naam}.png`), Buffer.from(r.result.data, 'base64'));
}

await stuur('Runtime.enable');
await stuur('Page.enable');
await stuur('Page.navigate', { url: basis });
await wacht(1500);

// Gegevens: fictieve testset plus een fictieve aflossingsvrije lening met een schenking.
await js(`(async () => {
  const { testdata } = await import('./js/testdata.js');
  const { LokaleOpslag } = await import('./js/opslag/lokaal.js');
  const d = structuredClone(testdata);
  d.leners.push({ id: 'pg', naam: 'Proef G (fictief)', tegenrekeningen: [], email: '', telefoon: '', adres: '', notities: '' });
  d.leningen.push({
    id: 'lg', nummer: 'G-1', lener_ids: ['pg'], geldgever_id: d.geldgevers[0].id, contractsoort: 'onderhands',
    hoofdsom: 48000, ingangsdatum: '2021-03-05', einddatum: null, rente: 2, rentetype: 'vast',
    aflossingsvorm: 'aflossingsvrij', frequentie: 'maand', betaalwijze: 'samen', eerste_vervaldatum: '2021-04-12',
    termijnbedrag: null, status: 'lopend', beginstand: { datum: '2026-01-01', saldo: 48000 },
    wijzigingen: [{ id: 'wg', datum: '2026-06-01', kwijtschelding: 8000, toelichting: 'schenking' }],
  });
  // Oude gegevens: een fictieve lening die nog als "vrij aflossen" is opgeslagen.
  d.leningen.push({
    id: 'lv', nummer: 'V-1', lener_ids: ['pg'], geldgever_id: d.geldgevers[0].id, contractsoort: 'onderhands',
    hoofdsom: 5000, ingangsdatum: '2025-01-01', einddatum: null, rente: 3, rentetype: 'vast',
    aflossingsvorm: 'vrij', frequentie: 'kwartaal', betaalwijze: 'samen', eerste_vervaldatum: '',
    termijnbedrag: null, status: 'lopend', beginstand: null,
    wijzigingen: [{ id: 'wv', datum: '2026-01-01', aflossingsvorm: 'vrij', rente: 2.5, toelichting: 'fictief' }],
  });
  // Oude gegevens: een fictieve lening met twee leners (W-018).
  d.leningen.push({ ...structuredClone(d.leningen.find((x) => x.id === 'lv')), id: 'l2', nummer: 'T-2', lener_ids: ['pg', d.leners[0].id], aflossingsvorm: 'aflossingsvrij', wijzigingen: [] });
  for (let m = 1; m <= 5; m += 1) {
    d.ontvangsten.push({ id: 'og' + m, datum: '2026-0' + m + '-12', bedrag: 80, lener_id: 'pg', tegenrekening: '', omschrijving: 'rente',
      regels: [{ lening_id: 'lg', bedrag: 80 }], ingevoerd_door: 'Rooktest', ingevoerd_op: '2026-11-23T10:00:00Z',
      ...(m === 5 ? { gewijzigd_door: 'Rooktest 2', gewijzigd_op: '2026-11-23T11:00:00Z' } : {}) });
  }
  const o = new LokaleOpslag();
  await o.wisAlles();
  await o.bewaar(d, 0, 'rooktest');
})()`);
await stuur('Page.reload');
await wacht(1500);

const controles = [];
const check = (naam, ok) => { controles.push([naam, ok]); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

const kop = await js('document.getElementById("gebruiker").innerText');
check('versienummer zichtbaar', /v1\.3\.0/.test(kop));

let t = await ga('#/');
check('overzicht laadt', /Overzicht/.test(t));
await foto('1-overzicht');

t = await ga('#/lening/lg');
check('leningkaart G-1 laadt', /G-1/.test(t));
check('einddatum "Geen"', /Einddatum\s+Geen/.test(t));
await foto('2-leningkaart-g1');

t = await ga('#/leningen/lg');
check('bewerkscherm toont kwijtschelding in wijzigingen', /kwijtschelding of schenking €\s?8\.000,00/.test(t));
check('veld kwijtschelding aanwezig', await js('!!document.querySelector("[data-w=kwijtschelding]")'));
await js('document.querySelector("#bereken").click()');
await wacht(300);
t = await js('document.getElementById("inhoud").innerText');
check('schema berekenen zonder einddatum geeft geen foutmelding', /Berekend schema/.test(t) && !/Einddatum is verplicht/.test(t));
await foto('3-lening-bewerken');

t = await ga('#/leningen/lv');
check('oude lening met vrij aflossen wordt aflossingsvrij', (await js('document.getElementById("lening-form").aflossingsvorm.value')) === 'aflossingsvrij');
check('keuzelijst aflossingsvorm heeft alleen annuïtair, lineair, aflossingsvrij',
  (await js('[...document.getElementById("lening-form").aflossingsvorm.options].map(o => o.value).join(",")')) === 'annuitair,lineair,aflossingsvrij');
check('geen "Vrij aflossen" meer op het scherm', !/vrij aflossen/i.test(t));
t = await ga('#/lening/lv');
check('leningkaart V-1 toont aflossingsvrij zonder foutmelding', /Aflossingsvrij/.test(t) && !/Onbekende aflossingsvorm/.test(t));

await js(`sessionStorage.setItem('invoer.maand', '2026-05')`);
t = await ga('#/invoer');
check('ontvangstenlijst laadt', /Ingevoerde ontvangsten/.test(t));
check('knop Wijzigen in lijst', await js('[...document.querySelectorAll("a.knop")].some(a => a.textContent.trim() === "Wijzigen")'));
check('lijst toont "gewijzigd door"', /gewijzigd door Rooktest 2/.test(t));
await foto('4-invoer');

t = await ga('#/invoer/og5');
check('wijzigscherm toont ingevoerd en gewijzigd door', /Ingevoerd door Rooktest op .*laatst gewijzigd door Rooktest 2 op/.test(t));
await foto('5-ontvangst-wijzigen');

await ga('#/leningen/nieuw');
await js(`(() => { const f = document.getElementById('lening-form'); f.ingangsdatum.value = '2026-06-01'; f.ingangsdatum.dispatchEvent(new Event('change', { bubbles: true })); })()`);
check('nieuwe lening: eerste vervaldatum voorgesteld als einde maand', (await js('document.getElementById("lening-form").eerste_vervaldatum.value')) === '2026-06-30');

t = await ga('#/rapporten');
check('rapporten laden', /Jaaroverzicht/.test(t));
await foto('6-rapporten');

t = await ga('#/instellingen');
check('proefmodus: testknoppen zichtbaar', /Fictieve testgegevens laden/.test(t));

t = await ga('#/help');
check('hulp laadt met werkinstructie en uitleg per scherm', /Werkinstructie/.test(t) && /Uitleg per scherm/.test(t) && /Lening bewerken/.test(t));

// ---- 1.2.0 ----------------------------------------------------------------
// W-016: vraagteken bij de titel springt naar de uitleg van dat scherm.
for (const [hash, sleutel] of [['#/', 'overzicht'], ['#/leningen', 'leningen'], ['#/leningen/lg', 'lening-bewerken'], ['#/lening/lg', 'leningkaart'], ['#/invoer', 'invoer'], ['#/rapporten', 'rapporten'], ['#/instellingen', 'instellingen'], ['#/leners', 'leners'], ['#/wensen', 'wensen']]) {
  await ga(hash);
  const href = await js('document.querySelector("#inhoud h1 .hulp-knop")?.getAttribute("href")');
  check(`vraagteken op ${hash} wijst naar ${sleutel}`, href === `#/help?over=${sleutel}`);
}
await ga('#/rapporten');
await js(`(() => { const s = document.querySelector('[name=jaar]') || document.querySelector('select'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await wacht(300);
check('vraagteken blijft na opnieuw tekenen van rapporten', await js('!!document.querySelector("#inhoud h1 .hulp-knop")'));
await ga('#/help?over=leningkaart');
await wacht(300);
check('hulp springt naar het juiste stuk', await js('(() => { const r = document.getElementById("hulp-leningkaart").getBoundingClientRect(); return r.top >= -2 && r.top < 80; })()'));

// W-015 en W-017 op het leningformulier.
await ga('#/leningen/lg');
check('datumvelden: min 2000-01-01 en max 2200-12-31', await js('[...document.querySelectorAll("#lening-form input[type=date]")].every(i => i.min === "2000-01-01" && i.max === "2200-12-31")'));
check('formulier zonder browsersuggesties', await js('document.getElementById("lening-form").getAttribute("autocomplete") === "off" && document.querySelector("[name=rente]").getAttribute("autocomplete") === "off"'));
await js(`(() => { const f = document.getElementById('lening-form'); f.ingangsdatum.value = '1999-01-01'; f.requestSubmit(); })()`);
await wacht(300);
check('ingangsdatum in 1999 geweigerd bij opslaan', /Ingangsdatum: het jaartal moet tussen 2000 en 2200 liggen/.test(await js('document.getElementById("meldingen").innerText')));

// W-018: één lener met zoeken.
await ga('#/leningen/lg');
check('geen vinkjes meer voor leners', await js('!document.querySelector("[name=lener_ids]")'));
check('keuzelijst met de huidige lener', (await js('document.querySelector("[name=lener_id]").value')) === 'pg');
await js(`(() => { const z = document.getElementById('zoek-lener'); z.value = 'Proef G'; z.dispatchEvent(new Event('input')); })()`);
check('zoeken verbergt niet-passende leners', await js('[...document.querySelector("[name=lener_id]").options].filter(o => o.value && !o.hidden).every(o => /Proef G/.test(o.textContent))'));
await ga('#/leningen/l2');
check('lening met twee leners toont waarschuwing', /had meer dan één lener/.test(await js('document.getElementById("inhoud").innerText')));

// W-017 op het invoerscherm: eigen max (vandaag) blijft staan.
await ga('#/invoer');
check('ontvangstdatum: min 2000, max blijft vandaag', await js('(() => { const i = document.querySelector("[name=datum]"); return i.min === "2000-01-01" && i.max !== "2200-12-31"; })()'));

// W-006: wens indienen in de proefmodus en melding in het menu.
await ga('#/wensen');
await js(`(() => { const f = document.getElementById('wens-form'); f.tekst.value = 'Fictieve proefwens voor de rooktest.'; f.requestSubmit(); })()`);
await wacht(500);
check('wens staat in de lijst', /Fictieve proefwens voor de rooktest/.test(await js('document.getElementById("wensenlijst").innerText')));
check('menu toont 1 nieuwe wens', (await js('document.querySelector("#nav-wensen .teller")?.textContent')) === '1');
await js(`(() => { const s = document.querySelector('select[data-wens]'); s.value = 'afgehandeld'; s.dispatchEvent(new Event('change')); })()`);
await wacht(400);
check('na afhandelen geen teller meer', await js('!document.querySelector("#nav-wensen .teller")'));
await foto('7-wensen');

check('geen JavaScript-fouten', fouten.length === 0);
if (fouten.length) console.log(fouten.join('\n'));

ws.close();
chrome.kill();
const mislukt = controles.filter(([, ok]) => !ok).length;
console.log(`\n${controles.length - mislukt} van ${controles.length} controles geslaagd`);
process.exit(mislukt ? 1 : 0);
