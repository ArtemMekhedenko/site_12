// ====== ДАННЫЕ КУРСОВ (легко менять) ======
const COURSES = [
  { id: 'course-1', title: 'Функциональная сила', priceFrom: 499, img: 'course1.jpg' },
  { id: 'course-2', title: 'Выносливость',         priceFrom: 499, img: 'course2.jpg' },
  { id: 'course-3', title: 'Мобильность',          priceFrom: 499, img: 'course3.jpg' },
  { id: 'course-4', title: 'Взрывная сила',        priceFrom: 499, img: 'course4.jpg' },
];

// ====== РЕНДЕР КАРТОЧЕК КУРСОВ ======
const grid = document.getElementById('coursesGrid');
if (grid) {
  grid.innerHTML = COURSES.map(c => `
    <a class="course-card" href="course.html?cid=${encodeURIComponent(c.id)}" style="--bg:url('${c.img}')">
      <div class="course-card__overlay">
        <div class="course-card__title">${c.title}</div>
        <div class="course-card__price">от ${c.priceFrom} грн</div>
      </div>
    </a>
  `).join('');
}

// ====== FAQ АККОРДЕОН ======
document.querySelectorAll('.faq-item').forEach(item => {
  const q = item.querySelector('.faq-q');
  const a = item.querySelector('.faq-a');

  q.addEventListener('click', () => {
    const open = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(x => x.classList.remove('open'));
    if (!open) item.classList.add('open');
  });

  // на всякий случай закрыть
  a.style.maxHeight = '0px';
});

const observer = new MutationObserver(() => {
  document.querySelectorAll('.faq-item').forEach(item => {
    const a = item.querySelector('.faq-a');
    if (item.classList.contains('open')) {
      a.style.maxHeight = a.scrollHeight + 'px';
    } else {
      a.style.maxHeight = '0px';
    }
  });
});
observer.observe(document.getElementById('faqList'), { subtree: true, attributes: true });

// ====== SMOOTH SCROLL ======
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // закрываем моб. меню
    const m = document.getElementById('mobileMenu');
    if (m) m.classList.remove('open');
  });
});

const burgerBtn = document.getElementById('burgerBtn');
const mobileMenu = document.getElementById('mobileMenu');
const overlay = document.getElementById('menuOverlay');

if (burgerBtn && mobileMenu && overlay) {
  const openMenu = () => {
    mobileMenu.classList.add('open');
    overlay.classList.add('open');
    burgerBtn.textContent = '✕';
  };

  const closeMenu = () => {
    mobileMenu.classList.remove('open');
    overlay.classList.remove('open');
    burgerBtn.textContent = '☰';
  };

  burgerBtn.addEventListener('click', () => {
    mobileMenu.classList.contains('open') ? closeMenu() : openMenu();
  });

  // клик по затемнению — закрывает меню
  overlay.addEventListener('click', closeMenu);

  // клик по пункту меню — закрывает
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}




// ====== YEAR ======
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const navLinks = document.querySelectorAll('.nav__link');
const sections = document.querySelectorAll('section[id]');

function setActiveLink() {
  let scrollY = window.pageYOffset;

  sections.forEach(section => {
    const sectionTop = section.offsetTop - 120;
    const sectionHeight = section.offsetHeight;
    const sectionId = section.getAttribute('id');

    if (
      scrollY >= sectionTop &&
      scrollY < sectionTop + sectionHeight
    ) {
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionId}`) {
          link.classList.add('active');
        }
      });
    }
  });
}

// при скролле
window.addEventListener('scroll', setActiveLink);

// при клике (мгновенно)
navLinks.forEach(link => {
  link.addEventListener('click', () => {
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});

