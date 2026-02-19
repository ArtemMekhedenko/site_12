// auth.js — OTP login (email + code)
// Работает с сервером:
// POST /api/auth/request-code { email }
// POST /api/auth/verify-code { email, code }
// GET  /api/me

const emailForm = document.getElementById('emailForm');
const codeForm = document.getElementById('codeForm');

const emailInput = document.getElementById('emailInput');
const codeInput = document.getElementById('codeInput');

const codeWrap = document.getElementById('codeWrap');
const hint = document.getElementById('hint');

const sendCodeBtn = document.getElementById('sendCodeBtn');
const loginBtn = document.getElementById('loginBtn');
const resendBtn = document.getElementById('resendBtn');

function setHint(msg = '', type = '') {
  hint.textContent = msg;
  hint.classList.remove('ok', 'err');
  if (type) hint.classList.add(type);
}

function setBusy(btn, busy, textWhenBusy = 'Зачекайте...') {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.dataset._text = btn.dataset._text || btn.textContent;
  btn.textContent = busy ? textWhenBusy : btn.dataset._text;
}

async function checkAlreadyLoggedIn() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    const data = await r.json();
    if (data?.ok && data.email) {
      // уже есть сессия
      window.location.href = 'index.html';
    }
  } catch (_) {}
}

checkAlreadyLoggedIn();

// 1) запросить код
async function requestCode(email) {
  setBusy(sendCodeBtn, true);
  setBusy(resendBtn, true);

  try {
    const r = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    const data = await r.json();

    if (!data?.ok) {
      setHint(data?.message || 'Не вдалося отримати код. Спробуйте ще раз.', 'err');
      return false;
    }

    codeWrap.style.display = 'block';
    codeInput.focus();

    setHint('Код надіслано. Якщо ти в DEV — код буде в Render Logs.', 'ok');
    return true;
  } catch (e) {
    setHint('Помилка з’єднання з сервером.', 'err');
    return false;
  } finally {
    setBusy(sendCodeBtn, false);
    setBusy(resendBtn, false);
  }
}

// 2) підтвердити код
async function verifyCode(email, code) {
  setBusy(loginBtn, true);

  try {
    const r = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code })
    });
    const data = await r.json();

    if (!data?.ok) {
      setHint(data?.message || 'Невірний код або він протермінований.', 'err');
      return false;
    }

    setHint('Готово! Вхід виконано ✅', 'ok');

    // важно: cookie сессия уже установлена сервером
    // переносим на главную
    window.location.href = 'index.html';
    return true;
  } catch (e) {
    setHint('Помилка з’єднання з сервером.', 'err');
    return false;
  } finally {
    setBusy(loginBtn, false);
  }
}

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  if (!email) return;

  setHint('');
  await requestCode(email);
});

resendBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    setHint('Спочатку введіть email.', 'err');
    return;
  }
  setHint('');
  await requestCode(email);
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const code = codeInput.value.trim();

  if (!email) {
    setHint('Спочатку введіть email.', 'err');
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    setHint('Введіть код з 6 цифр.', 'err');
    return;
  }

  setHint('');
  await verifyCode(email, code);
});
