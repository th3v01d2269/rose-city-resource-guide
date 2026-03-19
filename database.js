// database.js - PostgreSQL version
const { Pool } = require('pg');

let pool;

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    process.exit(1);
}

pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render PostgreSQL
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Connected to PostgreSQL at', res.rows[0].now);
    }
});

module.exports = pool;
