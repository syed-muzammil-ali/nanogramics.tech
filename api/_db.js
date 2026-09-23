import {Pool} from 'pg';

const schema = `
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
CREATE INDEX IF NOT EXISTS project_inquiries_created_at_idx ON project_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS project_inquiries_service_idx ON project_inquiries (service);
`;

let pool;
let schemaReady;

export async function getPool() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error('DATABASE_URL is not configured.'), {status: 503});
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : undefined,
      max: 1,
      idleTimeoutMillis: 10_000
    });
  }

  schemaReady ??= pool.query(schema);
  await schemaReady;
  return pool;
}

export function errorResponse(error) {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  return Response.json(
    {ok: false, error: status === 500 ? 'Server error.' : error.message},
    {status}
  );
}
