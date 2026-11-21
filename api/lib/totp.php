<?php
// Tijdgebaseerde eenmalige codes (TOTP, RFC 6238) zoals authenticator-apps
// die maken: zes cijfers, elke 30 seconden een nieuwe, op basis van SHA-1.

declare(strict_types=1);

const TOTP_PERIODE = 30;
const TOTP_CIJFERS = 6;
const TOTP_SPELING = 1; // één periode ervoor of erna geldt ook (klokverschil)

function base32Codeer(string $bytes): string
{
    $alfabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bytes) as $b) {
        $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
    }
    $uit = '';
    foreach (str_split($bits, 5) as $groep) {
        $uit .= $alfabet[bindec(str_pad($groep, 5, '0'))];
    }
    return $uit;
}

function base32Decodeer(string $tekst): string
{
    $alfabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $tekst = strtoupper(preg_replace('/[\s=]/', '', $tekst));
    $bits = '';
    foreach (str_split($tekst) as $teken) {
        $pos = strpos($alfabet, $teken);
        if ($pos === false) {
            throw new InvalidArgumentException('Ongeldige base32-tekst');
        }
        $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
    }
    $uit = '';
    foreach (str_split($bits, 8) as $byte) {
        if (strlen($byte) === 8) {
            $uit .= chr(bindec($byte));
        }
    }
    return $uit;
}

function nieuwTotpGeheim(): string
{
    return base32Codeer(random_bytes(20)); // 160 bits, zoals RFC 4226 aanbeveelt
}

function totpCode(string $geheim, int $stap): string
{
    $sleutel = base32Decodeer($geheim);
    $teller = pack('N*', 0, $stap); // 64-bits teller, big-endian
    $hash = hash_hmac('sha1', $teller, $sleutel, true);
    $offset = ord($hash[19]) & 0x0f;
    $getal = ((ord($hash[$offset]) & 0x7f) << 24)
        | ((ord($hash[$offset + 1]) & 0xff) << 16)
        | ((ord($hash[$offset + 2]) & 0xff) << 8)
        | (ord($hash[$offset + 3]) & 0xff);
    return str_pad((string)($getal % (10 ** TOTP_CIJFERS)), TOTP_CIJFERS, '0', STR_PAD_LEFT);
}

// Geeft de gebruikte tijdstap terug als de code klopt, anders null.
// Een stap die al eerder is gebruikt, wordt geweigerd (geen hergebruik).
function controleerTotp(string $geheim, string $code, int $laatsteStap, ?int $tijd = null): ?int
{
    $code = preg_replace('/\s+/', '', $code);
    if (!preg_match('/^\d{' . TOTP_CIJFERS . '}$/', $code)) {
        return null;
    }
    $nu = intdiv($tijd ?? time(), TOTP_PERIODE);
    for ($d = -TOTP_SPELING; $d <= TOTP_SPELING; $d++) {
        $stap = $nu + $d;
        if ($stap <= $laatsteStap) {
            continue;
        }
        if (hash_equals(totpCode($geheim, $stap), $code)) {
            return $stap;
        }
    }
    return null;
}

function totpUri(string $geheim, string $email, string $uitgever): string
{
    $label = rawurlencode($uitgever) . ':' . rawurlencode($email);
    return 'otpauth://totp/' . $label . '?secret=' . $geheim
        . '&issuer=' . rawurlencode($uitgever) . '&algorithm=SHA1&digits=' . TOTP_CIJFERS . '&period=' . TOTP_PERIODE;
}
