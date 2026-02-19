const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

/* ================================
   DATABASE (Postgres on Render)
================================ */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL missing');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================================
   CLOUDINARY CONFIG
================================ */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// admin token (set in Render env)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

/* ================================
   MIDDLEWARE
================================ */
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));
const upload = multer({ storage: multer.memoryStorage() });

/* ================================
   INIT DB + SEED
================================ */
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
      video_url TEXT NOT NULL DEFAULT '',
      position INT NOT NULL DEFAULT 1,
      UNIQUE(block_id, position)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS lessons_block_pos_idx
    ON lessons(block_id, position);
  `);

  console.log('✅ DB initialized');

  // seed lessons for 7 blocks (5 lessons each), only if missing
  await seedLessons();
}

async function seedLessons() {
  const blocks = 7;
  const lessonsPerBlock = 5;

  for (let i = 1; i <= blocks; i++) {
    const blockId = `block-${i}`;

    const exists = await pool.query(
      `SELECT 1 FROM lessons WHERE block_id=$1 LIMIT 1`,
      [blockId]
    );
    if (exists.rows.length > 0) continue;

    for (let p = 1; p <= lessonsPerBlock; p++) {
      await pool.query(
        `INSERT INTO lessons(block_id, title, video_url, position)
         VALUES ($1,$2,$3,$4)`,
        [blockId, `Урок ${p}`, '', p]
      );
    }

    console.log(`🎬 Seeded lessons for ${blockId}`);
  }
}

/* ================================
   ADMIN PAGE
================================ */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

/* ================================
   BUY (DEV)
================================ */
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
      redirectUrl: `/block.html?bid=${encodeURIComponent(productId)}`
    });
  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', message: 'DB error' });
  }
});

/* ================================
   ACCESS (важно для block.html)
================================ */
app.get('/api/access', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.json({ status: 'ok', allowed: [] });

  try {
    const r = await pool.query(
      `SELECT block_id FROM purchases WHERE email=$1`,
      [email]
    );
    return res.json({ status: 'ok', allowed: r.rows.map(x => x.block_id) });
  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', allowed: [] });
  }
});

/* ================================
   GET LESSONS
================================ */
app.get('/api/lessons', async (req, res) => {
  const blockId = (req.query.blockId || '').trim();
  if (!blockId) return res.json({ status: 'error', lessons: [] });

  try {
    const result = await pool.query(
      `SELECT title, video_url, position
       FROM lessons
       WHERE block_id=$1
       ORDER BY position ASC`,
      [blockId]
    );
    return res.json({ status: 'ok', lessons: result.rows });
  } catch (err) {
    console.error(err);
    return res.json({ status: 'error', lessons: [] });
  }
});

/* ================================
   UPLOAD VIDEO TO CLOUDINARY (ADMIN)
   Важно: ожидает file с именем "file"
================================ */
app.post('/api/admin/upload-video', upload.single('file'), async (req, res) => {
  try {
    // token check
    const token = (req.body.token || '').trim();
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, message: 'Wrong admin token' });
    }

    const blockId = (req.body.blockId || '').trim();
    const position = Number(req.body.position);
    const title = (req.body.title || '').trim();

    if (!blockId || !position || !req.file) {
      return res.status(400).json({ ok: false, message: 'blockId, position and file required' });
    }

    // upload to cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'skinblocks',
          public_id: `${blockId}-lesson-${position}`,
          overwrite: true
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    const videoUrl = uploadResult.secure_url;

    // upsert lesson: update if exists, else insert
    await pool.query(
      `INSERT INTO lessons(block_id, title, video_url, position)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (block_id, position)
       DO UPDATE SET
         title = EXCLUDED.title,
         video_url = EXCLUDED.video_url`,
      [blockId, title || `Урок ${position}`, videoUrl, position]
    );

    return res.json({ ok: true, videoUrl });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Upload failed' });
  }
});

/* ================================
   SPA FALLBACK
================================ */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ================================
   START
================================ */
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ DB init failed:', err);
    process.exit(1);
  });
