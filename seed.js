// seed.js - import resources.json into PostgreSQL
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seed() {
    try {
        // Create table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT,
                address TEXT,
                description TEXT,
                hours TEXT,
                website TEXT,
                state TEXT,
                county TEXT,
                category TEXT,
                req TEXT
            )
        `);
        console.log('✅ Table ensured.');

        const countRes = await pool.query('SELECT COUNT(*) as count FROM resources');
        if (parseInt(countRes.rows[0].count) > 0) {
            console.log('⚠️ Database already has data. Skipping seed.');
            return;
        }

        const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'resources.json'), 'utf8'));
        for (const r of seedData) {
            await pool.query(
                `INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    r.name,
                    r.phone || null,
                    r.address || null,
                    r.description || null,
                    r.hours || null,
                    r.website || null,
                    r.state || null,
                    r.county || null,
                    r.category || null,
                    JSON.stringify(r.req || [])
                ]
            );
        }
        console.log(`✅ Seeded database with ${seedData.length} resources.`);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        await pool.end();
    }
}

seed();
