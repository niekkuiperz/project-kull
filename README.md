# Leningadministratie

Webapp voor de administratie van uitgeleend geld, op naam van een privépersoon of een eigen vennootschap (BV). De eisnummers (F-01, N-01 enzovoort) verwijzen naar een vooraf opgesteld eisendocument.

De app berekent per lening het schema van verwachte termijnen, zet de ontvangsten daartegen af, signaleert achterstanden en afwijkingen, en maakt de jaaroverzichten voor de accountant en voor leners.

## Inhoud

1. [Snel uitproberen](#snel-uitproberen)
2. [Echt gebruiken: hosting en database](#echt-gebruiken-hosting-en-database)
3. [Rekenregels](#rekenregels)
4. [Eisen en waar ze zitten](#eisen-en-waar-ze-zitten)
5. [Wat nog niet getest is](#wat-nog-niet-getest-is)
6. [Ontwikkelen en testen](#ontwikkelen-en-testen)

## Snel uitproberen

De app werkt zonder hosting in je eigen browser (proefmodus). Gegevens staan dan alleen in die browser.

Dubbelklikken op `index.html` werkt **niet**: browsers laden de onderdelen van de app (JavaScript-modules) niet vanaf een losse schijfmap. Start een klein lokaal webservertje in de map van de app:

```bash
python3 -m http.server 8000
```

Open daarna <http://localhost:8000> en kies **Instellingen > Fictieve testgegevens laden**.

Geen Python? In Visual Studio Code werkt de extensie *Live Server* ook.

## Echt gebruiken: hosting en database

Voor gebruik door drie mensen vanaf elke computer (eis F-22) zijn twee dingen nodig:

| Onderdeel | Wat | Voorstel |
| --- | --- | --- |
| Pagina's | De bestanden in deze repository (HTML, CSS, JavaScript). Bevat geen gegevens en geen geheimen. | GitHub Pages of een andere statische host |
| Database en inloggen | Leningen, ontvangsten, accounts, tweestapsverificatie, rechten | Supabase, regio Frankfurt (EU) |

### Kosten en beperkingen

- **Supabase Free** pauzeert een project na een week met weinig activiteit. Bij maandelijks gebruik gebeurt dat dus vrijwel zeker. Gegevens blijven bewaard en je zet het project in het dashboard weer aan, maar dat is lastig voor wie de app alleen af en toe gebruikt. Het **Pro-abonnement** (25 dollar per maand volgens de prijspagina van Supabase) pauzeert niet. Controleer de actuele prijs op <https://supabase.com/pricing>.
- **Gekozen aanpak:** Supabase Free met een dagelijkse automatische aanroep (zie stap 9), zodat het project niet pauzeert. Supabase noemt dat zelf "meestal genoeg", maar geeft geen garantie. Pauzeert het toch, dan staat het project in het dashboard met één klik weer aan; gegevens blijven bewaard.
- Supabase Free maakt geen automatische back-ups. Gebruik daarom de knop **Download back-up** onder Instellingen en bewaar dat bestand op een tweede plek (eis N-03). De versiegeschiedenis in de database helpt bij een fout, maar is geen back-up.
- **GitHub Pages** is op een gratis GitHub-account alleen beschikbaar vanuit een **openbare** repository. Voor een privé-repository is GitHub Pro nodig. De code bevat geen gegevens of geheimen, dus openbaar is technisch veilig; wil je dat niet, kies dan GitHub Pro of een andere host.

### Stappen

1. **Supabase-project aanmaken** op <https://supabase.com>. Kies regio *Central EU (Frankfurt)*.
2. **Database inrichten:** open *SQL Editor*, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik *Run*.
3. **Openbare aanmelding uitzetten:** *Authentication > Sign In / Providers*: zet "Allow new users to sign up" uit. Alleen uitgenodigde mensen kunnen dan een account hebben.
4. **Accounts aanmaken:** *Authentication > Users > Invite user* voor elke gebruiker. Iedereen kiest via de uitnodigingsmail een wachtwoord.
5. **Rollen toekennen:** voer onderaan `schema.sql` de drie `insert`-regels uit, met de juiste e-mailadressen. Rollen: `beheerder` (alles), `eigenaar` (bewerken), `lezer` (alleen lezen).
6. **App koppelen:** zet in [`js/config.js`](js/config.js) de *Project URL* en de *publishable* (of *anon*) sleutel uit *Project Settings > API*. Gebruik nooit de *secret* of *service_role* sleutel.
7. **Publiceren:** repository-instellingen > *Pages* > bron: branch `main`, map `/`. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/<repository>/`.
8. **Inloggen en tweestapsverificatie instellen:** bij de eerste keer inloggen toont de app een QR-code voor een authenticator-app. Zonder die code kom je niet bij de gegevens (eis N-02, afgedwongen in de database).
9. **Wakker houden instellen:** zet in GitHub onder *Settings > Secrets and variables > Actions* twee secrets: `SUPABASE_URL` (de Project URL) en `SUPABASE_SLEUTEL` (de publishable sleutel). De workflow [`supabase-wakker-houden`](.github/workflows/supabase-wakker-houden.yml) roept dan elke dag de functie `ping` aan, die alleen het getal 1 teruggeeft. Test hem via *Actions > Supabase wakker houden > Run workflow*. GitHub zet geplande workflows uit na 60 dagen zonder activiteit in de repository en stuurt daar vooraf een e-mail over; zet hem dan weer aan.
10. **Eerste gegevens:** probeer de app eerst met testgegevens (Instellingen), maak hem daarna leeg en voer de echte leners en leningen in.

### Hoe de beveiliging werkt

- Lezen kan alleen met een account dat in de tabel `gebruikers` staat **en** met tweestapsverificatie is ingelogd.
- Schrijven gaat alleen via de databasefunctie `opslaan`, en alleen voor beheerder en eigenaar.
- Elke keer opslaan maakt een nieuwe versie. Oude versies kunnen via de app niet worden gewijzigd of verwijderd. Onder Instellingen kun je een eerdere versie terugzetten; dat wordt weer een nieuwe versie.
- Slaan twee mensen tegelijk op, dan wordt de tweede geweigerd met een melding om de pagina te herladen. Zo overschrijft niemand elkaars werk.
- De knoppen in de app volgen de rol, maar de echte controle zit in de database.

## Openbare repository: wat er nooit in mag

Deze repository kan openbaar zijn. Alles wat erin staat, inclusief de volledige geschiedenis, is dan voor iedereen leesbaar en blijft vindbaar, ook als je het later verwijdert. Zet er daarom **nooit** in:

- **Back-upbestanden** (`leningadministratie-backup-*.json`) of andere bestanden met echte namen, bedragen of rekeningnummers.
- **De secret- of service_role-sleutel** van Supabase. Alleen de publishable (of anon) sleutel hoort in `js/config.js`.
- **Echte e-mailadressen** in `supabase/schema.sql`. Voer de `insert`-regels uit in de SQL Editor van Supabase, maar sla de ingevulde versie niet op in de repository.

Het bestand `.gitignore` houdt back-ups buiten git, maar **niet** bij uploaden via de website van GitHub: daar wordt alles geüpload wat je erin sleept.

## Rekenregels

Deze regels bepalen de uitkomsten. Controleer ze tegen de contracten.

- **Rente per termijn** = jaarrente gedeeld door het aantal termijnen per jaar (52, 12, 4 of 1), over het saldo aan het begin van de periode. De eerste periode telt altijd als volle periode, ook als de lening halverwege een maand ingaat.
- **Annuïtair:** vast termijnbedrag, berekend uit hoofdsom, rente en aantal termijnen. Noemt het contract een vast bedrag, vul dat dan in; dat gaat voor.
- **Lineair:** elke termijn hetzelfde aflossingsbedrag, rente over het dalende saldo.
- **Aflossingsvrij:** alleen rente; de hele hoofdsom op de einddatum.
- **Vrij aflossen:** rente over het werkelijke saldo; aflossen mag altijd. Een aflossing verdeel je bij invoer zelf ("zelf verdelen").
- **Automatisch verdelen (F-12):** een ontvangst die precies gelijk is aan de open termijn, of aan een paar oudste open termijnen samen, wordt volgens het schema verdeeld over rente en aflossing. Een ontvangst tot 45 dagen vóór de vervaldatum hoort bij die termijn.
- **Afwijkend bedrag:** wordt niet automatisch verdeeld maar komt bij *te beoordelen*. Pas na handmatige verdeling telt het mee.
- **Extra aflossing:** aflossing boven het schema verlaagt het saldo. Het schema van de volgende termijnen blijft gelijk; leg zo nodig een wijziging vast.
- **Achterstand (F-15):** een termijn die een maand na de vervaldatum niet volledig is ontvangen.
- **Beginstand:** een lening die al liep, start met het saldo op de beginstanddatum. Een termijn die op die datum vervalt, valt erna (het saldo geldt per het begin van de dag). Ontvangsten van vóór de beginstand tellen niet mee.
- **Wijziging (F-04):** vanaf de ingangsdatum wordt het schema opnieuw berekend over het contractuele restant, met de nieuwe voorwaarden. Een extra opname verhoogt het saldo.
- **Gezamenlijke lening:** telt in het overzicht per lener bij elke lener volledig mee, in het totaal één keer.

## Eisen en waar ze zitten

| Eis | Onderwerp | Waar |
| --- | --- | --- |
| F-01 t/m F-03 | Register, leners, status | Leningen, Leners |
| F-04 | Wijzigingen met ingangsdatum | Lening bewerken > Wijzigingen |
| F-05 | Link naar contract en map | Lening en lener |
| F-06, F-07 | Schema, alle vormen en frequenties | Rekenkern, Leningkaart |
| F-08, F-09 | Handmatige invoer met controles, dubbele invoer | Invoer |
| F-10 | Plakken uit bankexport | **Niet gebouwd** (Could) |
| F-11 | Tegenrekeningen herkennen | Invoer, Leners |
| F-12 | Verdelen of signaleren | Rekenkern, Invoer |
| F-13 | Eén betaling over meerdere leningen | Invoer |
| F-14 t/m F-17 | Saldi, afwijkingen, aandacht nodig, naderende data | Overzicht |
| F-18 | Jaaroverzicht per geldgever | Rapporten (PDF en CSV) |
| F-19 | Leningkaart | Leningkaart, afdrukbaar |
| F-20 | Jaaroverzicht per lener | Rapporten |
| F-21, F-22, N-01, N-02 | Rollen, online, eigen accounts, tweestapsverificatie | Supabase, `schema.sql` |
| N-03 | Versiegeschiedenis en back-up | Database, Instellingen |
| N-04 | Rekenregels beschermd | Rekenregels zitten in de code, niet in bewerkbare cellen |
| N-05 | PDF en papier | Afdrukknoppen |
| N-07 | Werkinstructie | Menu Werkinstructie |

## Wat nog niet getest is

Eerlijk overzicht van de stand bij oplevering:

- **Getest:** de rekenkern (21 geautomatiseerde tests), de schermen in de proefmodus met testgegevens in een echte browser, en `schema.sql` op een lokale PostgreSQL 16-database met nagebootste Supabase-rollen (rechten per rol, tweestapsverificatie, conflict bij gelijktijdig opslaan, onwijzigbare geschiedenis).
- **Niet getest:** de koppeling met een echt Supabase-project (`js/opslag/supabase.js` en het inlogscherm). Die code volgt de documentatie van supabase-js versie 2, maar de eerste echte inlog kan nog een aanpassing vragen.
- **Eerste test met Supabase:** doe stap 1 t/m 8 met een testaccount, laad testgegevens, log in als lezer en controleer dat je niets kunt wijzigen. Pas daarna echte gegevens invoeren.
- De rekenregels zijn een redelijke standaard, geen vervanging van de contracten. Vergelijk bij elke nieuwe lening het berekende schema met het contract (knop *Schema berekenen*).

## Ontwikkelen en testen

Geen bouwstap en geen afhankelijkheden: gewone HTML, CSS en JavaScript-modules. Alleen de koppeling met Supabase laadt `@supabase/supabase-js` in de browser vanaf esm.sh.

```bash
node --test tests/engine.test.mjs   # rekenkern
python3 -m http.server 8000         # app lokaal
```

Mappen:

```
index.html            startpagina
css/app.css           opmaak, inclusief afdrukstijl
js/app.js             opstarten, navigatie, opslaan
js/config.js          koppeling met Supabase
js/engine/            rekenkern (geen scherm, geen opslag)
js/opslag/            lokale opslag en Supabase
js/ui/                schermen
js/testdata.js        fictieve testgegevens
supabase/schema.sql   database-inrichting
tests/                geautomatiseerde tests
```
