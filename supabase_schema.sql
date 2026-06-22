-- ============================================================
-- Archivy – Supabase Schema
-- Wohnbau Hess GmbH | Vertrags- und Dokumentenverwaltung
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUM: Sync-Status
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    CREATE TYPE sync_state_enum AS ENUM ('neu', 'geaendert', 'synchronisiert');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- TABELLE: adressen (Stammdaten)
-- ============================================================
CREATE TABLE IF NOT EXISTS adressen (
    id              BIGSERIAL PRIMARY KEY,
    adresse_id      TEXT UNIQUE NOT NULL,        -- FM-Sync-Schlüssel

    -- Name
    nachname        TEXT,
    vorname         TEXT,
    firma_name      TEXT,
    anrede          TEXT,
    titel           TEXT,

    -- Anschrift
    strasse         TEXT,
    hausnummer      TEXT,
    plz             TEXT,
    ort             TEXT,
    land            TEXT DEFAULT 'Deutschland',

    -- Kontakt
    telefon         TEXT,
    mobil           TEXT,
    email           TEXT,
    website         TEXT,

    -- Bankdaten
    iban            TEXT,
    bic             TEXT,
    bank            TEXT,

    -- Rollen-Flags
    ist_an          BOOLEAN DEFAULT false,
    ist_bieter      BOOLEAN DEFAULT false,
    ist_kunde       BOOLEAN DEFAULT false,
    ist_notar       BOOLEAN DEFAULT false,
    ist_makler      BOOLEAN DEFAULT false,
    ist_interessent BOOLEAN DEFAULT false,
    ist_lieferant   BOOLEAN DEFAULT false,

    -- Notizen
    notizen         TEXT,

    -- Sync
    app_modified_at TIMESTAMPTZ,
    sync_state      sync_state_enum DEFAULT 'synchronisiert',
    erstellt        TIMESTAMPTZ,
    geaendert       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adressen_nachname ON adressen (nachname);
CREATE INDEX IF NOT EXISTS idx_adressen_sync ON adressen (sync_state) WHERE sync_state != 'synchronisiert';


-- ============================================================
-- TABELLE: vertragsbesitzer
-- ============================================================
CREATE TABLE IF NOT EXISTS vertragsbesitzer (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    display_name  TEXT,
    allowed_users TEXT[] DEFAULT ARRAY[]::TEXT[],
    erstellt      TIMESTAMPTZ DEFAULT now() NOT NULL,
    geaendert     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vertragsbesitzer_name ON vertragsbesitzer (name);


-- ============================================================
-- TABELLE: app_admin (globaler Inhaber-Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_admin (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    admin_email TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ============================================================
-- TABELLE: zahlungsweisen (zentrale Auswahlliste)
-- ============================================================
CREATE TABLE IF NOT EXISTS zahlungsweisen (
    id                   BIGSERIAL PRIMARY KEY,
    vertragsbesitzer_id  TEXT REFERENCES vertragsbesitzer(id) ON DELETE CASCADE,
    bezeichnung          TEXT NOT NULL,
    sort_order           INTEGER DEFAULT 0,
    aktiv                BOOLEAN DEFAULT true,
    created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (vertragsbesitzer_id, bezeichnung)
);

CREATE INDEX IF NOT EXISTS idx_zahlungsweisen_owner_order ON zahlungsweisen (vertragsbesitzer_id, sort_order, bezeichnung);


-- ============================================================
-- TABELLE: vorgaenge (Herzstück)
-- ============================================================
CREATE TABLE IF NOT EXISTS vorgaenge (
    id                  BIGSERIAL PRIMARY KEY,
    vorgang_id          TEXT UNIQUE NOT NULL,    -- FM-Sync-Schlüssel

    -- Verknüpfungen (FM-Referenzen als Text; FK auf adressen wo sinnvoll)
    bvh                 TEXT,                    -- Bauvorhaben
    vertragsbesitzer_id TEXT REFERENCES vertragsbesitzer(id) ON DELETE SET NULL,
    ba                  TEXT,                    -- Bauabschnitt
    gew                 TEXT,                    -- Gewerk
    an                  TEXT,                    -- Auftragnehmer (FM-Ref)
    an_adresse_id       TEXT REFERENCES adressen(adresse_id) ON DELETE SET NULL,
    a_nr                TEXT,                    -- Auftragsnummer
    kunde               TEXT,
    kunde_adresse_id    TEXT REFERENCES adressen(adresse_id) ON DELETE SET NULL,
    we                  TEXT,                    -- Wohneinheit
    grundstueck         TEXT,
    makler              TEXT,
    makler_adresse_id   TEXT REFERENCES adressen(adresse_id) ON DELETE SET NULL,
    vertrag             TEXT,                    -- Vertrag-Referenz (FM)
    interessent         TEXT,
    interessent_adresse_id TEXT REFERENCES adressen(adresse_id) ON DELETE SET NULL,

    -- Inhalt
    vorgang_art         TEXT,
    kurzbeschreibung    TEXT,
    beschreibung        TEXT,

    -- Dateien (Supabase Storage Pfade)
    datei_pfad          TEXT,
    foto_pfad           TEXT,

    -- Fristen
    datum               DATE,
    frist               DATE,
    erledigung          DATE,
    nachfrist           DATE,
    erledigt            BOOLEAN DEFAULT false,

    -- Zuständigkeit
    ersteller           TEXT,
    verantwortlicher    TEXT,
    sb                  TEXT,                    -- Sachbearbeiter

    -- Sync
    modified_by         TEXT,
    app_modified_at     TIMESTAMPTZ,
    sync_state          sync_state_enum DEFAULT 'synchronisiert',
    erstellt            TIMESTAMPTZ,
    geaendert           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE IF EXISTS vorgaenge
    ADD COLUMN IF NOT EXISTS vertragsbesitzer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vorgaenge_bvh ON vorgaenge (bvh);
CREATE INDEX IF NOT EXISTS idx_vorgaenge_owner ON vorgaenge (vertragsbesitzer_id);
CREATE INDEX IF NOT EXISTS idx_vorgaenge_vorgang_art ON vorgaenge (vorgang_art);
CREATE INDEX IF NOT EXISTS idx_vorgaenge_frist ON vorgaenge (frist) WHERE erledigt = false;
CREATE INDEX IF NOT EXISTS idx_vorgaenge_sync ON vorgaenge (sync_state) WHERE sync_state != 'synchronisiert';
CREATE INDEX IF NOT EXISTS idx_vorgaenge_volltext ON vorgaenge
    USING gin(to_tsvector('german', coalesce(kurzbeschreibung,'') || ' ' || coalesce(beschreibung,'')));


-- ============================================================
-- TABELLE: vertraege
-- ============================================================
CREATE TABLE IF NOT EXISTS vertraege (
    id                  BIGSERIAL PRIMARY KEY,
    vertrag_id          TEXT UNIQUE NOT NULL,    -- FM-Sync-Schlüssel

    -- Klassifikation
    gruppe              TEXT,
    untergruppe         TEXT,

    -- Vertragspartner
    firma               TEXT,
    kontakt             TEXT,
    kontakt_adresse_id  TEXT REFERENCES adressen(adresse_id) ON DELETE SET NULL,
    telefon             TEXT,
    mobil               TEXT,
    fax                 TEXT,
    email               TEXT,
    webseite            TEXT,
    zugang              TEXT,
    passwort            TEXT,
    diskret             TEXT,

    -- Inhalt
    beschreibung        TEXT,
    vertragsnummer      TEXT,

    vertragsbesitzer_id TEXT REFERENCES vertragsbesitzer(id) ON DELETE SET NULL,

    -- Bankdaten
    iban                TEXT,
    bic                 TEXT,
    bank                TEXT,

    -- Kosten
    jahresraten         NUMERIC(10,2),
    kosten_pro_rate     NUMERIC(12,2),
    kosten_monatlich    NUMERIC(12,2),
    kosten_jaehrlich    NUMERIC(12,2),
    zahlungsweise       TEXT,                    -- z.B. monatlich, jährlich, einmalig
    dauerzahlung_id     TEXT,

    -- Laufzeit
    vertrags_datum      DATE,
    vertrags_beginn     DATE,
    vertrags_ablauf     DATE,
    kuendigungsfrist    TEXT,

    -- Dateien (Supabase Storage Pfade)
    datei_pfad          TEXT,
    datei_pfad_2        TEXT,

    -- Status
    aktiv               BOOLEAN DEFAULT true,
    notizen             TEXT,

    -- Sync
    app_modified_at     TIMESTAMPTZ,
    sync_state          sync_state_enum DEFAULT 'synchronisiert',
    erstellt            TIMESTAMPTZ,
    geaendert           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE IF EXISTS vertraege
    ADD COLUMN IF NOT EXISTS vertragsbesitzer_id TEXT;

ALTER TABLE IF EXISTS vertraege
    ADD COLUMN IF NOT EXISTS telefon TEXT,
    ADD COLUMN IF NOT EXISTS mobil TEXT,
    ADD COLUMN IF NOT EXISTS fax TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS webseite TEXT,
    ADD COLUMN IF NOT EXISTS zugang TEXT,
    ADD COLUMN IF NOT EXISTS passwort TEXT,
    ADD COLUMN IF NOT EXISTS diskret TEXT,
    ADD COLUMN IF NOT EXISTS modified_by TEXT,
    ADD COLUMN IF NOT EXISTS jahresraten NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_vertraege_gruppe ON vertraege (gruppe);
CREATE INDEX IF NOT EXISTS idx_vertraege_owner ON vertraege (vertragsbesitzer_id);
CREATE INDEX IF NOT EXISTS idx_vertraege_ablauf ON vertraege (vertrags_ablauf) WHERE aktiv = true;
CREATE INDEX IF NOT EXISTS idx_vertraege_sync ON vertraege (sync_state) WHERE sync_state != 'synchronisiert';
CREATE INDEX IF NOT EXISTS idx_vertraege_volltext ON vertraege
    USING gin(to_tsvector('german', coalesce(firma,'') || ' ' || coalesce(beschreibung,'') || ' ' || coalesce(vertragsnummer,'')));


-- ============================================================
-- HISTORIEN-/LOG-TABELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS vorgaenge_log (
    id              BIGSERIAL PRIMARY KEY,
    vorgang_id      TEXT NOT NULL REFERENCES vorgaenge(vorgang_id) ON DELETE CASCADE,
    aktion          TEXT NOT NULL,               -- 'erstellt', 'geaendert', 'geloescht'
    geaenderte_felder JSONB,
    alter_wert      JSONB,
    neuer_wert      JSONB,
    benutzer        TEXT,
    zeitpunkt       TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vorgaenge_log_vorgang ON vorgaenge_log (vorgang_id);

CREATE TABLE IF NOT EXISTS vertraege_log (
    id              BIGSERIAL PRIMARY KEY,
    vertrag_id      TEXT NOT NULL REFERENCES vertraege(vertrag_id) ON DELETE CASCADE,
    aktion          TEXT NOT NULL,
    geaenderte_felder JSONB,
    alter_wert      JSONB,
    neuer_wert      JSONB,
    benutzer        TEXT,
    zeitpunkt       TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vertraege_log_vertrag ON vertraege_log (vertrag_id);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE adressen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vorgaenge   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertraege   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertragsbesitzer ENABLE ROW LEVEL SECURITY;
ALTER TABLE zahlungsweisen ENABLE ROW LEVEL SECURITY;
ALTER TABLE vorgaenge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertraege_log ENABLE ROW LEVEL SECURITY;

-- Authentifizierte Nutzer dürfen alles lesen und schreiben
DROP POLICY IF EXISTS "auth_lesen" ON app_admin;
DROP POLICY IF EXISTS "auth_insert" ON app_admin;
DROP POLICY IF EXISTS "auth_update" ON app_admin;
DROP POLICY IF EXISTS "auth_delete" ON app_admin;
CREATE POLICY "auth_lesen" ON app_admin FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "auth_insert" ON app_admin FOR INSERT TO authenticated
    WITH CHECK (
        id = 1
        AND admin_email = lower ( auth.jwt() ->> 'email' )
    );
CREATE POLICY "auth_update" ON app_admin FOR UPDATE TO authenticated
    USING (admin_email = lower ( auth.jwt() ->> 'email' ))
    WITH CHECK (admin_email = lower ( auth.jwt() ->> 'email' ));
CREATE POLICY "auth_delete" ON app_admin FOR DELETE TO authenticated
    USING (admin_email = lower ( auth.jwt() ->> 'email' ));

DROP POLICY IF EXISTS "auth_lesen" ON vertragsbesitzer;
DROP POLICY IF EXISTS "auth_insert" ON vertragsbesitzer;
DROP POLICY IF EXISTS "auth_update" ON vertragsbesitzer;
DROP POLICY IF EXISTS "auth_delete" ON vertragsbesitzer;
CREATE POLICY "auth_lesen"  ON vertragsbesitzer FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = ANY (allowed_users));
CREATE POLICY "auth_insert" ON vertragsbesitzer FOR INSERT TO authenticated
    WITH CHECK ((auth.jwt() ->> 'email') = ANY (allowed_users));
CREATE POLICY "auth_update" ON vertragsbesitzer FOR UPDATE TO authenticated
    USING ((auth.jwt() ->> 'email') = ANY (allowed_users))
    WITH CHECK ((auth.jwt() ->> 'email') = ANY (allowed_users));
CREATE POLICY "auth_delete" ON vertragsbesitzer FOR DELETE TO authenticated
    USING ((auth.jwt() ->> 'email') = ANY (allowed_users));

DROP POLICY IF EXISTS "auth_lesen" ON zahlungsweisen;
DROP POLICY IF EXISTS "auth_insert" ON zahlungsweisen;
DROP POLICY IF EXISTS "auth_update" ON zahlungsweisen;
DROP POLICY IF EXISTS "auth_delete" ON zahlungsweisen;
CREATE POLICY "auth_lesen" ON zahlungsweisen FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = zahlungsweisen.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_insert" ON zahlungsweisen FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = zahlungsweisen.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_update" ON zahlungsweisen FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = zahlungsweisen.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = zahlungsweisen.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_delete" ON zahlungsweisen FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = zahlungsweisen.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );

DROP POLICY IF EXISTS "auth_lesen" ON adressen;
DROP POLICY IF EXISTS "auth_insert" ON adressen;
DROP POLICY IF EXISTS "auth_update" ON adressen;
CREATE POLICY "auth_lesen"  ON adressen    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON adressen    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON adressen    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_lesen" ON vorgaenge;
DROP POLICY IF EXISTS "auth_insert" ON vorgaenge;
DROP POLICY IF EXISTS "auth_update" ON vorgaenge;
DROP POLICY IF EXISTS "auth_delete" ON vorgaenge;
DROP POLICY IF EXISTS "fm_sync_insert" ON vorgaenge;
DROP POLICY IF EXISTS "fm_sync_update" ON vorgaenge;
CREATE POLICY "auth_lesen"  ON vorgaenge   FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vorgaenge.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_insert" ON vorgaenge   FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vorgaenge.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_update" ON vorgaenge   FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vorgaenge.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vorgaenge.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_delete" ON vorgaenge   FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vorgaenge.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
-- FileMaker Sync (anon key, service-to-service): schreibt nur Datensaetze mit gueltigem Besitzer
CREATE POLICY "fm_sync_insert" ON vorgaenge FOR INSERT TO anon WITH CHECK (vertragsbesitzer_id IS NOT NULL AND vertragsbesitzer_id <> '');
CREATE POLICY "fm_sync_update" ON vorgaenge FOR UPDATE TO anon USING (vertragsbesitzer_id IS NOT NULL AND vertragsbesitzer_id <> '');

DROP POLICY IF EXISTS "auth_lesen" ON vertraege;
DROP POLICY IF EXISTS "auth_insert" ON vertraege;
DROP POLICY IF EXISTS "auth_update" ON vertraege;
DROP POLICY IF EXISTS "auth_delete" ON vertraege;
DROP POLICY IF EXISTS "fm_sync_insert" ON vertraege;
DROP POLICY IF EXISTS "fm_sync_update" ON vertraege;
CREATE POLICY "auth_lesen"  ON vertraege   FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vertraege.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_insert" ON vertraege   FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vertraege.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_update" ON vertraege   FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vertraege.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vertraege.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
CREATE POLICY "auth_delete" ON vertraege   FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM vertragsbesitzer vb
            WHERE vb.id = vertraege.vertragsbesitzer_id
                AND (auth.jwt() ->> 'email') = ANY (vb.allowed_users)
        )
    );
-- FileMaker Sync (anon key, service-to-service): schreibt nur Datensaetze mit gueltigem Besitzer
CREATE POLICY "fm_sync_insert" ON vertraege FOR INSERT TO anon WITH CHECK (vertragsbesitzer_id IS NOT NULL AND vertragsbesitzer_id <> '');
CREATE POLICY "fm_sync_update" ON vertraege FOR UPDATE TO anon USING (vertragsbesitzer_id IS NOT NULL AND vertragsbesitzer_id <> '');

DROP POLICY IF EXISTS "auth_lesen" ON vorgaenge_log;
DROP POLICY IF EXISTS "auth_insert" ON vorgaenge_log;
CREATE POLICY "auth_lesen"  ON vorgaenge_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON vorgaenge_log FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_lesen" ON vertraege_log;
DROP POLICY IF EXISTS "auth_insert" ON vertraege_log;
CREATE POLICY "auth_lesen"  ON vertraege_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON vertraege_log FOR INSERT TO authenticated WITH CHECK (true);


-- ============================================================
-- STORAGE BUCKET (per Supabase Dashboard oder SQL)
-- ============================================================
-- Im Supabase Dashboard unter Storage → New Bucket anlegen:
--   Name: archivy-dokumente
--   Public: NEIN (privat, Zugriff nur per signierter URL)
--
-- Alternativ per SQL (erfordert pg_storage Extension):
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('archivy-dokumente', 'archivy-dokumente', false);
--
-- Storage-Policy für authentifizierte Nutzer:
-- CREATE POLICY "auth_storage_lesen" ON storage.objects
--   FOR SELECT TO authenticated USING (bucket_id = 'archivy-dokumente');
-- CREATE POLICY "auth_storage_upload" ON storage.objects
--   FOR INSERT TO authenticated WITH CHECK (bucket_id = 'archivy-dokumente');
