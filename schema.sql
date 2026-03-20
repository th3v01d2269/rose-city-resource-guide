-- US Community Resource Guide — schema.sql
CREATE TABLE IF NOT EXISTS resources (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL CHECK (length(trim(name)) >= 2),
    phone       TEXT, address TEXT, description TEXT,
    hours       TEXT, website TEXT, state TEXT, county TEXT,
    category    TEXT NOT NULL,
    req         TEXT,
    source      TEXT DEFAULT 'manual',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS source     TEXT DEFAULT 'manual';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT,
    description TEXT, state TEXT, county TEXT, phone TEXT,
    website TEXT, address TEXT, hours TEXT, req TEXT,
    source TEXT, active TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_r_state    ON resources(state);
CREATE INDEX IF NOT EXISTS idx_r_county   ON resources(county);
CREATE INDEX IF NOT EXISTS idx_r_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_r_source   ON resources(source);
CREATE INDEX IF NOT EXISTS idx_r_name     ON resources(name);
