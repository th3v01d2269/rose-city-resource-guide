// database.js with better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'resources.db');
const db = new Database(dbPath);

db.exec(`
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

const count = db.prepare("SELECT COUNT(*) as count FROM resources").get();
if (count.count === 0) {
  const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'resources.json'), 'utf8'));
  const insert = db.prepare(`
    INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of seedData) {
    insert.run(
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
  console.log(`Seeded database with ${seedData.length} resources.`);
}

module.exports = db;
