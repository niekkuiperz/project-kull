<?php
// Kern van de backend: configuratie, database, sessies, beveiliging en
// hulpfuncties. Wordt alleen via api/index.php geladen.

declare(strict_types=1);

const MAX_POGINGEN_ACCOUNT = 5;      // mislukte pogingen per e-mailadres...
const MAX_POGINGEN_IP = 20;          // ...en per IP-adres...
const POGING_VENSTER = 900;          // ...binnen 15 minuten
const SESSIE_INACTIEF = 1800;        // 30 minuten zonder activiteit: uitloggen
const SESSIE_MAXIMAAL = 43200;       // na 12 uur altijd opnieuw inloggen
const MIN_WACHTWOORD = 12;
const MAX_DATA_BYTES = 5_000_000;
const ROLLEN = ['beheerder', 'eigenaar', 'lezer'];

final class ApiFout extends Exception
{
    public function __construct(string $bericht, public readonly int $status = 400)
    {
        parent::__construct($bericht);
    }
}

/**
 * Waar de instellingen staan, in deze volgorde:
 * 1. het pad in de omgevingsvariabele KULL_CONFIG;
 * 2. kull-config.php in de map BOVEN de webroot (aanbevolen: van buitenaf
 *    nooit bereikbaar, ook niet als de webserver .htaccess negeert);
 * 3. api/config.php (alleen als 2 niet bestaat).
 */
function configBestand(): ?string
{
    $kandidaten = [];
    if (getenv('KULL_CONFIG')) {
        $kandidaten[] = getenv('KULL_CONFIG');
    }
    $kandidaten[] = dirname(__DIR__, 3) . '/kull-config.php';
    $kandidaten[] = dirname(__DIR__) . '/config.php';
    foreach ($kandidaten as $pad) {
        if (@is_file($pad)) {
            return $pad;
        }
    }
    return null;
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        $bestand = configBestand();
        if ($bestand === null) {
            throw new ApiFout('De server is nog niet ingericht: kull-config.php ontbreekt. Zie de README.', 500);
        }
        $config = require $bestand;
        if (!is_array($config)) {
            throw new ApiFout('Het configuratiebestand is ongeldig. Zie de README.', 500);
        }
        foreach (['db_dsn', 'sleutel', 'installatie_code'] as $verplicht) {
            if (empty($config[$verplicht])) {
                throw new ApiFout("Instelling '$verplicht' ontbreekt in het configuratiebestand.", 500);
            }
        }
        // Voorkom dat de app draait met de voorbeeldwaarden.
        foreach ($config as $sleutelNaam => $waarde) {
            if (is_string($waarde) && preg_match('/VERVANG|VUL_IN|NAAM_VAN_DE_DATABASE|GEBRUIKERSNAAM_VAN_DE_DATABASE|WACHTWOORD_VAN_DE_DATABASE/', $waarde)) {
                throw new ApiFout("Instelling '$sleutelNaam' bevat nog een voorbeeldwaarde. Vul het configuratiebestand in.", 500);
            }
        }
        if (strlen($config['sleutel']) < 32) {
            throw new ApiFout("De instelling 'sleutel' moet minstens 32 tekens lang zijn.", 500);
        }
        if (strlen($config['installatie_code']) < 12) {
            throw new ApiFout("De instelling 'installatie_code' moet minstens 12 tekens lang zijn.", 500);
        }
    }
    return $config;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $pdo = new PDO($c['db_dsn'], $c['db_gebruiker'] ?? null, $c['db_wachtwoord'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if (driver() === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        }
        maakTabellen($pdo);
    }
    return $pdo;
}

function driver(): string
{
    return str_starts_with(config()['db_dsn'], 'sqlite:') ? 'sqlite' : 'mysql';
}

function maakTabellen(PDO $pdo): void
{
    if (driver() === 'sqlite') {
        $id = 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $tekst = 'TEXT';
        $groot = 'TEXT';
        $eind = '';
    } else {
        $id = 'BIGINT AUTO_INCREMENT PRIMARY KEY';
        $tekst = 'VARCHAR(255)';
        $groot = 'LONGTEXT';
        $eind = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS kull_gebruikers (
        id $id,
        email $tekst NOT NULL UNIQUE,
        naam $tekst NOT NULL,
        rol $tekst NOT NULL,
        wachtwoord_hash $tekst NOT NULL,
        totp_geheim $tekst NULL,
        totp_laatste_stap BIGINT NOT NULL DEFAULT 0,
        actief INTEGER NOT NULL DEFAULT 1,
        moet_wachtwoord_wijzigen INTEGER NOT NULL DEFAULT 1,
        sessie_versie INTEGER NOT NULL DEFAULT 0,
        aangemaakt_op BIGINT NOT NULL,
        laatste_login BIGINT NULL
    )$eind");
    $pdo->exec("CREATE TABLE IF NOT EXISTS kull_versies (
        id $id,
        data $groot NOT NULL,
        opgeslagen_op BIGINT NOT NULL,
        opgeslagen_door BIGINT NULL,
        opgeslagen_door_naam $tekst NULL
    )$eind");
    $pdo->exec("CREATE TABLE IF NOT EXISTS kull_pogingen (
        id $id,
        sleutel $tekst NOT NULL,
        tijd BIGINT NOT NULL
    )$eind");
    $pdo->exec("CREATE TABLE IF NOT EXISTS kull_gebeurtenissen (
        id $id,
        tijd BIGINT NOT NULL,
        gebruiker_id BIGINT NULL,
        soort $tekst NOT NULL,
        omschrijving $tekst NOT NULL,
        ip $tekst NULL
    )$eind");
}

// Schrijftransactie die meteen een slot neemt, zodat twee gelijktijdige
// verzoeken elkaar niet kunnen inhalen.
function startSchrijven(): void
{
    if (driver() === 'sqlite') {
        db()->exec('BEGIN IMMEDIATE');
        return;
    }
    if ((int)eenRij("SELECT GET_LOCK('kull_schrijven', 10) AS l")['l'] !== 1) {
        throw new ApiFout('De server is bezig. Probeer het zo opnieuw.', 503);
    }
    db()->beginTransaction();
}

function stopSchrijven(bool $bevestigen): void
{
    if (driver() === 'sqlite') {
        db()->exec($bevestigen ? 'COMMIT' : 'ROLLBACK');
        return;
    }
    try {
        if (db()->inTransaction()) {
            $bevestigen ? db()->commit() : db()->rollBack();
        }
    } finally {
        eenRij("SELECT RELEASE_LOCK('kull_schrijven') AS l");
    }
}

function eenRij(string $sql, array $params = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $rij = $st->fetch();
    return $rij === false ? null : $rij;
}

function alleRijen(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function voerUit(string $sql, array $params = []): void
{
    db()->prepare($sql)->execute($params);
}

function logGebeurtenis(?int $gebruikerId, string $soort, string $omschrijving): void
{
    voerUit(
        'INSERT INTO kull_gebeurtenissen (tijd, gebruiker_id, soort, omschrijving, ip) VALUES (?, ?, ?, ?, ?)',
        [time(), $gebruikerId, $soort, mb_substr($omschrijving, 0, 250), clientIp()]
    );
}

function clientIp(): string
{
    // Bewust alleen REMOTE_ADDR: een X-Forwarded-For-kop is door de bezoeker te vervalsen.
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'onbekend');
}

// ---------------------------------------------------------------------------
// Sessies en CSRF
// ---------------------------------------------------------------------------
function isHttps(): bool
{
    if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443')) {
        return true;
    }
    // Een X-Forwarded-Proto-kop kan iedere bezoeker meesturen. Alleen vertrouwen
    // als de hoster een proxy gebruikt die deze kop zelf zet (instelling achter_proxy).
    return !empty(config()['achter_proxy'])
        && strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

// Wachtwoorden en codes alleen over een versleutelde verbinding. Uitzondering:
// testen op de eigen computer (localhost).
function vereisHttps(): void
{
    $lokaal = in_array(clientIp(), ['127.0.0.1', '::1'], true);
    if (!isHttps() && !$lokaal) {
        throw new ApiFout('Inloggen kan alleen via een beveiligde verbinding (https). Zet SSL aan bij je hoster.', 403);
    }
}

function startSessie(): void
{
    $https = isHttps();
    $pad = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/') . '/';
    session_name('kull_sessie');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $pad,
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();

    $nu = time();
    if (isset($_SESSION['gebruiker_id'])) {
        $verlopen = ($nu - ($_SESSION['laatst_actief'] ?? 0)) > SESSIE_INACTIEF
            || ($nu - ($_SESSION['begonnen'] ?? 0)) > SESSIE_MAXIMAAL;
        if ($verlopen) {
            beeindigSessie();
            session_start();
        }
    }
    $_SESSION['laatst_actief'] = $nu;
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function beeindigSessie(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}

// Nieuw sessie-ID bij elke stap omhoog in de inlog, tegen sessiekaping.
function vernieuwSessie(): void
{
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function controleerCsrf(): void
{
    $kop = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($kop) || !hash_equals($_SESSION['csrf'] ?? '', $kop)) {
        throw new ApiFout('Je sessie is verlopen. Herlaad de pagina.', 403);
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (!str_starts_with($type, 'application/json')) {
        throw new ApiFout('Ongeldig verzoek.', 415);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $host = parse_url($origin, PHP_URL_HOST);
        $eigen = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
        if (!$host || strcasecmp($host, $eigen) !== 0) {
            throw new ApiFout('Ongeldig verzoek.', 403);
        }
    }
}

function huidigeGebruiker(): ?array
{
    if (empty($_SESSION['gebruiker_id'])) {
        return null;
    }
    $g = eenRij('SELECT * FROM kull_gebruikers WHERE id = ?', [$_SESSION['gebruiker_id']]);
    // Geblokkeerd, hersteld of wachtwoord gewijzigd sinds het inloggen: sessie vervalt.
    if (!$g || !(int)$g['actief'] || (int)$g['sessie_versie'] !== (int)($_SESSION['sessie_versie'] ?? -1)) {
        beeindigSessie();
        return null;
    }
    return $g;
}

// Volledig ingelogd: wachtwoord, tweestapsverificatie en geen verplichte
// wachtwoordwijziging meer open.
function vereisIngelogd(): array
{
    $g = huidigeGebruiker();
    if (!$g || ($_SESSION['stap'] ?? '') !== 'klaar') {
        throw new ApiFout('Je bent niet (meer) ingelogd.', 401);
    }
    return $g;
}

function vereisRol(array $rollen): array
{
    $g = vereisIngelogd();
    if (!in_array($g['rol'], $rollen, true)) {
        throw new ApiFout('Je hebt geen rechten voor deze handeling.', 403);
    }
    return $g;
}

function publiekeGebruiker(array $g): array
{
    return ['id' => (int)$g['id'], 'naam' => $g['naam'], 'email' => $g['email'], 'rol' => $g['rol']];
}

// ---------------------------------------------------------------------------
// Blokkade na herhaalde mislukte pogingen
// ---------------------------------------------------------------------------
function pogingSleutels(string $email): array
{
    return ['account:' . mb_strtolower(trim($email)), 'ip:' . clientIp()];
}

function controleerBlokkade(string $email): void
{
    $grens = time() - POGING_VENSTER;
    voerUit('DELETE FROM kull_pogingen WHERE tijd < ?', [time() - 86400]);
    [$account, $ip] = pogingSleutels($email);
    $perAccount = (int)eenRij('SELECT COUNT(*) AS n FROM kull_pogingen WHERE sleutel = ? AND tijd >= ?', [$account, $grens])['n'];
    $perIp = (int)eenRij('SELECT COUNT(*) AS n FROM kull_pogingen WHERE sleutel = ? AND tijd >= ?', [$ip, $grens])['n'];
    if ($perAccount >= MAX_POGINGEN_ACCOUNT || $perIp >= MAX_POGINGEN_IP) {
        throw new ApiFout('Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw.', 429);
    }
}

function registreerMislukt(string $email): void
{
    foreach (pogingSleutels($email) as $s) {
        voerUit('INSERT INTO kull_pogingen (sleutel, tijd) VALUES (?, ?)', [$s, time()]);
    }
}

function wisPogingen(string $email): void
{
    voerUit('DELETE FROM kull_pogingen WHERE sleutel = ?', [pogingSleutels($email)[0]]);
}

// ---------------------------------------------------------------------------
// Versleuteling van TOTP-geheimen in de database
// ---------------------------------------------------------------------------
function versleutelSleutel(): string
{
    return sodium_crypto_generichash(config()['sleutel'], '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
}

function versleutel(string $tekst): string
{
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return base64_encode($nonce . sodium_crypto_secretbox($tekst, $nonce, versleutelSleutel()));
}

function ontsleutel(string $opgeslagen): string
{
    $ruw = base64_decode($opgeslagen, true);
    if ($ruw === false || strlen($ruw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
        throw new ApiFout('Beveiligingsgegevens zijn beschadigd.', 500);
    }
    $nonce = substr($ruw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $tekst = sodium_crypto_secretbox_open(substr($ruw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, versleutelSleutel());
    if ($tekst === false) {
        throw new ApiFout('Beveiligingsgegevens konden niet worden gelezen. Is de sleutel in config.php gewijzigd?', 500);
    }
    return $tekst;
}

// ---------------------------------------------------------------------------
// Wachtwoorden
// ---------------------------------------------------------------------------
function controleerNieuwWachtwoord(string $wachtwoord, string $email = ''): void
{
    if (mb_strlen($wachtwoord) < MIN_WACHTWOORD) {
        throw new ApiFout('Kies een wachtwoord van minstens ' . MIN_WACHTWOORD . ' tekens. Een zin van een paar woorden werkt goed.');
    }
    if (mb_strlen($wachtwoord) > 200) {
        throw new ApiFout('Dit wachtwoord is te lang.');
    }
    if ($email !== '' && stripos($wachtwoord, explode('@', $email)[0]) !== false) {
        throw new ApiFout('Gebruik je e-mailadres niet in je wachtwoord.');
    }
}

function tijdelijkWachtwoord(): string
{
    // Geen tekens die op elkaar lijken (0/O, 1/l/I).
    $tekens = 'abcdefghjkmnpqrstuvwxyz23456789';
    $groepen = [];
    for ($g = 0; $g < 4; $g++) {
        $deel = '';
        for ($i = 0; $i < 4; $i++) {
            $deel .= $tekens[random_int(0, strlen($tekens) - 1)];
        }
        $groepen[] = $deel;
    }
    return implode('-', $groepen);
}

// Om te voorkomen dat aan de responstijd te zien is of een e-mailadres bestaat.
// Vaste hash (zelfde algoritme en kosten als echte wachtwoorden), zodat er
// per verzoek niet ook nog een hash berekend hoeft te worden.
const NEP_HASH = '$2y$10$mv36jmsKsnSJInkOLkSNI.oa5/wGpm5svw66w4wTFKJU3S4pGTkrW';

function nepVerificatie(string $wachtwoord): void
{
    password_verify($wachtwoord, NEP_HASH);
}

// ---------------------------------------------------------------------------
// Verzoek en antwoord
// ---------------------------------------------------------------------------
function invoer(): array
{
    $ruw = file_get_contents('php://input', false, null, 0, MAX_DATA_BYTES + 1);
    if ($ruw === false || strlen($ruw) > MAX_DATA_BYTES) {
        throw new ApiFout('Het verzoek is te groot.', 413);
    }
    if ($ruw === '') {
        return [];
    }
    $json = json_decode($ruw, true, 64);
    if (!is_array($json)) {
        throw new ApiFout('Ongeldig verzoek.');
    }
    return $json;
}

function tekstVeld(array $in, string $naam, int $max = 255): string
{
    $v = $in[$naam] ?? '';
    if (!is_string($v)) {
        throw new ApiFout("Ongeldige waarde voor $naam.");
    }
    $v = trim($v);
    if (mb_strlen($v) > $max) {
        throw new ApiFout("$naam is te lang.");
    }
    return $v;
}

function geldigEmail(string $email): string
{
    $email = mb_strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new ApiFout('Vul een geldig e-mailadres in.');
    }
    return $email;
}

function antwoord(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
