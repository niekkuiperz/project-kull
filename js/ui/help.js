// Hulp: de werkinstructie (eis N-07), zodat iedereen de maandelijkse
// verwerking op dezelfde manier doet, plus uitleg per scherm (W-016). Elk
// scherm heeft een vraagteken bij de titel dat hier naar het juiste stuk
// springt (#/help?over=...).

import { esc } from './hulp.js';

// Uitleg per scherm. De sleutel komt overeen met "hulp" in de routes (app.js).
export const SCHERMEN = [
  ['overzicht', 'Overzicht', `
    <p>Het startscherm. Bovenaan staan tegels met het totaal uitstaande bedrag, het bedrag per geldgever, het aantal lopende leningen en het aantal punten waar actie nodig is.</p>
    <p><strong>Aandacht nodig</strong> somt op wat je moet bekijken: ontvangsten die je nog moet beoordelen, achterstanden en mogelijke dubbele invoer. Klik op de knop in een regel om er meteen naartoe te gaan.</p>
    <p><strong>Saldo per lener</strong> toont per lener het openstaande bedrag en het aantal lopende leningen.</p>`],
  ['invoer', 'Invoer (ontvangsten)', `
    <p>Hier voer je de betalingen in die op de bank zijn binnengekomen. Bovenaan kies je de maand; daaronder staan de ontvangsten van die maand, met wie ze invoerde en wie ze het laatst wijzigde.</p>
    <p><strong>Ontvangst invoeren:</strong> vul de datum van de bijschrijving en het bedrag in. Vul je het IBAN van de tegenrekening in, dan stelt de app de lener voor. Kies daarna de lening of leningen waar het geld bij hoort; betaalt iemand voor twee leningen tegelijk, verdeel het bedrag dan over beide.</p>
    <p><strong>Verwerking:</strong> past het bedrag precies bij de open termijn, dan verdeelt de app het zelf over rente en aflossing. Wijkt het af, dan komt de ontvangst bij <em>te beoordelen</em>. Kies dan zelf hoeveel rente en hoeveel aflossing het is; de app doet een voorstel (rente eerst). Aflossing boven het schema telt als extra aflossing.</p>
    <p><strong>Wijzigen of verwijderen:</strong> klik in de lijst op <em>Wijzigen</em>. Een datum in de toekomst kan niet.</p>`],
  ['leningen', 'Leningen', `
    <p>De lijst met alle leningen, met lener, geldgever, aflossingsvorm, hoofdsom, rente en het huidige saldo. Filter bovenaan op status of geldgever. Klik op een lening voor de leningkaart.</p>
    <p>Met <em>Nieuwe lening</em> leg je een lening vast. Zie hieronder bij <em>Lening bewerken</em>.</p>`],
  ['lening-bewerken', 'Lening bewerken', `
    <p><strong>Partijen:</strong> elke lening heeft precies één lener. Typ in <em>Zoek lener</em> een deel van de naam om de keuzelijst te beperken. Leen je aan twee mensen samen, leg dan één lener vast met beide namen en beide rekeningnummers.</p>
    <p><strong>Afspraken:</strong> neem ze over uit het contract of de akte. Aflossingsvormen:</p>
    <ul>
      <li><strong>Annuïtair:</strong> elke termijn hetzelfde bedrag, berekend zoals in de praktijk: de aflossing per termijn is de hoofdsom gedeeld door het aantal termijnen, en de rente per termijn is het rentepercentage over de helft van de hoofdsom (per jaar, verdeeld over de termijnen). Rente en aflossing zijn elke termijn gelijk; een afrondingsverschil komt in de laatste termijn. Voorbeeld: 50.000 tegen 10% over 5 jaar geeft per maand 833,33 aflossing plus 208,33 rente is 1.041,67. Noemt het contract een vast bedrag, vul dat dan in bij <em>Vast termijnbedrag</em>; de aflossing is dan dat bedrag min de rente, en een einddatum is niet nodig.</li>
      <li><strong>Lineair:</strong> elke termijn dezelfde aflossing, met rente over het dalende saldo. Einddatum verplicht.</li>
      <li><strong>Aflossingsvrij:</strong> alleen rente. Aflossen mag altijd en verlaagt de rente vanaf de volgende termijn. Zonder einddatum lopen de rentetermijnen door.</li>
    </ul>
    <p><strong>Eerste vervaldatum:</strong> de datum van de eerste termijn. Bij een nieuwe lening wordt het einde van de maand voorgesteld; ligt die op de laatste dag van een maand, dan vallen alle termijnen op de laatste dag.</p>
    <p><strong>Beginstand:</strong> voor een lening die al liep: het saldo op een bepaalde datum uit de oude administratie. Het schema begint dan op die datum. De beginstand geldt per het begin van die dag: een termijn die op die datum vervalt, wordt nog verwacht. Is die termijn al betaald en verwerkt in het saldo, kies dan de dag erna. Bij annuïtair blijven de oorspronkelijke hoofdsom en looptijd de basis voor rente en aflossing.</p>
    <p><strong>Wijzigingen in de afspraken:</strong> bij een renteherziening, extra opname, nieuwe einddatum of een kwijtschelding of schenking. Vul alleen in wat verandert, met de ingangsdatum. Vanaf die datum rekent de app opnieuw over het resterende saldo. Is de einddatum al voorbij en is er een nieuwe afspraak gemaakt (achterstand), leg die dan vast als wijziging met de nieuwe einddatum: de nog openstaande aflossing gaat op in het nieuwe schema, openstaande rente blijft als achterstand staan.</p>
    <p>Klik op <em>Schema berekenen</em> en vergelijk het eerste termijnbedrag met het contract voordat je opslaat. Alle datums moeten tussen 2000 en 2200 liggen.</p>`],
  ['leningkaart', 'Leningkaart', `
    <p>Alles over één lening: openstaand saldo, achterstand en ontvangen rente dit jaar, de afspraken, eventuele meldingen, het termijnschema en de betalingshistorie.</p>
    <p>In het <strong>termijnschema</strong> zie je per termijn wat er verwacht werd en wat er binnenkwam. In de <strong>betalingshistorie</strong> zie je elke ontvangst en hoe die verwerkt is. Met <em>Afspraken bewerken</em> pas je de lening aan, met <em>Ontvangst invoeren</em> voer je direct een betaling op deze lening in, en <em>Afdrukken of PDF</em> maakt een overzicht om te bewaren of te versturen.</p>`],
  ['leners', 'Leners', `
    <p>De lijst met leners, met hun totale saldo en aantal leningen. Klik op een naam om de gegevens te bekijken of te wijzigen.</p>
    <p><strong>Bekende tegenrekeningen:</strong> de rekeningnummers waarvandaan iemand betaalt, één per regel. Daarmee herkent de app bij de invoer wie er betaalde. Een lener met leningen kun je niet verwijderen.</p>`],
  ['rapporten', 'Rapporten', `
    <p><strong>Jaaroverzicht per geldgever:</strong> per lening het saldo op 1 januari en 31 december, nieuw verstrekt, afgelost, kwijtgescholden en ontvangen rente. Bedoeld voor de accountant; maak er een PDF van of download het voor Excel (CSV).</p>
    <p><strong>Jaaroverzicht per lener:</strong> voor een lener met een lening voor de eigen woning, voor de belastingaangifte.</p>
    <p>Staat er over dat jaar nog iets bij <em>te beoordelen</em>, los dat dan eerst op; anders klopt het overzicht niet.</p>`],
  ['instellingen', 'Instellingen', `
    <p><strong>Geldgevers:</strong> de namen van de twee geldgevers zoals ze overal in de app staan.</p>
    <p><strong>Back-up:</strong> download een volledige kopie van de administratie, en zet die zo nodig terug. Zet een back-up ook op een tweede plek.</p>
    <p><strong>Versiegeschiedenis:</strong> elke opslag is een versie. Je ziet wie wanneer opsloeg en kunt een oude versie terugzetten.</p>`],
  ['wensen', 'Wensen', `
    <p>Mis je iets of werkt iets onhandig, dien dan hier een wens in. Iedereen kan een wens indienen; alleen de beheerder ziet ze. De beheerder ziet een rood getal bij <em>Wensen</em> in het menu zolang er nieuwe wensen zijn, en zet een wens op gezien of afgehandeld.</p>`],
  ['account', 'Mijn account', `
    <p>Hier wijzig je je eigen wachtwoord. Kies er een van minstens 12 tekens dat je nergens anders gebruikt.</p>
    <p><strong>Inloggen</strong> gaat met e-mailadres, wachtwoord en de code uit de authenticator-app op je telefoon. Ben je je telefoon kwijt of je wachtwoord vergeten, vraag dan de beheerder om je account te herstellen.</p>`],
  ['gebruikers', 'Gebruikers (beheerder)', `
    <p>Alleen voor de beheerder. Voeg gebruikers toe met een rol: <em>Beheerder</em> mag alles, ook gebruikers beheren; <em>Bewerken</em> mag de administratie wijzigen; <em>Alleen lezen</em> mag alleen kijken.</p>
    <p>Een nieuwe gebruiker krijgt een tijdelijk wachtwoord. Geef dat persoonlijk of telefonisch door, niet per e-mail. Met <em>Blokkeren</em> zet je iemand tijdelijk uit, met <em>App opnieuw koppelen</em> of <em>Nieuw wachtwoord</em> herstel je een account. Met <em>Verwijderen</em> verdwijnt een account definitief (e-mailadres, wachtwoord en app-koppeling); de naam blijft zichtbaar in het logboek en bij wat diegene heeft ingevoerd. Je kunt jezelf niet verwijderen, en er is altijd minstens één actieve beheerder. Het <strong>logboek</strong> toont inloggen, mislukte pogingen en andere gebeurtenissen.</p>`],
];

export function toon(app, root, params, route, query) {
  root.innerHTML = `
    <h1>Hulp</h1>
    <p class="inhoudsopgave">Naar: <a href="#/help?over=werkinstructie">Werkinstructie</a> · ${SCHERMEN.map(([k, titel]) => `<a href="#/help?over=${k}">${esc(titel)}</a>`).join(' · ')} · <a href="#/help?over=begrippen">Begrippen</a></p>
    <section id="hulp-werkinstructie">
    <h2>Werkinstructie</h2>
    <section>
      <h3>Elke maand (ongeveer een uur)</h3>
      <ol class="stappen">
        <li><strong>Spreek af wie deze maand invoert.</strong> Jullie voeren allebei in; één persoon per maand voorkomt dubbele invoer.</li>
        <li><strong>Open internetbankieren</strong> en bekijk de bijschrijvingen op alle rekeningen, privé en BV, over de afgelopen maand.</li>
        <li><strong>Voer elke leningbetaling in</strong> onder <a href="#/invoer">Invoer</a>: datum, bedrag, lener. Vul het IBAN van de tegenrekening in, dan herkent de app de lener. Pensioen, AOW en andere bijschrijvingen voer je niet in.</li>
        <li><strong>Betaalt iemand voor meer leningen in één keer</strong>, vink dan beide leningen aan en verdeel het bedrag.</li>
        <li><strong>Los de meldingen op.</strong> Een waarschuwing over dubbele invoer: controleer of de betaling echt twee keer binnenkwam. Een bedrag dat afwijkt van de termijn komt bij "te beoordelen": verdeel het zelf over rente en aflossing, zo nodig na overleg met de lener.</li>
        <li><strong>Bekijk "Aandacht nodig"</strong> op het <a href="#/">Overzicht</a> en onderneem actie bij achterstanden.</li>
        <li><strong>Download een back-up</strong> onder <a href="#/instellingen">Instellingen</a> en zet die op een tweede plek.</li>
      </ol>
    </section>
    <section>
      <h3>Nieuwe lening</h3>
      <ol class="stappen">
        <li>Leg de lener vast onder <a href="#/leners">Leners</a>, als die er nog niet is.</li>
        <li>Maak de lening aan onder <a href="#/leningen">Leningen</a> en neem de afspraken over uit het contract of de akte.</li>
        <li>Klik op <em>Schema berekenen</em> en vergelijk het eerste termijnbedrag met het contract. Wijkt het af en noemt het contract een vast bedrag, vul dat dan in bij <em>Vast termijnbedrag</em>.</li>
        <li>Zet het contract in de map van de lener en plak de link bij de lening.</li>
      </ol>
    </section>
    <section>
      <h3>Wijziging in de afspraken</h3>
      <p>Bij een renteherziening, extra opname, gedeeltelijke kwijtschelding of schenking, of nieuw schema: open de lening, kies <em>Afspraken bewerken</em> en voeg onder <em>Wijzigingen</em> een regel toe met de ingangsdatum. Het oude schema blijft tot die datum gelden.</p>
    </section>
    <section>
      <h3>Einde van het jaar</h3>
      <ol class="stappen">
        <li>Zorg dat er niets meer "te beoordelen" staat over het jaar.</li>
        <li>Open <a href="#/rapporten">Rapporten</a>, kies het jaaroverzicht per geldgever en het jaar, en maak een PDF of CSV voor de accountant.</li>
        <li>Maak voor elke lener met een lening voor de eigen woning het jaaroverzicht per lener.</li>
      </ol>
    </section>
    </section>
    <h2>Uitleg per scherm</h2>
    ${SCHERMEN.map(([k, titel, tekst]) => `<section id="hulp-${k}" class="hulp-scherm"><h3>${esc(titel)}</h3>${tekst}</section>`).join('')}
    <section id="hulp-begrippen">
      <h2>Begrippen</h2>
      <dl>
        <dt>Achterstand</dt><dd>Een termijn die een maand na de vervaldatum niet volledig is ontvangen.</dd>
        <dt>Te beoordelen</dt><dd>Een ontvangst waarvan het bedrag niet klopt met de verwachte termijn. Die telt pas mee als je hem zelf verdeelt.</dd>
        <dt>Extra aflossing</dt><dd>Meer aflossing dan het schema vraagt. Het saldo daalt en de app rekent de volgende termijnen opnieuw uit over het lagere saldo.</dd>
        <dt>Kwijtschelding of schenking</dt><dd>Een deel van de schuld vervalt zonder dat er geld binnenkomt. Leg je vast als wijziging; het telt in het jaaroverzicht als kwijtgescholden, niet als afgelost.</dd>
        <dt>Beginstand</dt><dd>Het saldo waarmee een lening die al liep in deze administratie start.</dd>
      </dl>
    </section>`;
  const over = query?.get('over');
  const doel = over && root.querySelector(`#hulp-${CSS.escape(over)}`);
  if (doel) setTimeout(() => doel.scrollIntoView({ block: 'start' }), 0);
}
