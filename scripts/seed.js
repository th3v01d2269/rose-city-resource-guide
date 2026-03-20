require('dotenv').config();
const { Pool } = require('pg'), fs = require('fs'), path = require('path');
const isLocal = (process.env.DATABASE_URL || '').includes('localhost');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});
const FORCE = process.argv.includes('--force');
(async () => {
    console.log('\n📦 Seeding...\n');
    try {
        const candidates = [
            './data/resources.json', './resources.json',
            path.join(__dirname, '../data/resources.json'),
        ];
        let dataFile;
        for (const p of candidates) { if (fs.existsSync(p)) { dataFile = p; break; } }
        if (!dataFile) {
            console.log('ℹ️  No resources.json found — DB stays empty. Add data/resources.json to seed.');
            await pool.end(); return;
        }
        const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        console.log(`  📊 ${raw.length} records in ${path.basename(dataFile)}`);
        const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM resources');
        if (parseInt(count) > 0 && !FORCE) {
            console.log(`  ⚡  Already has ${count} records. Use --force to reseed.`);
            await pool.end(); return;
        }
        if (FORCE && parseInt(count) > 0) {
            await pool.query('TRUNCATE resources RESTART IDENTITY');
            console.log('  🗑️   Cleared');
        }
        let ins = 0, skip = 0;
        for (const r of raw) {
            if (!r.name?.trim() || !r.category) { skip++; continue; }
            try {
                await pool.query(
                    `INSERT INTO resources (name,phone,address,description,hours,website,state,county,category,req)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                    [r.name.trim(), r.phone||null, r.address||null, r.description||null,
                     r.hours||null, r.website||null, r.state||null, r.county||null,
                     r.category, JSON.stringify(Array.isArray(r.req) ? r.req : [])]
                );
                ins++;
            } catch(e) { skip++; }
            if (ins % 100 === 0 && ins > 0) process.stdout.write(`\r  🔄 ${ins}...`);
        }
        const final = (await pool.query('SELECT COUNT(*) FROM resources')).rows[0].count;
        console.log(`\n  ✅ Inserted:${ins} Skipped:${skip} Total:${final}\n`);
    } catch(e) { console.error('❌', e.message); process.exit(1); }
    finally { await pool.end(); }
})();
