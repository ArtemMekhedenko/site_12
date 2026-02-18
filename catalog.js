const CATALOG = {
  "course-1": {
    title: "Курс 1 — уход за кожей",
    blocks: [
      { id: 1, title: "Базовый уход", price: 499 },
      { id: 2, title: "Сыворотки и активы", price: 499 },
      { id: 3, title: "Проблемная кожа", price: 499 },
      { id: 4, title: "Анти-эйдж и восстановление", price: 499 },
    ],
    fullPrice: 1499
  },

  "course-2": { title: "Курс 2 — ...", blocks: [
    { id: 1, title: "Блок 1", price: 499 },
    { id: 2, title: "Блок 2", price: 499 },
    { id: 3, title: "Блок 3", price: 499 },
    { id: 4, title: "Блок 4", price: 499 },
  ], fullPrice: 1499 },

  "course-3": { title: "Курс 3 — ...", blocks: [
    { id: 1, title: "Блок 1", price: 499 },
    { id: 2, title: "Блок 2", price: 499 },
    { id: 3, title: "Блок 3", price: 499 },
    { id: 4, title: "Блок 4", price: 499 },
  ], fullPrice: 1499 },

  "course-4": { title: "Курс 4 — ...", blocks: [
    { id: 1, title: "Блок 1", price: 499 },
    { id: 2, title: "Блок 2", price: 499 },
    { id: 3, title: "Блок 3", price: 499 },
    { id: 4, title: "Блок 4", price: 499 },
  ], fullPrice: 1499 },
};

function makeBlockId(courseId, blockNum) {
  return `${courseId}-block-${blockNum}`;
}
function makeFullId(courseId) {
  return `${courseId}-full`;
}

module.exports = { CATALOG, makeBlockId, makeFullId };
