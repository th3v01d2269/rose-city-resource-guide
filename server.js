// server.js — US Community Resource Guide
// FIXED: /api/meta states shape, /api/resources {items}/{pages},
//        /api/ask /api/submit /api/learned, security middleware
require('dotenv').config();
const express     = require('express');
const path        = require('path');
const helmet      = require('helmet');
//const rateLimit   = require('express-rate-limit');
const cors        = require('cors');
const compression = require('compression');
const validator   = require('validator');
const db          = require('./database');

const app = express()
app.set("trust proxy", 1);;
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
// Rate limit disabled for development
app.use(cors({
pi/, rateLimit(/s/^/// DISABLED: /
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : true
}));
app.use('/api/', rateLimit({
pi/, rateLimit(/s/^/// DISABLED: /
    windowMs: 15 * 60 * 1000, max: 300,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests — please try again later' }
}));
app.use(express.json({ limit: '10mb' }));
pi/, rateLimit(/s/^/// DISABLED: /
app.use(express.static(path.join(__dirname, 'public')));
pi/, rateLimit(/s/^/// DISABLED: /

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

// ── DeepSeek API ──────────────────────────────────────────────────
async function callDeepSeek(userMsg, systemPrompt) {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMsg }
            ],
            max_tokens: 2048,
            response_format: { type: 'json_object' }
        })
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
}

// ── Moonshot (Kimi) API ─────────────────────────────────────────────
async function callMoonshot(userMsg, systemPrompt) {
    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`
        },
        body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMsg }
            ],
            max_tokens: 2048,
            temperature: 0.7
        })
    });
    if (!res.ok) throw new Error(`Moonshot API error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
}

// ── Web Search (SerpAPI) ─────────────────────────────────────────────
async function searchWeb(query) {
  if (!process.env.SERPAPI_KEY) return [];
  const url = `https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_KEY}&num=5`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.organic_results || []).map(r => ({
      title: r.title,
      description: r.snippet,
      url: r.link
    }));
  } catch(e) {
    log('WARN', 'Web search failed', { message: e.message });
    return [];
  }
}

// ── API: AI Assistant ──────────────────────────────────────────────────
app.post('/api/ask', async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    }
    const rawQ = req.body.question || '';
    const state = String(req.body.state || '').trim().substring(0, 50);
    const county = String(req.body.county || '').trim().substring(0, 60);
    const question = String(rawQ).trim().substring(0, 500);
    if (!question) return res.status(400).json({ error: 'No question provided' });
    log('INFO', 'AI question received', { q: question.substring(0, 80), state: state || 'any' });

    // 1. Always run local search first — instant, no API needed
    const localAnswer = localSearch(question, state, county);
    const localResults = getTopResources(question, state, county);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const hasAI = anthropicKey || groqKey || process.env.DEEPSEEK_API_KEY || process.env.MOONSHOT_API_KEY;

    if (!hasAI) {
        return res.json({ answer: localAnswer, source: 'local', saved: 0 });
    }

    // 2. Build context from local DB for AI to supplement
    const locCtx = county ? `${county}, ${state}` : (state || 'anywhere in the US');
    const dbSummary = localResults.length
        ? localResults.slice(0,12).map(r =>
            `• ${r.name} (${r.category}${r.county?', '+r.county:''})${r.phone?' — '+r.phone:''}${r.address?' — '+r.address:''}${r.hours?' — '+r.hours:''}`
          ).join('\n')
        : 'No close matches in local database.';

    // 3. Web search (SerpAPI)
    let webResults = [];
    if (process.env.SERPAPI_KEY) {
        try {
            webResults = await searchWeb(question);
            if (webResults.length) {
                log('INFO', 'Web search found results', { count: webResults.length });
            }
        } catch(e) { log('WARN', 'Web search failed', { message: e.message }); }
    }
    const webSummary = webResults.length
        ? '\n\nWeb search results:\n' + webResults.map(r => `- ${r.title}: ${r.description}\n  ${r.url}`).join('\n')
        : '';

    const SYSTEM_PROMPT = `You are a compassionate social services navigator helping find FREE community resources in the US.

Your response MUST be in this exact JSON format:
{
  "answer": "Your warm, practical response with specific resources, phone numbers, addresses. Use \n for line breaks. Lead with 988/211/911 if crisis detected.",
  "new_resources": [
    {
      "name": "Program Name",
      "phone": "555-555-5555",
      "address": "123 Main St, City ST 12345",
      "description": "What they offer and who they serve",
      "hours": "M-F 9am-5pm",
      "website": "example.org",
      "state": "Oregon",
      "county": "Multnomah County",
      "category": "Food & Groceries",
      "req": ["Eligibility requirement 1"]
    }
  ]
}

Valid categories: Food & Groceries, Meals, Shelter, Housing, Health Care, Mental Health & Recovery, Legal Services, Employment & Job Training, Benefits & Financial Aid, Clothing, Day Services/Hygiene, Domestic Violence & Sexual Assault, Youth Services, Veteran Services, Immigration, Reentry Resources, Transportation, Harm Reduction, Pet Care, Family & Parenting, Disability & Aging, Rental Assistance, STI & HIV Services, Libraries, Government Services, Safe Parking

In new_resources include ONLY real verified programs NOT already in the local database. If no new programs, use [].
Be warm, specific, mobile-friendly. Include phone numbers and addresses when known.`;

    const USER_MSG = `Location: ${locCtx}\nQuestion: ${question}\n\nAlready in local database:\n${dbSummary}\n\nProvide your answer AND any real programs not listed above.${webSummary}`;

    let aiAnswer = null;
    let source = '';
    let savedCount = 0;

    if (process.env.DEEPSEEK_API_KEY) {
        try {
            const raw = await callDeepSeek(USER_MSG, SYSTEM_PROMPT);
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const p = JSON.parse(m[0]);
                aiAnswer = p.answer;
                if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
                source = 'deepseek';
            } else {
                aiAnswer = raw;
                source = 'deepseek';
            }
        } catch(e) { log('WARN','DeepSeek fail',{message:e.message}); }
    }

    if (!aiAnswer && process.env.MOONSHOT_API_KEY) {
        try {
            const raw = await callMoonshot(USER_MSG, SYSTEM_PROMPT);
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const p = JSON.parse(m[0]);
                aiAnswer = p.answer;
                if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
                source = 'moonshot';
            } else {
                aiAnswer = raw;
                source = 'moonshot';
            }
        } catch(e) { log('WARN','Moonshot fail',{message:e.message}); }
    }

    if (!aiAnswer && groqKey) {
        try {
            const raw = await callGroq(USER_MSG, SYSTEM_PROMPT);
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const p = JSON.parse(m[0]);
                aiAnswer = p.answer;
                if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
                source = 'groq';
            } else {
                aiAnswer = raw;
                source = 'groq';
            }
        } catch(e) { log('WARN','Groq failed',{message:e.message}); }
    }

    if (!aiAnswer && anthropicKey) {
        try {
            const raw = await callAnthropic(USER_MSG, SYSTEM_PROMPT);
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const p = JSON.parse(m[0]);
                aiAnswer = p.answer;
                if (Array.isArray(p.new_resources) && p.new_resources.length) savedCount = saveNewResources(p.new_resources);
                source = 'claude';
            } else {
                aiAnswer = raw;
                source = 'claude';
            }
        } catch(e) { log('WARN','Anthropic failed',{message:e.message}); }
    }

    if (!aiAnswer) {
        aiAnswer = localAnswer;
        source = 'local';
    }

    res.json({ answer: aiAnswer, source, saved: savedCount });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
