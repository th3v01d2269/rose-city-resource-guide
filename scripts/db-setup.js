require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs'), path = require('path');
const isLocal = (process.env.DATABASE_URL || '').includes('localhost');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});
(async () => {
    console.log('\n🔧 Setting up database...\n');
    try {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
        const stmts = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
        for (const stmt of stmts) {
            try {
                await pool.query(stmt);
                console.log(`  ✅  ${stmt.substring(0, 60).replace(/\n/g, ' ')}`);
            } catch(e) {
                console.log(`  ⚠️   ${e.message.substring(0, 80)}`);
            }
        }
        console.log('\n✅ Schema ready\n');
    } catch(e) { console.error('❌', e.message); process.exit(1); }
    finally { await pool.end(); }
})();
