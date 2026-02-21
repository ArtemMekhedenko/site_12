async function apiGet(url){
  const r = await fetch(url, { credentials: 'include' });
  return r.json();
}
async function apiPost(url, body){
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify(body || {})
  });
  return r.json();
}

function makeFullId(courseId){ return `${courseId}-full`; }
function makeBlockId(courseId, n){ return `${courseId}-block-${n}`; }

function setBusy(btn, busy){
  btn.disabled = !!busy;
  btn.textContent = busy ? 'Зачекайте…' : btn.dataset.label;
}

function courseCard({courseId, course, purchased, onBuy, onOpen}){
  const div = document.createElement('div');
  div.className = 'card';

  const title = document.createElement('h3');
  title.textContent = course.title || courseId;
  div.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'muted';
  const blocksCount = Array.isArray(course.blocks) ? course.blocks.length : 0;
  meta.textContent = `${blocksCount} блок(и) • Повна ціна: ${course.fullPrice} грн`;
  div.appendChild(meta);

  const row = document.createElement('div');
  row.className = 'row';

  const pill = document.createElement('span');
  pill.className = purchased ? 'pill ok' : 'pill';
  pill.textContent = purchased ? 'Доступ є ✅' : 'Не куплено';
  row.appendChild(pill);

  const btn = document.createElement('button');
  btn.className = purchased ? 'btn primary' : 'btn primary';
  btn.dataset.label = purchased ? 'Відкрити' : 'Купити';
  btn.textContent = btn.dataset.label;

  btn.addEventListener('click', async () => {
    if (purchased) return onOpen();
    await onBuy(btn);
  });

  row.appendChild(btn);
  div.appendChild(row);

  return div;
}

async function main(){
  const me = await apiGet('/api/me');
  if (!me?.ok) {
    window.location.href = 'login.html';
    return;
  }
  document.getElementById('meEmail').textContent = me.email;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await apiPost('/api/auth/logout', {});
    window.location.href = 'index.html';
  });

  const catalog = await apiGet('/api/catalog');
  const access = await apiGet('/api/access');
  const allowed = new Set(access?.allowed || []);

  const myBox = document.getElementById('myCourses');
  const allBox = document.getElementById('allCourses');

  myBox.innerHTML = '';
  allBox.innerHTML = '';

  const entries = Object.entries(catalog?.catalog || {});
  for (const [courseId, course] of entries){
    const fullId = makeFullId(courseId);
    const purchased = allowed.has(fullId);

    const onOpen = () => {
      // открываем первый блок курса (можешь заменить на свою страницу курса)
      window.location.href = `block.html?bid=${encodeURIComponent(makeBlockId(courseId, 1))}`;
    };

    const onBuy = async (btn) => {
      setBusy(btn, true);
      try{
        const r = await apiPost('/api/pay/wayforpay/create-invoice', { itemId: fullId });
        if (r?.ok && r.invoiceUrl){
          window.location.href = r.invoiceUrl;
          return;
        }
        alert(r?.message || 'Не вдалося створити оплату');
      } finally {
        setBusy(btn, false);
      }
    };

    const card = courseCard({ courseId, course, purchased, onBuy, onOpen });
    (purchased ? myBox : allBox).appendChild(card);
  }

  if (!myBox.children.length){
    myBox.innerHTML = '<div class="muted">Поки що немає куплених курсів.</div>';
  }
}

main();
