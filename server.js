const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

/* ================================
   DATABASE
================================ */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

/* ================================
   MIDDLEWARE
================================ */

app.use(bodyParser.json());
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

/* ================================
   INIT DB
================================ */

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      block_id TEXT NOT NULL,
      UNIQUE(email, block_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id SERIAL PRIMARY KEY,
      block_id TEXT NOT NULL,
      title TEXT NOT NULL,
      video_url TEXT NOT NULL,
      position INT NOT NULL
    );
  `);

  console.log("✅ DB initialized");
}

/* ================================
   BUY (DEV)
================================ */

app.post('/api/payment/create', async (req, res) => {
  const { email, productId } = req.body;

  if (!email || !productId)
    return res.json({ status: 'error', message: 'Missing data' });

  await pool.query(
    `INSERT INTO purchases(email, block_id)
     VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [email, productId]
  );

  res.json({
    status: 'ok',
    redirectUrl: `/block.html?bid=${productId}`
  });
});

/* ================================
   GET LESSONS
================================ */

app.get('/api/lessons', async (req, res) => {
  const blockId = req.query.blockId;

  const result = await pool.query(
    `SELECT title, video_url, position
     FROM lessons
     WHERE block_id=$1
     ORDER BY position`,
    [blockId]
  );

  res.json({ status: 'ok', lessons: result.rows });
});

/* ================================
   UPLOAD VIDEO TO CLOUDINARY
================================ */

app.post('/api/admin/upload-video', upload.single('video'), async (req, res) => {
  const { blockId, title, position } = req.body;

  if (!req.file || !blockId || !title || !position) {
    return res.json({ ok: false, message: "Missing fields" });
  }

  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "video" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    await pool.query(
      `INSERT INTO lessons(block_id, title, video_url, position)
       VALUES($1,$2,$3,$4)`,
      [blockId, title, uploadResult.secure_url, position]
    );

    res.json({ ok: true, url: uploadResult.secure_url });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, message: "Upload error" });
  }
});

/* ================================
   SPA ROUTE
================================ */

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ================================
   START
================================ */

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
