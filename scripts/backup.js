require('dotenv').config();
const { Pool } = require('pg'), fs = require('fs'), path = require('path');
const isLocal = (process.env.DATABASE_URL || '').includes('localhost');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});
(async () => {
    try {
        const rows = (await pool.query('SELECT * FROM resources ORDER BY id')).rows
            .map(r => ({ ...r, req: r.req ? (typeof r.req==='string' ? JSON.parse(r.req) : r.req) : [] }));
        const dir = path.join(__dirname, '..', 'backups');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
        fs.writeFileSync(file, JSON.stringify(rows, null, 2));
        console.log(`✅ ${rows.length} resources → ${file}`);
    } catch(e) { console.error('❌', e.message); process.exit(1); }
    finally { await pool.end(); }
})();
