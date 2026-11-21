"""Aanvalstests op de PHP-API: probeert de beveiliging actief te omzeilen.

Gebruik (met een LEGE testdatabase en installatiecode 'geheim-install-123'):
    KULL_CONFIG=/pad/naar/test-config.php php -S 0.0.0.0:8793 -t .
    python3 tests/aanval_test.py 127.0.0.1:8793 <niet-loopback-ip>:8793

Het tweede adres moet dezelfde server via een niet-lokaal IP bereiken, om
het https-vereiste te testen.
"""

import base64
import concurrent.futures
import hashlib
import hmac
import http.cookiejar
import json
import sqlite3
import statistics
import struct
import sys
import time
import urllib.error
import urllib.request

LOKAAL = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1:8793'
EXTERN = sys.argv[2] if len(sys.argv) > 2 else None
DB = sys.argv[3] if len(sys.argv) > 3 else None
CODE = 'geheim-install-123'
resultaten = []


def totp(geheim, stap=None):
    sleutel = base64.b32decode(geheim + '=' * (-len(geheim) % 8))
    stap = int(time.time()) // 30 if stap is None else stap
    h = hmac.new(sleutel, struct.pack('>Q', stap), hashlib.sha1).digest()
    o = h[19] & 15
    return '%06d' % ((struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


class Client:
    def __init__(self, host=LOKAAL):
        self.basis = f'http://{host}/api/index.php'
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def cookie(self):
        return next((c for c in self.jar if c.name == 'kull_sessie'), None)

    def get(self, actie, extra='', koppen=None):
        req = urllib.request.Request(f'{self.basis}?actie={actie}{extra}', headers=koppen or {})
        return self._doe(req)

    def post(self, actie, data=None, koppen=None, ruw=None, soort='application/json', csrf=True):
        body = ruw if ruw is not None else json.dumps(data or {}).encode()
        req = urllib.request.Request(f'{self.basis}?actie={actie}', data=body, method='POST')
        req.add_header('Content-Type', soort)
        if csrf and self.csrf:
            req.add_header('X-CSRF', self.csrf)
        for k, v in (koppen or {}).items():
            req.add_header(k, v)
        s, r = self._doe(req)
        if isinstance(r, dict) and r.get('csrf'):
            self.csrf = r['csrf']
        return s, r

    def sessie(self):
        s, r = self.get('sessie')
        self.csrf = r.get('csrf')
        return r

    def _doe(self, req):
        try:
            with self.opener.open(req, timeout=30) as resp:
                tekst = resp.read()
                return resp.status, json.loads(tekst) if tekst else {}
        except urllib.error.HTTPError as e:
            tekst = e.read()
            try:
                return e.code, json.loads(tekst) if tekst else {}
            except ValueError:
                return e.code, {'_ruw': tekst[:300].decode(errors='replace')}


def check(naam, voorwaarde, info=''):
    resultaten.append(bool(voorwaarde))
    print(('OK   ' if voorwaarde else 'LEK  ') + naam + ('' if voorwaarde else f'  -> {info}'))


def volledig_inloggen(email, wachtwoord, geheim=None, nieuw=None):
    c = Client()
    c.sessie()
    s, r = c.post('inloggen', {'email': email, 'wachtwoord': wachtwoord})
    assert s == 200, r
    if r['stap'] == 'totp_instellen':
        geheim = c.post('totp_start')[1]['geheim']
        s, r = c.post('totp_bevestigen', {'code': totp(geheim)})
    else:
        s, r = c.post('totp', {'code': totp(geheim)})
    assert s == 200, r
    if r['stap'] == 'wachtwoord_wijzigen':
        s, r = c.post('wachtwoord', {'nieuw': nieuw})
        assert s == 200 and r['stap'] == 'klaar', r
    return c, geheim


DATA = {'versie': 1, 'geldgevers': [], 'leners': [], 'leningen': [], 'ontvangsten': []}

# ---------------------------------------------------------------------------
print('Opzet: beheerder, eigenaar en lezer aanmaken')
b = Client()
b.sessie()
b.post('installeren', {'code': CODE, 'naam': 'Beheer', 'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
geheim_b = b.post('totp_start')[1]['geheim']
s, r = b.post('totp_bevestigen', {'code': totp(geheim_b)})
assert r.get('stap') == 'klaar', r
b.post('opslaan', {'vorige': 0, 'data': DATA})
tijd_e = b.post('gebruiker_toevoegen', {'naam': 'Eigenaar', 'email': 'eigenaar@test.nl', 'rol': 'eigenaar'})[1]['tijdelijk_wachtwoord']
tijd_l = b.post('gebruiker_toevoegen', {'naam': 'Lezer', 'email': 'lezer@test.nl', 'rol': 'lezer'})[1]['tijdelijk_wachtwoord']
e, geheim_e = volledig_inloggen('eigenaar@test.nl', tijd_e, nieuw='paarse olifant op de fiets')
lz, geheim_l = volledig_inloggen('lezer@test.nl', tijd_l, nieuw='groene kikker in de sloot')

# ---------------------------------------------------------------------------
print('\nToegangscontrole')
anoniem = Client()
anoniem.sessie()
for actie in ['laad', 'historie', 'gebruikers', 'gebeurtenissen']:
    s, r = anoniem.get(actie)
    check(f'anoniem: {actie} geweigerd', s == 401, (s, r))
s, r = anoniem.get('versie', '&id=1')
check('anoniem: oude versie opvragen geweigerd', s == 401, (s, r))
s, r = anoniem.post('opslaan', {'vorige': 1, 'data': DATA})
check('anoniem: opslaan geweigerd', s == 401, (s, r))
for actie, data in [('gebruikers', None), ('gebeurtenissen', None)]:
    s, r = e.get(actie)
    check(f'eigenaar: {actie} geweigerd', s == 403, (s, r))
s, r = e.post('gebruiker_toevoegen', {'naam': 'X', 'email': 'x@test.nl', 'rol': 'beheerder'})
check('eigenaar kan zichzelf geen beheerder maken via nieuw account', s == 403, (s, r))
s, r = e.post('gebruiker_wijzigen', {'id': 2, 'rol': 'beheerder'})
check('eigenaar kan eigen rol niet verhogen', s == 403, (s, r))
s, r = lz.post('opslaan', {'vorige': 1, 'data': DATA})
check('lezer: opslaan geweigerd', s == 403, (s, r))
s, r = lz.post('gebruiker_herstel', {'id': 1, 'tweestaps': True})
check('lezer: tweestaps van beheerder wissen geweigerd', s == 403, (s, r))
s, r = e.post('opslaan', {'vorige': 1, 'data': DATA})
check('eigenaar: opslaan toegestaan', s == 200, (s, r))

# ---------------------------------------------------------------------------
print('\nHalf ingelogd (wachtwoord goed, code nog niet)')
half = Client()
half.sessie()
half.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': 'groene kikker in de sloot'})
for actie in ['laad', 'historie']:
    s, r = half.get(actie)
    check(f'zonder code: {actie} geweigerd', s == 401, (s, r))
s, r = half.post('wachtwoord', {'nieuw': 'nieuw wachtwoord zonder code'})
check('zonder code: wachtwoord wijzigen geweigerd', s == 401, (s, r))
s, r = half.post('totp_start')
check('met bestaande app: nieuw geheim opvragen geweigerd', s == 401, (s, r))

# ---------------------------------------------------------------------------
print('\nSessies')
fix = Client()
gekozen = 'aanvallergekozensessie1234567890'
fix.jar.set_cookie(http.cookiejar.Cookie(0, 'kull_sessie', gekozen, None, False, LOKAAL.split(':')[0] + '.local', False, False, '/', True, False, None, False, None, None, {}))
fix.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(fix.jar))
req = urllib.request.Request(f'{fix.basis}?actie=sessie', headers={'Cookie': f'kull_sessie={gekozen}'})
with urllib.request.urlopen(req) as resp:
    gezet = resp.headers.get('Set-Cookie', '')
check('vooraf gekozen sessie-ID wordt niet overgenomen', gekozen not in gezet and 'kull_sessie=' in gezet, gezet)
check('sessiecookie is HttpOnly en SameSite=Strict', 'httponly' in gezet.lower() and 'samesite=strict' in gezet.lower(), gezet)

oud_cookie = lz.cookie().value
lz.post('uitloggen')
gestolen = urllib.request.Request(f'{lz.basis}?actie=laad', headers={'Cookie': f'kull_sessie={oud_cookie}'})
try:
    urllib.request.urlopen(gestolen)
    check('cookie na uitloggen onbruikbaar', False, 'gaf 200')
except urllib.error.HTTPError as err:
    check('cookie na uitloggen onbruikbaar', err.code == 401, err.code)

e2, _ = volledig_inloggen('eigenaar@test.nl', 'paarse olifant op de fiets', geheim=geheim_e) if False else (None, None)

# ---------------------------------------------------------------------------
print('\nCSRF')
s, r = b.post('opslaan', {'vorige': 2, 'data': DATA}, koppen={'Origin': 'https://kwaadaardig.example'})
check('verzoek met vreemde Origin geweigerd', s == 403, (s, r))
s, r = b.post('opslaan', {'vorige': 2, 'data': DATA}, koppen={'X-CSRF': 'verkeerd'})
check('verkeerde CSRF-sleutel geweigerd', s == 403, (s, r))
s, r = b.post('opslaan', ruw=b'vorige=2', soort='application/x-www-form-urlencoded')
check('formulier-POST geweigerd', s in (403, 415), (s, r))

# ---------------------------------------------------------------------------
print('\nInjectie en invoer')
for payload in ["' OR '1'='1", "admin@test.nl'--", '" OR 1=1 --', "beheer@test.nl' UNION SELECT 1,2,3--"]:
    c = Client()
    c.sessie()
    s, r = c.post('inloggen', {'email': payload, 'wachtwoord': "' OR '1'='1"})
    check(f'SQL-injectie in inloggen ({payload[:18]}) geweigerd', s in (401, 429) and 'fout' in r, (s, r))
s, r = b.post('gebruiker_toevoegen', {'naam': "Robert'); DROP TABLE kull_gebruikers;--", 'email': 'bobby@test.nl', 'rol': 'lezer'})
s2, r2 = b.get('gebruikers')
check('SQL-injectie in naam letterlijk opgeslagen, tabel intact', s == 200 and any("DROP TABLE" in g['naam'] for g in r2['gebruikers']), (s, r, s2))
s, r = b.get('versie', "&id=1%20OR%201=1")
check('id met SQL-tekst geeft geen gegevens van andere versie', s in (200, 404), (s, r))
s, r = b.post('gebruiker_toevoegen', {'naam': 'Extra', 'email': 'extra@test.nl', 'rol': 'lezer', 'actief': 1, 'moet_wachtwoord_wijzigen': 0, 'totp_geheim': 'JBSWY3DPEHPK3PXP'})
s2, r2 = b.get('gebruikers')
extra = next(g for g in r2['gebruikers'] if g['email'] == 'extra@test.nl')
check('extra velden bij toevoegen genegeerd', extra['moet_wachtwoord_wijzigen'] and not extra['tweestaps'], extra)
s, r = b.post('inloggen', {'email': ['a', 'b'], 'wachtwoord': {'x': 1}})
check('verkeerd type invoer geeft nette fout', s in (400, 401) and 'fout' in r, (s, r))
s, r = b.post('opslaan', ruw=b'{"vorige": 2, "data": ' + b'x' * 10, soort='application/json')
check('ongeldige JSON geeft nette fout zonder details', s == 400 and 'Exception' not in json.dumps(r), (s, r))
groot = b'{"vorige":2,"data":{"leners":[],"leningen":[],"ontvangsten":["' + b'a' * 5_100_000 + b'"]}}'
s, r = b.post('opslaan', ruw=groot)
check('verzoek groter dan 5 MB geweigerd', s == 413, (s, r))
diep = b'{"a":' * 200 + b'1' + b'}' * 200
s, r = b.post('opslaan', ruw=diep)
check('extreem geneste JSON geweigerd', s == 400, (s, r))
s, r = b.get('bestaatniet')
check('onbekende actie geeft 404', s == 404, (s, r))

# ---------------------------------------------------------------------------
print('\nGelijktijdig opslaan (20 tegelijk op dezelfde versie)')
s, r = b.get('laad')
huidig = r['versie']


def poging(_):
    return b.post('opslaan', {'vorige': huidig, 'data': DATA})[0]


with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
    statussen = list(pool.map(poging, range(20)))
check('precies één gelijktijdige opslag slaagt', statussen.count(200) == 1 and statussen.count(409) == 19, statussen)

# ---------------------------------------------------------------------------
print('\nGebruikersnamen raden via responstijd')


def meet(email):
    tijden = []
    for _ in range(4):
        c = Client()
        c.sessie()
        t = time.perf_counter()
        c.post('inloggen', {'email': email, 'wachtwoord': 'willekeurig fout wachtwoord'})
        tijden.append(time.perf_counter() - t)
    return statistics.median(tijden)


bestaand = meet('beheer@test.nl')
onbekend = meet('niemand@test.nl')
check(f'responstijd bestaand ({bestaand*1000:.0f} ms) en onbekend ({onbekend*1000:.0f} ms) vergelijkbaar',
      abs(bestaand - onbekend) < max(bestaand, onbekend) * 0.25, (bestaand, onbekend))

# ---------------------------------------------------------------------------
print('\nBlokkade en omzeilpogingen')
for i in range(5):
    c = Client()
    c.sessie()
    c.post('inloggen', {'email': 'eigenaar@test.nl', 'wachtwoord': f'gok {i}'}, koppen={'X-Forwarded-For': f'10.0.0.{i}'})
c = Client()
c.sessie()
s, r = c.post('inloggen', {'email': 'eigenaar@test.nl', 'wachtwoord': 'paarse olifant op de fiets'}, koppen={'X-Forwarded-For': '10.9.9.9', 'X-Real-IP': '10.9.9.9'})
check('vervalste IP-koppen omzeilen de blokkade niet', s == 429, (s, r))
s, r = c.post('inloggen', {'email': 'EIGENAAR@test.nl ', 'wachtwoord': 'paarse olifant op de fiets'})
check('hoofdletters en spaties in e-mail omzeilen de blokkade niet', s == 429, (s, r))

# Code raden: lezer heeft geldig wachtwoord, probeert codes
c = Client()
c.sessie()
s, r = c.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': 'groene kikker in de sloot'})
fout = '000000' if totp(geheim_l) != '000000' else '111111'
for _ in range(5):
    c.post('totp', {'code': fout})
s, r = c.post('totp', {'code': totp(geheim_l)})
check('na 5 foute codes ook juiste code geblokkeerd', s == 429, (s, r))

for i in range(5):
    x = Client()
    x.sessie()
    x.post('installeren', {'code': f'gok{i}', 'naam': 'X', 'email': f'x{i}@t.nl', 'wachtwoord': 'een lang wachtwoord'})
x = Client()
x.sessie()
s, r = x.post('installeren', {'code': CODE, 'naam': 'X', 'email': 'x@t.nl', 'wachtwoord': 'een lang wachtwoord'})
check('installatiecode raden wordt geblokkeerd (en installatie is al gedaan)', s in (409, 429), (s, r))

# ---------------------------------------------------------------------------
if DB:
    print('\nOpslag van geheimen in de database')
    con = sqlite3.connect(DB)
    rij = con.execute("SELECT wachtwoord_hash, totp_geheim FROM kull_gebruikers WHERE email='beheer@test.nl'").fetchone()
    check('wachtwoord gehasht (bcrypt/argon2), niet leesbaar', rij[0].startswith(('$2y$', '$argon2')) and 'wachtwoord' not in rij[0], rij[0][:10])
    check('geheim van de app versleuteld opgeslagen', geheim_b not in (rij[1] or '') and rij[1] is not None, rij[1][:12] if rij[1] else None)
    alles = '\n'.join(str(r) for r in con.execute('SELECT * FROM kull_gebeurtenissen'))
    check('logboek bevat geen wachtwoorden', 'paarse olifant' not in alles and 'gok 1' not in alles and 'groene kikker' not in alles)

# ---------------------------------------------------------------------------
if EXTERN:
    print('\nHttps-vereiste (vanaf een niet-lokaal adres, over http)')
    ext = Client(EXTERN)
    ext.sessie()
    s, r = ext.post('inloggen', {'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
    check('inloggen over http geweigerd', s == 403 and 'https' in r.get('fout', ''), (s, r))
    s, r = ext.post('inloggen', {'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'}, koppen={'X-Forwarded-Proto': 'https'})
    check('vervalste X-Forwarded-Proto omzeilt https-vereiste niet', s == 403, (s, r))

print(f'\n{sum(resultaten)} van {len(resultaten)} aanvallen afgeslagen')
sys.exit(0 if all(resultaten) else 1)
