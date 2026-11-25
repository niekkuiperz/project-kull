// Versiegeschiedenis (W-024): wat er per versie veranderd is, voor alle
// gebruikers, bereikbaar onder Hulp en via het versienummer rechtsboven.
// Datum = datum waarop de versie live ging.
// Bewust geanonimiseerd: geen namen van leners, geen leningnummers, geen
// echte bedragen en geen namen van geldgevers. Bij beveiliging staat wat er
// beter werd, niet hoe iets te omzeilen was.
// Niet te verwarren met Versiebeheer onder Instellingen: dat zijn de
// opgeslagen versies van de gegevens.

import { esc } from './hulp.js';
import { VERSIE } from '../versie.js';

export const VERSIES = [
  {
    versie: '1.4.0', datum: '2026-11-25',
    functioneel: [
      'Te veel betaald: het bedrag gaat naar de open termijnen, oudste eerst, en elke volle termijn wordt verdeeld volgens het schema. Wat overblijft, kun je bij de ontvangst laten verwerken: naar de volgende termijn (rente eerst), als extra aflossing, terugstorten, of alles boven de eerste termijn als extra aflossing. Zonder keuze blijft het restant te beoordelen.',
      'Een hele ontvangst kan als terug te storten worden gemarkeerd; die telt dan niet mee.',
      'Herleidbaar: in het termijnschema staat per termijn met welke ontvangst(en) hij betaald is, en in de betalingshistorie per ontvangst voor welke termijnen hij gebruikt is. Ook op de afdruk.',
      'Waarschuwing als vooruitbetaalde rente termijnen na 30 juni van het volgende jaar dekt.',
      'Hulp staat rechtsboven, naast je naam, en is voor iedereen bereikbaar.',
      'Nieuwe pagina Versiegeschiedenis (deze pagina). Onder Instellingen heet de lijst met opgeslagen versies van de gegevens nu Versiebeheer.',
    ],
    veiligheid: ['Geen wijzigingen in de beveiliging.'],
  },
  {
    versie: '1.3.0', datum: '2026-11-25',
    functioneel: [
      'Annuïtair rekent zoals in de praktijk: een vaste aflossing per termijn plus een vaste rente over de helft van de hoofdsom, zodat elke termijn hetzelfde bedrag is.',
      'Een nieuwe afspraak na een verstreken einddatum neemt de nog openstaande aflossing mee.',
      'Beginstand: de eerste termijn valt één periode na de beginstand.',
      'Herstel: waarschuwingen bij het herberekenen na een extra aflossing gingen verloren.',
    ],
    veiligheid: ['De beheerder kan een gebruiker definitief verwijderen, inclusief inloggegevens en koppeling met de authenticator-app. In het logboek blijft alleen de naam zichtbaar.'],
  },
  {
    versie: '1.2.0', datum: '2026-11-25',
    functioneel: [
      'Wensformulier: iedereen kan een wens indienen; de beheerder ziet ze met een teller in het menu.',
      'Datums alleen van 2000 tot en met 2200.',
      'Hulp per scherm via een vraagteken bij elke titel.',
      'Eén lener per lening, te kiezen uit een keuzelijst met zoekveld.',
    ],
    veiligheid: [
      'De browser onthoudt in formulieren geen eerder getypte waarden meer, behalve bij inloggen.',
      'Het aantal wensen per gebruiker per dag is begrensd.',
    ],
  },
  {
    versie: '1.1.2', datum: '2026-11-25',
    functioneel: ['Na een nieuwe versie laadt de browser meteen de nieuwe bestanden, in plaats van tot een week later.'],
    veiligheid: [],
  },
  {
    versie: '1.1.1', datum: '2026-11-24',
    functioneel: ['"Vrij aflossen" is opgegaan in aflossingsvrij; de einddatum is daar niet verplicht.'],
    veiligheid: [],
  },
  {
    versie: '1.1.0', datum: '2026-11-24',
    functioneel: [
      'Extra aflossing verlaagt de rente bij elke aflossingsvorm.',
      'Gedeeltelijke kwijtschelding of schenking vastleggen.',
      'Einddatum niet nodig bij aflossingsvrij en bij annuïtair met een vast termijnbedrag.',
      'Per ontvangst zichtbaar wie hem invoerde en wijzigde.',
      'Bij een nieuwe lening wordt de eerste vervaldatum voorgesteld.',
      'Versienummer rechtsboven in de app.',
    ],
    veiligheid: [
      'Er blijft altijd minstens één actieve beheerder, ook als twee beheerders tegelijk iets wijzigen.',
      'Knoppen om testgegevens te laden of alles leeg te maken bestaan alleen nog in de proefmodus.',
    ],
  },
  {
    versie: '1.0.0', datum: '2026-11-22',
    functioneel: ['Eerste versie: leningen, leners, ontvangsten, termijnschema, meldingen, jaaroverzichten en back-up.'],
    veiligheid: [
      'Inloggen met wachtwoord en een code uit een authenticator-app.',
      'Rollen: beheerder, bewerken en alleen lezen. Logboek van inloggen en wijzigingen.',
      'Gegevens op een eigen server bij een Nederlandse webhoster; instellingen buiten de openbare map.',
      'Zoekmachines nemen de site niet op.',
      'Bevindingen uit een eigen beveiligingstest opgelost.',
    ],
  },
];

const datumNl = (iso) => iso.split('-').reverse().join('-');

export function toon(app, root) {
  const lijst = (items) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="hint">Geen.</p>');
  root.innerHTML = `
    <h1>Versiegeschiedenis</h1>
    <p>Je gebruikt versie <strong>${esc(VERSIE)}</strong>. Hieronder staat per versie wat er veranderd is. <a href="#/help">Terug naar Hulp</a></p>
    ${VERSIES.map((v) => `<section class="hulp-scherm" id="versie-${esc(v.versie)}">
      <h2>Versie ${esc(v.versie)} <span class="hint">${esc(datumNl(v.datum))}</span></h2>
      <h3>Functioneel</h3>${lijst(v.functioneel)}
      <h3>Beveiliging</h3>${lijst(v.veiligheid)}
    </section>`).join('')}`;
}
