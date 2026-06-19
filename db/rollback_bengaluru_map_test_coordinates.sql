BEGIN;

UPDATE survey_responses r
SET
  latitude = b.old_latitude,
  longitude = b.old_longitude,
  gps_accuracy = b.old_gps_accuracy,
  answers = b.old_answers
FROM map_coordinate_test_backup_20260619 b
WHERE r.id = b.response_id;

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
