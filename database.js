// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'resources.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      description TEXT,
      hours TEXT,
      website TEXT,
      state TEXT,
      county TEXT,
      category TEXT,
      req TEXT
    )
  `);

  db.get("SELECT COUNT(*) as count FROM resources", (err, row) => {
    if (err) throw err;
    if (row.count === 0) {
      const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'resources.json'), 'utf8'));
      const stmt = db.prepare(`
        INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of seedData) {
        stmt.run(
          r.name,
          r.phone || null,
          r.address || null,
          r.description || null,
          r.hours || null,
          r.website || null,
          r.state || null,
          r.county || null,
          r.category || null,
          JSON.stringify(r.req || [])
        );
      }
      stmt.finalize();
      console.log(`Seeded database with ${seedData.length} resources.`);
    }
  });
});

module.exports = db;
