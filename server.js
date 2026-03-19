// server.js with better-sqlite3 (synchronous)
const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to handle errors
function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: err.message });
}

// GET /api/meta
app.get('/api/meta', (req, res) => {
  try {
    const total = db.prepare("SELECT COUNT(*) as total FROM resources").get().total;
    const states = db.prepare("SELECT DISTINCT state FROM resources WHERE state IS NOT NULL").all().map(s => s.state);
    const counties = db.prepare("SELECT DISTINCT county FROM resources WHERE county IS NOT NULL").all().map(c => c.county);
    const categories = db.prepare("SELECT DISTINCT category FROM resources WHERE category IS NOT NULL").all().map(c => c.category);
    res.json({ total, states, counties, categories });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/resources
app.get('/api/resources', (req, res) => {
  try {
    const { q, state, county, category, page = 1, limit = 24 } = req.query;
    let sql = "SELECT * FROM resources WHERE 1=1";
    const params = [];

    if (q) {
      sql += " AND (name LIKE ? OR description LIKE ? OR address LIKE ? OR phone LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (state) {
      sql += " AND state = ?";
      params.push(state);
    }
    if (county) {
      sql += " AND county = ?";
      params.push(county);
    }
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`);
    const total = countStmt.get(...params).total;

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const stmt = db.prepare(sql);
    let rows = stmt.all(...params);
    rows.forEach(r => r.req = JSON.parse(r.req || '[]'));

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      results: rows
    });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/resources/:id
app.get('/api/resources/:id', (req, res) => {
  try {
    const id = req.params.id;
    const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ error: 'Resource not found' });
    row.req = JSON.parse(row.req || '[]');
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/resources
app.post('/api/resources', (req, res) => {
  try {
    const { name, phone, address, description, hours, website, state, county, category, req } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name,
      phone || null,
      address || null,
      description || null,
      hours || null,
      website || null,
      state || null,
      county || null,
      category,
      JSON.stringify(req || [])
    );
    res.status(201).json({ message: 'Resource added successfully', id: info.lastInsertRowid });
  } catch (err) {
    handleError(res, err);
  }
});

// Catch-all for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
