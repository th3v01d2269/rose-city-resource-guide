// server.js — US Community Resource Guide
// FIXED: /api/meta states shape, /api/resources {items}/{pages},
//        /api/ask /api/submit /api/learned, security middleware
require('dotenv').config();
const express     = require('express');
const path        = require('path');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const cors        = require('cors');
const compression = require('compression');
const validator   = require('validator');
const db          = require('./database');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Security & middleware ────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:    ["'self'", "https://fonts.gstatic.com"],
            scriptSrc:  ["'self'", "'unsafe-inline'"],
            imgSrc:     ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'",
                "https://nominatim.openstreetmap.org",
                "https://*.tile.openstreetmap.org",
                "https://api.groq.com",
                "https://api.anthropic.com"],
            workerSrc:  ["'self'", "blob:"],
        },
    },
}));
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : true
}));
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, max: 300,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests — please try again later' }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ah = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ── GET /api/meta ────────────────────────────────────────────
// Returns states as [{name, counties:[]}] — matches app.js populateCounties()
app.get('/api/meta', ah(async (req, res) => {
    const totalRes = await db.query('SELECT COUNT(*) as total FROM resources');
    const total    = parseInt(totalRes.rows[0].total);

    const catsRes = await db.query(
        'SELECT DISTINCT category FROM resources WHERE category IS NOT NULL ORDER BY category'
    );
    const categories = catsRes.rows.map(r => ({ name: r.category }));

    const statesRes = await db.query(
        'SELECT DISTINCT state FROM resources WHERE state IS NOT NULL ORDER BY state'
    );
    const states = [];
    for (const row of statesRes.rows) {
        const countyRes = await db.query(
            `SELECT DISTINCT county FROM resources
             WHERE state=$1 AND county IS NOT NULL ORDER BY county`,
            [row.state]
        );
        states.push({
            name: row.state,
            counties: countyRes.rows.map(r => r.county)
        });
    }
    res.json({ total, states, categories });
}));

// ── GET /api/resources ───────────────────────────────────────
// Returns {total, page, pages, limit, items} — app.js uses data.items + data.pages
app.get('/api/resources', ah(async (req, res) => {
    const { q, state, county, category, page = 1, limit = 24 } = req.query;
    let sql = 'SELECT * FROM resources WHERE 1=1';
    const params = []; let idx = 1;

    if (q) {
        sql += ` AND (name ILIKE $${idx} OR description ILIKE $${idx}
                  OR address ILIKE $${idx} OR phone ILIKE $${idx})`;
        params.push(`%${q}%`); idx++;
    }
    if (state)    { sql += ` AND state=$${idx}`;    params.push(state);    idx++; }
    if (county)   { sql += ` AND county=$${idx}`;   params.push(county);   idx++; }
    if (category) { sql += ` AND category=$${idx}`; params.push(category); idx++; }

    const countRes  = await db.query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
    const total     = parseInt(countRes.rows[0].total);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 24));
    const safePage  = Math.max(1, parseInt(page) || 1);
    const pages     = Math.ceil(total / safeLimit) || 1;
    const offset    = (safePage - 1) * safeLimit;

    sql += ` ORDER BY name LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(safeLimit, offset);

    const result = await db.query(sql, params);
    const items  = result.rows.map(r => ({
        ...r,
        req: r.req ? (typeof r.req === 'string' ? JSON.parse(r.req) : r.req) : []
    }));

    // items = what app.js expects; results = backward compat
    res.json({ total, page: safePage, pages, limit: safeLimit, items, results: items });
}));

// ── GET /api/resources/:id ───────────────────────────────────
app.get('/api/resources/:id', ah(async (req, res) => {
    const result = await db.query('SELECT * FROM resources WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Resource not found' });
    const row = result.rows[0];
    row.req = row.req ? (typeof row.req === 'string' ? JSON.parse(row.req) : row.req) : [];
    res.json(row);
}));

// ── POST /api/resources ──────────────────────────────────────
app.post('/api/resources', ah(async (req, res) => {
    const { name, phone, address, description, hours, website,
            state, county, category, req: reqs } = req.body;
    if (!name || !category)
        return res.status(400).json({ error: 'Name and category required' });
    const result = await db.query(
        `INSERT INTO resources
         (name,phone,address,description,hours,website,state,county,category,req)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [name, phone||null, address||null, description||null, hours||null,
         website||null, state||null, county||null, category, JSON.stringify(reqs||[])]
    );
    res.status(201).json({ message: 'Resource added', id: result.rows[0].id });
}));

// ── POST /api/submit ─────────────────────────────────────────
app.post('/api/submit', ah(async (req, res) => {
    const { name, category, description, state, county, phone,
            website, address, hours, req: reqs, source, active } = req.body;
    if (!name || !category || !state)
        return res.status(400).json({ error: 'Name, category, and state required' });

    const cleanName = validator.escape(name.trim());
    const cleanDesc = description ? validator.escape(description.trim()) : null;

    await db.query(`CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY, name TEXT, category TEXT, description TEXT,
        state TEXT, county TEXT, phone TEXT, website TEXT, address TEXT,
        hours TEXT, req TEXT, source TEXT, active TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved BOOLEAN DEFAULT false
    )`).catch(() => {});

    try {
        await db.query(
            `INSERT INTO submissions
             (name,category,description,state,county,phone,website,address,hours,req,source,active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [cleanName, category, cleanDesc, state, county||null, phone||null,
             website||null, address||null, hours||null,
             JSON.stringify(reqs||[]), source||null, active||null]
        );
    } catch(e) {
        await db.query(
            `INSERT INTO resources
             (name,phone,address,description,hours,website,state,county,category,req)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [cleanName, phone||null, address||null, cleanDesc, hours||null,
             website||null, state||null, county||null, category, JSON.stringify(reqs||[])]
        );
    }
    res.json({ ok: true, message: 'Submission received — thank you!' });
}));

// ── GET /api/learned ─────────────────────────────────────────
app.get('/api/learned', ah(async (req, res) => {
    const totalRes = await db.query('SELECT COUNT(*) as total FROM resources');
    const total = parseInt(totalRes.rows[0].total);
    let learned = 0;
    try {
        const r = await db.query("SELECT COUNT(*) as c FROM resources WHERE source='ai'");
        learned = parseInt(r.rows[0].c);
    } catch(e) { /* source column may not exist yet */ }
    res.json({ total, learned });
}));

// ── POST /api/ask ────────────────────────────────────────────
// AI chat: local DB first → Groq → Claude → fallback
app.post('/api/ask', rateLimit({ windowMs: 60000, max: 25 }), ah(async (req, res) => {
    const { question, state, county } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question required' });

    const q = question.trim().substring(0, 300);

    // 1. Local DB search (free, instant)
    const params = [`%${q}%`]; let idx = 2;
    let sql = `SELECT * FROM resources
               WHERE (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)`;
    if (state)  { sql += ` AND state=$${idx}`;  params.push(state);  idx++; }
    if (county) { sql += ` AND county=$${idx}`; params.push(county); idx++; }
    sql += ' ORDER BY name LIMIT 5';

    const local = await db.query(sql, params);
    if (local.rows.length > 0) {
        const answer = local.rows.map((r, i) =>
            `${i+1}. ${r.name}` +
            (r.phone   ? ` — ${r.phone}` : '') +
            (r.address ? `\n   📍 ${r.address}` : '') +
            (r.hours   ? `\n   🕐 ${r.hours}` : '') +
            (r.website ? `\n   🌐 ${r.website.startsWith('http') ? r.website : 'https://'+r.website}` : '')
        ).join('\n\n');
        return res.json({ answer, source: 'local', saved: 0 });
    }

    // 2. Groq — free llama3 (fast)
    if (process.env.GROQ_API_KEY) {
        try {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama3-8b-8192',
                    messages: [
                        { role: 'system', content: 'You are a social services assistant. Give brief, specific answers about free community resources. Include phone numbers when known. Use numbered list format.' },
                        { role: 'user', content: `Free resources for: "${q}"${state ? ' in ' + state : ''}${county ? ', ' + county : ''}. Under 150 words.` }
                    ],
                    max_tokens: 250
                })
            });
            const data = await groqRes.json();
            const answer = data.choices?.[0]?.message?.content
                || 'No results. Try calling 211 or visiting 211.org.';
            return res.json({ answer, source: 'ai', saved: 0 });
        } catch(e) { console.error('Groq error:', e.message); }
    }

    // 3. Claude — Anthropic fallback
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 300,
                    messages: [{
                        role: 'user',
                        content: `Free community resources for: "${q}"${state ? ' in ' + state : ''}${county ? ', ' + county : ''}. List specific orgs with phone numbers. Under 150 words.`
                    }]
                })
            });
            const data = await claudeRes.json();
            const answer = data.content?.[0]?.text
                || 'No results. Try calling 211 or visiting 211.org.';
            return res.json({ answer, source: 'ai', saved: 0 });
        } catch(e) { console.error('Claude error:', e.message); }
    }

    // 4. Plain fallback
    res.json({
        answer: `No results for "${q}"${state ? ' in ' + state : ''}.\n\n• Call 211 (free local resource hotline)\n• Visit 211.org\n• Search 988 for mental health crisis`,
        source: 'local', saved: 0
    });
}));

// ── GET /health ──────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        const r = await db.query('SELECT COUNT(*) as total FROM resources');
        res.json({ status: 'healthy', resources: parseInt(r.rows[0].total), ts: new Date().toISOString() });
    } catch(err) {
        res.status(503).json({ status: 'unhealthy', error: err.message });
    }
});

// ── Catch-all → index.html ───────────────────────────────────
app.get('*', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({
        error: IS_PROD ? 'Internal server error' : err.message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌹 Server running on port ${PORT}`));
