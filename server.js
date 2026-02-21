require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

// Resend (email delivery) — используем для отправки OTP кода
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = process.env.RESEND_FROM || 'Acme <onboarding@resend.dev>'; // заменишь на свой verified sender

const crypto = require('crypto');
const cookieParser = require('cookie-parser');
app.use(cookieParser());


/* ================================
   DATABASE
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

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

/* ================================
   MIDDLEWARE
================================ */
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 700 * 1024 * 1024 } // 700MB
});

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
      position INT NOT NULL,
      UNIQUE(block_id, position)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS lessons_block_pos_idx
    ON lessons(block_id, position);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS lessons_block_position_unique
    ON lessons(block_id, position);
  `);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS login_codes (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_email_idx ON sessions(email);`);




  console.log('✅ DB initialized');

  await seedLessonsIfMissing();
}

async function seedLessonsIfMissing() {
  const blocks = 7;
  const perBlock = 5;

  for (let i = 1; i <= blocks; i++) {
    const blockId = `block-${i}`;

    const exists = await pool.query(
      `SELECT 1 FROM lessons WHERE block_id=$1 LIMIT 1`,
      [blockId]
    );

    if (exists.rows.length > 0) continue;

    for (let p = 1; p <= perBlock; p++) {
      await pool.query(
        `INSERT INTO lessons(block_id, title, video_url, position)
         VALUES($1,$2,$3,$4)`,
        [blockId, `Урок ${p}`, '', p]
      );
    }

    console.log(`🎬 Seeded ${blockId} (${perBlock} lessons)`);
  }
}

/* ================================
   ADMIN PAGE
================================ */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function sendLoginCodeEmail(email, code) {
  if (!resend) {
    // Если RESEND_API_KEY не задан — просто не отправляем письмо (DEV режим)
    console.log(`✉️ Resend disabled (RESEND_API_KEY missing). OTP for ${email}: ${code}`);
    return;
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4">
      <h2 style="margin:0 0 12px 0">Код входа</h2>
      <p style="margin:0 0 12px 0">Твой код подтверждения:</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:700;margin:12px 0">${code}</div>
      <p style="margin:16px 0 0 0;color:#555">Код действителен 5 минут. Если это не ты — просто проигнорируй письмо.</p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [email],
    subject: 'Your login code',
    html
  });

  if (error) throw error;
  return data;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}
function randomCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}


/* ================================
   BUY (DEV)
================================ */
app.post('/api/payment/create', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const productId = (req.body.productId || '').trim();

  if (!email || !productId) {
    return res.json({ status: 'error', message: 'Missing email or productId' });
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
  } catch (e) {
    console.error(e);
    return res.json({ status: 'error', message: 'DB error' });
  }
});

/* ================================
   ACCESS
================================ */
app.get('/api/access', async (req, res) => {
  const token = req.cookies.session;
  if (!token) return res.json({ status:'ok', allowed: [] });

  const tokenHash = sha256(token);

  const s = await pool.query(
    `SELECT email, expires_at FROM sessions WHERE token_hash=$1 LIMIT 1`,
    [tokenHash]
  );

  if (s.rows.length === 0) return res.json({ status:'ok', allowed: [] });
  if (new Date(s.rows[0].expires_at).getTime() < Date.now()) return res.json({ status:'ok', allowed: [] });

  const email = s.rows[0].email;

  const r = await pool.query(`SELECT block_id FROM purchases WHERE email=$1`, [email]);
  return res.json({ status:'ok', allowed: r.rows.map(x => x.block_id) });
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
  } catch (e) {
    console.error(e);
    return res.json({ status: 'error', lessons: [] });
  }
});

/* ================================
   ADMIN VIDEO UPLOAD (Cloudinary)
   Важно: поле файла = "file" (как в admin.html)
================================ */
app.post('/api/admin/upload-video', upload.single('file'), async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    const blockId = (req.body.blockId || '').trim();
    const position = Number(req.body.position);
    const title = (req.body.title || '').trim();

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, message: 'Wrong admin token' });
    }

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

    // upsert in DB
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
    console.error('UPLOAD FAILED:', err);
    const msg = err?.message || err?.error?.message || 'Upload failed';
    return res.status(500).json({ ok: false, message: msg });
  }
});

/* ================================
   DEV: открыть доступ к блоку
   /api/dev/grant?email=test@gmail.com&blockId=block-1
================================ */
app.get('/api/dev/grant', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  const blockId = (req.query.blockId || '').trim();

  if (!email || !blockId) return res.json({ ok: false, message: 'email and blockId required' });

  try {
    await pool.query(
      `INSERT INTO purchases(email, block_id)
       VALUES($1,$2)
       ON CONFLICT (email, block_id) DO NOTHING`,
      [email, blockId]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

// 1) Запрос кода на email
app.post('/api/auth/request-code', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok:false, message:'email required' });

  const code = randomCode6();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут

  // очищаем старые коды этого email (чтобы был 1 актуальный)
  await pool.query(`DELETE FROM login_codes WHERE email=$1`, [email]);

  await pool.query(
    `INSERT INTO login_codes(email, code_hash, expires_at)
     VALUES($1,$2,$3)`,
    [email, codeHash, expiresAt]
  );

  // отправка письма (Resend). Если RESEND_API_KEY не задан — код просто выведется в логах (DEV режим)
  try {
    await sendLoginCodeEmail(email, code);
  } catch (e) {
    console.error('❌ Failed to send OTP email:', e);
    return res.status(500).json({ ok:false, message:'failed to send email' });
  }
  return res.json({ ok:true });
});

// 2) Проверка кода, создание сессии
app.post('/api/auth/verify-code', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = (req.body.code || '').trim();
  if (!email || !code) return res.status(400).json({ ok:false, message:'email and code required' });

  const r = await pool.query(
    `SELECT code_hash, expires_at FROM login_codes WHERE email=$1 LIMIT 1`,
    [email]
  );

  if (r.rows.length === 0) return res.status(400).json({ ok:false, message:'code not found' });

  const row = r.rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ ok:false, message:'code expired' });
  }

  if (sha256(code) !== row.code_hash) {
    return res.status(400).json({ ok:false, message:'wrong code' });
  }

  // код одноразовый
  await pool.query(`DELETE FROM login_codes WHERE email=$1`, [email]);

  // создаём сессию (30 дней)
  const token = randomToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO sessions(email, token_hash, expires_at)
     VALUES($1,$2,$3)`,
    [email, tokenHash, expiresAt]
  );

  // httpOnly cookie (JS не сможет её прочитать → безопаснее)
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true, // на Render https
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return res.json({ ok:true });
});

// 3) Кто я
app.get('/api/me', async (req, res) => {
  const token = req.cookies.session;
  if (!token) return res.json({ ok:true, email:null });

  const tokenHash = sha256(token);
  const r = await pool.query(
    `SELECT email, expires_at FROM sessions WHERE token_hash=$1 LIMIT 1`,
    [tokenHash]
  );

  if (r.rows.length === 0) return res.json({ ok:true, email:null });
  if (new Date(r.rows[0].expires_at).getTime() < Date.now()) return res.json({ ok:true, email:null });

  return res.json({ ok:true, email: r.rows[0].email });
});

// 4) Выход
app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies.session;
  if (token) {
    await pool.query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
  }
  res.clearCookie('session');
  res.json({ ok:true });
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
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((e) => {
    console.error('❌ DB init failed:', e);
    process.exit(1);
  });

  