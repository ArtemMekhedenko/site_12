const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

// ===== PORT (Railway compatible) =====
const PORT = process.env.PORT || 3000;

// ===== DB PATH (Railway volume compatible) =====
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.sqlite');
console.log('DB_PATH =', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

// ===== Middleware =====
app.use(bodyParser.json());
app.use(express.static(__dirname)); // index.html, css, js

// ===== Create tables if not exist =====
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      block_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id TEXT,
      title TEXT,
      video_url TEXT,
      position INTEGER
    )
  `);
});

// =======================================
// ========= API ROUTES ==================
// =======================================

// ===== Buy block (DEV version for now) =====
app.post('/api/buy', (req, res) => {
  const { email, blockId } = req.body;

  if (!email || !blockId) {
    return res.json({ status: 'error', message: 'Missing email or blockId' });
  }

  db.run(
    `INSERT INTO purchases (email, block_id) VALUES (?, ?)`,
    [email, blockId],
    function (err) {
      if (err) {
        console.error(err);
        return res.json({ status: 'error', message: 'DB error' });
      }

      console.log('Purchase saved:', email, blockId);
      res.json({ status: 'ok' });
    }
  );
});

// ===== Check access =====
app.get('/api/access', (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.json({ status: 'error', allowed: [] });
  }

  db.all(
    `SELECT block_id FROM purchases WHERE email = ?`,
    [email],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.json({ status: 'error', allowed: [] });
      }

      const allowed = rows.map(r => r.block_id);
      res.json({ status: 'ok', allowed });
    }
  );
});

// ===== Get lessons for block =====
app.get('/api/lessons', (req, res) => {
  const { blockId } = req.query;

  if (!blockId) {
    return res.json({ status: 'error', lessons: [] });
  }

  db.all(
    `SELECT title, video_url, position 
     FROM lessons 
     WHERE block_id = ? 
     ORDER BY position ASC`,
    [blockId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.json({ status: 'error', lessons: [] });
      }

      res.json({ status: 'ok', lessons: rows });
    }
  );
});

// ===== Add lesson (optional helper for future admin) =====
app.post('/api/add-lesson', (req, res) => {
  const { blockId, title, videoUrl, position } = req.body;

  if (!blockId || !title || !videoUrl) {
    return res.json({ status: 'error' });
  }

  db.run(
    `INSERT INTO lessons (block_id, title, video_url, position)
     VALUES (?, ?, ?, ?)`,
    [blockId, title, videoUrl, position || 0],
    function (err) {
      if (err) {
        console.error(err);
        return res.json({ status: 'error' });
      }

      res.json({ status: 'ok' });
    }
  );
});

// ===== Fallback to index (SPA friendly) =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
