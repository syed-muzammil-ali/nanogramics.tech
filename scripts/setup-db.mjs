import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from './load-env.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await loadEnvFile(path.join(root, '.env.local'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Example: postgres://user:password@localhost:5432/nanogramics');
  process.exit(1);
}

const {Pool} = await import('pg');
const schema = await readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
const {POS_SCHEMA} = await import('../api/pos.js');
const target = new URL(databaseUrl);
const databaseName = decodeURIComponent(target.pathname.slice(1));
if (!databaseName) {
  console.error('DATABASE_URL must include a database name.');
  process.exit(1);
}

const maintenanceUrl = new URL(databaseUrl);
maintenanceUrl.pathname = '/postgres';

const ssl = process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : undefined;
const maintenancePool = new Pool({
  connectionString: maintenanceUrl.toString(),
  ssl
});

try {
  const exists = await maintenancePool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (!exists.rowCount) {
    await maintenancePool.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
    console.log(`PostgreSQL database created: ${databaseName}`);
  } else {
    console.log(`PostgreSQL database already exists: ${databaseName}`);
  }
} finally {
  await maintenancePool.end();
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl
});

try {
  await pool.query(`${schema}\n${POS_SCHEMA}`);
  console.log('PostgreSQL schema is ready: website inquiries, POS, inventory, online orders, shop transfers, users, audit and riders');
} finally {
  await pool.end();
}
