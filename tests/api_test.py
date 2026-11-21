"""Eind-tot-eindtest van de PHP-API.

Gebruik (met een LEGE testdatabase):
    KULL_CONFIG=/pad/naar/test-config.php php -S 127.0.0.1:8790 -t .
    python3 tests/api_test.py http://127.0.0.1:8790/api/index.php
"""

import base64
import hashlib
import hmac
import http.cookiejar
import json
import struct
import sys
import time
import urllib.error
import urllib.request

BASIS = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8790/api/index.php'
CODE = 'geheim-install-123'
resultaten = []


def totp(geheim, stap=None):
    sleutel = base64.b32decode(geheim + '=' * (-len(geheim) % 8))
    stap = int(time.time()) // 30 if stap is None else stap
    h = hmac.new(sleutel, struct.pack('>Q', stap), hashlib.sha1).digest()
    o = h[19] & 15
    return '%06d' % ((struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None

    def get(self, actie, **extra):
        q = '&'.join(f'{k}={v}' for k, v in extra.items())
        return self._doe(urllib.request.Request(f'{BASIS}?actie={actie}' + (f'&{q}' if q else '')))

    def post(self, actie, data=None, csrf=True, soort='application/json'):
        req = urllib.request.Request(f'{BASIS}?actie={actie}', data=json.dumps(data or {}).encode(), method='POST')
        req.add_header('Content-Type', soort)
        if csrf and self.csrf:
            req.add_header('X-CSRF', self.csrf)
        status, body = self._doe(req)
        if isinstance(body, dict) and 'csrf' in body:
            self.csrf = body['csrf']
        return status, body

    def sessie(self):
        status, body = self.get('sessie')
        self.csrf = body['csrf']
        return body

    def _doe(self, req):
        try:
            with self.opener.open(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}')


def check(naam, voorwaarde, info=''):
    resultaten.append(bool(voorwaarde))
    print(('OK   ' if voorwaarde else 'FOUT ') + naam + ('' if voorwaarde else f'  -> {info}'))


def wacht_nieuwe_periode():
    # Een TOTP-code mag maar één keer; wacht op de volgende periode van 30 s.
    time.sleep(30 - (time.time() % 30) + 1)


DATA = {'versie': 1, 'geldgevers': [], 'leners': [], 'leningen': [], 'ontvangsten': []}

# ---- Installatie ----------------------------------------------------------
b = Client()
check('nieuwe server vraagt om installatie', b.sessie()['stap'] == 'installeren')
s, r = b.post('installeren', {'code': 'fout', 'naam': 'Beheer', 'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
check('verkeerde installatiecode geweigerd', s == 403, r)
s, r = b.post('installeren', {'code': CODE, 'naam': 'Beheer', 'email': 'beheer@test.nl', 'wachtwoord': 'kort'})
check('te kort wachtwoord geweigerd', s == 400, r)
s, r = b.post('installeren', {'code': CODE, 'naam': 'Beheer', 'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
check('installatie met juiste code', s == 200 and r['stap'] == 'totp_instellen', r)
s, r = b.get('laad')
check('zonder tweestapsverificatie geen toegang tot gegevens', s == 401, r)
s, r = b.post('totp_start')
geheim_b = r['geheim']
check('geheim en otpauth-adres ontvangen', s == 200 and r['uri'].startswith('otpauth://totp/'), r)
s, r = b.post('totp_bevestigen', {'code': '000000' if totp(geheim_b) != '000000' else '111111'})
check('verkeerde code geweigerd', s == 401, r)
s, r = b.post('totp_bevestigen', {'code': totp(geheim_b)})
check('app gekoppeld, beheerder is binnen', s == 200 and r['stap'] == 'klaar', r)
c2 = Client()
c2.sessie()
s, r = c2.post('installeren', {'code': CODE, 'naam': 'Indringer', 'email': 'x@test.nl', 'wachtwoord': 'een lang wachtwoord 2'})
check('tweede installatie onmogelijk', s == 409, r)

# ---- CSRF -----------------------------------------------------------------
s, r = b.post('opslaan', {'vorige': 0, 'data': DATA}, csrf=False)
check('POST zonder CSRF-sleutel geweigerd', s == 403, r)
s, r = b.post('opslaan', {'vorige': 0, 'data': DATA}, soort='text/plain')
check('POST als formulier (text/plain) geweigerd', s == 415, r)
s, r = b.get('opslaan')
check('opslaan via GET geweigerd', s == 405, r)

# ---- Opslaan en versies ---------------------------------------------------
s, r = b.get('laad')
check('lege administratie laden', s == 200 and r['versie'] == 0, r)
s, r = b.post('opslaan', {'vorige': 0, 'data': DATA})
check('eerste versie opgeslagen', s == 200 and r['versie'] == 1, r)
s, r = b.post('opslaan', {'vorige': 0, 'data': DATA})
check('verouderde versie geeft conflict', s == 409 and 'conflict' in r['fout'], r)
s, r = b.post('opslaan', {'vorige': 1, 'data': {'leners': 'geen lijst'}})
check('ongeldige gegevens geweigerd', s == 400, r)
s, r = b.post('opslaan', {'vorige': 1, 'data': {**DATA, 'leners': [{'id': 'p1', 'naam': 'Test é'}]}})
check('tweede versie opgeslagen', s == 200 and r['versie'] == 2, r)
s, r = b.get('laad')
check('laatste versie terug met juiste inhoud', r['versie'] == 2 and r['data']['leners'][0]['naam'] == 'Test é', r)
s, r = b.get('historie')
check('versiegeschiedenis met naam', s == 200 and len(r['versies']) == 2 and r['versies'][0]['door'] == 'Beheer', r)
s, r = b.get('versie', id=1)
check('oude versie opvragen', s == 200 and r['data']['leners'] == [], r)

# ---- Gebruikersbeheer -----------------------------------------------------
s, r = b.post('gebruiker_toevoegen', {'naam': 'Lezer', 'email': 'lezer@test.nl', 'rol': 'lezer'})
tijdelijk = r.get('tijdelijk_wachtwoord', '')
check('lezer toegevoegd met tijdelijk wachtwoord', s == 200 and len(tijdelijk) == 19, r)
s, r = b.post('gebruiker_toevoegen', {'naam': 'Dubbel', 'email': 'LEZER@test.nl', 'rol': 'lezer'})
check('zelfde e-mailadres (andere hoofdletters) geweigerd', s == 409, r)
s, r = b.post('gebruiker_toevoegen', {'naam': 'Eigenaar', 'email': 'eigenaar@test.nl', 'rol': 'superuser'})
check('onbekende rol geweigerd', s == 400, r)
s, r = b.get('gebruikers')
mij = next(g for g in r['gebruikers'] if g['email'] == 'beheer@test.nl')
lezer_id = next(g['id'] for g in r['gebruikers'] if g['email'] == 'lezer@test.nl')
check('gebruikerslijst zonder geheimen', 'wachtwoord_hash' not in json.dumps(r) and 'totp_geheim' not in json.dumps(r), r)
s, r = b.post('gebruiker_wijzigen', {'id': mij['id'], 'rol': 'lezer'})
check('beheerder kan eigen rol niet verlagen', s == 400, r)

# ---- Lezer: eerste keer inloggen ------------------------------------------
lz = Client()
lz.sessie()
s, r = lz.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': tijdelijk})
check('lezer logt in met tijdelijk wachtwoord', s == 200 and r['stap'] == 'totp_instellen', r)
s, r = lz.post('totp_start')
geheim_l = r['geheim']
s, r = lz.post('totp_bevestigen', {'code': totp(geheim_l)})
check('lezer moet daarna wachtwoord wijzigen', s == 200 and r['stap'] == 'wachtwoord_wijzigen', r)
s, r = lz.get('laad')
check('zonder nieuw wachtwoord geen toegang', s == 401, r)
s, r = lz.post('wachtwoord', {'nieuw': tijdelijk})
check('nieuw wachtwoord gelijk aan tijdelijk geweigerd', s == 400, r)
s, r = lz.post('wachtwoord', {'nieuw': 'drie blauwe fietsen in de regen'})
check('nieuw wachtwoord ingesteld', s == 200 and r['stap'] == 'klaar', r)
s, r = lz.get('laad')
check('lezer kan lezen', s == 200 and r['versie'] == 2, r)
s, r = lz.post('opslaan', {'vorige': 2, 'data': DATA})
check('lezer kan niet opslaan', s == 403, r)
s, r = lz.get('gebruikers')
check('lezer ziet geen gebruikersbeheer', s == 403, r)
s, r = lz.post('gebruiker_toevoegen', {'naam': 'X', 'email': 'x@test.nl', 'rol': 'beheerder'})
check('lezer kan geen gebruikers toevoegen', s == 403, r)

# ---- Blokkade na mislukte pogingen ----------------------------------------
aanval = Client()
aanval.sessie()
for i in range(5):
    aanval.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': f'fout {i}'})
s, r = aanval.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': 'drie blauwe fietsen in de regen'})
check('na 5 fouten ook juist wachtwoord geblokkeerd', s == 429, r)
s, r = aanval.post('inloggen', {'email': 'bestaat.niet@test.nl', 'wachtwoord': 'iets'})
check('onbekend e-mailadres geeft zelfde melding', s == 401 and 'klopt niet' in r['fout'], r)

# ---- Blokkeren, herstellen en sessies -------------------------------------
s, r = b.post('gebruiker_wijzigen', {'id': lezer_id, 'actief': False})
check('beheerder blokkeert lezer', s == 200, r)
s, r = lz.get('laad')
check('geblokkeerde lezer is direct uitgelogd', s == 401, r)
s, r = b.post('gebruiker_wijzigen', {'id': lezer_id, 'actief': True})
s, r = b.post('gebruiker_herstel', {'id': lezer_id, 'wachtwoord': True, 'tweestaps': True})
tijdelijk2 = r.get('tijdelijk_wachtwoord', '')
check('herstel geeft nieuw tijdelijk wachtwoord en wist blokkade', s == 200 and tijdelijk2, r)
lz2 = Client()
lz2.sessie()
s, r = lz2.post('inloggen', {'email': 'lezer@test.nl', 'wachtwoord': tijdelijk2})
check('na herstel opnieuw app koppelen', s == 200 and r['stap'] == 'totp_instellen', r)
s, r = lz2.post('totp_start')
check('nieuw geheim na herstel', r['geheim'] != geheim_l, r)

# ---- Hergebruik van een code en uitloggen ---------------------------------
s, r = b.get('gebeurtenissen')
check('logboek bevat mislukte pogingen', s == 200 and any(g['soort'] == 'inloggen_mislukt' for g in r['gebeurtenissen']), r)
s, r = b.post('uitloggen')
s, r = b.get('laad')
check('na uitloggen geen toegang', s == 401, r)

print('\nWacht op de volgende TOTP-periode om hergebruik te testen...')
b2 = Client()
b2.sessie()
s, r = b2.post('inloggen', {'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
check('beheerder logt opnieuw in', s == 200 and r['stap'] == 'totp', r)
wacht_nieuwe_periode()
code = totp(geheim_b)
s, r = b2.post('totp', {'code': code})
check('beheerder binnen met code', s == 200 and r['stap'] == 'klaar', r)
b3 = Client()
b3.sessie()
b3.post('inloggen', {'email': 'beheer@test.nl', 'wachtwoord': 'een lang wachtwoord 1'})
s, r = b3.post('totp', {'code': code})
check('dezelfde code een tweede keer geweigerd', s == 401, r)

print(f'\n{sum(resultaten)} van {len(resultaten)} controles geslaagd')
sys.exit(0 if all(resultaten) else 1)
