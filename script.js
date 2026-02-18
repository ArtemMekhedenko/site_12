// =====================
//  SkinBlocks script.js
//  - open block modal
//  - buy block (DEV payment)
//  - update UI immediately without reload
//  - access cache in localStorage
// =====================

const API = ""; // always use same-origin on Render

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function getEmail() {
  return localStorage.getItem('email') || '';
}

function setEmail(email) {
  localStorage.setItem('email', email);
}

function getAllowedLocal() {
  try { return JSON.parse(localStorage.getItem('allowed') || '[]'); }
  catch { return []; }
}
function setAllowedLocal(arr) {
  localStorage.setItem('allowed', JSON.stringify(arr || []));
}
function addAllowedLocal(blockId) {
  const s = new Set(getAllowedLocal());
  s.add(blockId);
  setAllowedLocal([...s]);
}
function hasAccessLocal(blockId) {
  return new Set(getAllowedLocal()).has(blockId);
}

// ---------- UI (Cards) ----------
function markCardPurchased(card, blockId) {
  if (!card) card = qs(`[data-block-id="${blockId}"]`);
  if (!card) return;

  card.classList.add('purchased');

  const status = qs('.block-status', card);
  if (status) status.textContent = 'Куплено';

  const btn = qs('.block-action', card);
  if (btn) {
    btn.textContent = 'Открыть';
    btn.dataset.action = 'open';
  }
}

function markCardLocked(card, blockId) {
  if (!card) card = qs(`[data-block-id="${blockId}"]`);
  if (!card) return;

  card.classList.remove('purchased');

  const status = qs('.block-status', card);
  if (status) status.textContent = 'Закрыто';

  const btn = qs('.block-action', card);
  if (btn) {
    btn.textContent = 'Купить';
    btn.dataset.action = 'buy';
  }
}

function refreshCardsFromLocal() {
  qsa('[data-block-id]').forEach(card => {
    const blockId = card.dataset.blockId;
    if (!blockId) return;
    if (hasAccessLocal(blockId)) markCardPurchased(card, blockId);
    else markCardLocked(card, blockId);
  });
}

// ---------- API ----------
async function apiGetAccess(email) {
  const res = await fetch(`${API}/api/access?email=${encodeURIComponent(email)}`);
  return res.json();
}

async function apiCreatePayment(email, blockId) {
  const res = await fetch(`${API}/api/payment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, productId: blockId })
  });
  return res.json();
}

// ---------- Modal ----------
const modal = qs('#blockModal');
const modalTitle = qs('#modalTitle');
const modalDesc = qs('#modalDesc');
const modalPrice = qs('#modalPrice');
const modalBuyBtn = qs('#modalBuyBtn');
const modalCloseBtn = qs('#modalCloseBtn');
const modalError = qs('#modalError');

let selectedBlockId = null;

function openModal(blockId, meta = {}) {
  selectedBlockId = blockId;

  if (modalTitle) modalTitle.textContent = meta.title || `Блок ${blockId}`;
  if (modalDesc) modalDesc.textContent = meta.desc || '';
  if (modalPrice) modalPrice.textContent = meta.price || '';

  if (modalError) modalError.textContent = '';

  // если уже куплено — показываем "Открыть"
  if (modalBuyBtn) {
    if (hasAccessLocal(blockId)) {
      modalBuyBtn.textContent = 'Открыть';
      modalBuyBtn.dataset.mode = 'open';
    } else {
      modalBuyBtn.textContent = 'Купить';
      modalBuyBtn.dataset.mode = 'buy';
    }
  }

  if (modal) modal.classList.add('open');
}

function closeModal() {
  if (modal) modal.classList.remove('open');
  selectedBlockId = null;
}

// ---------- Auth ----------
async function ensureEmail() {
  let email = getEmail();
  if (email) return email;

  // простой UX: попросить email при первом действии
  email = prompt('Введите email (как для покупки):');
  if (!email) return '';

  setEmail(email.trim());
  return getEmail();
}

async function refreshAccessFromServer() {
  const email = getEmail();
  if (!email) return;

  try {
    const data = await apiGetAccess(email);
    if (data.status === 'ok') {
      setAllowedLocal(data.allowed || []);
      refreshCardsFromLocal();
    }
  } catch (e) {
    // ignore
  }
}

// ---------- Actions ----------
async function handleBuyOrOpen() {
  if (!selectedBlockId) return;

  // если уже куплено — сразу открыть
  if (hasAccessLocal(selectedBlockId)) {
    window.location.href = `/block.html?bid=${encodeURIComponent(selectedBlockId)}`;
    return;
  }

  const email = await ensureEmail();
  if (!email) {
    if (modalError) modalError.textContent = 'Нужно указать email.';
    return;
  }

  try {
    const data = await apiCreatePayment(email, selectedBlockId);

    if (data.status !== 'ok') {
      if (modalError) modalError.textContent = 'Ошибка оплаты (DEV).';
      else alert('Ошибка оплаты (DEV).');
      return;
    }

    // ✅ СРАЗУ обновляем UI без перезагрузки
    addAllowedLocal(selectedBlockId);
    markCardPurchased(null, selectedBlockId);

    // закрыть модалку
    closeModal();

    // перейти на страницу блока
    const url = data.redirectUrl || `/block.html?bid=${encodeURIComponent(selectedBlockId)}`;
    window.location.href = url;

  } catch (e) {
    console.error(e);
    if (modalError) modalError.textContent = 'Ошибка соединения с сервером';
    else alert('Ошибка соединения с сервером');
  }
}

// ---------- Event bindings ----------
function bindCards() {
  // клик по карточке
  qsa('[data-block-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      // если кликнули по кнопке внутри — не дублируем
      if (e.target.closest('.block-action')) return;

      const blockId = card.dataset.blockId;
      const meta = {
        title: card.dataset.title || qs('.block-title', card)?.textContent || '',
        desc: card.dataset.desc || qs('.block-desc', card)?.textContent || '',
        price: card.dataset.price || qs('.block-price', card)?.textContent || ''
      };
      openModal(blockId, meta);
    });
  });

  // клик по кнопке "Купить/Открыть" в карточке
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.block-action');
    if (!btn) return;

    const card = btn.closest('[data-block-id]');
    if (!card) return;

    const blockId = card.dataset.blockId;

    if (hasAccessLocal(blockId)) {
      window.location.href = `/block.html?bid=${encodeURIComponent(blockId)}`;
      return;
    }

    const meta = {
      title: card.dataset.title || qs('.block-title', card)?.textContent || '',
      desc: card.dataset.desc || qs('.block-desc', card)?.textContent || '',
      price: card.dataset.price || qs('.block-price', card)?.textContent || ''
    };
    openModal(blockId, meta);
  });
}

function bindModal() {
  modalCloseBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modalBuyBtn?.addEventListener('click', handleBuyOrOpen);
}

// ---------- init ----------
window.addEventListener('load', async () => {
  refreshCardsFromLocal();     // show cached state instantly
  bindCards();
  bindModal();
  await refreshAccessFromServer(); // sync with server (optional)
});
