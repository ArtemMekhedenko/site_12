// auth.js — OTP login (email + code)
// POST /api/auth/request-code { email }
// POST /api/auth/verify-code { email, code }
// GET  /api/me

const emailForm = document.getElementById('emailForm');
const codeForm = document.getElementById('codeForm');

const emailInput = document.getElementById('emailInput');
const hiddenCodeInput = document.getElementById('codeInput');

const codeWrap = document.getElementById('codeWrap');
const hint = document.getElementById('hint');

const sendCodeBtn = document.getElementById('sendCodeBtn');
const loginBtn = document.getElementById('loginBtn');
const resendBtn = document.getElementById('resendBtn');

const otpRoot = document.getElementById('otp');
const otpBoxes = otpRoot ? Array.from(otpRoot.querySelectorAll('.otp-box')) : [];

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

function sanitizeDigit(ch) {
  const m = String(ch || '').match(/\d/);
  return m ? m[0] : '';
}

function readOtp() {
  return otpBoxes.map(b => sanitizeDigit(b.value)).join('');
}

function writeOtp(code) {
  const digits = String(code || '').replace(/\D/g, '').slice(0, 6).split('');
  otpBoxes.forEach((b, i) => b.value = digits[i] || '');
  hiddenCodeInput.value = digits.join('');
}

function focusFirstEmpty() {
  const idx = otpBoxes.findIndex(b => !b.value);
  (otpBoxes[idx === -1 ? 5 : idx] || otpBoxes[0])?.focus();
}

function clearOtp() {
  otpBoxes.forEach(b => b.value = '');
  hiddenCodeInput.value = '';
}

async function checkAlreadyLoggedIn() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    const data = await r.json();
    if (data?.ok && data.email) {
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
    clearOtp();
    focusFirstEmpty();

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

// 2) подтвердить код
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

// OTP boxes behavior
if (otpBoxes.length) {
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const d = sanitizeDigit(box.value);
      box.value = d;

      hiddenCodeInput.value = readOtp();

      if (d && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();

      const full = hiddenCodeInput.value;
      if (/^\d{6}$/.test(full)) {
        // auto submit (без кнопки)
        codeForm.requestSubmit();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (box.value) {
          box.value = '';
          hiddenCodeInput.value = readOtp();
          return;
        }
        if (i > 0) {
          otpBoxes[i - 1].focus();
          otpBoxes[i - 1].value = '';
          hiddenCodeInput.value = readOtp();
        }
      }

      if (e.key === 'ArrowLeft' && i > 0) otpBoxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      writeOtp(text);
      focusFirstEmpty();
      if (/^\d{6}$/.test(hiddenCodeInput.value)) {
        codeForm.requestSubmit();
      }
    });
  });
}

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const code = hiddenCodeInput.value.trim();

  if (!email) {
    setHint('Спочатку введіть email.', 'err');
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    setHint('Введіть код з 6 цифр.', 'err');
    focusFirstEmpty();
    return;
  }

  setHint('');
  await verifyCode(email, code);
});
