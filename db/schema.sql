CREATE TABLE IF NOT EXISTS survey_projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  locations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'textarea', 'select', 'number', 'date')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, question_key)
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES survey_projects(id),
  enumerator_name TEXT NOT NULL,
  location TEXT NOT NULL,
  respondent_name TEXT,
  respondent_phone TEXT,
  household_id TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  gps_accuracy NUMERIC(10, 2),
  survey_started_at TIMESTAMPTZ,
  survey_ended_at TIMESTAMPTZ,
  survey_duration_seconds INT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_project
  ON survey_responses (project_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
  ON survey_responses (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_responses_enumerator
  ON survey_responses (LOWER(enumerator_name));

CREATE INDEX IF NOT EXISTS idx_survey_responses_location
  ON survey_responses (location);

CREATE INDEX IF NOT EXISTS idx_survey_responses_answers
  ON survey_responses USING GIN (answers);
