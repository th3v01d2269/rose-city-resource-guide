const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Load & index resources at startup ──────────────────────────────────
const resources = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'resources.json'), 'utf8')
);

// Full-text search index
const searchIndex = resources.map((r, i) => ({
  i,
  t: [r.name, r.description, r.address, r.category, r.county, r.state, r.phone, r.hours]
    .join(' ').toLowerCase()
}));

// State → counties map
function buildMeta() {
  const stateMap = {};
  const catMap = {};

  for (const r of resources) {
    const s = r.state || 'Unknown';
    const co = r.county || 'Unknown';
    const cat = r.category || 'Unknown';

    if (!stateMap[s]) stateMap[s] = new Set();
    stateMap[s].add(co);
    catMap[cat] = (catMap[cat] || 0) + 1;
  }

  const states = Object.entries(stateMap)
    .sort(([a], [b]) => a === 'National' ? -1 : b === 'National' ? 1 : a.localeCompare(b))
    .map(([name, coSet]) => ({
      name,
      count: resources.filter(r => r.state === name).length,
      counties: [...coSet].sort((a, b) =>
        (a === 'National' || a === 'Statewide') ? -1 :
        (b === 'National' || b === 'Statewide') ? 1 :
        a.localeCompare(b)
      )
    }));

  const categories = Object.entries(catMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));

  return { total: resources.length, states, categories };
}

const META = buildMeta();

// ── Middleware ─────────────────────────────────────────────────────────
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

// ── API: Metadata ──────────────────────────────────────────────────────
app.get('/api/meta', (req, res) => res.json(META));

// ── API: Resources (search + filter + paginate) ────────────────────────
app.get('/api/resources', (req, res) => {
  const {
    q = '', state = '', county = '', category = '',
    page = '1', limit = '24'
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

  // Full-text search
  let indices = searchIndex.map(s => s.i);
  if (q.trim()) {
    const terms = q.trim().toLowerCase().split(/\s+/);
    const matched = new Set(
      searchIndex.filter(s => terms.every(t => s.t.includes(t))).map(s => s.i)
    );
    indices = indices.filter(i => matched.has(i));
  }

  // Filters
  if (state) indices = indices.filter(i => resources[i].state === state);
  if (county) indices = indices.filter(i => resources[i].county === county);
  if (category) indices = indices.filter(i => resources[i].category === category);

  const total = indices.length;
  const start = (pageNum - 1) * limitNum;
  const items = indices.slice(start, start + limitNum).map(i => resources[i]);

  res.json({
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum) || 1,
    items
  });
});

// ── API: Single resource ───────────────────────────────────────────────
app.get('/api/resources/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= resources.length)
    return res.status(404).json({ error: 'Not found' });
  res.json({ ...resources[idx], index: idx });
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`\n🌹 US Community Resource Guide`);
  console.log(`   ${resources.length.toLocaleString()} resources · ${META.states.length} states/territories`);
  console.log(`   http://localhost:${PORT}\n`);
});
