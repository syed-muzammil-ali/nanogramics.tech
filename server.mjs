import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from './scripts/load-env.mjs';
import {POST as posPost} from './api/pos.js';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
await loadEnvFile(path.join(appRoot, '.env.local'));

const root = path.join(appRoot, 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
};
const services = new Set([
  'SaaS development',
  'POS system development',
  'ERP system development',
  'Website development',
  'Social media content',
  'Graphic design'
]);
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

function sendJson(res, status, payload) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache'});
  res.end(JSON.stringify(payload));
}

async function parseJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Request body is too large.'), {status: 413});
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), {status: 400});
  }
}

async function readBody(req, max = 1_000_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) throw Object.assign(new Error('Request body is too large.'), {status: 413});
  }
  return body;
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validateInquiry(input) {
  const inquiry = {
    name: cleanText(input.name, 100),
    email: cleanText(input.email, 160).toLowerCase(),
    service: cleanText(input.service, 80),
    meetingDate: cleanText(input.meetingDate, 20),
    brief: cleanText(input.brief, 1200)
  };
  const errors = [];
  if (!inquiry.name) errors.push('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) errors.push('A valid email is required.');
  if (!services.has(inquiry.service)) errors.push('Please choose a valid service.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inquiry.meetingDate)) errors.push('Meeting date is required.');
  if (!inquiry.brief) errors.push('Small message is required.');
  return {inquiry, errors};
}

async function getPool() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error('DATABASE_URL is not configured.'), {status: 503});
  }
  if (!pool) {
    const {Pool} = await import('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : undefined
    });
  }
  schemaReady ??= pool.query(schema);
  await schemaReady;
  return pool;
}

async function createInquiry(req, res) {
  const {inquiry, errors} = validateInquiry(await parseJson(req));
  if (errors.length) {
    sendJson(res, 422, {ok: false, errors});
    return;
  }
  const db = await getPool();
  const result = await db.query(
    `INSERT INTO project_inquiries (name, email, service, meeting_date, brief)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [inquiry.name, inquiry.email, inquiry.service, inquiry.meetingDate, inquiry.brief]
  );
  sendJson(res, 201, {ok: true, inquiryId: result.rows[0].id, createdAt: result.rows[0].created_at});
}

async function serveStatic(pathname, res) {
  const staticPath = pathname === '/'
    ? '/index.html'
    : (pathname === '/pos' || pathname === '/pos/'
      ? '/pos/index.html'
      : (pathname === '/admin' || pathname === '/admin/' ? '/admin/index.html' : pathname));
  const target = path.resolve(root, '.' + staticPath);
  if (!target.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const body = await readFile(target);
  res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/health') {
      const databaseConfigured = Boolean(process.env.DATABASE_URL);
      if (!databaseConfigured) {
        sendJson(res, 200, {ok: true, databaseConfigured, databaseConnected: false});
        return;
      }
      const db = await getPool();
      await db.query('SELECT 1');
      sendJson(res, 200, {ok: true, databaseConfigured, databaseConnected: true});
      return;
    }
    if (pathname === '/api/inquiries' && req.method === 'POST') {
      await createInquiry(req, res);
      return;
    }
    if (pathname === '/api/pos' && req.method === 'POST') {
      const body = await readBody(req);
      const request = new Request('http://localhost/api/pos', {
        method: 'POST',
        headers: {'Content-Type': req.headers['content-type'] || 'application/json'},
        body
      });
      await sendWebResponse(res, await posPost(request));
      return;
    }
    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, {ok: false, error: 'API route not found.'});
      return;
    }
    await serveStatic(pathname, res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const status = error.status || 500;
    if (status === 500) console.error(error);
    sendJson(res, status, {ok: false, error: status === 500 ? 'Server error.' : error.message});
  }
});

const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
  const databaseStatus = process.env.DATABASE_URL ? 'PostgreSQL enabled' : 'PostgreSQL not configured';
  console.log(`Nanogramics website listening on ${host}:${port} (${databaseStatus})`);
});
