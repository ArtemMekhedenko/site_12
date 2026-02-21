/*************************************************
 * БЛОКИ (7)
 *************************************************/

const BLOCKS = [
  { id: 'block-1', title: 'Лоб', subtitle: '', price: 499, img: 'img/block-1.jpg',
    desc: 'Опис' },
  { id: 'block-2', title: 'Очі', subtitle: '', price: 499, img: 'img/block-2.jpg',
    desc: 'Опис' },
  { id: 'block-3', title: 'Уентральна частина обличчя та носогубка', subtitle: '', price: 499, img: 'img/block-3.jpg',
    desc: 'Опис' },
  { id: 'block-4', title: 'Антібрилі', subtitle: 'Назва', price: 499, img: 'img/block-4.jpg',
    desc: 'Опис' },
  { id: 'block-5', title: '', subtitle: 'Назва', price: 499, img: 'img/block-5.jpg',
    desc: 'Опис' },
  { id: 'block-6', title: '', subtitle: 'Назва', price: 499, img: 'img/block-6.jpg',
    desc: 'Опис' },
  { id: 'block-7', title: '', subtitle: 'Назва', price: 499, img: 'img/block-7.jpg',
    desc: 'Опис' },
];

let allowedSet = new Set();
let currentBlockId = null;

// email теперь берём НЕ из localStorage, а из cookie-сессии (OTP)
let sessionEmail = null;

/*************************************************
 * HELPERS: LOCAL CACHE (только для удобства UI)
 * Можно оставить, но мы будем уважать сервер.
 *************************************************/

function getLocalAllowed() {
  try { return JSON.parse(localStorage.getItem('allowed') || '[]'); }
  catch { return []; }
}
function setLocalAllowed(arr) {
  localStorage.setItem('allowed', JSON.stringify(arr || []));
}
function addLocalAllowed(blockId) {
  const s = new Set(getLocalAllowed());
  s.add(blockId);
  setLocalAllowed([...s]);
}
function clearLocalAllowed() {
  localStorage.removeItem('allowed');
}

/*************************************************
 * RENDER TILES
 *************************************************/

function renderTiles() {
  const grid = document.getElementById('tilesGrid');
  if (!grid) {
    console.warn('tilesGrid not found in HTML');
    return;
  }

  grid.innerHTML = BLOCKS.map(b => {
    const open = allowedSet.has(b.id);
    return `
      <div class="tile ${open ? 'is-open' : 'is-locked'}" data-id="${b.id}">
        <div class="tile__image">
          <img src="${b.img}" alt="${b.title}">
        </div>
        <div class="tile__content">
          <div class="tile__title">${b.title}</div>
          <div class="tile__subtitle">${b.subtitle}</div>
          <div class="tile__price">${b.price} грн</div>
          <div class="muted" style="font-size:12px;">
            ${open ? '✅ Куплено. Натисніть, щоб відкрити' : '🔒 Натисніть щоб подивитися та купити'}
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.tile').forEach(tile => {
    tile.addEventListener('click', () => openBlockModal(tile.dataset.id));
  });
}

/*************************************************
 * BLOCK MODAL (описание + купить/открыть)
 *************************************************/

const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');

const modalImg = document.getElementById('modalImg');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalPrice = document.getElementById('modalPrice');
const modalBadge = document.getElementById('modalBadge');

const modalBuyBtn = document.getElementById('modalBuyBtn');
const modalOpenBtn = document.getElementById('modalOpenBtn');

function openBlockModal(blockId) {
  const block = BLOCKS.find(b => b.id === blockId);
  if (!block || !modalOverlay) return;

  currentBlockId = blockId;
  const isOpen = allowedSet.has(blockId);

  if (modalImg) {
    modalImg.src = block.img;
    modalImg.alt = block.title;
  }
  if (modalTitle) modalTitle.textContent = `${block.title} — ${block.subtitle}`;
  if (modalDesc) modalDesc.textContent = block.desc;
  if (modalPrice) modalPrice.textContent = `${block.price} грн`;

  if (modalBadge) {
    modalBadge.textContent = isOpen ? 'Відкрито' : 'Закрито';
    modalBadge.classList.toggle('open', isOpen);
  }

  if (isOpen) {
    if (modalBuyBtn) modalBuyBtn.style.display = 'none';
    if (modalOpenBtn) {
      modalOpenBtn.style.display = 'inline-flex';
      modalOpenBtn.href = `block.html?bid=${encodeURIComponent(blockId)}`;
    }
  } else {
    if (modalBuyBtn) modalBuyBtn.style.display = 'inline-flex';
    if (modalOpenBtn) {
      modalOpenBtn.style.display = 'none';
      modalOpenBtn.href = '#';
    }
  }

  modalOverlay.classList.add('open');
  modalOverlay.setAttribute('aria-hidden', 'false');
}

function closeBlockModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
  currentBlockId = null;
}

if (modalClose) modalClose.addEventListener('click', closeBlockModal);
if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeBlockModal();
  });
}

/*************************************************
 * AUTH UI (OTP cookie)
 *************************************************/

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function setAuthButtons() {
  const loggedIn = !!sessionEmail;
  if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'inline-flex';
  if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-flex' : 'none';
}

function goToLogin() {
  // ВАЖНО: теперь логин делаем на login.html (OTP)
  window.location.href = 'login.html';
}

if (loginBtn) loginBtn.addEventListener('click', goToLogin);

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      // даже если сеть упала — чистим локально
    }
    sessionEmail = null;
    allowedSet = new Set();
    clearLocalAllowed();
    setAuthButtons();
    renderTiles();
  });
}

/*************************************************
 * ACCESS (через cookie /api/me + /api/access)
 *************************************************/

async function loadMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    const data = await r.json();
    sessionEmail = (data && data.ok && data.email) ? data.email : null;
  } catch (e) {
    sessionEmail = null;
  }
}

async function loadAccess() {
  // быстрый UI: показываем кэш только если уже когда-то были разрешения
  // (но окончательное состояние берём от сервера)
  const localAllowed = getLocalAllowed();
  if (localAllowed.length) {
    allowedSet = new Set(localAllowed);
    renderTiles();
  }

  // если не залогинен — серверный доступ пустой
  if (!sessionEmail) {
    allowedSet = new Set();           // строго: без логина доступа нет
    renderTiles();
    return;
  }

  try {
    // теперь просим доступ БЕЗ email, по cookie
    const res = await fetch('/api/access', { credentials: 'include' });
    const data = await res.json();

    const allowed = (data.allowed || []);
    allowedSet = new Set(allowed);
    setLocalAllowed(allowed);
    renderTiles();
  } catch (err) {
    console.error('ACCESS ERROR', err);
    // остаёмся на local cache
  }
}

/*************************************************
 * BUY (DEV) — с cookie. UI обновляется сразу.
 *************************************************/

async function buyProduct(productId) {
  if (!sessionEmail) {
    // нет сессии -> на login.html
    goToLogin();
    return;
  }

  try {
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // email больше не нужен, но оставим fallback если сервер старый:
      body: JSON.stringify({ productId, email: sessionEmail })
    });

    const data = await res.json();

    if (data.status !== 'ok') {
      alert('Ошибка: ' + (data.message || 'unknown'));
      return;
    }

    // ✅ сразу обновляем UI (без перезагрузки)
    allowedSet.add(productId);
    addLocalAllowed(productId);
    renderTiles();

    if (modalBadge) {
      modalBadge.textContent = 'Відкрито';
      modalBadge.classList.add('open');
    }
    if (modalBuyBtn) modalBuyBtn.style.display = 'none';
    if (modalOpenBtn) {
      modalOpenBtn.style.display = 'inline-flex';
      modalOpenBtn.href = `block.html?bid=${encodeURIComponent(productId)}`;
    }

    if (data.mode === 'wayforpay' && data.payUrl && data.fields) {
  // отправляем пользователя на оплату (POST form)
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = data.payUrl;
  f.style.display = 'none';

  // WayForPay принимает массивы productName/productPrice/productCount
  for (const [k, v] of Object.entries(data.fields)) {
    if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        const inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = `${k}[${idx}]`;
        inp.value = String(item);
        f.appendChild(inp);
      });
    } else {
      const inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = k;
      inp.value = String(v);
      f.appendChild(inp);
    }
  }

  document.body.appendChild(f);
  f.submit();
  return;
}

// dev fallback: сразу на блок
window.location.href = data.redirectUrl || `block.html?bid=${encodeURIComponent(productId)}`;

  } catch (err) {
    console.error('BUY ERROR', err);
    alert('Ошибка соединения с сервером');
  }
}

/*************************************************
 * MODAL BUY BTN
 *************************************************/

if (modalBuyBtn) {
  modalBuyBtn.addEventListener('click', () => {
    if (!currentBlockId) return;
    buyProduct(currentBlockId);
  });
}

/*************************************************
 * START
 *************************************************/

window.addEventListener('load', async () => {
  renderTiles();        // первичный рендер
  await loadMe();       // узнаём, есть ли сессия
  setAuthButtons();
  await loadAccess();   // подтягиваем allowed с сервера
});
