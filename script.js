/*************************************************
 * БЛОКИ (7)
 *************************************************/

const BLOCKS = [
  { id: 'block-1', title: 'Блок 1', subtitle: 'Базовый уход', price: 499, img: 'img/block-1.jpg',
    desc: 'Что такое базовый уход, как подобрать средства под тип кожи и выстроить ежедневную рутину.' },
  { id: 'block-2', title: 'Блок 2', subtitle: 'Активы и сыворотки', price: 499, img: 'img/block-2.jpg',
    desc: 'Разбор активов (витамин C, ретинол, кислоты), как сочетать и не навредить коже.' },
  { id: 'block-3', title: 'Блок 3', subtitle: 'Проблемная кожа', price: 499, img: 'img/block-3.jpg',
    desc: 'Работа с воспалениями, чувствительностью и барьером кожи. План на 2–4 недели.' },
  { id: 'block-4', title: 'Блок 4', subtitle: 'Anti-age', price: 499, img: 'img/block-4.jpg',
    desc: 'Антиэйдж-стратегия: упругость, тонус, поддержка коллагена. Нежно и эффективно.' },
  { id: 'block-5', title: 'Блок 5', subtitle: 'Массажи лица', price: 499, img: 'img/block-5.jpg',
    desc: 'Техники самомассажа, лимфодренаж, как делать безопасно и с результатом.' },
  { id: 'block-6', title: 'Блок 6', subtitle: 'Домашний уход', price: 499, img: 'img/block-6.jpg',
    desc: 'Домашние процедуры, расписание ухода, как поддерживать эффект стабильно.' },
  { id: 'block-7', title: 'Блок 7', subtitle: 'Поддержка результата', price: 499, img: 'img/block-7.jpg',
    desc: 'Как закрепить результат, что делать при откатах и как не бросать уход.' },
];

let allowedSet = new Set();
let currentBlockId = null;

/*************************************************
 * HELPERS: EMAIL + LOCAL ALLOWED
 *************************************************/

function getEmail() {
  return localStorage.getItem('email') || '';
}
function setEmail(email) {
  localStorage.setItem('email', email);
}
function clearEmail() {
  localStorage.removeItem('email');
}

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
            ${open ? '✅ Куплено. Нажми чтобы открыть' : '🔒 Нажми чтобы посмотреть и купить'}
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

  modalImg.src = block.img;
  modalImg.alt = block.title;
  modalTitle.textContent = `${block.title} — ${block.subtitle}`;
  modalDesc.textContent = block.desc;
  modalPrice.textContent = `${block.price} грн`;

  modalBadge.textContent = isOpen ? 'Открыто' : 'Закрыто';
  modalBadge.classList.toggle('open', isOpen);

  if (isOpen) {
    modalBuyBtn.style.display = 'none';
    modalOpenBtn.style.display = 'inline-flex';
    modalOpenBtn.href = `block.html?bid=${encodeURIComponent(blockId)}`;
  } else {
    modalBuyBtn.style.display = 'inline-flex';
    modalOpenBtn.style.display = 'none';
    modalOpenBtn.href = '#';
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
 * LOGIN MODAL
 *************************************************/

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const loginOverlay = document.getElementById('loginOverlay');
const loginClose = document.getElementById('loginClose');
const loginCancel = document.getElementById('loginCancel');
const loginSubmit = document.getElementById('loginSubmit');
const loginEmail = document.getElementById('loginEmail');

let pendingAfterLogin = null;

function openLoginModal(prefillEmail) {
  if (!loginOverlay) return;
  if (loginEmail) loginEmail.value = (prefillEmail || '').trim();
  loginOverlay.classList.add('open');
  loginOverlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => loginEmail?.focus(), 50);
}

function closeLoginModal() {
  if (!loginOverlay) return;
  loginOverlay.classList.remove('open');
  loginOverlay.setAttribute('aria-hidden', 'true');
}

if (loginOverlay) {
  loginOverlay.addEventListener('click', (e) => {
    if (e.target === loginOverlay) closeLoginModal();
  });
}
if (loginClose) loginClose.addEventListener('click', closeLoginModal);
if (loginCancel) loginCancel.addEventListener('click', closeLoginModal);

function setAuthButtons() {
  const email = getEmail();
  if (loginBtn) loginBtn.style.display = email ? 'none' : 'inline-flex';
  if (logoutBtn) logoutBtn.style.display = email ? 'inline-flex' : 'none';
}

if (loginBtn) {
  loginBtn.addEventListener('click', () => openLoginModal(''));
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearEmail();
    allowedSet = new Set();
    setLocalAllowed([]);
    setAuthButtons();
    renderTiles();
  });
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function doLogin() {
  const email = (loginEmail?.value || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    alert('Введите корректный email');
    return;
  }

  setEmail(email);
  closeLoginModal();
  setAuthButtons();
  await loadAccess();

  if (typeof pendingAfterLogin === 'function') {
    const f = pendingAfterLogin;
    pendingAfterLogin = null;
    f();
  }
}

if (loginSubmit) loginSubmit.addEventListener('click', doLogin);
if (loginEmail) {
  loginEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

/*************************************************
 * ACCESS
 *************************************************/

async function loadAccess() {
  const email = getEmail();

  // сначала применим локальный кэш — чтобы UI был мгновенным
  const localAllowed = getLocalAllowed();
  allowedSet = new Set(localAllowed);
  renderTiles();

  if (!email) return;

  // потом синхронизируемся с сервером
  try {
    const res = await fetch(`/api/access?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    const allowed = (data.allowed || []);
    allowedSet = new Set(allowed);
    setLocalAllowed(allowed);
    renderTiles();
  } catch (err) {
    console.error('ACCESS ERROR', err);
    // остаёмся на локальном кэше
  }
}

/*************************************************
 * BUY (DEV) — ВАЖНО: обновляет UI СРАЗУ
 *************************************************/

async function buyProduct(productId) {
  const email = getEmail();
  if (!email) {
    openLoginModal('');
    pendingAfterLogin = () => buyProduct(productId);
    return;
  }

  try {
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, email })
    });

    const data = await res.json();

    if (data.status !== 'ok') {
      alert('Ошибка: ' + (data.message || 'unknown'));
      return;
    }

    // ✅ СРАЗУ добавляем доступ в память + localStorage
    allowedSet.add(productId);
    addLocalAllowed(productId);

    // ✅ сразу обновляем плитки и модалку (без перезагрузки)
    renderTiles();

    if (modalBadge) {
      modalBadge.textContent = 'Открыто';
      modalBadge.classList.add('open');
    }
    if (modalBuyBtn) modalBuyBtn.style.display = 'none';
    if (modalOpenBtn) {
      modalOpenBtn.style.display = 'inline-flex';
      modalOpenBtn.href = `block.html?bid=${encodeURIComponent(productId)}`;
    }

    // если сервер дал redirectUrl — переходим
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    } else {
      // по умолчанию: открыть блок
      window.location.href = `block.html?bid=${encodeURIComponent(productId)}`;
    }

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

window.addEventListener('load', () => {
  setAuthButtons();
  loadAccess();
});
