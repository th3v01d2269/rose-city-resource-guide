/*
 * US Community Resource Guide
 * Copyright (c) 2026 th3v01d2269
 * Licensed under CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
 * Commercial use requires written permission: th3v01d2269@gmail.com
 * https://rose-city-resource-guide.onrender.com
 */
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Logger ─────────────────────────────────────────────────────────────
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function log(level, msg, meta) {
  if (LOG_LEVELS[level] > LOG_LEVEL) return;
  const icons = { ERROR: '🔴', WARN: '🟡', INFO: '🟢', DEBUG: '🔵' };
  const line = meta
    ? `[${ts()}] ${icons[level]} ${level.padEnd(5)} ${msg} ${JSON.stringify(meta)}`
    : `[${ts()}] ${icons[level]} ${level.padEnd(5)} ${msg}`;
  if (level === 'ERROR' || level === 'WARN') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// Catch any unhandled promise rejections or exceptions
process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception — server may be unstable', { message: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled promise rejection', { reason: String(reason) });
});

// ── Security headers ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Allow geolocation API from our own pages; block camera/mic/payment
  res.setHeader('Permissions-Policy',
    'geolocation=(self), camera=(), microphone=(), payment=()'
  );
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://maps.wikimedia.org",
    "frame-src 'self' https://www.openstreetmap.org",
    "connect-src 'self' https://api.anthropic.com https://api.groq.com https://nominatim.openstreetmap.org https://tile.openstreetmap.org https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org",
  ].join('; '));
  next();
});

app.use(compression());
app.use(express.json());

// ── Request logger ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR'
      : res.statusCode >= 400 ? 'WARN'
      : 'INFO';
    // Skip logging static assets (css, js, fonts) to reduce noise
    const isAsset = /\.(css|js|woff2?|ttf|png|ico|svg)$/i.test(req.path);
    if (!isAsset) {
      log(level, `${req.method} ${req.path}`, {
        status: res.statusCode,
        ms,
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '-',
      });
    }
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

// ── Load resources ─────────────────────────────────────────────────────
const resources = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'resources.json'), 'utf8')
);

const searchIndex = resources.map((r, i) => ({
  i,
  t: [r.name, r.description, r.address, r.category, r.county, r.state, r.phone, r.hours]
    .join(' ').toLowerCase()
}));

function buildMeta() {
  const stateMap = {}, catMap = {};
  for (const r of resources) {
    const s = r.state || 'Unknown';
    if (!stateMap[s]) stateMap[s] = new Set();
    stateMap[s].add(r.county || 'Unknown');
    catMap[r.category || 'Unknown'] = (catMap[r.category || 'Unknown'] || 0) + 1;
  }
  return {
    total: resources.length,
    states: Object.entries(stateMap)
      .sort(([a], [b]) => a === 'National' ? -1 : b === 'National' ? 1 : a.localeCompare(b))
      .map(([name, coSet]) => ({
        name,
        count: resources.filter(r => r.state === name).length,
        counties: [...coSet].sort((a, b) =>
          (a === 'National' || a === 'Statewide') ? -1 :
          (b === 'National' || b === 'Statewide') ? 1 : a.localeCompare(b))
      })),
    categories: Object.entries(catMap)
      .sort(([a], [b]) => {
        // Pin Safe Parking to top of list
        if (a === 'Safe Parking') return -1;
        if (b === 'Safe Parking') return 1;
        return a.localeCompare(b);
      })
      .map(([name, count]) => ({ name, count }))
  };
}

const META = buildMeta();

// ── API: Meta ──────────────────────────────────────────────────────────
app.get('/api/meta', (req, res) => res.json(META));

// ── API: Resources ─────────────────────────────────────────────────────
app.get('/api/resources', (req, res) => {
  const { q = '', state = '', county = '', category = '', page = '1', limit = '24' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  let indices = searchIndex.map(s => s.i);
  if (q.trim()) {
    const terms = q.trim().toLowerCase().split(/\s+/);
    const matched = new Set(searchIndex.filter(s => terms.every(t => s.t.includes(t))).map(s => s.i));
    indices = indices.filter(i => matched.has(i));
  }
  if (state) indices = indices.filter(i => resources[i].state === state);
  if (county) indices = indices.filter(i => {
    const co = resources[i].county;
    // Always include Statewide and National resources regardless of county filter
    return co === county || co === 'Statewide' || co === 'National';
  });
  if (category) indices = indices.filter(i => resources[i].category === category);
  const total = indices.length;
  const start = (pageNum - 1) * limitNum;
  const items = indices.slice(start, start + limitNum).map(i => resources[i]);
  res.json({ total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1, items });
});

app.get('/api/resources/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= resources.length)
    return res.status(404).json({ error: 'Not found' });
  res.json({ ...resources[idx], index: idx });
});

// ── API: Safe Parking ──────────────────────────────────────────────────
// Known networks that generally allow overnight vehicle dwelling
const PARKING_NETWORKS = [
  { name: 'Walmart Supercenter', type: 'retail', policy: 'Many locations allow overnight parking — always ask the manager first. 24-hour locations preferred.', icon: '🛒' },
  { name: 'Cracker Barrel', type: 'restaurant', policy: 'Officially RV-friendly overnight. Ask manager for permission.', icon: '🏠' },
  { name: 'Cabela\'s', type: 'retail', policy: 'Most locations welcome overnight parking. Ask staff.', icon: '🏕️' },
  { name: 'Bass Pro Shops', type: 'retail', policy: 'Most locations allow overnight. Check with store first.', icon: '🎣' },
  { name: 'Truck Stop', type: 'fuel', policy: 'Generally open 24/7 with overnight parking areas.', icon: '🚛' },
  { name: 'Rest Area', type: 'rest_stop', policy: 'Legal overnight parking (time limits vary by state — usually 8-10 hours).', icon: '😴' },
  { name: 'Church', type: 'church', policy: 'Many churches offer safe parking programs for people living in vehicles. Call ahead.', icon: '⛪' },
  { name: 'Casino', type: 'casino', policy: 'Many tribal casinos allow free overnight parking.', icon: '🎰' },
  { name: 'Hospital', type: 'hospital', policy: 'Some hospitals have 24-hour lots — ask security.', icon: '🏥' },
  { name: '24 Hour Fitness', type: 'gym', policy: '24-hour gyms often have overnight parking and shower access.', icon: '💪' },
];

app.get('/api/parking-networks', (req, res) => res.json(PARKING_NETWORKS));

// ── API: Learned resources count ─────────────────────────────────────
app.get('/api/learned', (req, res) => {
  const learned = resources.filter(r => r.source === 'ai_discovered');
  res.json({
    total: resources.length,
    learned: learned.length,
    recent: learned.slice(-5).map(r => ({
      name: r.name,
      category: r.category,
      state: r.state,
      added: r.added
    }))
  });
});

// ── API: AI Assistant ──────────────────────────────────────────────────
app.post('/api/ask', async (req, res) => {
  const { question, state, county } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });
  log('INFO', 'AI question received', { q: question.substring(0, 80), state: state || 'any' });

  // 1. Always run local search first — instant, no API needed
  const localAnswer = localSearch(question, state, county);
  const localResults = getTopResources(question, state, county);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const hasAI = anthropicKey || groqKey;

  // No AI key → return local results only
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

  const SYSTEM_PROMPT = `You are a compassionate social services navigator helping find FREE community resources in the US.

Your response MUST be in this exact JSON format:
{
  "answer": "Your warm, practical response with specific resources, phone numbers, addresses. Use \\n for line breaks. Lead with 988/211/911 if crisis detected.",
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

  const USER_MSG = `Location: ${locCtx}\nQuestion: ${question}\n\nAlready in local database:\n${dbSummary}\n\nProvide your answer AND any real programs not listed above.`;

  try {
    let rawText = '';

    if (groqKey) {
      // Groq — fast, free tier available
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2048,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: USER_MSG }
          ],
          response_format: { type: 'json_object' }
        })
      });
      if (!groqRes.ok) {
        const err = await groqRes.text();
        log('ERROR', 'Groq API error', { response: err.substring(0, 200) });
        throw new Error('Groq API error ' + groqRes.status);
      }
      const groqData = await groqRes.json();
      rawText = groqData.choices?.[0]?.message?.content || '';
      log('INFO', 'Groq AI response OK');
    } else if (anthropicKey) {
      // Anthropic Claude fallback
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: USER_MSG }]
        })
      });
      if (!anthropicRes.ok) throw new Error('Anthropic API error ' + anthropicRes.status);
      const anthropicData = await anthropicRes.json();
      rawText = anthropicData.content?.[0]?.text || '';
      log('INFO', 'Anthropic AI response OK');
    }

    // 3. Parse AI response
    let answer = localAnswer;
    let savedCount = 0;

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        answer = parsed.answer || localAnswer;

        // 4. Save new resources to database
        if (Array.isArray(parsed.new_resources) && parsed.new_resources.length > 0) {
          savedCount = saveNewResources(parsed.new_resources);
        }
      } else {
        answer = rawText; // AI returned plain text, use as-is
      }
    } catch (parseErr) {
      answer = rawText; // Parsing failed, use raw text
    }

    res.json({ answer, source: 'ai', saved: savedCount });

  } catch (e) {
    log('ERROR', 'AI request failed', { message: e.message });
    res.json({ answer: localAnswer, source: 'local', saved: 0 });
  }
});

// ── Save new resources discovered by AI ─────────────────────────────
const VALID_CATS = new Set([
  'Food & Groceries','Meals','Shelter','Housing','Health Care','Mental Health & Recovery',
  'Legal Services','Employment & Job Training','Benefits & Financial Aid','Clothing',
  'Day Services/Hygiene','Domestic Violence & Sexual Assault','Youth Services',
  'Veteran Services','Immigration','Reentry Resources','Transportation','Harm Reduction',
  'Pet Care','Family & Parenting','Disability & Aging','Rental Assistance',
  'STI & HIV Services','Libraries','Government Services',
  'Safe Parking'
]);

function saveNewResources(newOnes) {
  let saved = 0;
  const existingNames = new Set(resources.map(r => r.name.toLowerCase().trim()));

  for (const r of newOnes) {
    if (!r.name || !r.category) continue;
    if (!VALID_CATS.has(r.category)) continue;
    if (existingNames.has(r.name.toLowerCase().trim())) continue;

    const entry = {
      name: String(r.name).trim(),
      phone: String(r.phone || '').trim(),
      address: String(r.address || '').trim(),
      description: String(r.description || '').trim(),
      hours: String(r.hours || '').trim(),
      website: String(r.website || '').trim(),
      state: String(r.state || 'National').trim(),
      county: String(r.county || 'Statewide').trim(),
      category: r.category,
      req: Array.isArray(r.req) ? r.req : [],
      source: 'ai_discovered',
      added: new Date().toISOString()
    };

    resources.push(entry);
    searchIndex.push({
      i: resources.length - 1,
      t: [entry.name, entry.description, entry.address, entry.category, entry.county, entry.state, entry.phone]
        .join(' ').toLowerCase()
    });
    existingNames.add(entry.name.toLowerCase().trim());
    saved++;

    log('INFO', `AI discovered new resource: ${entry.name}`, { category: entry.category, state: entry.state });
  }

  if (saved > 0) {
    // Persist to disk asynchronously
    const dataPath = path.join(__dirname, 'data', 'resources.json');
    fs.writeFile(dataPath, JSON.stringify(resources, null, 2), err => {
      if (err) log('ERROR', 'Failed to save learned resources to disk', { message: err.message });
      else log('INFO', `Saved ${saved} AI-learned resource(s) to DB`, { total: resources.length });
    });
    // Rebuild META counts
    Object.assign(META, buildMeta());
  }

  return saved;
}

// ── Get top scored resources for AI context ──────────────────────────
function getTopResources(question, state, county) {
  const pool = state
    ? resources.filter(r => r.state === state || r.state === 'National')
    : resources;
  const terms = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return pool
    .map(r => {
      const text = (r.name+' '+r.description+' '+r.category+' '+(r.county||'')).toLowerCase();
      return { r, score: terms.filter(t => text.includes(t)).length };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(x => x.r);
}

// ── Smart local search (no API key needed) ────────────────────────────
function localSearch(question, state, county) {
  const q = question.toLowerCase();

  // Crisis detection — always first
  const crisisWords = ['suicide', 'kill myself', 'end my life', 'overdose', 'dying', 'crisis', 'emergency', 'danger', 'hurt myself', 'abuse'];
  if (crisisWords.some(w => q.includes(w))) {
    return '🆘 If you are in immediate danger, call 911.\n\nCrisis support:\n• 988 Suicide & Crisis Lifeline — call or text 988\n• Crisis Text Line — text HOME to 741741\n• Domestic Violence Hotline — 1-800-799-7233\n\nYou are not alone. Help is available 24/7.';
  }

  // Determine location filter
  const pool = state
    ? resources.filter(r => r.state === state || r.state === 'National')
    : resources;

  // Extract key terms
  const stopWords = new Set(['need','help','find','where','can','get','near','free','please','want','looking','for','the','and','with','have','that','this','are','not','but','they','what','how','who','when']);
  const terms = q.split(/\s+/)
    .map(w => w.replace(/[^a-z]/g,''))
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Category keyword mapping
  const catMap = {
    'Food & Groceries': ['food','eat','hungry','hunger','groceries','pantry','snap','ebt','meals','breakfast','lunch','dinner','starving'],
    'Meals': ['meal','soup kitchen','hot food','eat tonight','feeding'],
    'Shelter': ['shelter','homeless','sleep','bed','housing','place to stay','roof','tonight','outside','living outside','vehicle','car','tent'],
    'Housing': ['housing','apartment','rent','home','place to live','section 8','voucher','affordable'],
    'Rental Assistance': ['rent','eviction','evicted','behind on rent','utility','electric','gas bill','shutoff'],
    'Health Care': ['doctor','medical','clinic','health','sick','insurance','prescription','dental','teeth','vision','eye'],
    'Mental Health & Recovery': ['mental','depression','anxiety','therapy','counseling','addiction','drugs','alcohol','recovery','rehab','suboxone','methadone'],
    'Harm Reduction': ['needle','syringe','naloxone','narcan','overdose','fentanyl','drugs'],
    'Domestic Violence & Sexual Assault': ['domestic violence','abuse','abusive','dv','assault','safe house','shelter from','partner','beating','hit'],
    'Legal Services': ['legal','lawyer','attorney','eviction','court','record','expunge','immigration','visa','daca','rights'],
    'Employment & Job Training': ['job','work','employment','hire','resume','training','career','unemployed','income'],
    'Benefits & Financial Aid': ['benefits','snap','medicaid','welfare','tanf','cash assistance','financial','money','bill','utility','help paying'],
    'Youth Services': ['youth','teen','teenager','young adult','runaway','homeless youth','ages 18','ages 24'],
    'Veteran Services': ['veteran','military','va','service member','combat','ptsd','vet'],
    'Disability & Aging': ['disability','disabled','senior','elder','aging','wheelchair','medicare','ssi','ssdi'],
    'Immigration': ['immigration','immigrant','undocumented','daca','visa','deportation','asylum','refugee'],
    'Reentry Resources': ['prison','jail','incarcerated','released','parole','probation','record','felony','reentry'],
    'Transportation': ['ride','bus','transportation','car','travel','medical appointment'],
    'Clothing': ['clothes','clothing','coat','shoes','blanket','winter'],
    'Pet Care': ['pet','dog','cat','animal','vet','pet food'],
    'Family & Parenting': ['child','children','family','parent','childcare','kids','baby','pregnant','head start'],
    'STI & HIV Services': ['hiv','aids','sti','std','testing','sexual health','prep','treatment'],
    'Day Services/Hygiene': ['shower','laundry','hygiene','restroom','bathroom','clean','mail','phone charge'],
  };

  // Score each category
  let bestCat = null, bestScore = 0;
  for (const [cat, keywords] of Object.entries(catMap)) {
    const score = keywords.filter(k => q.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestCat = cat; }
  }

  // Also score by term matching across all resources
  const scored = pool.map(r => {
    const text = (r.name + ' ' + r.description + ' ' + r.category + ' ' + (r.county||'')).toLowerCase();
    let score = terms.filter(t => text.includes(t)).length;
    if (bestCat && r.category === bestCat) score += 3;
    return { r, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.r);

  if (!scored.length) {
    return `I searched our database but didn't find an exact match for "${question}".\n\n📞 Call 211 — they can connect you to local resources 24/7.\n\nOr try:\n• Narrowing your search (e.g. "food" or "shelter")\n• Selecting your state/county in the filters above`;
  }

  const loc = county ? county + (state ? ', ' + state : '') : (state || '');
  let answer = `Here are free resources${loc ? ' in ' + loc : ''} for "${question}":\n\n`;

  scored.forEach(r => {
    answer += `🔹 ${r.name}`;
    if (r.phone) answer += `\n   📞 ${r.phone}`;
    if (r.address) answer += `\n   📍 ${r.address}`;
    if (r.hours) answer += `\n   🕐 ${r.hours}`;
    answer += '\n\n';
  });

  answer += '📞 Also call 211 for more local options 24/7.';
  return answer.trim();
}

// ── API: Community resource submission ────────────────────────────────
app.post('/api/submit', (req, res) => {
  const r = req.body;

  // Basic validation
  if (!r.name || !r.category || !r.description || !r.state) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  // Sanitize
  const entry = {
    name: String(r.name).trim().substring(0, 100),
    category: String(r.category).trim(),
    description: String(r.description).trim().substring(0, 500),
    state: String(r.state).trim(),
    county: String(r.county || 'Statewide').trim(),
    phone: String(r.phone || '').trim().substring(0, 20),
    website: String(r.website || '').trim().replace(/^https?:\/\//, '').substring(0, 120),
    address: String(r.address || '').trim().substring(0, 150),
    hours: String(r.hours || '').trim().substring(0, 80),
    req: Array.isArray(r.req) ? r.req.map(x => String(x).trim()).filter(Boolean) : [],
    source: String(r.source || 'community').trim(),
    source_url: String(r.source_url || '').trim().substring(0, 200),
    active: String(r.active || 'unknown'),
    submitted: new Date().toISOString(),
    _pending: true, // flagged for review
  };

  log('INFO', 'Community submission received', {
    name: entry.name,
    category: entry.category,
    state: entry.state,
    source: entry.source,
  });

  // Save to pending submissions file
  const pendingPath = path.join(__dirname, 'data', 'submissions.json');
  let pending = [];
  try {
    if (fs.existsSync(pendingPath)) {
      pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    }
  } catch(e) {
    pending = [];
  }
  pending.push(entry);
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

  // Also add directly to live resources so it's immediately searchable
  // (mark with _pending so it can be reviewed/removed later)
  const existingNames = new Set(resources.map(r => r.name.toLowerCase().trim()));
  if (!existingNames.has(entry.name.toLowerCase().trim())) {
    resources.push(entry);
    searchIndex.push({
      i: resources.length - 1,
      t: [entry.name, entry.description, entry.address, entry.category, entry.county, entry.state, entry.phone]
        .join(' ').toLowerCase()
    });
    // Rebuild meta counts
    Object.assign(META, buildMeta());
    log('INFO', `Community submission added to live DB: ${entry.name}`, { total: resources.length });
  }

  // Async verify website after responding
  if (entry.website) {
    verifySubmission(entry).then(() => {
      // Re-save with verification results
      const pd = path.join(__dirname, 'data', 'submissions.json');
      try {
        const all = fs.existsSync(pd) ? JSON.parse(fs.readFileSync(pd,'utf8')) : [];
        fs.writeFileSync(pd, JSON.stringify(all, null, 2));
      } catch(e) {}
    });
  }

  res.json({ ok: true, message: 'Submission received' });
});

// ── API: Pending submissions (admin view) ─────────────────────────────
app.get('/api/submissions', (req, res) => {
  const pendingPath = path.join(__dirname, 'data', 'submissions.json');
  try {
    const pending = fs.existsSync(pendingPath)
      ? JSON.parse(fs.readFileSync(pendingPath, 'utf8'))
      : [];
    res.json({ count: pending.length, submissions: pending });
  } catch(e) {
    res.json({ count: 0, submissions: [] });
  }
});

// ── API: Resource verification ────────────────────────────────────────
// Checks if a website is still reachable to confirm program is active
async function checkWebsite(url) {
  if (!url) return { reachable: null, checked: null };
  const fullUrl = url.startsWith('http') ? url : 'https://' + url;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(fullUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'USCommunityResourceGuide/1.0 (+https://rose-city-resource-guide.onrender.com)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return { reachable: res.ok || res.status < 400, status: res.status, checked: new Date().toISOString() };
  } catch(e) {
    return { reachable: false, error: e.message.substring(0, 60), checked: new Date().toISOString() };
  }
}

// Verify a single resource by index
app.post('/api/verify/:index', async (req, res) => {
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= resources.length)
    return res.status(404).json({ error: 'Not found' });

  const r = resources[idx];
  const result = await checkWebsite(r.website);
  r._verified = result;
  log('INFO', `Verified: ${r.name}`, { reachable: result.reachable, status: result.status });

  // Persist verification result
  const dataPath = path.join(__dirname, 'data', 'resources.json');
  fs.writeFile(dataPath, JSON.stringify(resources, null, 2), () => {});

  res.json({ index: idx, name: r.name, website: r.website, ...result });
});

// Batch verify Safe Parking resources (run periodically)
app.post('/api/verify-parking', async (req, res) => {
  const parkingResources = resources
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.category === 'Safe Parking' && r.website);

  res.json({ message: `Verifying ${parkingResources.length} Safe Parking resources in background` });

  let verified = 0, reachable = 0, unreachable = 0;
  for (const { r, i } of parkingResources) {
    const result = await checkWebsite(r.website);
    r._verified = result;
    if (result.reachable === true) reachable++;
    else if (result.reachable === false) unreachable++;
    verified++;
    // Small delay to avoid hammering servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Persist results
  const dataPath = path.join(__dirname, 'data', 'resources.json');
  fs.writeFile(dataPath, JSON.stringify(resources, null, 2), () => {});
  log('INFO', `Batch verification complete`, { verified, reachable, unreachable });
});

// Auto-verify new community submissions
// (called internally after /api/submit)
async function verifySubmission(entry) {
  if (!entry.website) return;
  const result = await checkWebsite(entry.website);
  entry._verified = result;
  if (result.reachable === false) {
    log('WARN', `Submitted resource website unreachable: ${entry.name}`, { website: entry.website });
    entry._verified.flag = 'Website did not respond — needs manual review';
  }
}

// Review queue: pending submissions
app.get('/api/submissions', (req, res) => {
  const pendingPath = path.join(__dirname, 'data', 'submissions.json');
  try {
    const pending = fs.existsSync(pendingPath)
      ? JSON.parse(fs.readFileSync(pendingPath, 'utf8'))
      : [];
    // Summarize verification status
    const summary = {
      total: pending.length,
      verified_ok: pending.filter(r => r._verified?.reachable === true).length,
      verified_fail: pending.filter(r => r._verified?.reachable === false).length,
      unverified: pending.filter(r => !r._verified).length,
      submissions: pending
    };
    res.json(summary);
  } catch(e) {
    res.json({ total: 0, submissions: [] });
  }
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── Global error handler ───────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log('ERROR', 'Unhandled Express error', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: err.stack?.split('\n')[1]?.trim() || '',
  });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  const aiStatus = process.env.GROQ_API_KEY
    ? 'Groq active' + (process.env.ANTHROPIC_API_KEY ? ' + Anthropic fallback' : '')
    : process.env.ANTHROPIC_API_KEY
      ? 'Anthropic active'
      : 'NO AI KEY SET — using local search only';

  log('INFO', '🌹 US Community Resource Guide started', {
    port: PORT,
    resources: resources.length,
    ai: aiStatus,
    env: process.env.NODE_ENV || 'development',
  });

  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    log('WARN', 'No AI API key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY in Render environment.');
  }
});
