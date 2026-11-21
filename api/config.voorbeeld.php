<?php
// Kopieer dit bestand naar config.php (in dezelfde map) en vul het in.
// config.php staat in .gitignore: zet het NOOIT in GitHub.

return [
    // Database. MySQL (bij vrijwel elke Nederlandse webhoster):
    'db_dsn' => 'mysql:host=localhost;dbname=NAAM_VAN_DE_DATABASE;charset=utf8mb4',
    'db_gebruiker' => 'GEBRUIKERSNAAM_VAN_DE_DATABASE',
    'db_wachtwoord' => 'WACHTWOORD_VAN_DE_DATABASE',
    // Of SQLite (geen database aanmaken nodig; het bestand komt in api/data/):
    // 'db_dsn' => 'sqlite:' . __DIR__ . '/data/kull.sqlite',

    // Lange willekeurige tekst (minstens 32 tekens), bijvoorbeeld uit je
    // wachtwoordbeheerder. Hiermee worden de geheimen van de authenticator-apps
    // versleuteld. Bewaar hem ook in je wachtwoordbeheerder: gaat hij verloren,
    // dan moet iedereen de app opnieuw koppelen.
    'sleutel' => 'VERVANG_DOOR_EEN_LANGE_WILLEKEURIGE_TEKST',

    // Eenmalige code om de eerste beheerder aan te maken. Na de installatie
    // mag je hem laten staan; hij werkt alleen zolang er nog geen gebruikers zijn.
    'installatie_code' => 'VERVANG_DOOR_EEN_EIGEN_CODE',

    // Naam die in de authenticator-app verschijnt.
    'app_naam' => 'Project Kull',
];
