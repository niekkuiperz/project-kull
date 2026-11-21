# Leningadministratie

Webapp voor de administratie van uitgeleend geld, op naam van een privépersoon of een eigen vennootschap (BV). De eisnummers (F-01, N-01 enzovoort) verwijzen naar een vooraf opgesteld eisendocument.

De app berekent per lening het schema van verwachte termijnen, zet de ontvangsten daartegen af, signaleert achterstanden en afwijkingen, en maakt de jaaroverzichten voor de accountant en voor leners.

## Inhoud

1. [Snel uitproberen](#snel-uitproberen)
2. [Echt gebruiken: bij een Nederlandse webhoster](#echt-gebruiken-bij-een-nederlandse-webhoster)
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

## Echt gebruiken: bij een Nederlandse webhoster

De app draait op een gewoon webhostingpakket met PHP en MySQL, zoals Antagonist, Vimexx of TransIP dat bieden. De map `api/` is de backend: inloggen, tweestapsverificatie, rollen en opslag. Er is geen andere dienst nodig.

### Wat je nodig hebt

- Een webhostingpakket met **PHP 8.1 of nieuwer**, de PHP-extensies **pdo_mysql** en **sodium** (standaard bij vrijwel elke hoster), en een **MySQL**- of MariaDB-database.
- Een domeinnaam of subdomein, bijvoorbeeld `administratie.jouwdomein.nl`.
- **SSL (https)**. Bijna elke hoster biedt gratis Let's Encrypt. Zonder https weigert de app het inloggen.

### Installeren

1. **Database aanmaken** in het controlepaneel van de hoster. Noteer databasenaam, gebruikersnaam en wachtwoord (in je wachtwoordbeheerder).
2. **SSL aanzetten** voor het domein, en "HTTPS afdwingen" als de hoster die optie heeft.
3. **Instellingen:** kopieer `api/config.voorbeeld.php` naar **`kull-config.php` in de map boven de webroot** (bij Plesk: naast `httpdocs`, dus in de hoofdmap van het domein). Daar is het bestand van buitenaf nooit bereikbaar, ook niet als de webserver de `.htaccess`-regels negeert. Vul in:
   - de databasegegevens;
   - `sleutel`: een lange willekeurige tekst (minstens 32 tekens) uit je wachtwoordbeheerder. Bewaar hem daar ook;
   - `installatie_code`: een zelfbedachte code van minstens 12 tekens voor het aanmaken van het eerste account.
   Gebruik in deze waarden geen enkel aanhalingsteken (`'`) en geen backslash (`\`). De app start niet zolang er nog een voorbeeldwaarde in staat.
   Kan je hoster geen bestanden boven de webroot plaatsen, gebruik dan `api/config.php`. De app zoekt in deze volgorde: de omgevingsvariabele `KULL_CONFIG`, `kull-config.php` boven de webroot, `api/config.php`.
4. **App koppelen:** zet in `js/config.js` de regel `api: 'api/index.php',`.
5. **Uploaden** met FTP of het bestandsbeheer van de hoster naar de map van het domein (vaak `public_html` of `www`): `index.html`, `.htaccess`, en de mappen `css`, `js` en `api`. De mappen `tests` en `.github` en de README hoeven niet mee.
6. **Eerste account:** open het adres in je browser. De app vraagt om de installatiecode; maak daarmee je beheerdersaccount aan en koppel je authenticator-app.
7. **Andere gebruikers:** menu *Gebruikers* > *Gebruiker toevoegen*. De app maakt een tijdelijk wachtwoord dat je persoonlijk doorgeeft. Bij de eerste keer inloggen koppelt de gebruiker een authenticator-app en kiest een eigen wachtwoord.
8. **Controleren:** open eenmalig `https://jouwdomein/api/lib/kern.php`, `https://jouwdomein/README.md` en `https://jouwdomein/api/config.voorbeeld.php` in je browser. Je moet een foutmelding (403 of 404) krijgen of een lege pagina, nooit de inhoud van het bestand. Krijg je wel iets te zien, stop dan en controleer of de `.htaccess`-bestanden zijn geüpload. Doe dit met de hand, één keer per adres: herhaald of geautomatiseerd aftasten kan door de firewall van de hoster als aanval worden gezien.
9. **Eerste gegevens:** probeer de app eerst met testgegevens (Instellingen), maak hem daarna leeg en voer de echte leners en leningen in.

### Hoe de beveiliging werkt

- **Inloggen in twee stappen:** wachtwoord plus een code uit een authenticator-app (eis N-02). Zonder beide stappen geeft de server geen gegevens.
- **Wachtwoorden** worden opgeslagen met de standaard hashfunctie van PHP (`password_hash`), nooit leesbaar. Minimaal 12 tekens.
- **Geheimen van de authenticator-apps** staan versleuteld in de database, met de `sleutel` uit het configuratiebestand.
- **Blokkade:** na 5 mislukte pogingen (wachtwoord of code) op een account, of 20 vanaf één IP-adres, is inloggen 15 minuten geblokkeerd. Een code uit de app werkt maar één keer.
- **Sessies** verlopen na 30 minuten zonder activiteit en altijd na 12 uur. Bij het blokkeren of herstellen van een account, of een nieuw wachtwoord, vervallen de open sessies van die gebruiker direct.
- **Rollen** worden op de server gecontroleerd: `beheerder` (alles, ook gebruikers), `eigenaar` (bewerken), `lezer` (alleen lezen). De knoppen in de app volgen dat alleen.
- **Versiegeschiedenis:** elke keer opslaan maakt een nieuwe versie; via de app is geen versie te wijzigen of te wissen. Slaan twee mensen tegelijk op, dan wordt de tweede geweigerd met een melding om te herladen.
- **Logboek:** inlogpogingen en wijzigingen in accounts staan onder *Gebruikers*.
- **Afscherming:** `api/.htaccess` laat alleen `api/index.php` toe; de hoofd-`.htaccess` zet beveiligingskoppen (onder meer een Content Security Policy) en verbergt de testbestanden.

### Back-ups

- De meeste hosters maken dagelijks een back-up van bestanden en database. Controleer dat bij jouw pakket.
- Gebruik daarnaast maandelijks de knop **Download back-up** onder Instellingen en bewaar dat bestand op een tweede, losse plek (eis N-03).
- Bewaar `kull-config.php` (of in elk geval de `sleutel`) in je wachtwoordbeheerder. Zonder die sleutel moet iedereen de authenticator-app opnieuw koppelen.

### Noodprocedure: beheerder kan niet meer inloggen

Een andere beheerder kan je tweestapsverificatie herstellen via *Gebruikers*. Ben je de enige beheerder en is je telefoon kwijt, open dan de database in het controlepaneel van de hoster (meestal phpMyAdmin) en voer uit:

```sql
UPDATE kull_gebruikers SET totp_geheim = NULL, totp_laatste_stap = 0 WHERE email = 'jouw@emailadres.nl';
```

Bij de volgende keer inloggen koppel je de app opnieuw. Tip: maak twee beheerders aan, dan is dit nooit nodig.

## Openbare repository: wat er nooit in mag

Deze repository kan openbaar zijn. Alles wat erin staat, inclusief de volledige geschiedenis, is dan voor iedereen leesbaar en blijft vindbaar, ook als je het later verwijdert. Zet er daarom **nooit** in:

- **`kull-config.php` of `api/config.php`**, met de databasegegevens, de sleutel en de installatiecode.
- **De database** of een SQLite-bestand uit `api/data/`.
- **Back-upbestanden** (`leningadministratie-backup-*.json`) of andere bestanden met echte namen, bedragen of rekeningnummers.

Het bestand `.gitignore` houdt deze bestanden buiten git, maar **niet** bij uploaden via de website van GitHub: daar wordt alles geüpload wat je erin sleept.

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
| F-21, F-22, N-01, N-02 | Rollen, online, eigen accounts, tweestapsverificatie | `api/`, menu Gebruikers |
| N-03 | Versiegeschiedenis en back-up | Database, Instellingen |
| N-04 | Rekenregels beschermd | Rekenregels zitten in de code, niet in bewerkbare cellen |
| N-05 | PDF en papier | Afdrukknoppen |
| N-07 | Werkinstructie | Menu Werkinstructie |

## Wat nog niet getest is

Eerlijk overzicht van de stand bij oplevering:

- **Getest:** de rekenkern (21 tests); de TOTP-code tegen de officiële testvectoren van RFC 6238; de API van begin tot eind met PHP 8.3 en SQLite (46 controles: installatie, tweestapsverificatie, rechten per rol, blokkade, CSRF, conflicten, hergebruik van codes, blokkeren en herstellen); de hele inlogflow en de schermen in een echte browser, met de Content Security Policy actief; de QR-code met een onafhankelijke decoder.
- **Aanvalstests** (`tests/aanval_test.py`, 46 aanvallen): toegang zonder of met te weinig rechten, half ingelogd, sessie-ID vooraf opdringen, gestolen cookie na uitloggen, CSRF met vreemde Origin, SQL-injectie, extra velden, te grote of te diep geneste verzoeken, 20 gelijktijdige opslagen, blokkade omzeilen met vervalste IP-koppen of hoofdletters, codes en installatiecode raden, e-mailadressen raden via de responstijd, opslag van wachtwoorden en geheimen, en het https-vereiste. Daarnaast een XSS-test in de browser met kwaadaardige namen, omschrijvingen en `javascript:`-links, in proefmodus en servermodus.
- **Gevonden en opgelost bij die tests:** (1) een vervalste kop `X-Forwarded-Proto` omzeilde het https-vereiste; die kop wordt nu alleen vertrouwd met de instelling `achter_proxy`. (2) Een onbekend e-mailadres gaf een twee keer zo trage reactie, waardoor bestaande accounts te raden waren; nu even snel. (3) Links naar contracten en mappen accepteerden `javascript:`-adressen; nu alleen `http` en `https`.
- **Niet getest:** MySQL. De code gebruikt standaard-SQL en de MySQL-functies `GET_LOCK` en `RELEASE_LOCK`, maar er draaide hier geen MySQL-server. Ook de `.htaccess`-regels zijn niet op een echte Apache- of LiteSpeed-server getest. Doe daarom stap 8 van de installatie.
- **Eerste test op de hoster:** installeer met een testaccount, laad testgegevens, log in als lezer en controleer dat je niets kunt wijzigen. Pas daarna echte gegevens invoeren.
- De rekenregels zijn een redelijke standaard, geen vervanging van de contracten. Vergelijk bij elke nieuwe lening het berekende schema met het contract (knop *Schema berekenen*).

## Ontwikkelen en testen

Geen bouwstap en geen afhankelijkheden: gewone HTML, CSS, JavaScript-modules en PHP. De QR-encoder van Kazuhiko Arase (MIT) zit in `js/vendor/`.

```bash
node --test tests/engine.test.mjs                                   # rekenkern
KULL_CONFIG=/tmp/test-config.php php -S 127.0.0.1:8790 -t .        # app en API lokaal
python3 tests/api_test.py http://127.0.0.1:8790/api/index.php       # API-test (lege testdatabase)
python3 tests/aanval_test.py 127.0.0.1:8790 <ip>:8790 <sqlite-bestand>  # aanvalstests (lege testdatabase)
```

Mappen:

```
index.html            startpagina
.htaccess             beveiligingskoppen voor Apache en LiteSpeed
css/app.css           opmaak, inclusief afdrukstijl
js/app.js             opstarten, navigatie, opslaan
js/config.js          proefmodus of server
js/engine/            rekenkern (geen scherm, geen opslag)
js/opslag/            lokale opslag en server
js/ui/                schermen
js/vendor/            QR-encoder
js/testdata.js        fictieve testgegevens
api/index.php         API (enige bereikbare PHP-bestand)
api/lib/              kern en TOTP
api/config.voorbeeld.php  voorbeeld voor api/config.php
tests/                geautomatiseerde tests
```
