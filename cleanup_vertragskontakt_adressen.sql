-- Cleanup: alte synthetische Vertragskontakt-Adressen entfernen
-- Ziel: keine Zusatz-Adressfuehrung fuer Vertragskontakte mehr

-- 1) VORSCHAU (nur lesen)
SELECT COUNT(*) AS vertrag_refs_auf_synthetische_adressen
FROM vertraege
WHERE kontakt_adresse_id LIKE 'vertrag-kontakt-%';

SELECT COUNT(*) AS synthetische_adressen
FROM adressen
WHERE adresse_id LIKE 'vertrag-kontakt-%';

-- 2) BEREINIGUNG (schreiben)
BEGIN;

-- Historische Verweise loesen
UPDATE vertraege
SET kontakt_adresse_id = NULL
WHERE kontakt_adresse_id LIKE 'vertrag-kontakt-%';

-- Alte synthetische Adress-Datensaetze loeschen
DELETE FROM adressen
WHERE adresse_id LIKE 'vertrag-kontakt-%';

COMMIT;

-- 3) NACHKONTROLLE
SELECT COUNT(*) AS verbleibende_vertrag_refs
FROM vertraege
WHERE kontakt_adresse_id LIKE 'vertrag-kontakt-%';

SELECT COUNT(*) AS verbleibende_synthetische_adressen
FROM adressen
WHERE adresse_id LIKE 'vertrag-kontakt-%';
