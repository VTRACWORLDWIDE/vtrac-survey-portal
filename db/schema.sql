CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  enumerator_name TEXT NOT NULL,
  location TEXT NOT NULL,
  respondent_name TEXT,
  respondent_phone TEXT,
  household_id TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  gps_accuracy NUMERIC(10, 2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
  ON survey_responses (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_responses_enumerator
  ON survey_responses (LOWER(enumerator_name));

CREATE INDEX IF NOT EXISTS idx_survey_responses_location
  ON survey_responses (location);

CREATE INDEX IF NOT EXISTS idx_survey_responses_answers
  ON survey_responses USING GIN (answers);

