CREATE TABLE IF NOT EXISTS project_inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  service TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  brief TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_inquiries_created_at_idx
  ON project_inquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS project_inquiries_service_idx
  ON project_inquiries (service);
