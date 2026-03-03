const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

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

// WayForPay
const WFP_MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT || '';
const WFP_SECRET_KEY = process.env.WFP_SECRET_KEY || '';
// домен без https:// (например: site-12.onrender.com)
const WFP_DOMAIN = (process.env.WFP_DOMAIN || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
const WFP_CURRENCY = process.env.WFP_CURRENCY || 'UAH';


/* ================================
   MIDDLEWARE
================================ */
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
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

  await pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    order_ref TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    product_id TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'UAH',
    payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ
  );
`);

await pool.query(`CREATE INDEX IF NOT EXISTS orders_email_idx ON orders(email);`);
await pool.query(`CREATE INDEX IF NOT EXISTS orders_product_idx ON orders(product_id);`);
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
  // user from cookie session
  const token = req.cookies.session;
  if (!token) return res.json({ status: 'error', message: 'Not logged in' });

  const tokenHash = sha256(token);
  const s = await pool.query(
    `SELECT email, expires_at FROM sessions WHERE token_hash=$1 LIMIT 1`,
    [tokenHash]
  );
  if (s.rows.length === 0) return res.json({ status: 'error', message: 'Session not found' });
  if (new Date(s.rows[0].expires_at).getTime() < Date.now()) return res.json({ status: 'error', message: 'Session expired' });

  const email = String(s.rows[0].email || '').trim().toLowerCase();
  const productId = String(req.body.productId || '').trim();

  if (!productId) return res.json({ status: 'error', message: 'Missing productId' });

  // ---- FALLBACK (если WayForPay ещё не настроен) ----
  if (!WFP_MERCHANT_ACCOUNT || !WFP_SECRET_KEY || !WFP_DOMAIN) {
    try {
      await pool.query(
        `INSERT INTO purchases(email, block_id)
         VALUES($1,$2)
         ON CONFLICT (email, block_id) DO NOTHING`,
        [email, productId]
      );
      return res.json({
        status: 'ok',
        mode: 'dev',
        redirectUrl: `/block.html?bid=${encodeURIComponent(productId)}`
      });
    } catch (e) {
      console.error(e);
      return res.json({ status: 'error', message: 'DB error' });
    }
  }


  // ---- REAL PAYMENT (WayForPay) ----
  const amount = Number(req.body.amount || 0) || 499; // fallback price
  const currency = WFP_CURRENCY;

  // orderRef must be unique
  const orderRef = `SB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const orderDate = Math.floor(Date.now() / 1000);

  try {
    await pool.query(
      `INSERT INTO orders(order_ref, email, block_id, amount, currency, payment_status)
       VALUES($1,$2,$3,$4,$5,'pending')`,
      [orderRef, email, productId, amount, currency]
    );
  } catch (e) {
    console.error('ORDER INSERT ERROR', e);
    return res.json({ status: 'error', message: 'Could not create order' });
  }

  // signature (HMAC_MD5) - fields separated by ";"
  // merchantAccount; merchantDomainName; orderReference; orderDate; amount; currency; productName...; productCount...; productPrice...
  function hmacMd5(str, key) {
    return crypto.createHmac('md5', key).update(str, 'utf8').digest('hex');
  }

  const productName = [`${productId}`];
  const productCount = [1];
  const productPrice = [Number(amount)];

  const signParts = [
    WFP_MERCHANT_ACCOUNT,
    WFP_DOMAIN,
    orderRef,
    String(orderDate),
    String(amount),
    currency,
    ...productName,
    ...productCount.map(String),
    ...productPrice.map(String),
  ];
  const merchantSignature = hmacMd5(signParts.join(';'), WFP_SECRET_KEY);

  const returnUrl = `https://${WFP_DOMAIN}/payment-success.html?orderRef=${encodeURIComponent(orderRef)}`;
  const serviceUrl = `https://${WFP_DOMAIN}/api/pay/wayforpay/webhook`;

  // Purchase (redirect user to WayForPay checkout)
  // https://secure.wayforpay.com/pay  (form POST)
  const fields = {
    merchantAccount: WFP_MERCHANT_ACCOUNT,
    merchantDomainName: WFP_DOMAIN,
    merchantSignature,
    orderReference: orderRef,
    orderDate,
    amount,
    currency,
    productName,
    productCount,
    productPrice,
    returnUrl,
    serviceUrl,
    language: 'UA'
  };

  return res.json({
    status: 'ok',
    mode: 'wayforpay',
    payUrl: 'https://secure.wayforpay.com/pay',
    fields,
    orderRef
  });
});

app.post('/api/pay/wayforpay/webhook', async (req, res) => {
  try {
    const payload = req.body;

    const orderRef = payload?.orderReference;
    const status = payload?.transactionStatus;

    if (!orderRef) return res.json({ status: 'error', message: 'No orderReference' });

    // WayForPay обычно присылает Approved на успешную оплату
    if (status === 'Approved') {
      // 1) пометить заказ paid
      const o = await pool.query(
        `UPDATE orders
         SET payment_status='paid', paid_at=NOW()
         WHERE order_ref=$1
         RETURNING email, block_id`,
        [orderRef]
      );

      // 2) открыть доступ (записать покупку)
      if (o.rows.length) {
        const { email, block_id } = o.rows[0];
        await pool.query(
          `INSERT INTO purchases(email, block_id)
           VALUES($1,$2)
           ON CONFLICT (email, block_id) DO NOTHING`,
          [email, block_id]
        );
      }
    } else if (status) {
      // если не approved — пометим failed (или оставь pending)
      await pool.query(
        `UPDATE orders SET payment_status='failed' WHERE order_ref=$1`,
        [orderRef]
      );
    }

    // ответ WayForPay
    return res.json({ orderReference: orderRef, status: 'accept', time: Math.floor(Date.now()/1000) });
  } catch (e) {
    console.error('WFP webhook error', e);
    return res.status(500).json({ status: 'error' });
  }
});

app.get('/api/order', async (req, res) => {
  const orderRef = String(req.query.orderRef || '').trim();
  if (!orderRef) return res.json({ status: 'error', message: 'Missing orderRef' });

  try {
    const r = await pool.query(
      `SELECT order_ref, email, block_id, amount, currency, payment_status
       FROM orders
       WHERE order_ref=$1
       LIMIT 1`,
      [orderRef]
    );

    if (!r.rows.length) return res.json({ status: 'error', message: 'Order not found' });

    const o = r.rows[0];
    return res.json({
      status: 'ok',
      order: {
        orderRef: o.order_ref,
        email: o.email,
        productId: o.block_id,
        amount: o.amount,
        currency: o.currency,
        paymentStatus: o.payment_status
      }
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

  // DEV режим: если нет email-сервиса — покажем код в логах
  console.log(`🔐 LOGIN CODE for ${email}: ${code} (valid 5 min)`);

  // PROD режим: сюда позже подключим отправку письма через Resend/SMTP
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

  