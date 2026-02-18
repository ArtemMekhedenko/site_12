const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL missing');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.json());
app.use(express.static(__dirname));

/* ======================================================
   INIT DB + AUTO SEED
====================================================== */

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      block_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email, block_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id SERIAL PRIMARY KEY,
      block_id TEXT NOT NULL,
      title TEXT NOT NULL,
      video_url TEXT NOT NULL,
      position INT NOT NULL DEFAULT 1
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS lessons_block_pos_idx
    ON lessons(block_id, position);
  `);

  console.log('✅ DB initialized');

  await seedLessons();
}

/* ======================================================
   AUTO VIDEO SEED (7 BLOCKS)
====================================================== */

async function seedLessons() {
  const blocks = 7;

  for (let i = 1; i <= blocks; i++) {
    const blockId = `block-${i}`;

    const exists = await pool.query(
      `SELECT 1 FROM lessons WHERE block_id=$1 LIMIT 1`,
      [blockId]
    );

    if (exists.rows.length > 0) continue;

    for (let j = 1; j <= 4; j++) {
      await pool.query(
        `INSERT INTO lessons(block_id, title, video_url, position)
         VALUES($1,$2,$3,$4)`,
        [
          blockId,
          `Урок ${j}`,
          `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`,
          j
        ]
      );
    }

    console.log(`🎬 Seeded videos for ${blockId}`);
  }
}

/* ======================================================
   BUY (DEV)
====================================================== */

app.post('/api/payment/create', async (req, res) => {
  const { email, productId } = req.body;

  if (!email || !productId) {
    return res.json({ status: 'error', message: 'Missing data' });
  }

  try {
    await pool.query(
      `INSERT INTO purchases(email, block_id)
       VALUES($1,$2)
       ON CONFLICT (email, block_id) DO NOTHING`,
      [email, productId]
    );

    return res.json({
      status: 'ok',
      redirectUrl: `/block.html?bid=${productId}`
    });

  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', message: 'DB error' });
  }
});

/* ======================================================
   ACCESS
====================================================== */

app.get('/api/access', async (req, res) => {
  const email = req.query.email;

  if (!email) return res.json({ status: 'ok', allowed: [] });

  try {
    const r = await pool.query(
      `SELECT block_id FROM purchases WHERE email=$1`,
      [email]
    );

    return res.json({
      status: 'ok',
      allowed: r.rows.map(x => x.block_id)
    });

  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', allowed: [] });
  }
});

/* ======================================================
   GET LESSONS
====================================================== */

app.get('/api/lessons', async (req, res) => {
  const blockId = req.query.blockId;

  if (!blockId)
    return res.json({ status: 'error', lessons: [] });

  try {
    const r = await pool.query(
      `SELECT title, video_url, position
       FROM lessons
       WHERE block_id=$1
       ORDER BY position ASC`,
      [blockId]
    );

    return res.json({
      status: 'ok',
      lessons: r.rows
    });

  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', lessons: [] });
  }
});

/* ======================================================
   SPA ROUTE
====================================================== */

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ======================================================
   START
====================================================== */

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
