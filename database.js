// database.js — PostgreSQL connection pool
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set — check .env');
}

const isLocal = (process.env.DATABASE_URL || '').includes('localhost');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', err => console.error('DB pool error:', err.message));

pool.query('SELECT NOW()')
    .then(r => console.log('✅ PostgreSQL connected at', r.rows[0].now))
    .catch(err => console.error('❌ DB connection failed:', err.message));

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool,
};
