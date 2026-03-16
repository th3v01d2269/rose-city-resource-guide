const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json());
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
      .sort(([a], [b]) => a.localeCompare(b))
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
  if (county) indices = indices.filter(i => resources[i].county === county);
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

// ── API: AI Assistant ──────────────────────────────────────────────────
app.post('/api/ask', async (req, res) => {
  const { question, state, county } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'AI assistant not configured yet. Set ANTHROPIC_API_KEY in your Render environment variables. In the meantime, use the search and filters above to find resources, or call 211 for live help.'
    });
  }

  const locationFilter = state
    ? resources.filter(r => r.state === state || r.state === 'National')
    : resources;

  const terms = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const relevant = locationFilter
    .filter(r => terms.some(t => (r.name + ' ' + r.description + ' ' + r.category).toLowerCase().includes(t)))
    .slice(0, 15)
    .map(r => `• ${r.name} (${r.category}${r.county ? ', ' + r.county : ''})${r.phone ? ' — ' + r.phone : ''}${r.address ? ' — ' + r.address : ''}${r.hours ? ' — ' + r.hours : ''}`)
    .join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a compassionate social services navigator. Help people find free community resources in the US. Be warm, practical, and specific. Always include phone numbers and addresses when available. If someone seems to be in crisis, start with crisis lines (988, 211, 911). Keep responses concise and readable on a phone screen. Format with line breaks for readability.',
        messages: [{
          role: 'user',
          content: `Location: ${county ? county + ', ' : ''}${state || 'US'}\n\nQuestion: ${question}\n\nMatching resources from database:\n${relevant || 'No direct matches found — giving general guidance.'}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(500).json({ error: 'AI request failed. Please try again.' });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'Sorry, could not get a response. Try again.';
    res.json({ answer });
  } catch (e) {
    console.error('AI fetch error:', e.message);
    res.status(500).json({ error: 'Could not reach AI. Check your connection and try again.' });
  }
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`\n🌹 US Community Resource Guide`);
  console.log(`   ${resources.length.toLocaleString()} resources loaded`);
  console.log(`   AI assistant: ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '⚠️  set ANTHROPIC_API_KEY to enable'}`);
  console.log(`   http://localhost:${PORT}\n`);
});
