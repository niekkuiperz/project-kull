// Opslag in Supabase (Postgres + inlog). Elke keer opslaan voegt een nieuwe
// versie toe aan de tabel administratie_versies; oude versies blijven bestaan
// (versiegeschiedenis, eis N-03). Wie wat mag, regelt de database zelf met
// Row Level Security (zie supabase/schema.sql); de knoppen in de app volgen
// dat alleen.
//
// LET OP: deze module is geschreven volgens de documentatie van supabase-js
// v2, maar is nog niet tegen een echt Supabase-project getest. Zie README,
// paragraaf "Eerste test met Supabase".

import { ConflictFout } from './lokaal.js';

let createClient;

async function laadBibliotheek() {
  if (!createClient) {
    ({ createClient } = await import('https://esm.sh/@supabase/supabase-js@2'));
  }
  return createClient;
}

export class SupabaseOpslag {
  constructor(url, sleutel) {
    this.modus = 'supabase';
    this.url = url;
    this.sleutel = sleutel;
    this.client = null;
  }

  async start() {
    const maak = await laadBibliotheek();
    this.client = maak(this.url, this.sleutel, { auth: { persistSession: true } });
    return this;
  }

  // ---- Inloggen met tweestapsverificatie (N-02) ----------------------------
  async sessie() {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async inloggen(email, wachtwoord) {
    const { error } = await this.client.auth.signInWithPassword({ email, password: wachtwoord });
    if (error) throw new Error(vertaalFout(error.message));
  }

  async uitloggen() {
    await this.client.auth.signOut();
  }

  // Geeft 'klaar' (aal2), 'verifieren' (code nodig) of 'aanmelden' (nog geen
  // authenticator-app gekoppeld).
  async tweestapsStatus() {
    const { data, error } = await this.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw new Error(vertaalFout(error.message));
    if (data.currentLevel === 'aal2') return 'klaar';
    if (data.nextLevel === 'aal2') return 'verifieren';
    return 'aanmelden';
  }

  async startAanmelding() {
    // Ruim een eerder afgebroken, niet-geverifieerde aanmelding op.
    const lijst = await this.client.auth.mfa.listFactors();
    for (const f of lijst.data?.all || []) {
      if (f.status === 'unverified') await this.client.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await this.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Leningadministratie' });
    if (error) throw new Error(vertaalFout(error.message));
    return { factorId: data.id, qr: data.totp.qr_code, geheim: data.totp.secret };
  }

  async verifieer(code, factorId) {
    let id = factorId;
    if (!id) {
      const { data, error } = await this.client.auth.mfa.listFactors();
      if (error) throw new Error(vertaalFout(error.message));
      id = data.totp?.[0]?.id;
      if (!id) throw new Error('Er is geen authenticator-app gekoppeld.');
    }
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) throw new Error('De code klopt niet of is verlopen. Probeer de volgende code.');
  }

  // ---- Gegevens ---------------------------------------------------------------
  async gebruiker() {
    const { data: u } = await this.client.auth.getUser();
    const { data, error } = await this.client.from('gebruikers').select('naam, rol').eq('user_id', u.user.id).maybeSingle();
    if (error) throw new Error(vertaalFout(error.message));
    if (!data) throw new Error('Dit account heeft geen toegang tot de administratie. Vraag de beheerder om je toe te voegen.');
    return data;
  }

  async laad() {
    const { data, error } = await this.client
      .from('administratie_versies')
      .select('id, data')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw new Error(vertaalFout(error.message));
    if (!data.length) return { data: null, versie: 0 };
    return { data: data[0].data, versie: data[0].id };
  }

  async bewaar(gegevens, vorigeVersie) {
    const { data, error } = await this.client.rpc('opslaan', { p_vorige: vorigeVersie, p_data: gegevens });
    if (error) {
      if (/conflict/i.test(error.message)) {
        throw new ConflictFout('Iemand anders heeft intussen iets opgeslagen. Je wijziging is niet bewaard: herlaad de pagina en voer hem opnieuw in.');
      }
      throw new Error(vertaalFout(error.message));
    }
    return data;
  }

  async historie() {
    const { data, error } = await this.client
      .from('administratie_versies')
      .select('id, opgeslagen_op, opgeslagen_door_naam')
      .order('id', { ascending: false })
      .limit(100);
    if (error) throw new Error(vertaalFout(error.message));
    return data.map((r) => ({ versie: r.id, opgeslagen_op: r.opgeslagen_op, door: r.opgeslagen_door_naam }));
  }

  async laadVersie(versie) {
    const { data, error } = await this.client.from('administratie_versies').select('data').eq('id', versie).single();
    if (error) throw new Error(vertaalFout(error.message));
    return data.data;
  }
}

function vertaalFout(tekst) {
  if (/Invalid login credentials/i.test(tekst)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/permission denied|row-level security/i.test(tekst)) return 'Je hebt geen rechten voor deze handeling.';
  if (/Failed to fetch|NetworkError/i.test(tekst)) return 'Geen verbinding met de database. Controleer je internetverbinding.';
  return tekst;
}
