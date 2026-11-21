-- Correct only labels emitted by the original onboarding form; preserve all other zones.
WITH legacy_zones (label, iana) AS (
  VALUES
    ('Asia/Jakarta (GMT+7)', 'Asia/Jakarta'),
    ('Asia/Makassar (GMT+8)', 'Asia/Makassar'),
    ('Asia/Jayapura (GMT+9)', 'Asia/Jayapura')
), updated_organizations AS (
  UPDATE organizations AS org
  SET timezone = zones.iana
  FROM legacy_zones AS zones
  WHERE org.timezone = zones.label
  RETURNING org.id
)
UPDATE outlets AS outlet
SET timezone = zones.iana
FROM legacy_zones AS zones
WHERE outlet.timezone = zones.label;
