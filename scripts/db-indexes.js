require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrations = [
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `CREATE INDEX IF NOT EXISTS idx_resources_state    ON resources(state)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_county   ON resources(county)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_name     ON resources(name)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_created  ON resources(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_fts ON resources USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')))`,
    `CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql'`,
    `DROP TRIGGER IF EXISTS update_resources_updated_at ON resources`,
    `CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`,
];

(async () => {
    console.log('\n🔧  Applying database migrations...\n');
    let ok = 0, fail = 0;
    for (const sql of migrations) {
        const label = sql.trim().substring(0, 60);
        try {
            await pool.query(sql);
            console.log(`  ✅  ${label}`);
            ok++;
        } catch (err) {
            console.error(`  ❌  ${label}\n      ${err.message}`);
            fail++;
        }
    }
    console.log(`\n── Result: ${ok} applied, ${fail} failed ──\n`);
    await pool.end();
    process.exit(fail > 0 ? 1 : 0);
})();
