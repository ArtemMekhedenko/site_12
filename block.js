/*************************************************
 * block.js (FULL) — OTP COOKIE VERSION
 * - Access check via /api/me + /api/access (cookie)
 * - Lessons from /api/lessons
 * - Active highlight + "Сейчас"
 * - Lesson progress + resume time
 * - Prev/Next + autoplay next
 * - Block progress + "Просмотрено ✔"
 * - Completion screen when all lessons done
 * - Buy button works from block page (DEV) + instant unlock
 *************************************************/

function getParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

const blockId = getParam('bid');

// elements (from block.html)
const blockTitle = document.getElementById('blockTitle');
const blockSub = document.getElementById('blockSub');

const lessonsBox = document.getElementById('lessonsBox');
const lockedBox = document.getElementById('lockedBox');

const videoPlayer = document.getElementById('videoPlayer');
const videoLocked = document.getElementById('videoLocked');

const lessonTitle = document.getElementById('lessonTitle');
const lessonHint = document.getElementById('lessonHint');

const logoutBtn = document.getElementById('logoutBtn');

const prevLessonBtn = document.getElementById('prevLessonBtn');
const nextLessonBtn = document.getElementById('nextLessonBtn');

// block progress UI
const blockProgressText = document.getElementById('blockProgressText');
const blockProgressCount = document.getElementById('blockProgressCount');
const blockProgressBar = document.getElementById('blockProgressBar');

// completion modal
const doneOverlay = document.getElementById('doneOverlay');
const doneClose = document.getElementById('doneClose');
const doneOk = document.getElementById('doneOk');

// buy button on locked state (if exists)
const buyBlockBtn = document.getElementById('buyBlockBtn'); // если у тебя есть id
// если нет — попробуем найти по тексту/классу:
const fallbackBuyBtn = buyBlockBtn || document.querySelector('[data-buy-block], .buy-block-btn');

if (!blockId) {
  alert('Не указан блок (bid)');
  window.location.href = 'index.html#blocks';
}

if (blockTitle) blockTitle.textContent = `Блок: ${blockId}`;

// state
let currentLessons = [];
let currentIdx = 0;
let sessionEmail = null;

// ===== logout =====
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    window.location.href = 'index.html#blocks';
  });
}

// ===== keys =====
function progressKey(idx) { return `progress-${blockId}-${idx}`; } // 0..100
function timeKey(idx) { return `time-${blockId}-${idx}`; }         // seconds
function lastKey() { return `last-${blockId}`; }
function doneKey(idx) { return `done-${blockId}-${idx}`; }         // "1" if watched

// ===== UI helpers =====
function setLockedState(text) {
  if (blockSub) blockSub.textContent = 'Доступ закрыт';
  if (lessonHint) lessonHint.textContent = text || 'Купите блок на главной странице, чтобы открыть уроки.';

  if (videoPlayer) videoPlayer.style.display = 'none';
  if (videoLocked) videoLocked.style.display = 'block';

  if (lockedBox) lockedBox.style.display = 'block';
  if (lessonsBox) lessonsBox.innerHTML = '';

  if (prevLessonBtn) prevLessonBtn.style.display = 'none';
  if (nextLessonBtn) nextLessonBtn.style.display = 'none';

  // reset block progress UI
  if (blockProgressText) blockProgressText.textContent = 'Прогрес: —';
  if (blockProgressCount) blockProgressCount.textContent = '';
  if (blockProgressBar) blockProgressBar.style.width = '0%';

  // показать кнопку покупки если есть
  if (fallbackBuyBtn) fallbackBuyBtn.style.display = 'inline-flex';
}

function setOpenShell() {
  if (blockSub) blockSub.textContent = 'Доступ відкритий ✅';
  if (lessonHint) lessonHint.textContent = '';

  if (videoPlayer) videoPlayer.style.display = 'block';
  if (videoLocked) videoLocked.style.display = 'none';

  if (lockedBox) lockedBox.style.display = 'none';

  if (prevLessonBtn) prevLessonBtn.style.display = 'inline-flex';
  if (nextLessonBtn) nextLessonBtn.style.display = 'inline-flex';

  if (fallbackBuyBtn) fallbackBuyBtn.style.display = 'none';
}

function openDoneModal() {
  if (!doneOverlay) return;
  doneOverlay.classList.add('open');
  doneOverlay.setAttribute('aria-hidden', 'false');
}
function closeDoneModal() {
  if (!doneOverlay) return;
  doneOverlay.classList.remove('open');
  doneOverlay.setAttribute('aria-hidden', 'true');
}
if (doneOverlay) {
  doneOverlay.addEventListener('click', (e) => {
    if (e.target === doneOverlay) closeDoneModal();
  });
}
doneClose?.addEventListener('click', closeDoneModal);
doneOk?.addEventListener('click', closeDoneModal);

// ===== API =====
async function fetchMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    const data = await r.json();
    sessionEmail = (data?.ok && data.email) ? data.email : null;
  } catch (_) {
    sessionEmail = null;
  }
}

async function fetchLessons() {
  const res = await fetch(`/api/lessons?blockId=${encodeURIComponent(blockId)}`, { credentials: 'include' });
  const data = await res.json();
  if (data.status !== 'ok') return [];
  return data.lessons || [];
}

async function checkAccess() {
  // cookie-based access
  const res = await fetch('/api/access', { credentials: 'include' });
  const data = await res.json();
  if (data.status !== 'ok') return false;
    const allowed = (data.allowed || []);
  if (allowed.includes(blockId)) return true;
  // allow full course purchase: course-1-block-2 -> course-1-full
  const m = String(blockId || '').match(/^(course-\d+)-block-\d+$/);
  if (m && allowed.includes(`${m[1]}-full`)) return true;
  return false;
}

async function buyThisBlock() {
  // если не залогинен — отправим на login.html
  if (!sessionEmail) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // email добавим как fallback (если сервер ещё ждёт email)
      body: JSON.stringify({ productId: blockId, email: sessionEmail })
    });
    const data = await res.json();

    if (data.status !== 'ok') {
      alert(data.message || 'Ошибка оплаты/покупки');
      return;
    }

    // ✅ моментально повторно проверяем доступ и перерисовываем
    const allowed = await checkAccess();
    if (!allowed) {
      // на случай задержки БД — подождём 400мс и попробуем ещё раз
      await new Promise(r => setTimeout(r, 400));
    }

    await init(true); // re-init, forced
  } catch (e) {
    console.error(e);
    alert('Ошибка соединения с сервером.');
  }
}

if (fallbackBuyBtn) {
  fallbackBuyBtn.addEventListener('click', buyThisBlock);
}

// ===== Progress calc =====
function getLessonProgress(idx) {
  const p = Number(localStorage.getItem(progressKey(idx)) || 0);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
}

function isLessonDone(idx) {
  if (localStorage.getItem(doneKey(idx)) === '1') return true;
  return getLessonProgress(idx) >= 90;
}

function updateBlockProgressUI() {
  if (!currentLessons.length) {
    if (blockProgressText) blockProgressText.textContent = 'Прогрес: 0%';
    if (blockProgressCount) blockProgressCount.textContent = '0/0';
    if (blockProgressBar) blockProgressBar.style.width = '0%';
    return;
  }

  let doneCount = 0;
  for (let i = 0; i < currentLessons.length; i++) {
    if (isLessonDone(i)) doneCount++;
  }

  const percent = Math.round((doneCount / currentLessons.length) * 100);

  if (blockProgressText) blockProgressText.textContent = `Прогресс: ${percent}%`;
  if (blockProgressCount) blockProgressCount.textContent = `${doneCount}/${currentLessons.length}`;
  if (blockProgressBar) blockProgressBar.style.width = `${percent}%`;

  if (doneCount === currentLessons.length && currentLessons.length > 0) {
    const flag = `done-block-${blockId}`;
    if (localStorage.getItem(flag) !== '1') {
      localStorage.setItem(flag, '1');
      openDoneModal();
    }
  }
}

function updateLessonRowUI(idx) {
  if (!lessonsBox) return;

  const row = lessonsBox.querySelector(`.lesson-item[data-idx="${idx}"]`);
  if (!row) return;

  if (isLessonDone(idx)) row.classList.add('done');
  else row.classList.remove('done');

  const bar = row.querySelector('.lesson-progress-bar');
  if (bar) bar.style.width = `${getLessonProgress(idx)}%`;

  const existing = row.querySelector('.lesson-check');
  if (isLessonDone(idx)) {
    if (!existing) {
      const check = document.createElement('span');
      check.className = 'lesson-check';
      check.innerHTML = `<i>✔</i> Просмотрено`;
      row.appendChild(check);
    }
  } else {
    existing?.remove();
  }
}

// ===== render lessons list =====
function renderLessons(lessons) {
  currentLessons = lessons;

  if (!lessonsBox) return;

  if (!lessons.length) {
    lessonsBox.innerHTML = `<div class="muted">Уроков пока нет.</div>`;
    if (lessonTitle) lessonTitle.textContent = 'Уроки';
    if (prevLessonBtn) prevLessonBtn.disabled = true;
    if (nextLessonBtn) nextLessonBtn.disabled = true;
    updateBlockProgressUI();
    return;
  }

  lessonsBox.innerHTML = lessons.map((l, idx) => {
    const p = getLessonProgress(idx);
    return `
      <div class="lesson-item" data-idx="${idx}">
        <span class="lesson-dot"></span>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:900; line-height:1.25;">${l.title}</div>
          <div class="lesson-progress">
            <div class="lesson-progress-bar" style="width:${p}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lessonsBox.querySelectorAll('.lesson-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.idx);
      goToLesson(idx);
    });
  });

  for (let i = 0; i < lessons.length; i++) updateLessonRowUI(i);

  const saved = localStorage.getItem(lastKey());
  const startIdx = saved !== null ? Number(saved) : 0;
  goToLesson(Number.isFinite(startIdx) ? startIdx : 0);

  updateBlockProgressUI();
}

// ===== navigation =====
function updateNavButtons() {
  if (prevLessonBtn) prevLessonBtn.disabled = (currentIdx <= 0);
  if (nextLessonBtn) nextLessonBtn.disabled = (currentLessons.length === 0 || currentIdx >= currentLessons.length - 1);
}

function markActiveLesson(idx) {
  if (!lessonsBox) return;

  lessonsBox.querySelectorAll('.lesson-item').forEach(x => x.classList.remove('active'));
  lessonsBox.querySelectorAll('.lesson-now').forEach(b => b.remove());

  const active = lessonsBox.querySelector(`.lesson-item[data-idx="${idx}"]`);
  if (active) {
    active.classList.add('active');

    const badge = document.createElement('div');
    badge.className = 'lesson-now';
    badge.textContent = 'Сейчас';
    active.appendChild(badge);
  }
}

function playLesson(idx) {
  const lesson = currentLessons[idx];
  if (!lesson || !videoPlayer) return;

  // если lesson.video_url пустой — просто не стартуем
  if (!lesson.video_url) {
    if (lessonTitle) lessonTitle.textContent = lesson.title;
    if (lessonHint) lessonHint.textContent = 'Видео ещё не загружено для этого урока.';
    videoPlayer.pause();
    videoPlayer.innerHTML = '';
    return;
  }

  currentIdx = idx;
  localStorage.setItem(lastKey(), String(idx));

  if (lessonTitle) lessonTitle.textContent = lesson.title;
  if (lessonHint) lessonHint.textContent = '';

  videoPlayer.pause();
  videoPlayer.innerHTML = '';

  const source = document.createElement('source');
  source.src = lesson.video_url;
  source.type = 'video/mp4';
  videoPlayer.appendChild(source);

  videoPlayer.load();

  const savedTime = Number(localStorage.getItem(timeKey(idx)) || 0);
  const safeTime = Number.isFinite(savedTime) ? Math.max(0, savedTime) : 0;

  const onMeta = () => {
    if (safeTime > 0 && videoPlayer.duration && safeTime < videoPlayer.duration - 1) {
      videoPlayer.currentTime = safeTime;
    }
    videoPlayer.removeEventListener('loadedmetadata', onMeta);
  };
  videoPlayer.addEventListener('loadedmetadata', onMeta);

  videoPlayer.play().catch(() => {});
}

function goToLesson(idx) {
  if (!currentLessons.length) return;

  if (idx < 0) idx = 0;
  if (idx >= currentLessons.length) idx = currentLessons.length - 1;

  currentIdx = idx;
  markActiveLesson(idx);
  playLesson(idx);
  updateNavButtons();
}

// prev/next buttons
prevLessonBtn?.addEventListener('click', () => goToLesson(currentIdx - 1));
nextLessonBtn?.addEventListener('click', () => goToLesson(currentIdx + 1));

// ===== video events: progress + done + autoplay next =====
if (videoPlayer) {
  videoPlayer.addEventListener('timeupdate', () => {
    if (!videoPlayer.duration || !currentLessons.length) return;

    const percent = Math.floor((videoPlayer.currentTime / videoPlayer.duration) * 100);
    localStorage.setItem(timeKey(currentIdx), String(videoPlayer.currentTime));
    localStorage.setItem(progressKey(currentIdx), String(percent));

    if (percent >= 90) localStorage.setItem(doneKey(currentIdx), '1');

    updateLessonRowUI(currentIdx);
    updateBlockProgressUI();
  });

  videoPlayer.addEventListener('ended', () => {
    if (!currentLessons.length) return;

    localStorage.setItem(doneKey(currentIdx), '1');
    localStorage.setItem(progressKey(currentIdx), '100');
    updateLessonRowUI(currentIdx);
    updateBlockProgressUI();

    if (currentIdx < currentLessons.length - 1) {
      goToLesson(currentIdx + 1);
    }
  });
}

// ===== start =====
async function init(force = false) {
  try {
    await fetchMe();

    // если не залогинен — сразу lock + кнопка ведёт на login
    if (!sessionEmail) {
      setLockedState('🔒 Увійдіть, щоб перевірити доступ і відкрити уроки.');
      return;
    }

    const allowed = await checkAccess();
    if (!allowed) {
      setLockedState('🔒 У вас нет доступа к этому блоку. Купите его на главной странице.');
      return;
    }

    setOpenShell();
    const lessons = await fetchLessons();
    renderLessons(lessons);
  } catch (e) {
    console.error(e);
    setLockedState('Ошибка соединения с сервером.');
  }
}

window.addEventListener('load', () => init(false));
