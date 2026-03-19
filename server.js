// server.js
const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/meta', (req, res) => {
  db.get("SELECT COUNT(*) as total FROM resources", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row.total;
    db.all("SELECT DISTINCT state FROM resources WHERE state IS NOT NULL", (err, states) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all("SELECT DISTINCT county FROM resources WHERE county IS NOT NULL", (err, counties) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all("SELECT DISTINCT category FROM resources WHERE category IS NOT NULL", (err, categories) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            total,
            states: states.map(s => s.state),
            counties: counties.map(c => c.county),
            categories: categories.map(c => c.category)
          });
        });
      });
    });
  });
});

app.get('/api/resources', (req, res) => {
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

  db.get(`SELECT COUNT(*) as total FROM (${sql})`, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row.total;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      rows.forEach(r => r.req = JSON.parse(r.req || '[]'));
      res.json({
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        results: rows
      });
    });
  });
});

app.get('/api/resources/:id', (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM resources WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Resource not found' });
    row.req = JSON.parse(row.req || '[]');
    res.json(row);
  });
});

app.post('/api/resources', (req, res) => {
  const { name, phone, address, description, hours, website, state, county, category, req } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required.' });
  }

  const stmt = db.prepare(`
    INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
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
  stmt.finalize(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Resource added successfully', id: this.lastID });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
