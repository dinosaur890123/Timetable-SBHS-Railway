const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool;
let schemaEnsured = false;
let schemaEnsurePromise;

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

function shouldUseSsl(connectionString) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (!connectionString) return false;
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function getPool() {
  if (pool) return pool;

  const connectionString = getConnectionString();
  if (!connectionString) return null;

  const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined;
  const max = Number.parseInt(process.env.PGPOOL_MAX || '5', 10);

  pool = new Pool({
    connectionString,
    ssl,
    max: Number.isFinite(max) ? max : 5,
    connectionTimeoutMillis: Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '10000', 10),
    idleTimeoutMillis: 30000,
    statement_timeout: Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '15000', 10),
  });

  pool.on('error', (err) => {
    console.error('[db] Idle client error:', err?.message || err);
  });

  return pool;
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;

  const activePool = getPool();
  if (!activePool) {
    schemaEnsured = true;
    return;
  }

  schemaEnsurePromise = (async () => {
    const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    try {
      await activePool.query(sql);
    } catch (err) {
      schemaEnsurePromise = undefined;
      throw err;
    }

    schemaEnsured = true;
  })();

  return schemaEnsurePromise;
}

async function query(text, params) {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Postgres is not configured (missing POSTGRES_URL/DATABASE_URL)');
  }
  await ensureSchema();
  return activePool.query(text, params);
}

async function withTransaction(fn) {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('Postgres is not configured (missing POSTGRES_URL/DATABASE_URL)');
  }
  await ensureSchema();
  const client = await activePool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

function hasDb() {
  return Boolean(getConnectionString());
}

module.exports = {
  hasDb,
  ensureSchema,
  query,
  withTransaction,
  close,
};
