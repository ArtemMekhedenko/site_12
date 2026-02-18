const { text } = require("express");

// Если уже залогинен — сразу на курс (можешь поменять на главную)
const existingEmail = localStorage.getItem('email');
if (existingEmail) {
  // Можно отправлять на главную или туда, где был пользователь
  // window.location.href = 'index.html';
}

const form = document.getElementById('loginForm');
const input = document.getElementById('emailInput');
const hint = document.getElementById('hint');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = input.value.trim().toLowerCase();
  if (!email) return;

  // Проверим, есть ли покупки (чтобы не пускать "пустых")
  const res = await fetch(`/api/purchases?email=${encodeURIComponent(email)}`);
  const data = await res.json();

  if (data.status !== 'ok') {
    hint.textContent = 'Ошибка сервера. Попробуйте позже.';
    return;
  }

  if (!data.purchases || data.purchases.length === 0) {
    hint.textContent = 'Покупок по этому email не найдено. Проверьте email.';
    return;
  }

  localStorage.setItem('email', email);
  hint.textContent = 'Успешно! Перенаправляю...';

  // куда отправлять после входа:
  window.location.href = 'course.html';
});
