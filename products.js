const PRODUCTS = {
  "block-1": { name: "Блок 1 — ...", price: 499 },
  "block-2": { name: "Блок 2 — ...", price: 499 },
  "block-3": { name: "Блок 3 — ...", price: 499 },
  "block-4": { name: "Блок 4 — ...", price: 499 },
  "block-5": { name: "Блок 5 — ...", price: 499 },
  "block-6": { name: "Блок 6 — ...", price: 499 },
  "block-7": { name: "Блок 7 — ...", price: 499 },
};
function getProduct(productId){ return PRODUCTS[productId] || null; }
module.exports = { PRODUCTS, getProduct };
