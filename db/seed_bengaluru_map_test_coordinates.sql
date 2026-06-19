BEGIN;

CREATE TABLE IF NOT EXISTS map_coordinate_test_backup_20260619 (
  response_id BIGINT PRIMARY KEY,
  old_latitude NUMERIC(10, 7),
  old_longitude NUMERIC(10, 7),
  old_gps_accuracy NUMERIC(10, 2),
  old_answers JSONB NOT NULL,
  backup_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH target_project AS (
  SELECT id
  FROM survey_projects
  WHERE slug = 'bengaluru-second-airport-feasibility'
),
targets AS (
  SELECT r.id
  FROM survey_responses r
  JOIN target_project p ON p.id = r.project_id
  WHERE r.latitude IS NULL OR r.longitude IS NULL
  ORDER BY r.id
  LIMIT 200
)
INSERT INTO map_coordinate_test_backup_20260619 (
  response_id,
  old_latitude,
  old_longitude,
  old_gps_accuracy,
  old_answers
)
SELECT r.id, r.latitude, r.longitude, r.gps_accuracy, r.answers
FROM survey_responses r
JOIN targets t ON t.id = r.id
ON CONFLICT (response_id) DO NOTHING;

WITH target_project AS (
  SELECT id
  FROM survey_projects
  WHERE slug = 'bengaluru-second-airport-feasibility'
),
targets AS (
  SELECT r.id, ROW_NUMBER() OVER (ORDER BY r.id) AS rn
  FROM survey_responses r
  JOIN target_project p ON p.id = r.project_id
  WHERE r.latitude IS NULL OR r.longitude IS NULL
  ORDER BY r.id
  LIMIT 200
),
anchors(label, lat, lng) AS (
  VALUES
    ('MG Road', 12.975600, 77.606900),
    ('Indiranagar', 12.971900, 77.641200),
    ('Koramangala', 12.935200, 77.624500),
    ('Whitefield', 12.969800, 77.750000),
    ('Electronic City', 12.845200, 77.660200),
    ('Yelahanka', 13.100700, 77.596300),
    ('Hebbal', 13.035800, 77.597000),
    ('Jayanagar', 12.925000, 77.593800),
    ('Banashankari', 12.925500, 77.546800),
    ('Rajajinagar', 12.991500, 77.554600),
    ('Malleshwaram', 13.003100, 77.564300),
    ('JP Nagar', 12.906300, 77.585700),
    ('BTM Layout', 12.916600, 77.610100),
    ('HSR Layout', 12.911600, 77.638900),
    ('Marathahalli', 12.956900, 77.701100),
    ('Sarjapur Road', 12.912100, 77.685600),
    ('Kengeri', 12.917700, 77.484900),
    ('Peenya', 13.028500, 77.519700),
    ('KR Puram', 13.007500, 77.695000),
    ('Banaswadi', 13.014200, 77.651900),
    ('Thanisandra', 13.055700, 77.633500),
    ('Hennur', 13.035900, 77.643100),
    ('Chikkabanavara', 13.081000, 77.504000),
    ('Basavanagudi', 12.942200, 77.575500),
    ('Frazer Town', 12.998000, 77.614700),
    ('Shivajinagar', 12.985600, 77.605700),
    ('Vasanth Nagar', 12.991900, 77.592100),
    ('Richmond Town', 12.963700, 77.604400),
    ('Wilson Garden', 12.948900, 77.596300),
    ('Majestic', 12.976600, 77.571300),
    ('Chickpet', 12.970500, 77.576400),
    ('RT Nagar', 13.024700, 77.594700),
    ('Sanjaynagar', 13.035200, 77.577200),
    ('Sahakar Nagar', 13.062100, 77.588000),
    ('Vidyaranyapura', 13.080300, 77.556700),
    ('Jakkur', 13.076600, 77.606800),
    ('HBR Layout', 13.024700, 77.628900),
    ('Horamavu', 13.027900, 77.660300),
    ('Bagalur Road', 13.133500, 77.668000),
    ('Hoodi', 12.991000, 77.716000),
    ('Varthur', 12.938900, 77.741200),
    ('Hoskote Road', 13.070700, 77.798000),
    ('Lalbagh', 12.950700, 77.584800),
    ('Adugodi', 12.942800, 77.610400),
    ('Bommanahalli', 12.899700, 77.625000),
    ('Bommasandra', 12.816700, 77.691200),
    ('Madivala', 12.922600, 77.617400),
    ('Bannerghatta Road', 12.800500, 77.577500),
    ('Uttarahalli', 12.906300, 77.545500),
    ('Nagarbhavi', 12.971900, 77.512700)
),
numbered_anchors AS (
  SELECT label, lat, lng, ROW_NUMBER() OVER () AS anchor_index, COUNT(*) OVER () AS anchor_count
  FROM anchors
),
assignments AS (
  SELECT
    t.id,
    a.label,
    ROUND((a.lat + ((((t.rn * 37) % 17) - 8) * 0.00115))::numeric, 7) AS latitude,
    ROUND((a.lng + ((((t.rn * 29) % 19) - 9) * 0.00120))::numeric, 7) AS longitude,
    ROUND((18 + ((t.rn * 7) % 28))::numeric, 2) AS gps_accuracy
  FROM targets t
  JOIN numbered_anchors a
    ON a.anchor_index = ((t.rn - 1) % a.anchor_count) + 1
)
UPDATE survey_responses r
SET
  latitude = assignments.latitude,
  longitude = assignments.longitude,
  gps_accuracy = assignments.gps_accuracy,
  answers = r.answers || jsonb_build_object(
    '_map_test_coordinate', true,
    '_map_test_label', assignments.label,
    '_map_test_note', 'Synthetic Bengaluru coordinate for dashboard map QA',
    '_map_test_seeded_at', NOW()
  )
FROM assignments
WHERE r.id = assignments.id;

COMMIT;

SELECT
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS gps_ready_samples,
  COUNT(*) FILTER (WHERE answers->>'_map_test_coordinate' = 'true') AS synthetic_map_test_samples,
  COUNT(*) AS total_samples
FROM survey_responses
WHERE project_id = (
  SELECT id
  FROM survey_projects
  WHERE slug = 'bengaluru-second-airport-feasibility'
);
