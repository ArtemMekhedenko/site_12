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
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

app.use(bodyParser.json());
app.use(express.static(__dirname));

/* ================================= */
/* ========== INIT DB ============== */
/* ================================= */

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

  // УДАЛЯЕМ старые уроки (чтобы не дублировались)
  await pool.query(`DELETE FROM lessons`);

  const rows = [
    ['block-1','Урок 1','',1],
    ['block-1','Урок 2','',2],
    ['block-1','Урок 3','',3],
    ['block-1','Урок 4','',4],
    ['block-1','Урок 5','',5],

    ['block-2','Урок 1','',1],
    ['block-2','Урок 2','',2],
    ['block-2','Урок 3','',3],
    ['block-2','Урок 4','',4],
    ['block-2','Урок 5','',5],

    ['block-3','Урок 1','',1],
    ['block-3','Урок 2','',2],
    ['block-3','Урок 3','',3],
    ['block-3','Урок 4','',4],
    ['block-3','Урок 5','',5],

    ['block-4','Урок 1','',1],
    ['block-4','Урок 2','',2],
    ['block-4','Урок 3','',3],
    ['block-4','Урок 4','',4],
    ['block-4','Урок 5','',5],

    ['block-5','Урок 1','',1],
    ['block-5','Урок 2','',2],
    ['block-5','Урок 3','',3],
    ['block-5','Урок 4','',4],
    ['block-5','Урок 5','',5],

    ['block-6','Урок 1','',1],
    ['block-6','Урок 2','',2],
    ['block-6','Урок 3','',3],
    ['block-6','Урок 4','',4],
    ['block-6','Урок 5','',5],

    ['block-7','Урок 1','',1],
    ['block-7','Урок 2','',2],
    ['block-7','Урок 3','',3],
    ['block-7','Урок 4','',4],
    ['block-7','Урок 5','',5],
  ];

  for (const r of rows) {
    await pool.query(
      `INSERT INTO lessons (block_id,title,video_url,position)
       VALUES ($1,$2,$3,$4)`,
      r
    );
  }

  console.log('✅ DB initialized & seeded');
}


/* ================================= */
/* ========== API ================== */
/* ================================= */

// DEV Payment endpoint
app.post('/api/payment/create', async (req, res) => {
  const { email, productId, blockId } = req.body;
  const finalBlockId = blockId || productId;

  if (!email || !finalBlockId) {
    return res.status(400).json({ status:'error', message:'Missing email or blockId' });
  }

  try {
    await pool.query(
      `INSERT INTO purchases(email, block_id)
       VALUES($1,$2)
       ON CONFLICT (email, block_id) DO NOTHING`,
      [email, finalBlockId]
    );

    return res.json({
      status: 'ok',
      redirectUrl: `/block.html?bid=${encodeURIComponent(finalBlockId)}`
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ status:'error' });
  }
});

// Проверка доступа
app.get('/api/access', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.json({ status:'ok', allowed: [] });

  try {
    const r = await pool.query(
      `SELECT block_id FROM purchases WHERE email=$1`,
      [email]
    );
    res.json({ status:'ok', allowed: r.rows.map(x => x.block_id) });
  } catch (e) {
    console.error(e);
    res.json({ status:'error', allowed: [] });
  }
});

// Получить уроки
app.get('/api/lessons', async (req, res) => {
  const blockId = req.query.blockId;
  if (!blockId) return res.json({ status:'error', lessons: [] });

  try {
    const r = await pool.query(
      `SELECT title, video_url, position
       FROM lessons
       WHERE block_id=$1
       ORDER BY position ASC`,
      [blockId]
    );
    res.json({ status:'ok', lessons: r.rows });
  } catch (e) {
    console.error(e);
    res.json({ status:'error', lessons: [] });
  }
});

/* ================================= */
/* ========== FRONT ROUTE ========== */
/* ================================= */

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ================================= */
/* ========== START ================= */
/* ================================= */

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ DB init failed:', err);
    process.exit(1);
  });
