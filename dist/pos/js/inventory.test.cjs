const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', setAttribute() {}, addEventListener() {}, focus() {} });
  return elements.get(id);
}
const products = [
  {id: 1, code: 'SY-001', name: 'Embroidered Kurta', brand: 'Saya', category: 'Suits', price: 2800, qty: 0},
  {id: 2, code: "SP'002", name: '<Linen Kurta>', brand: 'Sapphire', category: 'Single Pcs', price: 3500, qty: 1200},
  {id: 3, code: 'SY-003', name: 'Scarf', brand: 'Saya', category: 'Accessories', price: 800, qty: 5}
];
let reads = 0, updated, deleted, salesRefreshes = 0;
const context = vm.createContext({console, document: {getElementById: el},
  API: {getCategories: async () => [{id:1,name:'Suits'}, {id:2,name:'Accessories'}, {id:3,name:'Single Pcs'}], getProducts: async () => { reads++; return products; }, updateProduct: async p => { updated = p; }, deleteProduct: async code => { deleted = code; }},
  formatCurrency: p => Number(p).toLocaleString(), showToast() {}, showModal() {}, hideModal() {}, showConfirm: async () => true,
  BarcodeTools: {show() {}},
  sales: {loadProducts: async () => { salesRefreshes++; }, renderProducts() {}}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'inventory.js'), 'utf8') + '\nglobalThis.manager = inventory;', context);
(async () => {
  const m = context.manager;
  await m.loadProducts();
  for (const [query, codes] of [['saya', ['SY-001','SY-003']], ['kurta',['SY-001',"SP'002"]], ['saya kurta',['SY-001']], ['2800',['SY-001']], ['2,800',['SY-001']], ['saph',["SP'002"]], ['kurta saya',['SY-001']], ['SY-001',['SY-001']], ['  SAYA   kurta  ',['SY-001']], ['absent',[]]]) {
    m.searchTerm = query; m.applyFilter();
    assert.deepEqual(Array.from(m.filteredProducts, p => p.code), codes, query);
  }
  assert.equal(reads, 1, 'Search stays local');
  assert.match(el('inventory-list').innerHTML, /No products found/);
  m.searchTerm = ''; m.applyFilter();
  assert.match(el('inventory-list').innerHTML, /&lt;Linen Kurta&gt;/);
  assert.match(el('inventory-list').innerHTML, /1200/);
  assert.match(el('inventory-list').innerHTML, /Out of stock/);
  m.editProduct('SY-001');
  el('product-qty').value = '0'; el('product-code').value = 'SY-001';
  await m.handleProductFormSubmit();
  assert.equal(updated.brand, 'Saya'); assert.equal(updated.qty, 0); assert.equal(updated.code, 'SY-001');
  await m.deleteProduct("SP'002"); assert.equal(deleted, "SP'002"); assert.equal(salesRefreshes, 2);
  context.API.getProducts = async () => [];
  await m.loadProducts(); assert.match(el('inventory-list').innerHTML, /No inventory available/);
  for (const heading of ['Product Name', 'Category', 'Brand', 'Price', 'Quantity / Stock', 'SKU / Code', 'Actions']) assert.ok(el('inventory-list').innerHTML.includes(heading));
  context.API.getProducts = async () => { throw new Error('Fixture failure'); };
  await m.loadProducts(); assert.match(el('inventory-list').innerHTML, /Unable to load inventory/);
  m.loading = true; m.render(); assert.match(el('inventory-list').innerHTML, /Loading inventory/);
  console.log('PASS: search examples, local filtering, safe rendering, stock display, zero-stock save, code preservation, delete/POS refresh, empty/error/loading states');
})().catch(error => { console.error(error); process.exitCode = 1; });
