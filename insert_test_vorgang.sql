INSERT INTO vorgaenge (vorgang_id, vorgang_art, kurzbeschreibung, beschreibung, bvh, ba, frist, verantwortlicher, ersteller, sync_state, created_at, erstellt)
VALUES (
  'TEST-001',
  'Inspektion',
  'Test-Vorgang für PDF-Feature',
  'Das ist ein Test-Vorgang um die PDF-Upload und Anzeige zu testen.',
  'BVH-2024-001',
  'BA-001',
  '2026-12-31',
  'Stefan',
  'System',
  'synchronisiert',
  now(),
  now()
);
