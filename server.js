// server.js - PostgreSQL version (async/await)
const express = require('express');
const path = require('path');
const db = require('./database'); // now a pg Pool

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper for error handling
const handleError = (res, err) => {
    console.error(err);
    res.status(500).json({ error: err.message });
};

// GET /api/meta
app.get('/api/meta', async (req, res) => {
    try {
        const totalRes = await db.query('SELECT COUNT(*) as total FROM resources');
        const total = parseInt(totalRes.rows[0].total);
        const statesRes = await db.query('SELECT DISTINCT state FROM resources WHERE state IS NOT NULL');
        const countiesRes = await db.query('SELECT DISTINCT county FROM resources WHERE county IS NOT NULL');
        const categoriesRes = await db.query('SELECT DISTINCT category FROM resources WHERE category IS NOT NULL');
        res.json({
            total,
            states: statesRes.rows.map(r => r.state),
            counties: countiesRes.rows.map(r => r.county),
            categories: categoriesRes.rows.map(r => r.category)
        });
    } catch (err) {
        handleError(res, err);
    }
});

// GET /api/resources
app.get('/api/resources', async (req, res) => {
    try {
        const { q, state, county, category, page = 1, limit = 24 } = req.query;
        let sql = 'SELECT * FROM resources WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (q) {
            sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
            params.push(`%${q}%`);
            paramIndex++;
        }
        if (state) {
            sql += ` AND state = $${paramIndex}`;
            params.push(state);
            paramIndex++;
        }
        if (county) {
            sql += ` AND county = $${paramIndex}`;
            params.push(county);
            paramIndex++;
        }
        if (category) {
            sql += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        // Get total count
        const countRes = await db.query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
        const total = parseInt(countRes.rows[0].total);

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        sql += ` ORDER BY id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(sql, params);
        // Parse req field from JSON string
        const rows = result.rows.map(r => ({
            ...r,
            req: r.req ? JSON.parse(r.req) : []
        }));
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
app.get('/api/resources/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const row = result.rows[0];
        row.req = row.req ? JSON.parse(row.req) : [];
        res.json(row);
    } catch (err) {
        handleError(res, err);
    }
});

// POST /api/resources
app.post('/api/resources', async (req, res) => {
    try {
        const { name, phone, address, description, hours, website, state, county, category, req } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required.' });
        }

        const result = await db.query(
            `INSERT INTO resources (name, phone, address, description, hours, website, state, county, category, req)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [
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
            ]
        );
        res.status(201).json({ message: 'Resource added successfully', id: result.rows[0].id });
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
