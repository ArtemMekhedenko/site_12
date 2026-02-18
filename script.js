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
 * HELPERS
 *************************************************/
function getEmail() {
  return localStorage.getItem('email');
}
function setEmail(email) {
  localStorage.setItem('email', email);
}
function clearEmail() {
  localStorage.removeItem('email');
}

/*************************************************
 * RENDER TILES
 *************************************************/
function renderTiles() {
  const grid = document.getElementById('tilesGrid');
  if (!grid) return;

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

if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeBlockModal();
  });
}
if (modalClose) modalClose.addEventListener('click', closeBlockModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay?.classList.contains('open')) closeBlockModal();
});

if (modalBuyBtn) {
  modalBuyBtn.addEventListener('click', () => {
    if (!currentBlockId) return;
    ensureLoggedInThen(() => buyProduct(currentBlockId));
  });
}

/*************************************************
 * LOGIN MODAL
 *************************************************/
const loginOverlay = document.getElementById('loginOverlay');
const loginClose = document.getElementById('loginClose');
const loginCancel = document.getElementById('loginCancel');
const loginSubmit = document.getElementById('loginSubmit');
const loginEmail = document.getElementById('loginEmail');

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function openLoginModal(prefill = '') {
  if (!loginOverlay) return;
  loginEmail.value = prefill || '';
  loginOverlay.classList.add('open');
  loginOverlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => loginEmail.focus(), 50);
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
    setAuthButtons();
    renderTiles();
  });
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function ensureLoggedInThen(fn) {
  const email = getEmail();
  if (email) return fn();
  openLoginModal('');
  // после успешного логина вызовем fn
  pendingAfterLogin = fn;
}

let pendingAfterLogin = null;

async function doLogin() {
  const email = (loginEmail.value || '').trim().toLowerCase();
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
  if (!email) {
    allowedSet = new Set();
    renderTiles();
    return;
  }

  try {
    const res = await fetch(`/api/access?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    allowedSet = new Set((data.allowed || []));
    renderTiles();
  } catch (err) {
    console.error('ACCESS ERROR', err);
    allowedSet = new Set();
    renderTiles();
  }
}

/*************************************************
 * BUY (DEV)
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

    // DEV: сразу переходим на успех
    if (data.dev) {
      window.location.href = `payment-success.html?orderRef=${encodeURIComponent(data.orderRef)}`;
      return;
    }

  } catch (err) {
    console.error('BUY ERROR', err);
    alert('Ошибка соединения с сервером');
  }
}

/*************************************************
 * START
 *************************************************/
window.addEventListener('load', () => {
  setAuthButtons();
  loadAccess();
});
