// Werkinstructie (eis N-07): zodat iedereen de maandelijkse verwerking op
// dezelfde manier doet.

export function toon(app, root) {
  root.innerHTML = `
    <h1>Werkinstructie</h1>
    <section>
      <h2>Elke maand (ongeveer een uur)</h2>
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
      <h2>Nieuwe lening</h2>
      <ol class="stappen">
        <li>Leg de lener vast onder <a href="#/leners">Leners</a>, als die er nog niet is.</li>
        <li>Maak de lening aan onder <a href="#/leningen">Leningen</a> en neem de afspraken over uit het contract of de akte.</li>
        <li>Klik op <em>Schema berekenen</em> en vergelijk het eerste termijnbedrag met het contract. Wijkt het af en noemt het contract een vast bedrag, vul dat dan in bij <em>Vast termijnbedrag</em>.</li>
        <li>Zet het contract in de map van de lener en plak de link bij de lening.</li>
      </ol>
    </section>
    <section>
      <h2>Wijziging in de afspraken</h2>
      <p>Bij een renteherziening, extra opname of nieuw schema: open de lening, kies <em>Afspraken bewerken</em> en voeg onder <em>Wijzigingen</em> een regel toe met de ingangsdatum. Het oude schema blijft tot die datum gelden.</p>
    </section>
    <section>
      <h2>Einde van het jaar</h2>
      <ol class="stappen">
        <li>Zorg dat er niets meer "te beoordelen" staat over het jaar.</li>
        <li>Open <a href="#/rapporten">Rapporten</a>, kies het jaaroverzicht per geldgever en het jaar, en maak een PDF of CSV voor de accountant.</li>
        <li>Maak voor elke lener met een lening voor de eigen woning het jaaroverzicht per lener.</li>
      </ol>
    </section>
    <section>
      <h2>Begrippen</h2>
      <dl>
        <dt>Achterstand</dt><dd>Een termijn die een maand na de vervaldatum niet volledig is ontvangen.</dd>
        <dt>Te beoordelen</dt><dd>Een ontvangst waarvan het bedrag niet klopt met de verwachte termijn. Die telt pas mee als je hem zelf verdeelt.</dd>
        <dt>Extra aflossing</dt><dd>Meer aflossing dan het schema vraagt. Het saldo daalt; het schema van de volgende termijnen blijft gelijk tot je een wijziging vastlegt.</dd>
        <dt>Beginstand</dt><dd>Het saldo waarmee een lening die al liep in deze administratie start.</dd>
      </dl>
    </section>`;
}
