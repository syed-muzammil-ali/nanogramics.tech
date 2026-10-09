import crypto from 'node:crypto';
import {Pool} from 'pg';
import bcrypt from 'bcryptjs';

let pool;
let ready;

const COMPANY_PAGES = ['sales','wholesale','online','inventory','shop','returns','exchange','riders','riders-payments','riders-reports','reports','audit','settings'];

export const POS_SCHEMA = `
CREATE TABLE IF NOT EXISTS pos_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  designation TEXT DEFAULT '',
  description TEXT DEFAULT '',
  permissions TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pos_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pos_products (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  barcode_value TEXT UNIQUE,
  name TEXT NOT NULL,
  brand TEXT DEFAULT '',
  type TEXT DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  "desc" TEXT DEFAULT '',
  category TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY,
  user_id BIGINT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  cashback NUMERIC DEFAULT 0,
  delivery NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'paid',
  notes TEXT DEFAULT '',
  return_status TEXT DEFAULT 'none',
  returned_items TEXT DEFAULT '[]',
  exchange_status TEXT DEFAULT 'none',
  invoice_details_json TEXT DEFAULT '{}',
  pdf_status TEXT DEFAULT 'web',
  pdf_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT DEFAULT '',
  type TEXT DEFAULT '',
  qty INTEGER NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pos_online_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  items_json TEXT DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  delivery NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'cod',
  order_status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  weight NUMERIC DEFAULT 0,
  qty_of_goods INTEGER DEFAULT 0,
  goods_description TEXT DEFAULT '',
  return_status TEXT DEFAULT 'none',
  returned_items TEXT DEFAULT '[]',
  exchange_status TEXT DEFAULT 'none',
  inventory_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS pos_user_performance_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL DEFAULT 0,
  username TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'online',
  pieces INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  is_return INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_returns (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  invoice_type TEXT NOT NULL,
  return_type TEXT NOT NULL,
  return_reason TEXT DEFAULT '',
  return_qty INTEGER NOT NULL DEFAULT 0,
  items_json TEXT DEFAULT '[]',
  original_items TEXT DEFAULT '[]',
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  total_amount NUMERIC DEFAULT 0,
  refund_amount NUMERIC DEFAULT 0,
  user_id BIGINT DEFAULT 0,
  username TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_online_returns (
  id BIGSERIAL PRIMARY KEY,
  return_amount NUMERIC NOT NULL,
  return_pieces INTEGER NOT NULL,
  description TEXT DEFAULT '',
  user_id BIGINT DEFAULT 0,
  username TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_exchanges (
  id BIGSERIAL PRIMARY KEY,
  exchange_number TEXT,
  original_invoice_id TEXT NOT NULL,
  invoice_type TEXT NOT NULL,
  original_items TEXT DEFAULT '[]',
  new_items TEXT DEFAULT '[]',
  new_qty_of_goods INTEGER DEFAULT 0,
  new_goods_description TEXT DEFAULT '',
  new_address TEXT DEFAULT '',
  original_amount NUMERIC DEFAULT 0,
  new_amount NUMERIC DEFAULT 0,
  additional_amount NUMERIC DEFAULT 0,
  refund_amount NUMERIC DEFAULT 0,
  reason TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  user_id BIGINT DEFAULT 0,
  username TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT,
  username TEXT NOT NULL,
  user_role TEXT NOT NULL,
  system_type TEXT NOT NULL,
  action TEXT NOT NULL,
  invoice_number TEXT,
  customer_name TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS pos_sku_seq START WITH 100001;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS barcode_value TEXT;
ALTER TABLE pos_products ALTER COLUMN qty SET DEFAULT 0;
UPDATE pos_products SET barcode_value=code WHERE barcode_value IS NULL;
ALTER TABLE pos_online_orders ADD COLUMN IF NOT EXISTS inventory_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pos_returns ADD COLUMN IF NOT EXISTS receipt_json JSONB;
ALTER TABLE pos_exchanges ADD COLUMN IF NOT EXISTS receipt_json JSONB;
CREATE TABLE IF NOT EXISTS pos_stock_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shop',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pos_stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  transfer_number TEXT UNIQUE NOT NULL,
  person_name TEXT NOT NULL,
  source_location_id BIGINT,
  destination_location_id BIGINT,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'posted',
  created_by_user_id BIGINT,
  created_by_username TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_stock_transfer_items (
  id BIGSERIAL PRIMARY KEY,
  transfer_id BIGINT NOT NULL REFERENCES pos_stock_transfers(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  reference_price NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE pos_stock_transfer_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS pos_stock_transfers_request_idx ON pos_stock_transfers(request_id) WHERE request_id IS NOT NULL;
CREATE SEQUENCE IF NOT EXISTS pos_rider_pickup_seq START WITH 1;
CREATE TABLE IF NOT EXISTS pos_rider_pickups (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE,
  rider_id TEXT NOT NULL,
  rider_name TEXT NOT NULL,
  rider_phone TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  pickup_at TIMESTAMPTZ NOT NULL,
  settlement TEXT NOT NULL DEFAULT 'informational' CHECK (settlement IN ('informational','deduct')),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Closed')),
  parcels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory_applied BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT,
  created_by_username TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pos_rider_payments (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  pickup_id TEXT NOT NULL REFERENCES pos_rider_pickups(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  credit_cents BIGINT NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL,
  received_by TEXT NOT NULL,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_rider_returns (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  pickup_id TEXT NOT NULL REFERENCES pos_rider_pickups(id) ON DELETE CASCADE,
  expected_id TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0 CHECK (received >= 0),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted >= 0),
  damaged INTEGER NOT NULL DEFAULT 0 CHECK (damaged >= 0),
  missing INTEGER NOT NULL DEFAULT 0 CHECK (missing >= 0),
  price_cents BIGINT NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pos_rider_history (
  id BIGSERIAL PRIMARY KEY,
  pickup_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_by BIGINT,
  created_by_username TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_sales_created_idx ON pos_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS pos_online_orders_created_idx ON pos_online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS pos_audit_created_idx ON pos_audit_log(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pos_products_barcode_idx ON pos_products(barcode_value);
CREATE INDEX IF NOT EXISTS pos_rider_pickups_date_idx ON pos_rider_pickups(pickup_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pos_rider_payments_pickup_idx ON pos_rider_payments(pickup_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS pos_rider_returns_pickup_idx ON pos_rider_returns(pickup_id, received_at DESC);
CREATE INDEX IF NOT EXISTS pos_rider_history_pickup_idx ON pos_rider_history(pickup_id, created_at DESC);
`;

const PLATFORM_SCHEMA = `
CREATE TABLE IF NOT EXISTS platform_admins (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schema_name TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'VIP',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '',
  pages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_companies_name_idx ON platform_companies(lower(name));
INSERT INTO platform_companies (id,name,schema_name,plan,pages_json,active,is_system)
VALUES ('default','Nanogramics','public','VIP','["sales","wholesale","online","inventory","shop","returns","exchange","riders","riders-payments","riders-reports","reports","audit","settings"]'::jsonb,true,true)
ON CONFLICT (id) DO NOTHING;
`;

function secret() {
  return process.env.POS_SESSION_SECRET || process.env.DATABASE_URL || 'nanogramics-pos-dev';
}

function sign(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions || '[]',
    kind: user.kind || 'tenant',
    companyId: user.companyId || 'default',
    companyName: user.companyName || 'Nanogramics',
    companySchema: user.companySchema || 'public',
    pages: Array.isArray(user.pages) ? user.pages : COMPANY_PAGES,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token) {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    const signature = Buffer.from(sig);
    const expectedSignature = Buffer.from(expected);
    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(signature, expectedSignature)) return null;
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (user.exp < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

async function db() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL is not configured.'), {status: 503});
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : undefined,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || (process.env.VERCEL ? '1' : '10'), 10),
    idleTimeoutMillis: 10_000
  });
  ready ??= (async () => {
    if (process.env.NODE_ENV === 'production' && String(process.env.POS_SESSION_SECRET || '').length < 32) {
      throw httpError('POS_SESSION_SECRET must contain at least 32 characters in production.', 503);
    }
    await pool.query(`${POS_SCHEMA}\n${PLATFORM_SCHEMA}`);
    const adminUsername = process.env.POS_ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.POS_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
    const {rows} = await pool.query('SELECT id FROM pos_users WHERE username = $1', [adminUsername]);
    if (!rows.length) {
      if (!adminPassword) throw httpError('POS_ADMIN_PASSWORD must be configured before the first production login.', 503);
      await pool.query(
        `INSERT INTO pos_users (username, password_hash, role, designation, description, permissions, status)
         VALUES ($1, $2, 'admin', 'System Administrator', 'Full system access', '[]', 'active')`,
        [adminUsername, bcrypt.hashSync(adminPassword, 12)]
      );
    }
    await pool.query("INSERT INTO pos_categories (name) VALUES ('Suits'), ('Accessories'), ('Single Pcs') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO pos_stock_locations (name, kind) VALUES ('Warehouse', 'warehouse'), ('Main Shop', 'shop') ON CONFLICT DO NOTHING");
  })();
  await ready;
  return pool;
}

const num = value => Number(value || 0);
const dateOnly = value => String(value || '').slice(0, 10);
const parseItems = row => ({...row, items: safeJson(row.items_json, []), customer: {name: row.customer_name, phone: row.customer_phone, address: row.customer_address}});
const safeJson = (value, fallback) => {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
};

function httpError(message, status = 422) {
  return Object.assign(new Error(message), {status});
}

const normalizedCompanyName = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const publicCompany = row => ({
  id: row.id,
  name: row.name,
  plan: row.plan,
  phone: row.phone || '',
  address: row.address || '',
  logo: row.logo || '',
  pages: Array.isArray(row.pages_json) ? row.pages_json : safeJson(row.pages_json, COMPANY_PAGES),
  active: row.active,
  isSystem: row.is_system,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

function checkedPages(value) {
  if (!Array.isArray(value) || !value.length || value.some(page => !COMPANY_PAGES.includes(page))) {
    throw httpError('Select at least one valid company page.');
  }
  const pages = COMPANY_PAGES.filter(page => value.includes(page));
  if (pages.some(page => page.startsWith('riders-')) && !pages.includes('riders')) {
    throw httpError('Enable Rider pickups before Rider payments or reports.');
  }
  return pages;
}

function quotedSchema(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value || '')) throw httpError('Invalid company workspace.', 500);
  return `"${value}"`;
}

async function findCompany(value, {allowDefault = true} = {}) {
  const database = await db();
  const name = normalizedCompanyName(value);
  const {rows} = name
    ? await database.query('SELECT * FROM platform_companies WHERE lower(name)=lower($1) OR id=$1 LIMIT 1', [name])
    : await database.query("SELECT * FROM platform_companies WHERE id='default' LIMIT 1");
  if (!rows[0] && !name && allowDefault) throw httpError('Default workspace is unavailable.', 503);
  if (!rows[0]) throw httpError('Company workspace was not found.', 401);
  if (!rows[0].active) throw httpError('This company workspace is disabled. Contact Nanogramics.', 403);
  return rows[0];
}

async function withCompany(company, action) {
  const database = await db();
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${quotedSchema(company.schema_name)}, public`);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function requirePlatformAdmin(user) {
  if (!user || user.kind !== 'platform' || user.role !== 'superadmin') throw httpError('Super admin access required.', 401);
}

async function platformHandler(channel, args, user) {
  const database = await db();
  if (channel === 'platform:admin:login') {
    const [username, password] = args;
    const configuredUsername = String(process.env.PLATFORM_ADMIN_USERNAME || 'superadmin').trim();
    const configuredPassword = String(process.env.PLATFORM_ADMIN_PASSWORD || '');
    let result = await database.query('SELECT * FROM platform_admins WHERE username=$1', [configuredUsername]);
    if (!result.rows.length) {
      if (configuredPassword.length < 12) throw httpError('PLATFORM_ADMIN_PASSWORD must be configured with at least 12 characters.', 503);
      await database.query('INSERT INTO platform_admins (username,password_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [configuredUsername, bcrypt.hashSync(configuredPassword, 12)]);
      result = await database.query('SELECT * FROM platform_admins WHERE username=$1', [configuredUsername]);
    }
    const row = result.rows[0];
    if (String(username || '').trim() !== row.username || !bcrypt.compareSync(String(password || ''), row.password_hash)) throw httpError('Invalid super admin username or password.', 401);
    const session = {id: row.username, username: row.username, role: 'superadmin', kind: 'platform', companyId: '', companyName: '', companySchema: '', pages: []};
    return {...session, token: sign(session)};
  }

  requirePlatformAdmin(user);
  if (channel === 'platform:admin:overview') {
    const {rows} = await database.query('SELECT * FROM platform_companies ORDER BY is_system DESC, created_at DESC');
    return rows.map(publicCompany);
  }
  if (channel === 'platform:admin:create') {
    const input = args[0] || {};
    const name = normalizedCompanyName(input.name);
    const username = String(input.username || '').trim();
    const password = String(input.password || '');
    const pages = checkedPages(input.pages || COMPANY_PAGES);
    if (!name || name.length > 160) throw httpError('Enter a valid company name.');
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) throw httpError('Company admin username must be 3–80 letters, numbers, dots, dashes or underscores.');
    if (password.length < 8 || password.length > 160) throw httpError('Company admin password must be 8–160 characters.');
    const logo = String(input.logo || '');
    if (logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(logo) || logo.length > 350000)) throw httpError('Company logo must be PNG, JPEG or WebP up to 250 KB.');
    const id = crypto.randomUUID();
    const schemaName = `tenant_${id.replaceAll('-', '')}`;
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      const duplicate = await client.query('SELECT id FROM platform_companies WHERE lower(name)=lower($1)', [name]);
      if (duplicate.rows.length) throw httpError('A company with this name already exists.', 409);
      await client.query(`CREATE SCHEMA ${quotedSchema(schemaName)}`);
      await client.query(`SET LOCAL search_path TO ${quotedSchema(schemaName)}, public`);
      await client.query(POS_SCHEMA);
      await client.query(
        `INSERT INTO pos_users (username,password_hash,role,designation,description,permissions,status)
         VALUES ($1,$2,'admin','Company Administrator','Full company access','[]','active')`,
        [username, bcrypt.hashSync(password, 12)]
      );
      await client.query("INSERT INTO pos_categories (name) VALUES ('Suits'),('Accessories'),('Single Pcs') ON CONFLICT DO NOTHING");
      await client.query("INSERT INTO pos_stock_locations (name,kind) VALUES ('Warehouse','warehouse'),('Main Shop','shop') ON CONFLICT DO NOTHING");
      await client.query('SET LOCAL search_path TO public');
      const created = await client.query(
        `INSERT INTO platform_companies (id,name,schema_name,plan,phone,address,logo,pages_json,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true) RETURNING *`,
        [id, name, schemaName, String(input.plan || 'VIP').slice(0, 40), String(input.phone || '').trim().slice(0, 80), String(input.address || '').trim().slice(0, 500), logo, JSON.stringify(pages)]
      );
      await client.query('COMMIT');
      return publicCompany(created.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  if (channel === 'platform:admin:update') {
    const input = args[0] || {};
    const existing = (await database.query('SELECT * FROM platform_companies WHERE id=$1', [input.id])).rows[0];
    if (!existing) throw httpError('Company not found.', 404);
    const name = normalizedCompanyName(input.name);
    const pages = checkedPages(input.pages || COMPANY_PAGES);
    if (!name || name.length > 160) throw httpError('Enter a valid company name.');
    const logo = String(input.logo || '');
    if (logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(logo) || logo.length > 350000)) throw httpError('Company logo must be PNG, JPEG or WebP up to 250 KB.');
    const {rows} = await database.query(
      `UPDATE platform_companies SET name=$2,plan=$3,phone=$4,address=$5,logo=$6,pages_json=$7::jsonb,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [input.id, name, String(input.plan || 'VIP').slice(0, 40), String(input.phone || '').trim().slice(0, 80), String(input.address || '').trim().slice(0, 500), logo, JSON.stringify(pages)]
    );
    return publicCompany(rows[0]);
  }
  if (channel === 'platform:admin:toggle') {
    const [id, active] = args;
    if (typeof active !== 'boolean') throw httpError('Invalid company status.');
    const {rows} = await database.query('UPDATE platform_companies SET active=$2,updated_at=now() WHERE id=$1 RETURNING *', [id, active]);
    if (!rows[0]) throw httpError('Company not found.', 404);
    return publicCompany(rows[0]);
  }
  if (channel === 'platform:admin:delete') {
    const [id, confirmationName] = args;
    const company = (await database.query('SELECT * FROM platform_companies WHERE id=$1', [id])).rows[0];
    if (!company) throw httpError('Company not found.', 404);
    if (company.is_system) throw httpError('The default Nanogramics workspace cannot be deleted.', 403);
    if (normalizedCompanyName(confirmationName) !== company.name) throw httpError('Type the exact company name to permanently delete it.');
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DROP SCHEMA ${quotedSchema(company.schema_name)} CASCADE`);
      await client.query('DELETE FROM platform_companies WHERE id=$1', [id]);
      await client.query('COMMIT');
      return {success: true};
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  throw httpError('Admin action not found.', 404);
}

function assertCompanyPageAccess(user, channel, args = []) {
  const allowed = Array.isArray(user?.pages) ? user.pages : COMPANY_PAGES;
  let required = [];
  if (channel === 'db:audit:log' || channel === 'db:setting:get' || channel === 'db:user:logout') return;
  if (/^db:product:(getAll|getByCode)$/.test(channel) || channel === 'db:category:getAll') required = ['inventory','sales','wholesale','online','returns','exchange','shop','riders'];
  else if (channel.startsWith('db:product:') || channel.startsWith('db:category:')) required = ['inventory'];
  else if (channel === 'db:sale:create') required = [args[0]?.notes === 'WHOLESALE' ? 'wholesale' : 'sales'];
  else if (channel.startsWith('db:sale:') || channel.startsWith('invoice:pdf:')) required = ['sales','wholesale','reports','returns','exchange'];
  else if (channel.startsWith('db:onlineOrder:')) required = ['online'];
  else if (channel === 'db:return:getInvoice') required = ['returns','exchange'];
  else if (channel.startsWith('db:return:') || channel.startsWith('db:simpleOnlineReturn:')) required = ['returns'];
  else if (channel.startsWith('db:exchange:')) required = ['exchange'];
  else if (channel.startsWith('db:report:')) required = ['reports'];
  else if (channel.startsWith('db:audit:')) required = ['audit'];
  else if (channel.startsWith('db:user:') || channel.startsWith('db:setting:')) required = ['settings'];
  else if (channel.startsWith('shop:')) required = ['shop'];
  else if (['riders:payment','riders:returns'].includes(channel)) required = ['riders-payments'];
  else if (['riders:reports','riders:export'].includes(channel)) required = ['riders-reports'];
  else if (channel.startsWith('riders:')) required = ['riders'];
  if (required.length && !required.some(page => allowed.includes(page))) throw httpError('This page is not enabled for your company. Contact Nanogramics.', 403);
}

function normalizeLineItems(items) {
  if (!Array.isArray(items) || !items.length) throw httpError('At least one product is required.');
  const grouped = new Map();
  for (const raw of items) {
    const code = String(raw?.code || raw?.id || '').trim();
    const qty = Number(raw?.qty);
    if (!code) throw httpError('Every item must include a product SKU.');
    if (!Number.isInteger(qty) || qty <= 0) throw httpError(`Invalid quantity for ${code}.`);
    const previous = grouped.get(code);
    grouped.set(code, previous ? {...previous, qty: previous.qty + qty} : {...raw, code, qty});
  }
  return [...grouped.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function itemQuantityMap(items) {
  if (!Array.isArray(items) || !items.length) return new Map();
  return new Map(normalizeLineItems(items).map(item => [item.code, item.qty]));
}

function stockDeltas(nextItems, previousItems = [], previousApplied = false, nextApplied = true) {
  const previous = previousApplied ? itemQuantityMap(previousItems) : new Map();
  const next = nextApplied ? itemQuantityMap(nextItems) : new Map();
  const codes = new Set([...previous.keys(), ...next.keys()]);
  return new Map([...codes].map(code => [code, (next.get(code) || 0) - (previous.get(code) || 0)]));
}

async function applyInventoryDeltas(client, deltas) {
  const entries = [...deltas.entries()].filter(([, delta]) => delta !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return new Map();
  const codes = entries.map(([code]) => code);
  const {rows} = await client.query(
    'SELECT * FROM pos_products WHERE code = ANY($1::text[]) ORDER BY code FOR UPDATE',
    [codes]
  );
  const products = new Map(rows.map(product => [product.code, product]));
  for (const code of codes) {
    if (!products.has(code)) throw httpError(`Product ${code} does not exist.`, 409);
  }
  for (const [code, delta] of entries) {
    const product = products.get(code);
    if (delta > 0 && Number(product.qty) < delta) {
      throw httpError(`${product.name} (${code}) has only ${product.qty} in stock.`, 409);
    }
    const {rows: updated} = await client.query(
      'UPDATE pos_products SET qty=qty-$1, updated_at=now() WHERE code=$2 RETURNING *',
      [delta, code]
    );
    products.set(code, updated[0]);
  }
  return products;
}

async function getProductMap(client, items, lock = false) {
  const normalized = normalizeLineItems(items);
  const codes = normalized.map(item => item.code);
  const {rows} = await client.query(
    `SELECT * FROM pos_products WHERE code = ANY($1::text[]) ORDER BY code${lock ? ' FOR UPDATE' : ''}`,
    [codes]
  );
  const products = new Map(rows.map(product => [product.code, product]));
  for (const code of codes) {
    if (!products.has(code)) throw httpError(`Product ${code} does not exist.`, 409);
  }
  return {normalized, products};
}

function canonicalItems(items, products) {
  return items.map(item => {
    const product = products.get(item.code);
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      brand: product.brand || '',
      type: product.type || '',
      price: num(product.price),
      qty: item.qty
    };
  });
}

async function nextSku(client) {
  const {rows} = await client.query("SELECT 'NG-' || lpad(nextval('pos_sku_seq')::text, 8, '0') AS code");
  return rows[0].code;
}

async function withTx(client, work) {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function requireUser(user) {
  if (!user) throw Object.assign(new Error('Please sign in again.'), {status: 401});
  return user;
}

function requireAdmin(user) {
  requireUser(user);
  if (user.role !== 'admin') throw Object.assign(new Error('Admin access is required.'), {status: 403});
}

function userPermissions(user) {
  if (user?.role === 'admin') return ['*'];
  return safeJson(user?.permissions, []);
}

function requireRiderPermission(user, permission) {
  requireUser(user);
  const permissions = userPermissions(user);
  if (permissions.includes('*') || permissions.includes(`riders.${permission}`)) return;
  throw Object.assign(new Error(`Rider ${permission} permission is required.`), {status: 403});
}

async function handler(channel, args, user, providedClient) {
  const client = providedClient || await db();

  if (channel === 'db:user:authenticate') {
    const [username, password] = args;
    const {rows} = await client.query('SELECT * FROM pos_users WHERE username = $1', [String(username || '').trim()]);
    const row = rows[0];
    if (!row) throw Object.assign(new Error('Username not found. Please check and try again.'), {status: 401});
    if (row.status === 'inactive') throw Object.assign(new Error('Your account has been deactivated. Please contact an administrator.'), {status: 403});
    if (!bcrypt.compareSync(String(password || ''), row.password_hash)) throw Object.assign(new Error('Incorrect password. Please try again.'), {status: 401});
    const sessionUser = {
      id: row.id, username: row.username, role: row.role, designation: row.designation || '', description: row.description || '',
      permissions: row.permissions || '[]', status: row.status || 'active', kind: 'tenant', companyId: user.companyId,
      companyName: user.companyName, companySchema: user.companySchema, pages: user.pages
    };
    return {...sessionUser, token: sign(sessionUser)};
  }

  if (channel === 'db:user:logout') return {success: true};
  requireUser(user);

  switch (channel) {
    case 'db:user:getAll':
      requireAdmin(user);
      return (await client.query('SELECT id, username, role, designation, description, permissions, status, created_at, updated_at FROM pos_users ORDER BY id ASC')).rows;
    case 'db:user:add': {
      requireAdmin(user);
      const [input] = args;
      if (!input?.username || !input?.password) throw new Error('Username and password required');
      await client.query(
        `INSERT INTO pos_users (username, password_hash, role, designation, description, permissions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.username, bcrypt.hashSync(input.password, 10), input.role || 'cashier', input.designation || '', input.description || '', Array.isArray(input.permissions) ? JSON.stringify(input.permissions) : input.permissions || '[]', input.status || 'active']
      );
      return {success: true};
    }
    case 'db:user:update': {
      requireAdmin(user);
      const [userId, updates] = args;
      const permissions = Array.isArray(updates.permissions) ? JSON.stringify(updates.permissions) : updates.permissions || '[]';
      if (updates.password) {
        await client.query('UPDATE pos_users SET role=$1,password_hash=$2,designation=$3,description=$4,permissions=$5,status=$6,updated_at=now() WHERE id=$7',
          [updates.role, bcrypt.hashSync(updates.password, 10), updates.designation || '', updates.description || '', permissions, updates.status || 'active', userId]);
      } else {
        await client.query('UPDATE pos_users SET role=$1,designation=$2,description=$3,permissions=$4,status=$5,updated_at=now() WHERE id=$6',
          [updates.role, updates.designation || '', updates.description || '', permissions, updates.status || 'active', userId]);
      }
      return {success: true};
    }
    case 'db:user:delete':
      requireAdmin(user);
      await client.query('DELETE FROM pos_users WHERE id=$1 AND NOT (role=$2 AND (SELECT count(*) FROM pos_users WHERE role=$2) <= 1)', [args[0], 'admin']);
      return {success: true};

    case 'db:category:getAll':
      return (await client.query('SELECT * FROM pos_categories ORDER BY lower(name)')).rows;
    case 'db:category:add':
      await client.query('INSERT INTO pos_categories (name) VALUES ($1)', [String(args[0] || '').trim()]);
      return {success: true};
    case 'db:category:delete': {
      const used = await client.query('SELECT id FROM pos_products WHERE lower(trim(category)) = lower((SELECT name FROM pos_categories WHERE id=$1)) LIMIT 1', [args[0]]);
      if (used.rows.length) throw new Error('Reassign products to another category before deleting this category.');
      await client.query('DELETE FROM pos_categories WHERE id=$1', [args[0]]);
      return {success: true};
    }
    case 'db:product:getAll':
      return (await client.query('SELECT *, code AS sku, COALESCE(barcode_value, code) AS barcode FROM pos_products ORDER BY name ASC')).rows;
    case 'db:product:getByCode':
      return (await client.query('SELECT *, code AS sku, COALESCE(barcode_value, code) AS barcode FROM pos_products WHERE code=$1 OR barcode_value=$1', [String(args[0] || '').trim().toUpperCase()])).rows;
    case 'db:product:add': {
      const p = args[0] || {};
      const name = String(p?.name || '').trim();
      const qty = Number(p?.qty);
      const price = Number(p?.price);
      if (!name) throw httpError('Product name is required.');
      if (!Number.isFinite(price) || price < 0) throw httpError('Price must be zero or greater.');
      if (!Number.isInteger(qty) || qty < 0) throw httpError('Stock quantity must be a whole number of zero or greater.');
      const product = await withTx(client, async () => {
        const code = await nextSku(client);
        const {rows} = await client.query(
          'INSERT INTO pos_products (code,barcode_value,name,brand,type,price,qty,"desc",category) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8) RETURNING *, code AS sku, barcode_value AS barcode',
          [code, name, String(p.brand || '').trim(), String(p.type || '').trim(), price, qty, String(p.desc || '').trim(), String(p.category || '').trim()]
        );
        return rows[0];
      });
      return {success: true, product};
    }
    case 'db:product:update': {
      const p = args[0] || {};
      const name = String(p?.name || '').trim();
      const qty = Number(p?.qty);
      const price = Number(p?.price);
      if (!name) throw httpError('Product name is required.');
      if (!Number.isFinite(price) || price < 0) throw httpError('Price must be zero or greater.');
      if (!Number.isInteger(qty) || qty < 0) throw httpError('Stock quantity must be a whole number of zero or greater.');
      await client.query('UPDATE pos_products SET name=$1,brand=$2,price=$3,qty=$4,category=$5,updated_at=now() WHERE code=$6',
        [name, String(p.brand || '').trim(), price, qty, String(p.category || '').trim(), p.code]);
      return {success: true};
    }
    case 'db:product:delete':
      await client.query('DELETE FROM pos_products WHERE code=$1', [args[0]]);
      return {success: true};
    case 'db:product:updateStock':
      await client.query('UPDATE pos_products SET qty = GREATEST(0, qty + $1) WHERE code=$2', [Number.parseInt(args[1], 10) || 0, args[0]]);
      return {success: true};

    case 'db:sale:create':
      return createSale(client, args[0], user);
    case 'db:sale:getAll':
      return (await client.query('SELECT * FROM pos_sales ORDER BY created_at DESC')).rows;
    case 'db:sale:getById': {
      const sale = (await client.query('SELECT * FROM pos_sales WHERE id=$1', [args[0]])).rows[0];
      if (!sale) throw new Error('Sale not found');
      const items = (await client.query('SELECT * FROM pos_sale_items WHERE sale_id=$1', [args[0]])).rows;
      return {...sale, items};
    }
    case 'db:sale:getByDateRange':
      return (await client.query('SELECT * FROM pos_sales WHERE created_at::date BETWEEN $1 AND $2 ORDER BY created_at DESC', [dateOnly(args[0]), dateOnly(args[1])])).rows;
    case 'db:sale:delete':
      requireAdmin(user);
      return deleteSale(client, args[0], user);
    case 'invoice:pdf:list':
      return (await client.query('SELECT id, created_at, total, pdf_status, pdf_error FROM pos_sales WHERE id ILIKE $1 ORDER BY created_at DESC LIMIT 100', [`%${String(args[0] || '').slice(0, 100)}%`])).rows;
    case 'invoice:pdf:generate':
    case 'invoice:pdf:open':
      return {success: false, error: 'PDF generation is desktop-only in the web POS. Use browser print/export.'};
    case 'db:report:getSalesReport':
      return salesReport(client, args[0], args[1]);

    case 'db:setting:get':
      return (await client.query('SELECT value FROM pos_settings WHERE key=$1', [args[0]])).rows[0]?.value ?? null;
    case 'db:setting:set':
      await client.query('INSERT INTO pos_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=excluded.value', [args[0], args[1]]);
      return {success: true};

    case 'db:onlineOrder:create':
      return createOnlineOrder(client, args[0], user);
    case 'db:onlineOrder:getAll':
      return (await client.query('SELECT * FROM pos_online_orders ORDER BY created_at DESC')).rows.map(parseItems);
    case 'db:onlineOrder:getByDate':
      return (await client.query('SELECT * FROM pos_online_orders WHERE created_at::date=$1 ORDER BY created_at DESC', [dateOnly(args[0])])).rows.map(parseItems);
    case 'db:onlineOrder:getByDateRange':
      return (await client.query('SELECT * FROM pos_online_orders WHERE created_at::date BETWEEN $1 AND $2 ORDER BY created_at DESC', [dateOnly(args[0]), dateOnly(args[1])])).rows.map(parseItems);
    case 'db:onlineOrder:updateStatus':
      return updateOnlineOrderStatus(client, args[0], args[1]);
    case 'db:onlineOrder:bulkUpdateStatus': {
      const [ids, status] = args;
      return withTx(client, async () => {
        let updated = 0;
        for (const id of [...new Set(ids || [])].sort()) {
          const result = await updateOnlineOrderStatus(client, id, status, false);
          if (!result.skipped) updated++;
        }
        return {success: true, updated, skipped: (ids || []).length - updated};
      });
    }
    case 'db:onlineOrder:update':
      return updateOnlineOrder(client, args[0]);
    case 'db:onlineOrder:delete':
      requireAdmin(user);
      return deleteOnlineOrder(client, args[0]);
    case 'db:report:getFullReport':
      return fullReport(client, args[0], args[1]);
    case 'db:report:getUserPerformance':
      return userPerformance(client, args[0], args[1]);

    case 'db:simpleOnlineReturn:process': {
      const [r] = args;
      const result = await client.query('INSERT INTO pos_online_returns (return_amount,return_pieces,description,user_id,username) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [num(r.returnAmount), Number.parseInt(r.returnPieces, 10) || 0, r.description || '', user.id, user.username]);
      await client.query("INSERT INTO pos_user_performance_log (user_id,username,order_id,order_type,pieces,amount,is_return) VALUES ($1,$2,'SIMPLE_RETURN','online',$3,$4,1)",
        [user.id, user.username, Number.parseInt(r.returnPieces, 10) || 0, num(r.returnAmount)]);
      return {success: true, returnId: result.rows[0].id, returnAmount: num(r.returnAmount), returnPieces: Number.parseInt(r.returnPieces, 10) || 0};
    }
    case 'db:simpleOnlineReturn:getList':
      return (await client.query('SELECT * FROM pos_online_returns ORDER BY created_at DESC LIMIT 100')).rows;
    case 'db:return:getList':
      return (await client.query('SELECT * FROM pos_returns ORDER BY created_at DESC LIMIT 100')).rows.map(row => ({...row, receipt: jsonColumn(row.receipt_json, null)}));
    case 'db:exchange:getList':
      return (await client.query('SELECT * FROM pos_exchanges ORDER BY created_at DESC LIMIT 100')).rows.map(row => ({...row, receipt: jsonColumn(row.receipt_json, null)}));
    case 'db:return:getInvoice':
      return lookupInvoice(client, args[0]);
    case 'db:return:process':
      return processAdjustment(client, args[0], user, 'return');
    case 'db:exchange:process':
      return processAdjustment(client, args[0], user, 'exchange');

    case 'db:audit:log':
      await audit(client, args[0], user);
      return {success: true};
    case 'db:audit:getLogs':
      return getAudit(client, args[0] || {});
    case 'db:audit:clearOld':
      await client.query("DELETE FROM pos_audit_log WHERE created_at < now() - ($1 || ' days')::interval", [Number.parseInt(args[0], 10) || 90]);
      return {success: true};
    case 'dialog:showSave':
    case 'dialog:showMessageBox':
      return {response: 0, canceled: false};
    case 'db:backup:create':
      return {success: true, path: 'Backups are managed by the hosted Postgres provider.'};
    case 'shop:locations':
      return (await client.query("SELECT name FROM pos_stock_locations WHERE kind='shop' AND status='active' ORDER BY name")).rows;
    case 'shop:list':
      return shopList(client, args[0]);
    case 'shop:details':
      return shopDetails(client, args[0]);
    case 'shop:issue':
      return shopIssue(client, args[0], user);
    case 'riders:list':
      requireRiderPermission(user, 'view');
      return riderList(client);
    case 'riders:detail':
      requireRiderPermission(user, 'view');
      return riderDetail(client, args[0]?.id);
    case 'riders:history':
      requireRiderPermission(user, 'view');
      return riderHistory(client, args[0]?.id);
    case 'riders:products':
      requireRiderPermission(user, 'view');
      return riderProducts(client, args[0]?.search);
    case 'riders:save': {
      const input = args[0] || {};
      requireRiderPermission(user, input.id ? (input.finish ? 'finish' : 'edit') : 'create');
      return saveRiderPickup(client, input, user);
    }
    case 'riders:payment':
      requireRiderPermission(user, 'payments');
      return recordRiderPayment(client, args[0] || {}, user);
    case 'riders:returns':
      requireRiderPermission(user, 'returns');
      return recordRiderReturn(client, args[0] || {}, user);
    case 'riders:close':
      requireRiderPermission(user, 'finish');
      return closeRiderPickup(client, args[0]?.id, user);
    case 'riders:delete':
      requireRiderPermission(user, 'delete');
      return deleteRiderPickup(client, args[0] || {}, user);
    case 'riders:reports':
      requireRiderPermission(user, 'reports');
      return riderReports(client, args[0] || {});
    case 'riders:pdf':
      requireRiderPermission(user, 'view');
      return riderPrintable(client, args[0] || {});
    case 'riders:export':
      requireRiderPermission(user, 'export');
      return riderExport(client, args[0] || {});
    case 'print:receipt-silent':
      return {success: true, browserPrint: true};
    default:
      throw Object.assign(new Error(`Unsupported POS action: ${channel}`), {status: 404});
  }
}

function cents(value, field = 'Amount') {
  const normalized = String(value ?? '0').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw httpError(`${field} must be zero or greater with at most two decimals.`);
  const [whole, fraction = ''] = normalized.split('.');
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(result)) throw httpError(`${field} is too large.`);
  return result;
}

function jsonColumn(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  return safeJson(value, fallback);
}

function positiveInteger(value, field) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw httpError(`${field} must be a positive whole number.`);
  return result;
}

function nonNegativeInteger(value, field) {
  const result = Number(value || 0);
  if (!Number.isSafeInteger(result) || result < 0) throw httpError(`${field} must be a whole number of zero or greater.`);
  return result;
}

function clean(value, max = 250) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeRiderParcels(rawParcels) {
  if (!Array.isArray(rawParcels)) throw httpError('Pickup parcels must be a list.');
  const parcelNumbers = new Set();
  return rawParcels.map((raw, parcelIndex) => {
    const number = clean(raw?.number, 120);
    const name = clean(raw?.name, 160);
    if (!number || !name) throw httpError(`Parcel ${parcelIndex + 1} needs a customer/parcel name and tracking number.`);
    const key = number.toLowerCase();
    if (parcelNumbers.has(key)) throw httpError(`Parcel number ${number} is duplicated in this pickup.`);
    parcelNumbers.add(key);
    if (!Array.isArray(raw.products) || !raw.products.length) throw httpError(`Parcel ${number} needs at least one product.`);
    const products = raw.products.map((product, productIndex) => ({
      id: clean(product?.id, 80) || crypto.randomUUID(),
      product_id: product?.product_id || null,
      name: clean(product?.name, 180) || (() => { throw httpError(`Product ${productIndex + 1} in parcel ${number} needs a name.`); })(),
      sku: clean(product?.sku || product?.code, 100).toUpperCase(),
      quantity: positiveInteger(product?.quantity ?? product?.qty, `Product quantity in parcel ${number}`),
      price_cents: product?.price_cents != null ? nonNegativeInteger(product.price_cents, 'Product price') : cents(product?.price, 'Product price')
    }));
    const returns = (Array.isArray(raw.returns) ? raw.returns : []).map((item, returnIndex) => ({
      id: clean(item?.id, 80) || crypto.randomUUID(),
      product_id: item?.product_id || null,
      name: clean(item?.name, 180) || (() => { throw httpError(`Expected return ${returnIndex + 1} in parcel ${number} needs a name.`); })(),
      sku: clean(item?.sku || item?.code, 100).toUpperCase(),
      quantity: positiveInteger(item?.quantity ?? item?.qty, `Expected return quantity in parcel ${number}`),
      price_cents: item?.price_cents != null ? nonNegativeInteger(item.price_cents, 'Return value') : cents(item?.price, 'Return value'),
      reason: clean(item?.reason, 250),
      notes: clean(item?.notes, 500)
    }));
    const deliveryCents = raw?.delivery_cents != null
      ? nonNegativeInteger(raw.delivery_cents, 'Delivery charges')
      : cents(raw?.delivery, 'Delivery charges');
    return {
      id: clean(raw?.id, 80) || crypto.randomUUID(),
      number,
      name,
      phone: clean(raw?.phone, 50),
      address: clean(raw?.address, 500),
      delivery_cents: deliveryCents,
      notes: clean(raw?.notes, 500),
      products,
      returns,
      total_cents: deliveryCents + products.reduce((sum, item) => sum + item.quantity * item.price_cents, 0)
    };
  });
}

function riderSkuMap(parcels, property = 'products') {
  const quantities = new Map();
  for (const parcel of parcels || []) {
    for (const item of parcel[property] || []) {
      if (!item.sku) continue;
      quantities.set(item.sku, (quantities.get(item.sku) || 0) + nonNegativeInteger(item.quantity, 'Inventory quantity'));
    }
  }
  return quantities;
}

function mapDifference(next, previous) {
  const keys = new Set([...next.keys(), ...previous.keys()]);
  return new Map([...keys].map(key => [key, (next.get(key) || 0) - (previous.get(key) || 0)]));
}

function riderReturnTotals(returnRows) {
  const totals = new Map();
  for (const row of returnRows || []) {
    const current = totals.get(row.expected_id) || {received: 0, accepted: 0, damaged: 0, missing: 0};
    current.received += Number(row.received || 0);
    current.accepted += Number(row.accepted || 0);
    current.damaged += Number(row.damaged || 0);
    current.missing += Number(row.missing || 0);
    totals.set(row.expected_id, current);
  }
  return totals;
}

export function buildRiderPickup(row, paymentRows = [], returnRows = []) {
  const returnTotals = riderReturnTotals(returnRows);
  const parcels = jsonColumn(row.parcels_json, []).map(parcel => ({
    ...parcel,
    products: (parcel.products || []).map(item => ({...item, quantity: Number(item.quantity), price_cents: Number(item.price_cents)})),
    returns: (parcel.returns || []).map(item => {
      const recorded = returnTotals.get(item.id) || {received: 0, accepted: 0, damaged: 0, missing: 0};
      return {
        ...item,
        quantity: Number(item.quantity),
        price_cents: Number(item.price_cents),
        ...recorded,
        pending: Math.max(0, Number(item.quantity) - recorded.accepted)
      };
    })
  }));
  const payments = paymentRows.map(payment => ({...payment, amount_cents: Number(payment.amount_cents), credit_cents: Number(payment.credit_cents)}));
  const returns = returnRows.map(entry => ({...entry, price_cents: Number(entry.price_cents), received: Number(entry.received), accepted: Number(entry.accepted), damaged: Number(entry.damaged), missing: Number(entry.missing)}));
  const flatReturns = parcels.flatMap(parcel => parcel.returns);
  const totalCents = parcels.reduce((sum, parcel) => sum + Number(parcel.total_cents || 0), 0);
  const receivedCents = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const expected = flatReturns.reduce((sum, item) => sum + item.quantity, 0);
  const returned = flatReturns.reduce((sum, item) => sum + item.received, 0);
  const accepted = flatReturns.reduce((sum, item) => sum + item.accepted, 0);
  const pending = flatReturns.reduce((sum, item) => sum + item.pending, 0);
  const returnValueCents = flatReturns.reduce((sum, item) => sum + item.accepted * item.price_cents, 0);
  const netCents = Math.max(0, totalCents - (row.settlement === 'deduct' ? returnValueCents : 0));
  const outstandingCents = netCents - receivedCents;
  const hasDispute = flatReturns.some(item => item.damaged > 0 || item.missing > 0);
  const returnStatus = expected === 0 ? 'No Return Expected'
    : pending === 0 ? 'Fully Returned'
    : hasDispute ? 'Return Disputed'
    : accepted > 0 || returned > 0 ? 'Partially Returned'
    : 'Return Pending';
  const paymentStatus = receivedCents === 0 ? 'Unpaid'
    : outstandingCents < 0 ? 'Overpaid'
    : outstandingCents === 0 ? 'Paid'
    : 'Partially Paid';
  return {
    ...row,
    pickup_at: new Date(row.pickup_at).toISOString().slice(0, 16),
    parcels,
    payments,
    returns,
    totals: {
      parcels: parcels.length,
      pieces: parcels.reduce((sum, parcel) => sum + parcel.products.reduce((part, item) => part + item.quantity, 0), 0),
      total_cents: totalCents,
      received_cents: receivedCents,
      outstanding_cents: outstandingCents,
      net_cents: netCents,
      return_value_cents: returnValueCents,
      expected,
      returned,
      accepted,
      pending,
      payment_status: paymentStatus,
      return_status: returnStatus,
      fully_settled: outstandingCents <= 0 && pending === 0
    }
  };
}

async function riderRows(client, where = '', params = []) {
  const pickups = (await client.query(`SELECT * FROM pos_rider_pickups WHERE deleted_at IS NULL ${where} ORDER BY pickup_at DESC, created_at DESC`, params)).rows;
  if (!pickups.length) return [];
  const ids = pickups.map(row => row.id);
  const payments = (await client.query('SELECT * FROM pos_rider_payments WHERE pickup_id=ANY($1::text[]) ORDER BY paid_at DESC', [ids])).rows;
  const returns = (await client.query('SELECT * FROM pos_rider_returns WHERE pickup_id=ANY($1::text[]) ORDER BY received_at DESC', [ids])).rows;
  return pickups.map(row => buildRiderPickup(
    row,
    payments.filter(payment => payment.pickup_id === row.id),
    returns.filter(entry => entry.pickup_id === row.id)
  ));
}

async function riderList(client) {
  return riderRows(client);
}

async function riderDetail(client, id) {
  if (!id) throw httpError('Pickup ID is required.');
  const rows = await riderRows(client, 'AND id=$1', [id]);
  if (!rows.length) throw httpError('Rider pickup not found.', 404);
  return rows[0];
}

async function riderHistory(client, id) {
  if (!id) throw httpError('Pickup ID is required.');
  return (await client.query('SELECT action,created_by,created_by_username,details,created_at FROM pos_rider_history WHERE pickup_id=$1 ORDER BY created_at DESC LIMIT 250', [id])).rows;
}

async function riderProducts(client, search) {
  const term = `%${clean(search, 120)}%`;
  return (await client.query(
    `SELECT id,code,name,brand,category,price,qty FROM pos_products
     WHERE qty > 0 AND ($1='%%' OR code ILIKE $1 OR name ILIKE $1 OR brand ILIKE $1 OR category ILIKE $1)
     ORDER BY name LIMIT 40`,
    [term]
  )).rows;
}

async function riderHistoryEntry(client, pickupId, action, user, details = {}) {
  await client.query(
    'INSERT INTO pos_rider_history (pickup_id,action,created_by,created_by_username,details) VALUES ($1,$2,$3,$4,$5)',
    [pickupId, action, user.id, user.username, JSON.stringify(details)]
  );
}

async function nextRiderPickupNumber(client) {
  const {rows} = await client.query("SELECT 'RDR-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('pos_rider_pickup_seq')::text,6,'0') AS number");
  return rows[0].number;
}

async function saveRiderPickup(client, input, user) {
  return withTx(client, async () => {
    const riderName = clean(input.rider_name, 160);
    const riderPhone = clean(input.rider_phone, 50);
    const pickupAt = new Date(input.pickup_at);
    if (!riderName || !riderPhone) throw httpError('Rider name and phone are required.');
    if (!Number.isFinite(pickupAt.getTime())) throw httpError('A valid pickup date and time is required.');
    const settlement = input.settlement === 'deduct' ? 'deduct' : 'informational';
    if (settlement === 'deduct' && user.role !== 'admin') throw Object.assign(new Error('Admin access is required to use return-value deduction.'), {status: 403});
    const parcels = normalizeRiderParcels(input.parcels || []);
    if (input.finish && !parcels.length) throw httpError('Add at least one parcel before finishing the pickup.');

    const existing = input.id
      ? (await client.query('SELECT * FROM pos_rider_pickups WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [input.id])).rows[0]
      : null;
    if (input.id && !existing) throw httpError('Rider pickup not found.', 404);
    if (existing?.status === 'Closed') throw httpError('Closed pickups cannot be edited.');
    if (existing?.status === 'Active' && user.role !== 'admin') throw Object.assign(new Error('Admin access is required to edit a finished pickup.'), {status: 403});
    if (existing?.status === 'Active' && !input.confirm_credit) throw httpError('Confirm the finished-pickup adjustment before saving.');

    if (existing) {
      const usedExpectedIds = (await client.query('SELECT DISTINCT expected_id FROM pos_rider_returns WHERE pickup_id=$1', [existing.id])).rows.map(row => row.expected_id);
      const nextExpectedIds = new Set(parcels.flatMap(parcel => parcel.returns.map(item => item.id)));
      if (usedExpectedIds.some(id => !nextExpectedIds.has(id))) throw httpError('An expected-return line with saved return history cannot be removed.');
    }

    const nextStatus = existing?.status === 'Active' ? 'Active' : (input.finish ? 'Active' : 'Draft');
    const previousParcels = existing ? jsonColumn(existing.parcels_json, []) : [];
    const previousInventory = existing?.inventory_applied ? riderSkuMap(previousParcels) : new Map();
    const nextInventory = nextStatus === 'Active' ? riderSkuMap(parcels) : new Map();
    await applyInventoryDeltas(client, mapDifference(nextInventory, previousInventory));

    const id = existing?.id || crypto.randomUUID();
    const number = existing?.number || (nextStatus === 'Active' ? await nextRiderPickupNumber(client) : null);
    const riderId = existing?.rider_id || crypto.createHash('sha256').update(`${riderPhone.replace(/\D/g, '')}|${riderName.toLowerCase()}`).digest('hex').slice(0, 24);
    if (existing) {
      await client.query(
        `UPDATE pos_rider_pickups SET number=$1,rider_name=$2,rider_phone=$3,company=$4,pickup_at=$5,settlement=$6,notes=$7,status=$8,parcels_json=$9,inventory_applied=$10,updated_at=now() WHERE id=$11`,
        [number || (nextStatus === 'Active' ? await nextRiderPickupNumber(client) : null), riderName, riderPhone, clean(input.company, 160), pickupAt.toISOString(), settlement, clean(input.notes, 1000), nextStatus, JSON.stringify(parcels), nextStatus === 'Active', id]
      );
    } else {
      await client.query(
        `INSERT INTO pos_rider_pickups (id,number,rider_id,rider_name,rider_phone,company,pickup_at,settlement,notes,status,parcels_json,inventory_applied,created_by,created_by_username)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, number, riderId, riderName, riderPhone, clean(input.company, 160), pickupAt.toISOString(), settlement, clean(input.notes, 1000), nextStatus, JSON.stringify(parcels), nextStatus === 'Active', user.id, user.username]
      );
    }
    await riderHistoryEntry(client, id, existing ? (nextStatus === 'Active' ? 'Pickup updated' : 'Draft updated') : (nextStatus === 'Active' ? 'Pickup created and finished' : 'Draft created'), user, {parcels: parcels.length});
    return riderDetail(client, id);
  });
}

async function recordRiderPayment(client, input, user) {
  return withTx(client, async () => {
    const pickupId = clean(input.pickup_id, 80);
    const requestId = clean(input.request_id, 80);
    if (!pickupId || !requestId) throw httpError('Pickup and payment request IDs are required.');
    const duplicate = (await client.query('SELECT * FROM pos_rider_payments WHERE request_id=$1', [requestId])).rows[0];
    if (duplicate) return {success: true, duplicate: true, id: duplicate.id};
    const pickup = await riderDetail(client, pickupId);
    if (pickup.status === 'Draft') throw httpError('Finish the pickup before recording payments.');
    if (pickup.status === 'Closed') throw httpError('Closed pickups cannot receive new payments.');
    const amountCents = cents(input.amount, 'Payment amount');
    if (amountCents <= 0) throw httpError('Payment amount must be greater than zero.');
    if (amountCents > Math.max(0, pickup.totals.outstanding_cents) && (user.role !== 'admin' || !input.confirm_overpayment)) {
      throw httpError('Admin confirmation is required for an overpayment.');
    }
    const paidAt = new Date(input.paid_at || Date.now());
    if (!Number.isFinite(paidAt.getTime())) throw httpError('A valid payment date is required.');
    const allowedMethods = ['Cash', 'Bank Transfer', 'Easypaisa', 'JazzCash', 'Other'];
    const method = allowedMethods.includes(input.method) ? input.method : 'Other';
    const previousCredit = Math.max(0, -pickup.totals.outstanding_cents);
    const nextCredit = Math.max(0, amountCents - Math.max(0, pickup.totals.outstanding_cents));
    const creditCents = Math.max(0, nextCredit - previousCredit);
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO pos_rider_payments (id,request_id,pickup_id,amount_cents,credit_cents,method,reference,notes,paid_at,received_by,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, requestId, pickupId, amountCents, creditCents, method, clean(input.reference, 160), clean(input.notes, 500), paidAt.toISOString(), user.username, user.id]
    );
    await riderHistoryEntry(client, pickupId, 'Payment recorded', user, {payment_id: id, amount_cents: amountCents, method});
    return {success: true, id, receipt_id: id};
  });
}

async function recordRiderReturn(client, input, user) {
  return withTx(client, async () => {
    const pickupId = clean(input.pickup_id, 80);
    const requestId = clean(input.request_id, 80);
    const expectedId = clean(input.expected_id, 80);
    if (!pickupId || !requestId || !expectedId) throw httpError('Pickup, expected return and request IDs are required.');
    const duplicate = (await client.query('SELECT * FROM pos_rider_returns WHERE request_id=$1', [requestId])).rows[0];
    if (duplicate) return {success: true, duplicate: true, id: duplicate.id};
    const pickupRow = (await client.query('SELECT * FROM pos_rider_pickups WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [pickupId])).rows[0];
    if (!pickupRow) throw httpError('Rider pickup not found.', 404);
    if (pickupRow.status !== 'Active') throw httpError('Returns can only be recorded against an active pickup.');
    const pickup = await riderDetail(client, pickupId);
    const expected = pickup.parcels.flatMap(parcel => parcel.returns).find(item => item.id === expectedId);
    if (!expected) throw httpError('Expected return line not found.', 404);
    const received = nonNegativeInteger(input.received, 'Received quantity');
    const accepted = nonNegativeInteger(input.accepted, 'Accepted quantity');
    const damaged = nonNegativeInteger(input.damaged, 'Damaged quantity');
    const missing = nonNegativeInteger(input.missing, 'Missing quantity');
    if (accepted + damaged > received) throw httpError('Accepted plus damaged pieces cannot exceed pieces received now.');
    if (received === 0 && missing === 0) throw httpError('Enter received pieces or a missing-piece observation.');
    if (accepted > expected.pending) throw httpError(`Only ${expected.pending} piece(s) remain to be accepted.`);
    const returnValue = accepted * expected.price_cents;
    if (pickup.settlement === 'deduct' && returnValue > Math.max(0, pickup.totals.outstanding_cents) && (user.role !== 'admin' || !input.confirm_credit)) {
      throw httpError('Admin confirmation is required because this return creates rider credit.');
    }
    const receivedAt = new Date(input.received_at || Date.now());
    if (!Number.isFinite(receivedAt.getTime())) throw httpError('A valid return date is required.');
    if (accepted && expected.sku) await applyInventoryDeltas(client, new Map([[expected.sku, -accepted]]));
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO pos_rider_returns (id,request_id,pickup_id,expected_id,received,accepted,damaged,missing,price_cents,received_at,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, requestId, pickupId, expectedId, received, accepted, damaged, missing, expected.price_cents, receivedAt.toISOString(), clean(input.notes, 500), user.id]
    );
    await riderHistoryEntry(client, pickupId, 'Return recorded', user, {return_id: id, expected_id: expectedId, received, accepted, damaged, missing});
    return {success: true, id};
  });
}

async function closeRiderPickup(client, id, user) {
  return withTx(client, async () => {
    const pickup = await riderDetail(client, id);
    if (pickup.status === 'Closed') return {success: true, duplicate: true};
    if (pickup.status !== 'Active') throw httpError('Finish the pickup before closing it.');
    if (!pickup.totals.fully_settled) throw httpError('Settle the outstanding balance and all expected returns before closing this pickup.');
    await client.query("UPDATE pos_rider_pickups SET status='Closed',updated_at=now() WHERE id=$1", [id]);
    await riderHistoryEntry(client, id, 'Pickup closed', user);
    return {success: true};
  });
}

async function deleteRiderPickup(client, input, user) {
  if (!input.confirm) throw httpError('Delete confirmation is required.');
  return withTx(client, async () => {
    const row = (await client.query('SELECT * FROM pos_rider_pickups WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [input.id])).rows[0];
    if (!row) return {success: true, skipped: true};
    if (input.permanent && user.role !== 'admin') throw Object.assign(new Error('Admin access is required for permanent deletion.'), {status: 403});
    if (row.inventory_applied) {
      const issued = riderSkuMap(jsonColumn(row.parcels_json, []));
      const acceptedRows = (await client.query('SELECT expected_id,accepted FROM pos_rider_returns WHERE pickup_id=$1', [row.id])).rows;
      const expectedById = new Map(jsonColumn(row.parcels_json, []).flatMap(parcel => (parcel.returns || []).map(item => [item.id, item])));
      const accepted = new Map();
      for (const entry of acceptedRows) {
        const sku = expectedById.get(entry.expected_id)?.sku;
        if (sku) accepted.set(sku, (accepted.get(sku) || 0) + Number(entry.accepted));
      }
      await applyInventoryDeltas(client, mapDifference(accepted, issued));
    }
    await riderHistoryEntry(client, row.id, input.permanent ? 'Pickup permanently deleted' : 'Pickup archived', user);
    if (input.permanent) await client.query('DELETE FROM pos_rider_pickups WHERE id=$1', [row.id]);
    else await client.query('UPDATE pos_rider_pickups SET deleted_at=now(),inventory_applied=false,updated_at=now() WHERE id=$1', [row.id]);
    return {success: true};
  });
}

function reportBucket(rows, label) {
  return rows.reduce((summary, pickup) => {
    summary.label = label;
    summary.pickups++;
    summary.parcels += pickup.totals.parcels;
    summary.total_cents += pickup.totals.total_cents;
    summary.net_cents += pickup.totals.net_cents;
    summary.received_cents += pickup.totals.received_cents;
    summary.outstanding_cents += pickup.totals.outstanding_cents;
    summary.pending += pickup.totals.pending;
    return summary;
  }, {label, pickups: 0, parcels: 0, total_cents: 0, net_cents: 0, received_cents: 0, outstanding_cents: 0, pending: 0});
}

function groupRiderReport(rows, keyFn, labelFn = key => key) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => reportBucket(values, labelFn(key, values))).sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function weekStart(value) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function riderReports(client, filters = {}) {
  let rows = await riderRows(client);
  if (filters.start) rows = rows.filter(row => String(row.pickup_at).slice(0, 10) >= filters.start);
  if (filters.end) rows = rows.filter(row => String(row.pickup_at).slice(0, 10) <= filters.end);
  if (filters.rider) rows = rows.filter(row => row.rider_id === filters.rider);
  if (filters.pickup) rows = rows.filter(row => row.id === filters.pickup);
  if (filters.status) rows = rows.filter(row => row.status === filters.status);
  if (filters.payment_status) rows = rows.filter(row => row.totals.payment_status === filters.payment_status);
  if (filters.return_status) rows = rows.filter(row => row.totals.return_status === filters.return_status);
  if (filters.method) rows = rows.filter(row => row.payments.some(payment => payment.method === filters.method));
  const summaryBucket = reportBucket(rows, 'All pickups');
  const summary = {
    pickups: summaryBucket.pickups,
    parcels: summaryBucket.parcels,
    pieces: rows.reduce((sum, row) => sum + row.totals.pieces, 0),
    total_cents: summaryBucket.total_cents,
    net_cents: summaryBucket.net_cents,
    received_cents: summaryBucket.received_cents,
    outstanding_cents: summaryBucket.outstanding_cents,
    expected_returns: rows.reduce((sum, row) => sum + row.totals.expected, 0),
    accepted_returns: rows.reduce((sum, row) => sum + row.totals.accepted, 0),
    pending_returns: summaryBucket.pending
  };
  return {
    summary,
    pickups: rows,
    riders: groupRiderReport(rows, row => row.rider_id, (_key, values) => `${values[0].rider_name} · ${values[0].rider_phone}`),
    daily: groupRiderReport(rows, row => String(row.pickup_at).slice(0, 10)),
    weekly: groupRiderReport(rows, row => weekStart(String(row.pickup_at)), start => `Week of ${start}`)
  };
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function riderPrintDocument(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>body{font:14px Arial,sans-serif;color:#18292f;margin:32px}h1{font-size:22px}h2{font-size:17px;margin-top:26px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px;border:1px solid #ccd8dc;text-align:left}th{background:#edf3f4}.muted{color:#607780}.totals{font-size:16px;font-weight:700}@media print{body{margin:12mm}}</style></head><body><h1>${htmlEscape(title)}</h1>${body}<script>window.addEventListener('load',()=>window.print())<\/script></body></html>`;
}

async function riderPrintable(client, input) {
  const pickup = await riderDetail(client, input.pickup_id);
  const payment = input.payment_id ? pickup.payments.find(item => item.id === input.payment_id) : null;
  const rows = pickup.parcels.flatMap(parcel => parcel.products.map(item => `<tr><td>${htmlEscape(parcel.number)}</td><td>${htmlEscape(item.name)}</td><td>${htmlEscape(item.sku)}</td><td>${item.quantity}</td><td>${(item.price_cents / 100).toFixed(2)}</td><td>${(item.quantity * item.price_cents / 100).toFixed(2)}</td></tr>`)).join('');
  const body = payment
    ? `<p>${htmlEscape(pickup.number)} · ${htmlEscape(pickup.rider_name)} · ${htmlEscape(pickup.rider_phone)}</p><h2>Payment receipt</h2><table><tr><th>Date</th><th>Method</th><th>Reference</th><th>Received by</th><th>Amount</th></tr><tr><td>${htmlEscape(payment.paid_at)}</td><td>${htmlEscape(payment.method)}</td><td>${htmlEscape(payment.reference)}</td><td>${htmlEscape(payment.received_by)}</td><td>Rs ${(payment.amount_cents / 100).toFixed(2)}</td></tr></table>`
    : `<p>${htmlEscape(pickup.rider_name)} · ${htmlEscape(pickup.rider_phone)} · ${htmlEscape(pickup.company)}<br>${htmlEscape(pickup.pickup_at.replace('T', ' '))}</p><table><thead><tr><th>Parcel</th><th>Product</th><th>SKU</th><th>Pieces</th><th>Rate</th><th>Line value</th></tr></thead><tbody>${rows}</tbody></table><p class="totals">Pickup value: Rs ${(pickup.totals.total_cents / 100).toFixed(2)} · Received: Rs ${(pickup.totals.received_cents / 100).toFixed(2)} · Outstanding: Rs ${(pickup.totals.outstanding_cents / 100).toFixed(2)}</p>`;
  return {success: true, kind: 'html', mode: input.mode || 'print', filename: `${payment ? 'rider-payment' : 'rider-pickup'}-${pickup.number || pickup.id}.html`, html: riderPrintDocument(payment ? 'Rider payment receipt' : `Rider pickup ${pickup.number}`, body)};
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function riderExport(client, input) {
  const report = await riderReports(client, input.filters || {});
  if (input.format === 'csv') {
    const header = ['Pickup', 'Date', 'Rider', 'Phone', 'Status', 'Parcels', 'Pieces', 'Value', 'Net due', 'Received', 'Outstanding', 'Pending returns'];
    const lines = report.pickups.map(pickup => [pickup.number, pickup.pickup_at, pickup.rider_name, pickup.rider_phone, pickup.status, pickup.totals.parcels, pickup.totals.pieces, (pickup.totals.total_cents / 100).toFixed(2), (pickup.totals.net_cents / 100).toFixed(2), (pickup.totals.received_cents / 100).toFixed(2), (pickup.totals.outstanding_cents / 100).toFixed(2), pickup.totals.pending]);
    return {success: true, kind: 'csv', filename: `rider-report-${new Date().toISOString().slice(0, 10)}.csv`, mime: 'text/csv;charset=utf-8', content: [header, ...lines].map(row => row.map(csvCell).join(',')).join('\r\n')};
  }
  const rows = report.pickups.map(pickup => `<tr><td>${htmlEscape(pickup.number)}</td><td>${htmlEscape(pickup.pickup_at)}</td><td>${htmlEscape(pickup.rider_name)}</td><td>${pickup.totals.parcels}</td><td>${(pickup.totals.total_cents / 100).toFixed(2)}</td><td>${(pickup.totals.received_cents / 100).toFixed(2)}</td><td>${(pickup.totals.outstanding_cents / 100).toFixed(2)}</td><td>${pickup.totals.pending}</td></tr>`).join('');
  const body = `<p>${report.summary.pickups} pickups · ${report.summary.parcels} parcels · Rs ${(report.summary.total_cents / 100).toFixed(2)} total value</p><table><thead><tr><th>Pickup</th><th>Date</th><th>Rider</th><th>Parcels</th><th>Value</th><th>Received</th><th>Outstanding</th><th>Pending returns</th></tr></thead><tbody>${rows}</tbody></table>`;
  return {success: true, kind: 'html', mode: input.mode || 'print', filename: `rider-report-${new Date().toISOString().slice(0, 10)}.html`, html: riderPrintDocument('Rider settlement report', body)};
}

async function createSale(client, sale, user) {
  return withTx(client, async () => {
    if (!sale?.id || !Array.isArray(sale.items) || !sale.items.length) throw new Error('Sale must include an invoice ID and items.');
    const existing = (await client.query('SELECT id FROM pos_sales WHERE id=$1', [sale.id])).rows[0];
    if (existing) return {success: true, duplicate: true, message: 'Sale was already synced', invoiceId: sale.id};
    const {normalized} = await getProductMap(client, sale.items);
    const products = await applyInventoryDeltas(client, new Map(normalized.map(item => [item.code, item.qty])));
    const items = canonicalItems(normalized, products);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discount = Math.max(0, num(sale.discount));
    const delivery = Math.max(0, num(sale.delivery));
    const total = Math.max(0, subtotal - discount + delivery);
    await client.query(
      `INSERT INTO pos_sales (id,user_id,subtotal,discount,cashback,delivery,tax,total,payment_method,payment_status,notes,invoice_details_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [sale.id, sale.user_id || user.id, subtotal, discount, num(sale.cashback), delivery, num(sale.tax), total, sale.payment_method || 'cash', sale.payment_status || 'paid', sale.notes || '', JSON.stringify({cashier: user.username})]
    );
    for (const item of items) {
      await client.query('INSERT INTO pos_sale_items (sale_id,product_code,product_name,brand,type,qty,price,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [sale.id, item.code, item.name, item.brand, item.type, item.qty, item.price, item.qty * item.price]);
    }
    await audit(client, {action: 'Sale Created', invoiceNumber: sale.id, customerName: 'Walk-in', details: `Rs ${total}; stock deducted atomically`}, user);
    return {success: true, message: 'Sale completed', invoiceId: sale.id, total, pdf: {success: false, error: 'Use browser print/export for a PDF.'}};
  });
}

async function deleteSale(client, saleId, user) {
  return withTx(client, async () => {
    const sale = (await client.query('SELECT * FROM pos_sales WHERE id=$1 FOR UPDATE', [saleId])).rows[0];
    if (!sale) return {success: true, skipped: true};
    const adjustments = (await client.query('SELECT id FROM pos_returns WHERE invoice_id=$1 UNION ALL SELECT id FROM pos_exchanges WHERE original_invoice_id=$1 LIMIT 1', [saleId])).rows;
    if (adjustments.length) throw httpError('This invoice has return or exchange history and cannot be deleted.', 409);
    const items = (await client.query('SELECT product_code AS code,qty FROM pos_sale_items WHERE sale_id=$1', [saleId])).rows;
    await applyInventoryDeltas(client, new Map(items.map(item => [item.code, -Number(item.qty)])));
    await client.query('DELETE FROM pos_sales WHERE id=$1', [saleId]);
    await audit(client, {action: 'Sale Deleted', invoiceNumber: saleId, details: 'Inventory restored atomically'}, user);
    return {success: true};
  });
}

async function createOnlineOrder(client, order, user) {
  const customer = order.customer || {};
  const id = order.id || `ORD-${Date.now()}`;
  const orderStatus = order.orderStatus || 'pending';
  if (!['pending', 'shipping', 'delivered'].includes(orderStatus)) throw httpError('A new online order must have a valid active status.');
  return withTx(client, async () => {
    if ((await client.query('SELECT id FROM pos_online_orders WHERE id=$1', [id])).rows[0]) {
      return {success: true, duplicate: true, id};
    }
    const normalized = normalizeLineItems(order.items);
    const products = await applyInventoryDeltas(client, new Map(normalized.map(item => [item.code, item.qty])));
    const items = canonicalItems(normalized, products);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const delivery = Math.max(0, num(order.delivery));
    const discount = Math.max(0, num(order.discount));
    const total = Math.max(0, subtotal + delivery - discount);
    await client.query(
      `INSERT INTO pos_online_orders (id,customer_name,customer_phone,customer_address,city,items_json,subtotal,delivery,discount,total,payment_status,order_status,notes,weight,qty_of_goods,goods_description,inventory_applied,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17)`,
      [id, customer.name || '', customer.phone || '', customer.address || '', order.city || customer.city || '', JSON.stringify(items), subtotal, delivery, discount, total, order.paymentStatus || 'cod', orderStatus, order.notes || '', num(order.weight), items.reduce((s, i) => s + i.qty, 0), items.map(i => `${i.qty} x ${i.name}`).join(', '), order.created_at || new Date().toISOString()]
    );
    await client.query('INSERT INTO pos_user_performance_log (user_id,username,order_id,pieces,amount) VALUES ($1,$2,$3,$4,$5)', [user.id, user.username, id, items.reduce((s, i) => s + i.qty, 0), total]);
    await audit(client, {action: 'Online Order Created', invoiceNumber: id, customerName: customer.name || '', details: `Rs ${total}; stock deducted atomically`}, user);
    return {success: true, id, total};
  });
}

async function updateOnlineOrder(client, order) {
  return withTx(client, async () => {
    const existing = (await client.query('SELECT * FROM pos_online_orders WHERE id=$1 FOR UPDATE', [order.id])).rows[0];
    if (!existing) throw httpError('Online order not found.', 404);
    const normalized = normalizeLineItems(order.items);
    const nextStatus = order.orderStatus || existing.order_status || 'pending';
    if (!['pending', 'shipping', 'delivered', 'return'].includes(nextStatus)) throw httpError('Invalid online order status.');
    const nextApplied = nextStatus !== 'return';
    const previousItems = safeJson(existing.items_json, []);
    await applyInventoryDeltas(client, stockDeltas(normalized, previousItems, existing.inventory_applied, nextApplied));
    const {products} = await getProductMap(client, normalized);
    const items = canonicalItems(normalized, products);
    const customer = order.customer || {};
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const delivery = Math.max(0, num(order.delivery));
    const discount = Math.max(0, num(order.discount));
    const total = Math.max(0, subtotal + delivery - discount);
    await client.query(
      `UPDATE pos_online_orders SET customer_name=$1,customer_phone=$2,customer_address=$3,city=$4,items_json=$5,subtotal=$6,delivery=$7,discount=$8,total=$9,payment_status=$10,order_status=$11,notes=$12,weight=$13,qty_of_goods=$14,goods_description=$15,inventory_applied=$16 WHERE id=$17`,
      [customer.name || '', customer.phone || '', customer.address || '', order.city || customer.city || '', JSON.stringify(items), subtotal, delivery, discount, total, order.paymentStatus || 'cod', nextStatus, order.notes || '', num(order.weight), items.reduce((s, i) => s + i.qty, 0), items.map(i => `${i.qty} x ${i.name}`).join(', '), nextApplied, order.id]
    );
    return {success: true, id: order.id, total};
  });
}

async function updateOnlineOrderStatus(client, id, status, manageTransaction = true) {
  if (!['pending', 'shipping', 'delivered', 'return'].includes(status)) throw httpError('Invalid online order status.');
  const work = async () => {
    const order = (await client.query('SELECT * FROM pos_online_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!order) return {success: true, skipped: true};
    const shouldApply = status !== 'return';
    if (Boolean(order.inventory_applied) !== shouldApply) {
      const items = safeJson(order.items_json, []);
      await applyInventoryDeltas(client, stockDeltas(items, items, order.inventory_applied, shouldApply));
    }
    await client.query('UPDATE pos_online_orders SET order_status=$1,inventory_applied=$2 WHERE id=$3', [status, shouldApply, id]);
    return {success: true};
  };
  return manageTransaction ? withTx(client, work) : work();
}

async function deleteOnlineOrder(client, id) {
  return withTx(client, async () => {
    const order = (await client.query('SELECT * FROM pos_online_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!order) return {success: true, skipped: true};
    if (order.inventory_applied) {
      const items = safeJson(order.items_json, []);
      await applyInventoryDeltas(client, stockDeltas([], items, true, false));
    }
    await client.query('DELETE FROM pos_online_orders WHERE id=$1', [id]);
    return {success: true};
  });
}

async function salesReport(client, start, end) {
  const sales = (await client.query('SELECT * FROM pos_sales WHERE created_at::date BETWEEN $1 AND $2', [dateOnly(start), dateOnly(end)])).rows;
  const items = sales.length ? (await client.query('SELECT * FROM pos_sale_items WHERE sale_id = ANY($1::text[])', [sales.map(s => s.id)])).rows : [];
  const totalRevenue = sales.reduce((s, r) => s + num(r.total), 0);
  const totalDiscount = sales.reduce((s, r) => s + num(r.discount), 0);
  const totalItems = items.reduce((s, i) => s + num(i.qty), 0);
  const byProduct = {};
  for (const item of items) {
    byProduct[item.product_code] ??= {code: item.product_code, name: item.product_name, brand: item.brand || '', qty: 0, times: 0, revenue: 0};
    byProduct[item.product_code].qty += num(item.qty);
    byProduct[item.product_code].times += 1;
    byProduct[item.product_code].revenue += num(item.subtotal);
  }
  return {summary: {totalSales: sales.length, totalRevenue, totalDiscount, totalItems, averageOrderValue: sales.length ? totalRevenue / sales.length : 0}, itemBreakdown: Object.values(byProduct), sales};
}

async function fullReport(client, start, end) {
  const basic = await salesReport(client, start, end);
  const saleIds = basic.sales.map(sale => sale.id);
  const saleItems = saleIds.length ? (await client.query('SELECT * FROM pos_sale_items WHERE sale_id=ANY($1::text[])', [saleIds])).rows : [];
  const offlineSales = basic.sales.filter(sale => String(sale.notes || '').toUpperCase() !== 'WHOLESALE');
  const wholesaleSales = basic.sales.filter(sale => String(sale.notes || '').toUpperCase() === 'WHOLESALE');
  const summarizeSales = sales => {
    const ids = new Set(sales.map(sale => sale.id));
    const items = saleItems.filter(item => ids.has(item.sale_id));
    const totalRevenue = sales.reduce((sum, sale) => sum + num(sale.total), 0);
    return {
      totalSales: sales.length,
      totalRevenue,
      totalDiscount: sales.reduce((sum, sale) => sum + num(sale.discount), 0),
      totalItems: items.reduce((sum, item) => sum + Number(item.qty), 0),
      averageOrderValue: sales.length ? totalRevenue / sales.length : 0
    };
  };
  const transfers = (await client.query('SELECT * FROM pos_stock_transfers WHERE transferred_at::date BETWEEN $1 AND $2 ORDER BY transferred_at DESC', [dateOnly(start), dateOnly(end)])).rows;
  const transferItems = transfers.length ? (await client.query('SELECT * FROM pos_stock_transfer_items WHERE transfer_id=ANY($1::bigint[])', [transfers.map(transfer => transfer.id)])).rows : [];
  const shopBreakdown = Object.values(transferItems.reduce((map, item) => {
    map[item.product_code] ??= {code: item.product_code, name: item.product_name, brand: item.brand, quantity: 0, value: 0};
    map[item.product_code].quantity += Number(item.quantity);
    map[item.product_code].value += Number(item.quantity) * Number(item.reference_price);
    return map;
  }, {}));
  const online = (await client.query('SELECT * FROM pos_online_orders WHERE created_at::date BETWEEN $1 AND $2 ORDER BY created_at DESC', [dateOnly(start), dateOnly(end)])).rows.map(parseItems);
  const simpleReturns = (await client.query('SELECT * FROM pos_online_returns WHERE created_at::date BETWEEN $1 AND $2', [dateOnly(start), dateOnly(end)])).rows;
  const delivered = online.filter(o => o.order_status === 'delivered');
  const returnPieces = simpleReturns.reduce((s, r) => s + num(r.return_pieces), 0);
  const onlineRevenue = delivered.reduce((s, o) => s + num(o.total), 0);
  const returnAmount = simpleReturns.reduce((s, r) => s + num(r.return_amount), 0);
  return {
    adjustments: {summary: {netAdjustment: -returnAmount}},
    period: {startDate: start, endDate: end},
    offline: {sales: offlineSales, saleItems: saleItems.filter(item => offlineSales.some(sale => sale.id === item.sale_id)), summary: summarizeSales(offlineSales), productBreakdown: basic.itemBreakdown},
    wholesale: {sales: wholesaleSales, saleItems: saleItems.filter(item => wholesaleSales.some(sale => sale.id === item.sale_id)), summary: summarizeSales(wholesaleSales), productBreakdown: basic.itemBreakdown.filter(product => saleItems.some(item => wholesaleSales.some(sale => sale.id === item.sale_id) && item.product_code === product.code))},
    shopStock: {transfers, items: transferItems, summary: {totalTransfers: transfers.length, totalShops: new Set(transfers.map(transfer => transfer.destination_location_id)).size, totalProducts: new Set(transferItems.map(item => item.product_code)).size, totalQuantity: transferItems.reduce((sum, item) => sum + Number(item.quantity), 0)}, productBreakdown: shopBreakdown},
    online: {simpleReturns, orders: online, summary: {totalOrders: online.length, totalRevenue: onlineRevenue, totalDiscount: delivered.reduce((s, o) => s + num(o.discount), 0), netOnlineRevenue: onlineRevenue - returnAmount, returnedAmount: returnAmount, paid: online.filter(o => o.payment_status === 'paid').length, cod: online.filter(o => o.payment_status !== 'paid').length, returned: online.filter(o => o.order_status === 'return').length, shipping: online.filter(o => o.order_status === 'shipping').length, delivered: delivered.length, grandTotalPieces: delivered.reduce((s, o) => s + o.items.reduce((t, i) => t + num(i.qty), 0), 0), returnPieces, totalPieces: Math.max(0, delivered.reduce((s, o) => s + o.items.reduce((t, i) => t + num(i.qty), 0), 0) - returnPieces)}, cityBreakdown: []},
    combined: {grossRevenue: basic.summary.totalRevenue + onlineRevenue - returnAmount, netRevenue: basic.summary.totalRevenue + onlineRevenue - returnAmount, totalRevenue: basic.summary.totalRevenue + onlineRevenue - returnAmount, totalDiscount: basic.summary.totalDiscount, totalTransactions: basic.sales.length + online.length}
  };
}

async function userPerformance(client, start, end) {
  const rows = (await client.query(
    `SELECT l.*, o.customer_name, o.city, o.order_status, o.created_at AS order_date
     FROM pos_user_performance_log l LEFT JOIN pos_online_orders o ON l.order_id=o.id
     WHERE l.created_at::date BETWEEN $1 AND $2 ORDER BY l.username,l.created_at`,
    [dateOnly(start), dateOnly(end)]
  )).rows;
  const map = {};
  for (const log of rows) {
    map[log.username] ??= {username: log.username, user_id: log.user_id, deliveredOrders: 0, deliveredSales: 0, deliveredPieces: 0, returnedOrders: 0, returnedAmount: 0, orders: []};
    if (Number(log.is_return)) {
      map[log.username].returnedOrders++;
      map[log.username].returnedAmount += num(log.amount);
    } else {
      map[log.username].deliveredOrders++;
      map[log.username].deliveredSales += num(log.amount);
      map[log.username].deliveredPieces += num(log.pieces);
    }
  }
  return {users: Object.values(map).map(u => ({...u, netSales: u.deliveredSales - u.returnedAmount})), period: {startDate: start, endDate: end}};
}

async function lookupInvoice(client, id) {
  const sale = (await client.query('SELECT * FROM pos_sales WHERE id=$1', [id])).rows[0];
  if (sale) {
    const items = (await client.query('SELECT product_code AS code,product_name AS name,brand,type,qty,price,subtotal FROM pos_sale_items WHERE sale_id=$1 ORDER BY id', [id])).rows;
    return invoiceForAdjustment(client, {...sale, invoiceType: 'offline', items}, id);
  }
  const order = (await client.query('SELECT * FROM pos_online_orders WHERE id=$1', [id])).rows[0];
  if (order) return invoiceForAdjustment(client, {...parseItems(order), invoiceType: 'online'}, id);
  return {success: false, message: 'Invoice not found'};
}

async function invoiceForAdjustment(client, invoice, id) {
  const previousReturns = (await client.query('SELECT items_json FROM pos_returns WHERE invoice_id=$1', [id])).rows.flatMap(row => jsonColumn(row.items_json, []));
  const previousExchanges = (await client.query('SELECT original_items FROM pos_exchanges WHERE original_invoice_id=$1', [id])).rows.flatMap(row => jsonColumn(row.original_items, []));
  const used = new Map();
  for (const item of [...previousReturns, ...previousExchanges]) {
    const key = `${item.itemIndex ?? ''}|${item.code || ''}`;
    used.set(key, (used.get(key) || 0) + Number(item.qty || 0));
  }
  const subtotal = Number(invoice.subtotal || invoice.items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0));
  const discount = Number(invoice.discount || 0);
  const ratio = subtotal > 0 ? Math.max(0, subtotal - discount) / subtotal : 1;
  const items = invoice.items.map((item, itemIndex) => {
    const key = `${itemIndex}|${item.code || item.product_code || ''}`;
    const quantity = Number(item.qty || 0);
    return {
      itemIndex,
      code: item.code || item.product_code,
      name: item.name || item.product_name,
      brand: item.brand || '',
      type: item.type || '',
      qty: quantity,
      price: Number(item.price || 0),
      refundPrice: Math.round(Number(item.price || 0) * ratio * 100) / 100,
      available: Math.max(0, quantity - (used.get(key) || 0))
    };
  });
  return {
    success: true,
    data: {
      ...invoice,
      invoiceType: invoice.invoiceType,
      items,
      remainingAmount: Math.round(items.reduce((sum, item) => sum + item.available * item.refundPrice, 0) * 100) / 100
    }
  };
}

async function processAdjustment(client, data, user, type) {
  return withTx(client, async () => {
    const invoiceId = clean(data?.invoiceId || data?.invoice_id, 120);
    const invoiceType = data?.invoiceType || data?.invoice_type || 'offline';
    if (!invoiceId || !['offline', 'online'].includes(invoiceType)) throw httpError('A valid original invoice is required.');
    const sourceTable = invoiceType === 'online' ? 'pos_online_orders' : 'pos_sales';
    const source = (await client.query(`SELECT id FROM ${sourceTable} WHERE id=$1 FOR UPDATE`, [invoiceId])).rows[0];
    if (!source) throw httpError('Original invoice not found.', 404);
    const lookup = await lookupInvoice(client, invoiceId);
    if (!lookup.success) throw httpError(lookup.message || 'Invoice not found.', 404);
    const invoice = lookup.data;
    const requested = Array.isArray(data.items) ? data.items : [];
    if (!requested.length) throw httpError('Select at least one product.');
    const selected = requested.map(request => {
      const itemIndex = Number(request.itemIndex);
      const item = invoice.items[itemIndex];
      const quantity = positiveInteger(request.qty, 'Return quantity');
      if (!item || quantity > item.available) throw httpError('A selected return quantity exceeds the remaining invoice quantity.');
      return {...item, qty: quantity};
    });
    const duplicateIndexes = new Set();
    for (const item of selected) {
      if (duplicateIndexes.has(item.itemIndex)) throw httpError('The same invoice line cannot be selected twice.');
      duplicateIndexes.add(item.itemIndex);
    }
    const replacementInput = type === 'exchange' ? normalizeLineItems(data.newItems || []) : [];
    const replacementProducts = replacementInput.length ? (await getProductMap(client, replacementInput)).products : new Map();
    const replacements = replacementInput.map(item => {
      const product = replacementProducts.get(item.code);
      return {code: product.code, name: product.name, brand: product.brand || '', type: product.type || '', qty: item.qty, price: Number(product.price)};
    });
    const inventoryChanges = new Map();
    for (const item of selected) inventoryChanges.set(item.code, (inventoryChanges.get(item.code) || 0) - item.qty);
    for (const item of replacements) inventoryChanges.set(item.code, (inventoryChanges.get(item.code) || 0) + item.qty);
    await applyInventoryDeltas(client, inventoryChanges);
    const credit = Math.round(selected.reduce((sum, item) => sum + item.qty * item.refundPrice, 0) * 100) / 100;
    const newAmount = Math.round(replacements.reduce((sum, item) => sum + item.qty * item.price, 0) * 100) / 100;
    const additionalAmount = Math.max(0, Math.round((newAmount - credit) * 100) / 100);
    const refundAmount = Math.max(0, Math.round((credit - newAmount) * 100) / 100);
    const invoiceNumber = `${type === 'exchange' ? 'EX' : 'RT'}-${Date.now()}-${crypto.randomInt(100, 999)}`;
    const receipt = {
      success: true,
      mode: type,
      invoiceNumber,
      originalInvoiceId: invoiceId,
      invoiceType,
      items: selected,
      newItems: replacements,
      credit,
      newAmount,
      additionalAmount,
      refundAmount,
      remainingAmount: Math.max(0, Math.round((invoice.remainingAmount - credit) * 100) / 100),
      reason: clean(data.reason || data.return_reason, 500),
      created_at: new Date().toISOString()
    };
    if (type === 'exchange') {
      const result = await client.query(
        `INSERT INTO pos_exchanges (exchange_number,original_invoice_id,invoice_type,original_items,new_items,original_amount,new_amount,additional_amount,refund_amount,reason,customer_name,customer_phone,user_id,username,receipt_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [invoiceNumber, invoiceId, invoiceType, JSON.stringify(selected), JSON.stringify(replacements), credit, newAmount, additionalAmount, refundAmount, receipt.reason, invoice.customer_name || '', invoice.customer_phone || '', user.id, user.username, JSON.stringify(receipt)]
      );
      await audit(client, {action: 'Exchange Processed', invoiceNumber, customerName: invoice.customer_name || '', details: `Original ${invoiceId}; stock restored/deducted atomically`}, user);
      return {...receipt, id: result.rows[0].id};
    }
    const result = await client.query(
      `INSERT INTO pos_returns (invoice_id,invoice_type,return_type,return_reason,return_qty,items_json,original_items,customer_name,customer_phone,total_amount,refund_amount,user_id,username,receipt_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [invoiceId, invoiceType, selected.length === invoice.items.length && selected.every(item => item.qty === item.available) ? 'full' : 'partial', receipt.reason, selected.reduce((sum, item) => sum + item.qty, 0), JSON.stringify(selected), JSON.stringify(invoice.items), invoice.customer_name || '', invoice.customer_phone || '', credit, refundAmount, user.id, user.username, JSON.stringify(receipt)]
    );
    await audit(client, {action: 'Return Processed', invoiceNumber, customerName: invoice.customer_name || '', details: `Original ${invoiceId}; stock restored atomically`}, user);
    return {...receipt, id: result.rows[0].id};
  });
}

async function audit(client, entry = {}, user) {
  await client.query(
    'INSERT INTO pos_audit_log (timestamp,user_id,username,user_role,system_type,action,invoice_number,customer_name,details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [entry.timestamp || new Date().toISOString(), entry.userId || entry.user_id || user?.id || null, entry.username || user?.username || 'system', entry.userRole || user?.role || 'cashier', entry.systemType || 'Web', entry.action || 'Unknown', entry.invoiceNumber || entry.invoice_number || null, entry.customerName || entry.customer_name || null, entry.details || '']
  );
}

async function getAudit(client, filters) {
  const where = [];
  const params = [];
  if (filters.startDate) { params.push(filters.startDate); where.push(`created_at::date >= $${params.length}`); }
  if (filters.endDate) { params.push(filters.endDate); where.push(`created_at::date <= $${params.length}`); }
  if (filters.username) { params.push(`%${filters.username}%`); where.push(`username ILIKE $${params.length}`); }
  if (filters.action) { params.push(`%${filters.action}%`); where.push(`action ILIKE $${params.length}`); }
  if (filters.systemType) { params.push(filters.systemType); where.push(`system_type = $${params.length}`); }
  return (await client.query(`SELECT * FROM pos_audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 500`, params)).rows;
}

async function shopIssue(client, data, user) {
  return withTx(client, async () => {
    const requestId = clean(data?.requestId, 80);
    if (!requestId) throw httpError('A transfer request ID is required.');
    const duplicate = (await client.query('SELECT id FROM pos_stock_transfers WHERE request_id=$1', [requestId])).rows[0];
    if (duplicate) return {success: true, duplicate: true, id: duplicate.id};
    const person = clean(data?.person, 150);
    const location = clean(data?.location, 150);
    if (!person || !location) throw httpError('Person name and shop/location are required.');
    const transferredAt = new Date(data?.transferredAt);
    if (!Number.isFinite(transferredAt.getTime())) throw httpError('A valid transfer date and time is required.');
    const normalizedItems = normalizeLineItems((data.items || []).map(item => ({code: item.code, qty: Number(item.quantity)})));
    const source = (await client.query("SELECT id FROM pos_stock_locations WHERE kind='warehouse' ORDER BY id LIMIT 1")).rows[0];
    const destination = (await client.query("SELECT id FROM pos_stock_locations WHERE name=$1 AND kind='shop'", [location])).rows[0]
      || (await client.query("INSERT INTO pos_stock_locations (name,kind) VALUES ($1,'shop') ON CONFLICT (name) DO UPDATE SET name=excluded.name RETURNING id", [location])).rows[0];
    const products = await applyInventoryDeltas(client, new Map(normalizedItems.map(item => [item.code, item.qty])));
    const result = await client.query(
      `INSERT INTO pos_stock_transfers (transfer_number,request_id,person_name,source_location_id,destination_location_id,transferred_at,status,posted_at,created_by_user_id,created_by_username)
       VALUES ($1,$2,$3,$4,$5,$6,'posted',now(),$7,$8) RETURNING id`,
      [`ST-${Date.now()}-${crypto.randomInt(100, 999)}`, requestId, person, source?.id || null, destination.id, transferredAt.toISOString(), user.id, user.username]
    );
    for (const item of normalizedItems) {
      const product = products.get(item.code);
      await client.query(
        'INSERT INTO pos_stock_transfer_items (transfer_id,product_code,product_name,brand,category,quantity,reference_price) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [result.rows[0].id, product.code, product.name, product.brand || '', product.category || '', item.qty, num(product.price)]
      );
    }
    await audit(client, {action: 'Shop Stock Issued', invoiceNumber: `ST-${result.rows[0].id}`, details: `${normalizedItems.length} products; inventory deducted atomically`}, user);
    return {success: true, id: result.rows[0].id};
  });
}

async function shopList(client, page = 0) {
  const offset = Math.max(0, Number.parseInt(page, 10) || 0) * 100;
  return (await client.query(
    `SELECT t.*, destination.name AS shop_name, source.name AS source_name,
            count(i.id)::int AS total_products, COALESCE(sum(i.quantity),0)::int AS total_quantity
     FROM pos_stock_transfers t
     LEFT JOIN pos_stock_locations destination ON destination.id=t.destination_location_id
     LEFT JOIN pos_stock_locations source ON source.id=t.source_location_id
     LEFT JOIN pos_stock_transfer_items i ON i.transfer_id=t.id
     GROUP BY t.id,destination.name,source.name
     ORDER BY t.transferred_at DESC LIMIT 100 OFFSET $1`,
    [offset]
  )).rows;
}

async function shopDetails(client, id) {
  const transfer = (await client.query(
    `SELECT t.*, destination.name AS shop_name, source.name AS source_name
     FROM pos_stock_transfers t
     LEFT JOIN pos_stock_locations destination ON destination.id=t.destination_location_id
     LEFT JOIN pos_stock_locations source ON source.id=t.source_location_id
     WHERE t.id=$1`, [id]
  )).rows[0];
  if (!transfer) throw httpError('Shop stock transfer not found.', 404);
  const items = (await client.query('SELECT * FROM pos_stock_transfer_items WHERE transfer_id=$1', [id])).rows;
  return {...transfer, items};
}

export async function POST(req) {
  try {
    if (req.method !== 'POST') return Response.json({ok: false, error: 'Method not allowed'}, {status: 405});
    const body = await req.json();
    const channel = String(body.channel || '');
    const args = Array.isArray(body.args) ? body.args : [];
    const session = verify(body.token);
    let result;
    if (channel.startsWith('platform:admin:')) {
      result = await platformHandler(channel, args, session);
    } else if (channel === 'db:user:authenticate') {
      const company = await findCompany(args[2]);
      const context = {
        companyId: company.id,
        companyName: company.name,
        companySchema: company.schema_name,
        pages: Array.isArray(company.pages_json) ? company.pages_json : safeJson(company.pages_json, COMPANY_PAGES)
      };
      result = await withCompany(company, client => handler(channel, args, context, client));
    } else {
      if (!session) throw httpError('Please sign in again.', 401);
      const company = await findCompany(session.companyId || 'default');
      const activeSession = {
        ...session,
        companyId: company.id,
        companyName: company.name,
        companySchema: company.schema_name,
        pages: Array.isArray(company.pages_json) ? company.pages_json : safeJson(company.pages_json, COMPANY_PAGES)
      };
      assertCompanyPageAccess(activeSession, channel, args);
      result = await withCompany(company, client => handler(channel, args, activeSession, client));
    }
    return Response.json({ok: true, result});
  } catch (error) {
    const status = error.status || (error.code === '23505' ? 409 : 500);
    if (status === 500) console.error(error);
    return Response.json({ok: false, error: status === 500 ? 'Server error.' : error.message}, {status});
  }
}

export {normalizeLineItems, stockDeltas};
