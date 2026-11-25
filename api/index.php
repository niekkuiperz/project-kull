<?php
// API van Project Kull. Eén ingang; de actie staat in ?actie=...
// Alle antwoorden zijn JSON. Wijzigende verzoeken (POST) vereisen de
// CSRF-sleutel uit "sessie" in de kop X-CSRF.

declare(strict_types=1);

require __DIR__ . '/lib/kern.php';
require __DIR__ . '/lib/totp.php';

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof ApiFout) {
        antwoord(['fout' => $e->getMessage()], $e->status);
    }
    error_log('[kull] ' . $e::class . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    antwoord(['fout' => 'Er ging iets mis op de server. Probeer het later opnieuw.'], 500);
});

if (!function_exists('sodium_crypto_secretbox')) {
    throw new ApiFout('De PHP-extensie sodium ontbreekt op deze server. Vraag de hoster om die aan te zetten.', 500);
}

config();
startSessie();

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actie = (string)($_GET['actie'] ?? '');
$posts = [
    'installeren', 'inloggen', 'totp_start', 'totp_bevestigen', 'totp', 'wachtwoord', 'uitloggen', 'opslaan',
    'gebruiker_toevoegen', 'gebruiker_wijzigen', 'gebruiker_herstel',
    'wens_indienen', 'wens_status', 'gebruiker_verwijderen',
];
$gets = ['sessie', 'laad', 'historie', 'versie', 'gebruikers', 'gebeurtenissen', 'wensen'];

if (in_array($actie, $posts, true)) {
    if ($methode !== 'POST') {
        throw new ApiFout('Methode niet toegestaan.', 405);
    }
    controleerCsrf();
    vereisHttps();
    $in = invoer();
} elseif (in_array($actie, $gets, true)) {
    if ($methode !== 'GET') {
        throw new ApiFout('Methode niet toegestaan.', 405);
    }
    $in = [];
} else {
    throw new ApiFout('Onbekende actie.', 404);
}

$naam = config()['app_naam'] ?? 'Project Kull';

switch ($actie) {
    // -----------------------------------------------------------------------
    // Inloggen
    // -----------------------------------------------------------------------
    case 'sessie':
        $aantal = (int)eenRij('SELECT COUNT(*) AS n FROM kull_gebruikers')['n'];
        $g = huidigeGebruiker();
        $stap = $aantal === 0 ? 'installeren' : ($g ? ($_SESSION['stap'] ?? 'inloggen') : 'inloggen');
        antwoord([
            'stap' => $stap,
            'csrf' => $_SESSION['csrf'],
            'gebruiker' => ($g && $stap === 'klaar') ? publiekeGebruiker($g) : null,
            'app_naam' => $naam,
        ]);

    case 'installeren':
        // Eerste beheerder aanmaken. Alleen mogelijk zolang er nog geen
        // gebruikers zijn, en alleen met de installatiecode uit config.php.
        controleerBlokkade('installatie');
        $code = tekstVeld($in, 'code', 200);
        if (!hash_equals((string)config()['installatie_code'], $code)) {
            registreerMislukt('installatie');
            throw new ApiFout('De installatiecode klopt niet.', 403);
        }
        $email = geldigEmail(tekstVeld($in, 'email'));
        $gebruikersnaam = tekstVeld($in, 'naam', 100);
        $wachtwoord = (string)($in['wachtwoord'] ?? '');
        if ($gebruikersnaam === '') {
            throw new ApiFout('Vul je naam in.');
        }
        controleerNieuwWachtwoord($wachtwoord, $email);
        $hash = password_hash($wachtwoord, PASSWORD_DEFAULT);
        startSchrijven();
        try {
            if ((int)eenRij('SELECT COUNT(*) AS n FROM kull_gebruikers')['n'] > 0) {
                throw new ApiFout('De installatie is al gedaan.', 409);
            }
            voerUit(
                'INSERT INTO kull_gebruikers (email, naam, rol, wachtwoord_hash, moet_wachtwoord_wijzigen, aangemaakt_op) VALUES (?, ?, ?, ?, 0, ?)',
                [$email, $gebruikersnaam, 'beheerder', $hash, time()]
            );
            $id = (int)db()->lastInsertId();
            stopSchrijven(true);
        } catch (Throwable $e) {
            stopSchrijven(false);
            throw $e;
        }
        logGebeurtenis($id, 'installatie', "Eerste beheerder aangemaakt: $email");
        vernieuwSessie();
        $_SESSION['gebruiker_id'] = $id;
        $_SESSION['sessie_versie'] = 0;
        $_SESSION['begonnen'] = time();
        $_SESSION['stap'] = 'totp_instellen';
        antwoord(['stap' => 'totp_instellen', 'csrf' => $_SESSION['csrf']]);

    case 'inloggen':
        $email = mb_strtolower(tekstVeld($in, 'email'));
        $wachtwoord = (string)($in['wachtwoord'] ?? '');
        controleerBlokkade($email);
        $g = $email !== '' ? eenRij('SELECT * FROM kull_gebruikers WHERE email = ?', [$email]) : null;
        if (!$g) {
            nepVerificatie($wachtwoord);
        }
        if (!$g || !(int)$g['actief'] || !password_verify($wachtwoord, $g['wachtwoord_hash'])) {
            registreerMislukt($email);
            logGebeurtenis($g ? (int)$g['id'] : null, 'inloggen_mislukt', "Mislukte inlogpoging voor $email");
            throw new ApiFout('E-mailadres of wachtwoord klopt niet.', 401);
        }
        if (password_needs_rehash($g['wachtwoord_hash'], PASSWORD_DEFAULT)) {
            voerUit('UPDATE kull_gebruikers SET wachtwoord_hash = ? WHERE id = ?', [password_hash($wachtwoord, PASSWORD_DEFAULT), $g['id']]);
        }
        vernieuwSessie();
        $_SESSION['gebruiker_id'] = (int)$g['id'];
        $_SESSION['sessie_versie'] = (int)$g['sessie_versie'];
        $_SESSION['begonnen'] = time();
        $_SESSION['stap'] = $g['totp_geheim'] ? 'totp' : 'totp_instellen';
        antwoord(['stap' => $_SESSION['stap'], 'csrf' => $_SESSION['csrf']]);

    case 'totp_start':
        $g = huidigeGebruiker();
        if (!$g || ($_SESSION['stap'] ?? '') !== 'totp_instellen') {
            throw new ApiFout('Log eerst in.', 401);
        }
        $_SESSION['totp_nieuw'] ??= nieuwTotpGeheim();
        antwoord(['geheim' => $_SESSION['totp_nieuw'], 'uri' => totpUri($_SESSION['totp_nieuw'], $g['email'], $naam)]);

    case 'totp_bevestigen':
    case 'totp':
        $g = huidigeGebruiker();
        $verwacht = $actie === 'totp' ? 'totp' : 'totp_instellen';
        if (!$g || ($_SESSION['stap'] ?? '') !== $verwacht) {
            throw new ApiFout('Log eerst in.', 401);
        }
        controleerBlokkade($g['email']);
        $geheim = $actie === 'totp' ? ontsleutel($g['totp_geheim']) : ($_SESSION['totp_nieuw'] ?? '');
        if ($geheim === '') {
            throw new ApiFout('Begin opnieuw met het koppelen van de app.', 400);
        }
        $stap = controleerTotp($geheim, tekstVeld($in, 'code', 20), (int)$g['totp_laatste_stap']);
        if ($stap === null) {
            registreerMislukt($g['email']);
            logGebeurtenis((int)$g['id'], 'code_mislukt', 'Onjuiste code uit de authenticator-app');
            throw new ApiFout('De code klopt niet of is verlopen. Probeer de volgende code.', 401);
        }
        if ($actie === 'totp_bevestigen') {
            voerUit('UPDATE kull_gebruikers SET totp_geheim = ?, totp_laatste_stap = ? WHERE id = ?', [versleutel($geheim), $stap, $g['id']]);
            unset($_SESSION['totp_nieuw']);
            logGebeurtenis((int)$g['id'], 'tweestaps_ingesteld', 'Authenticator-app gekoppeld');
        } else {
            voerUit('UPDATE kull_gebruikers SET totp_laatste_stap = ? WHERE id = ?', [$stap, $g['id']]);
        }
        voerUit('UPDATE kull_gebruikers SET laatste_login = ? WHERE id = ?', [time(), $g['id']]);
        wisPogingen($g['email']);
        logGebeurtenis((int)$g['id'], 'ingelogd', 'Ingelogd');
        vernieuwSessie();
        $_SESSION['stap'] = (int)$g['moet_wachtwoord_wijzigen'] ? 'wachtwoord_wijzigen' : 'klaar';
        antwoord(['stap' => $_SESSION['stap'], 'csrf' => $_SESSION['csrf']]);

    case 'wachtwoord':
        $g = huidigeGebruiker();
        $stap = $_SESSION['stap'] ?? '';
        if (!$g || ($stap !== 'klaar' && $stap !== 'wachtwoord_wijzigen')) {
            throw new ApiFout('Log eerst in.', 401);
        }
        if ($stap === 'klaar') {
            controleerBlokkade($g['email']);
            if (!password_verify((string)($in['huidig'] ?? ''), $g['wachtwoord_hash'])) {
                registreerMislukt($g['email']);
                throw new ApiFout('Je huidige wachtwoord klopt niet.', 401);
            }
        }
        $nieuw = (string)($in['nieuw'] ?? '');
        controleerNieuwWachtwoord($nieuw, $g['email']);
        if (password_verify($nieuw, $g['wachtwoord_hash'])) {
            throw new ApiFout('Kies een ander wachtwoord dan het huidige.');
        }
        $versie = (int)$g['sessie_versie'] + 1;
        voerUit(
            'UPDATE kull_gebruikers SET wachtwoord_hash = ?, moet_wachtwoord_wijzigen = 0, sessie_versie = ? WHERE id = ?',
            [password_hash($nieuw, PASSWORD_DEFAULT), $versie, $g['id']]
        );
        logGebeurtenis((int)$g['id'], 'wachtwoord_gewijzigd', 'Wachtwoord gewijzigd');
        vernieuwSessie();
        $_SESSION['sessie_versie'] = $versie; // andere sessies van deze gebruiker vervallen
        $_SESSION['stap'] = 'klaar';
        antwoord(['stap' => 'klaar', 'csrf' => $_SESSION['csrf']]);

    case 'uitloggen':
        if (!empty($_SESSION['gebruiker_id'])) {
            logGebeurtenis((int)$_SESSION['gebruiker_id'], 'uitgelogd', 'Uitgelogd');
        }
        beeindigSessie();
        antwoord(['ok' => true]);

    // -----------------------------------------------------------------------
    // Gegevens: elke opslag is een nieuwe versie (versiegeschiedenis)
    // -----------------------------------------------------------------------
    case 'laad':
        vereisIngelogd();
        $rij = eenRij('SELECT id, data FROM kull_versies ORDER BY id DESC LIMIT 1');
        antwoord($rij ? ['versie' => (int)$rij['id'], 'data' => json_decode($rij['data'], true)] : ['versie' => 0, 'data' => null]);

    case 'opslaan':
        $g = vereisRol(['beheerder', 'eigenaar']);
        $data = $in['data'] ?? null;
        foreach (['leners', 'leningen', 'ontvangsten'] as $lijst) {
            if (!is_array($data) || !isset($data[$lijst]) || !is_array($data[$lijst]) || !array_is_list($data[$lijst])) {
                throw new ApiFout('Ongeldige gegevens.');
            }
        }
        $vorige = $in['vorige'] ?? null;
        if (!is_int($vorige) || $vorige < 0) {
            throw new ApiFout('Ongeldige versie.');
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        startSchrijven(); // één opslag tegelijk
        try {
            $laatste = (int)(eenRij('SELECT MAX(id) AS m FROM kull_versies')['m'] ?? 0);
            if ($laatste !== $vorige) {
                throw new ApiFout('conflict: iemand anders heeft intussen iets opgeslagen.', 409);
            }
            voerUit(
                'INSERT INTO kull_versies (data, opgeslagen_op, opgeslagen_door, opgeslagen_door_naam) VALUES (?, ?, ?, ?)',
                [$json, time(), $g['id'], $g['naam']]
            );
            $id = (int)db()->lastInsertId();
            stopSchrijven(true);
        } catch (Throwable $e) {
            stopSchrijven(false);
            throw $e;
        }
        antwoord(['versie' => $id]);

    case 'historie':
        vereisIngelogd();
        $rijen = alleRijen('SELECT id, opgeslagen_op, opgeslagen_door_naam FROM kull_versies ORDER BY id DESC LIMIT 100');
        antwoord(['versies' => array_map(fn ($r) => [
            'versie' => (int)$r['id'],
            'opgeslagen_op' => gmdate('c', (int)$r['opgeslagen_op']),
            'door' => $r['opgeslagen_door_naam'],
        ], $rijen)]);

    case 'versie':
        vereisIngelogd();
        $rij = eenRij('SELECT data FROM kull_versies WHERE id = ?', [(int)($_GET['id'] ?? 0)]);
        if (!$rij) {
            throw new ApiFout('Deze versie bestaat niet.', 404);
        }
        antwoord(['data' => json_decode($rij['data'], true)]);

    // -----------------------------------------------------------------------
    // Gebruikersbeheer (alleen beheerder)
    // -----------------------------------------------------------------------
    case 'gebruikers':
        vereisRol(['beheerder']);
        $rijen = alleRijen('SELECT id, naam, email, rol, actief, totp_geheim, moet_wachtwoord_wijzigen, laatste_login FROM kull_gebruikers ORDER BY naam');
        antwoord(['gebruikers' => array_map(fn ($r) => [
            'id' => (int)$r['id'],
            'naam' => $r['naam'],
            'email' => $r['email'],
            'rol' => $r['rol'],
            'actief' => (bool)$r['actief'],
            'tweestaps' => $r['totp_geheim'] !== null,
            'moet_wachtwoord_wijzigen' => (bool)$r['moet_wachtwoord_wijzigen'],
            'laatste_login' => $r['laatste_login'] ? gmdate('c', (int)$r['laatste_login']) : null,
        ], $rijen)]);

    case 'gebruiker_toevoegen':
        $beheerder = vereisRol(['beheerder']);
        $email = geldigEmail(tekstVeld($in, 'email'));
        $gebruikersnaam = tekstVeld($in, 'naam', 100);
        $rol = tekstVeld($in, 'rol', 20);
        if ($gebruikersnaam === '' || !in_array($rol, ROLLEN, true)) {
            throw new ApiFout('Vul een naam in en kies een rol.');
        }
        if (eenRij('SELECT id FROM kull_gebruikers WHERE email = ?', [$email])) {
            throw new ApiFout('Er is al een gebruiker met dit e-mailadres.', 409);
        }
        $tijdelijk = tijdelijkWachtwoord();
        voerUit(
            'INSERT INTO kull_gebruikers (email, naam, rol, wachtwoord_hash, moet_wachtwoord_wijzigen, aangemaakt_op) VALUES (?, ?, ?, ?, 1, ?)',
            [$email, $gebruikersnaam, $rol, password_hash($tijdelijk, PASSWORD_DEFAULT), time()]
        );
        logGebeurtenis((int)$beheerder['id'], 'gebruiker_toegevoegd', "Gebruiker toegevoegd: $email ($rol)");
        antwoord(['tijdelijk_wachtwoord' => $tijdelijk]);

    case 'gebruiker_wijzigen':
        $beheerder = vereisRol(['beheerder']);
        $doel = eenRij('SELECT * FROM kull_gebruikers WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$doel) {
            throw new ApiFout('Gebruiker niet gevonden.', 404);
        }
        $gebruikersnaam = tekstVeld($in, 'naam', 100) ?: $doel['naam'];
        $rol = tekstVeld($in, 'rol', 20) ?: $doel['rol'];
        $actief = array_key_exists('actief', $in) ? (bool)$in['actief'] : (bool)$doel['actief'];
        if (!in_array($rol, ROLLEN, true)) {
            throw new ApiFout('Onbekende rol.');
        }
        if ((int)$doel['id'] === (int)$beheerder['id'] && ($rol !== 'beheerder' || !$actief)) {
            throw new ApiFout('Je kunt je eigen rol niet verlagen en jezelf niet blokkeren.');
        }
        // W-008: controle en wijziging in één schrijfslot, zodat twee
        // beheerders die elkaar tegelijk verlagen niet samen op nul uitkomen.
        startSchrijven();
        try {
            $huidig = eenRij('SELECT * FROM kull_gebruikers WHERE id = ?', [$doel['id']]);
            if ($huidig['rol'] === 'beheerder' && ($rol !== 'beheerder' || !$actief)) {
                $overig = (int)eenRij("SELECT COUNT(*) AS n FROM kull_gebruikers WHERE rol = 'beheerder' AND actief = 1 AND id <> ?", [$doel['id']])['n'];
                if ($overig === 0) {
                    throw new ApiFout('Er moet minstens één actieve beheerder overblijven.');
                }
            }
            $versie = (int)$huidig['sessie_versie'] + (($rol !== $huidig['rol'] || $actief !== (bool)$huidig['actief']) ? 1 : 0);
            voerUit(
                'UPDATE kull_gebruikers SET naam = ?, rol = ?, actief = ?, sessie_versie = ? WHERE id = ?',
                [$gebruikersnaam, $rol, $actief ? 1 : 0, $versie, $doel['id']]
            );
            stopSchrijven(true);
        } catch (Throwable $e) {
            stopSchrijven(false);
            throw $e;
        }
        logGebeurtenis((int)$beheerder['id'], 'gebruiker_gewijzigd', "Gebruiker {$doel['email']}: rol $rol, " . ($actief ? 'actief' : 'geblokkeerd'));
        antwoord(['ok' => true]);

    case 'gebruiker_herstel':
        $beheerder = vereisRol(['beheerder']);
        $doel = eenRij('SELECT * FROM kull_gebruikers WHERE id = ?', [(int)($in['id'] ?? 0)]);
        if (!$doel) {
            throw new ApiFout('Gebruiker niet gevonden.', 404);
        }
        if ((int)$doel['id'] === (int)$beheerder['id']) {
            throw new ApiFout('Herstel je eigen account niet hier; gebruik "Wachtwoord wijzigen".');
        }
        $uit = ['ok' => true];
        $versie = (int)$doel['sessie_versie'] + 1;
        if (!empty($in['wachtwoord'])) {
            $tijdelijk = tijdelijkWachtwoord();
            voerUit('UPDATE kull_gebruikers SET wachtwoord_hash = ?, moet_wachtwoord_wijzigen = 1 WHERE id = ?', [password_hash($tijdelijk, PASSWORD_DEFAULT), $doel['id']]);
            $uit['tijdelijk_wachtwoord'] = $tijdelijk;
            logGebeurtenis((int)$beheerder['id'], 'wachtwoord_hersteld', "Tijdelijk wachtwoord voor {$doel['email']}");
        }
        if (!empty($in['tweestaps'])) {
            voerUit('UPDATE kull_gebruikers SET totp_geheim = NULL, totp_laatste_stap = 0 WHERE id = ?', [$doel['id']]);
            logGebeurtenis((int)$beheerder['id'], 'tweestaps_hersteld', "Authenticator-app ontkoppeld voor {$doel['email']}");
        }
        voerUit('UPDATE kull_gebruikers SET sessie_versie = ? WHERE id = ?', [$versie, $doel['id']]);
        voerUit('DELETE FROM kull_pogingen WHERE sleutel = ?', ['account:' . $doel['email']]);
        antwoord($uit);

    case 'gebeurtenissen':
        vereisRol(['beheerder']);
        $rijen = alleRijen(
            'SELECT e.tijd, e.soort, e.omschrijving, e.ip, g.naam, v.naam AS verwijderd_naam FROM kull_gebeurtenissen e
             LEFT JOIN kull_gebruikers g ON g.id = e.gebruiker_id
             LEFT JOIN kull_verwijderde_gebruikers v ON v.id = e.gebruiker_id ORDER BY e.id DESC LIMIT 200'
        );
        antwoord(['gebeurtenissen' => array_map(fn ($r) => [
            'tijd' => gmdate('c', (int)$r['tijd']),
            'soort' => $r['soort'],
            'omschrijving' => $r['omschrijving'],
            'ip' => $r['ip'],
            'naam' => $r['naam'] ?? ($r['verwijderd_naam'] !== null ? $r['verwijderd_naam'] . ' (verwijderd)' : null),
        ], $rijen)]);

    // W-020: alleen de beheerder verwijdert een gebruiker; niet zichzelf en
    // niet de laatste actieve beheerder (zelfde regels als bij blokkeren).
    case 'gebruiker_verwijderen':
        $beheerder = vereisRol(['beheerder']);
        $id = $in['id'] ?? null;
        if (!is_int($id)) {
            throw new ApiFout('Ongeldige gegevens.');
        }
        if ($id === (int)$beheerder['id']) {
            throw new ApiFout('Je kunt je eigen account niet verwijderen.');
        }
        startSchrijven();
        try {
            $doel = eenRij('SELECT * FROM kull_gebruikers WHERE id = ?', [$id]);
            if (!$doel) {
                throw new ApiFout('Gebruiker niet gevonden.', 404);
            }
            if ($doel['rol'] === 'beheerder' && (int)$doel['actief']) {
                $overig = (int)eenRij("SELECT COUNT(*) AS n FROM kull_gebruikers WHERE rol = 'beheerder' AND actief = 1 AND id <> ?", [$id])['n'];
                if ($overig === 0) {
                    throw new ApiFout('Er moet minstens één actieve beheerder overblijven.');
                }
            }
            voerUit('DELETE FROM kull_verwijderde_gebruikers WHERE id = ?', [$id]);
            voerUit('INSERT INTO kull_verwijderde_gebruikers (id, naam, verwijderd_op) VALUES (?, ?, ?)', [$id, $doel['naam'], time()]);
            voerUit('DELETE FROM kull_gebruikers WHERE id = ?', [$id]);
            stopSchrijven(true);
        } catch (Throwable $e) {
            stopSchrijven(false);
            throw $e;
        }
        logGebeurtenis((int)$beheerder['id'], 'gebruiker_verwijderd', "Gebruiker {$doel['naam']} verwijderd");
        antwoord(['ok' => true]);

    // -----------------------------------------------------------------------
    // Wensen (W-006): iedereen mag indienen, alleen beheerders zien ze.
    // -----------------------------------------------------------------------
    case 'wens_indienen':
        $g = vereisIngelogd();
        $tekst = tekstVeld($in, 'tekst', 2000);
        if (mb_strlen($tekst) < 5) {
            throw new ApiFout('Beschrijf je wens in ten minste een paar woorden.');
        }
        $recent = (int)eenRij('SELECT COUNT(*) AS n FROM kull_wensen WHERE gebruiker_id = ? AND tijd >= ?', [$g['id'], time() - 86400])['n'];
        if ($recent >= MAX_WENSEN_PER_DAG) {
            throw new ApiFout('Je hebt vandaag al veel wensen ingediend. Probeer het morgen opnieuw.', 429);
        }
        voerUit('INSERT INTO kull_wensen (tijd, gebruiker_id, naam, tekst, status) VALUES (?, ?, ?, ?, ?)', [time(), $g['id'], $g['naam'], $tekst, 'nieuw']);
        logGebeurtenis((int)$g['id'], 'wens', 'Wens ingediend');
        antwoord(['ok' => true]);

    case 'wensen':
        vereisRol(['beheerder']);
        $rijen = alleRijen('SELECT id, tijd, naam, tekst, status FROM kull_wensen ORDER BY id DESC LIMIT 300');
        antwoord(['wensen' => array_map(fn ($r) => [
            'id' => (int)$r['id'],
            'tijd' => gmdate('c', (int)$r['tijd']),
            'naam' => $r['naam'],
            'tekst' => $r['tekst'],
            'status' => $r['status'],
        ], $rijen)]);

    case 'wens_status':
        $g = vereisRol(['beheerder']);
        $status = tekstVeld($in, 'status', 20);
        $id = $in['id'] ?? null;
        if (!is_int($id) || !in_array($status, WENS_STATUSSEN, true)) {
            throw new ApiFout('Ongeldige gegevens.');
        }
        if (!eenRij('SELECT id FROM kull_wensen WHERE id = ?', [$id])) {
            throw new ApiFout('Deze wens bestaat niet.', 404);
        }
        voerUit('UPDATE kull_wensen SET status = ?, gewijzigd_op = ? WHERE id = ?', [$status, time(), $id]);
        antwoord(['ok' => true]);
}
