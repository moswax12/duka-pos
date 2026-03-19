let isOnline = navigator.onLine;
let syncInProgress = false;
let token = null;
function setToken(t) { token = t; }
function updateStatusUI() {
  const el = document.getElementById('onlineStatus');
  if (!el) return;
  el.innerHTML = isOnline ? '<span style="color:var(--green)">🟢 Online</span>' : '<span style="color:var(--danger)">🔴 Offline</span>';
}
window.addEventListener('online', () => { isOnline = true; updateStatusUI(); syncOfflineData(); });
window.addEventListener('offline', () => { isOnline = false; updateStatusUI(); });

async function syncFromServer() {
  if (!isOnline || !token) return;
  try {
    const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    const pRes = await fetch('/api/products', { headers: h });
    if (pRes.ok) { const p = await pRes.json(); await localDB.dbClear('products'); await localDB.dbPutAll('products', p); }
    const cRes = await fetch('/api/categories', { headers: h });
    if (cRes.ok) { const c = await cRes.json(); await localDB.dbClear('categories'); await localDB.dbPutAll('categories', c); }
    const sRes = await fetch('/api/settings', { headers: h });
    if (sRes.ok) { const s = await sRes.json(); for (const [k, v] of Object.entries(s)) { await localDB.dbPut('settings', { key: k, value: v }); } }
    const tRes = await fetch('/api/transactions?limit=100', { headers: h });
    if (tRes.ok) { const t = await tRes.json(); for (const x of t) { await localDB.dbPut('transactions', { ...x, synced: true }); } }
  } catch(e) { console.log('Sync from server failed:', e.message); }
}

async function syncOfflineData() {
  if (!isOnline || !token || syncInProgress) return;
  syncInProgress = true;
  try {
    const unsynced = await localDB.dbGetByIndex('transactions', 'synced', false);
    if (!unsynced.length) { syncInProgress = false; return; }
    const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    let synced = 0;
    for (const txn of unsynced) {
      try {
        const res = await fetch('/api/transactions', { method: 'POST', headers: h, body: JSON.stringify({ customer: txn.customer, items: txn.items.map(i => ({ product_id: i.product_id, qty: i.qty })), discount_pct: txn.discount_pct, payment: txn.payment }) });
        if (res.ok) { await localDB.dbPut('transactions', { ...txn, synced: true }); synced++; }
      } catch(e) {}
    }
    if (synced > 0) {
      showToast('Synced ' + synced + ' offline sale' + (synced > 1 ? 's' : '') + '!');
      await syncFromServer();
      if (typeof renderProducts === 'function') { window.allProducts = await localDB.dbGetAll('products'); renderProducts(); }
    }
  } catch(e) { console.log(e); }
  syncInProgress = false;
}

async function localGetProducts(search, category) {
  let p = await localDB.dbGetAll('products');
  p = p.filter(x => x.active !== false);
  if (category && category !== 'All') p = p.filter(x => x.category === category);
  if (search) p = p.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
  return p.sort((a, b) => a.name.localeCompare(b.name));
}
async function localGetCategories() { return localDB.dbGetAll('categories'); }
async function localGetSettings() { const rows = await localDB.dbGetAll('settings'); return Object.fromEntries(rows.map(r => [r.key, r.value])); }

async function localCheckout({ customer, items, discount_pct, payment, cashier }) {
  const settings = await localGetSettings();
  const products = await localDB.dbGetAll('products');
  const pm = Object.fromEntries(products.map(p => [p.id, p]));
  for (const item of items) {
    const prod = pm[item.product_id];
    if (!prod) throw new Error('Product not found');
    if (prod.stock !== 999 && prod.stock < item.qty) throw new Error('Not enough stock for ' + prod.name);
  }
  const subtotal = items.reduce((s, i) => s + Number(pm[i.product_id].price) * i.qty, 0);
  const disc = Math.min(parseFloat(discount_pct) || 0, 100);
  const after = subtotal * (1 - disc / 100);
  const vatRate = (parseFloat(settings.vat_rate) || 16) / 100;
  const vat = after * vatRate;
  const total = after + vat;
  const txnId = 'OFF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const now = new Date().toISOString();
  const txn = { id: txnId, customer: customer || 'Walk-in Customer', cashier_name: cashier, items: items.map(i => ({ product_id: i.product_id, product_name: pm[i.product_id].name, qty: i.qty, unit_price: Number(pm[i.product_id].price), total_price: Number(pm[i.product_id].price) * i.qty })), discount_pct: disc, subtotal, vat, total, payment, created_at: now, synced: false };
  await localDB.dbPut('transactions', txn);
  for (const item of items) { const prod = pm[item.product_id]; if (prod.stock !== 999) { await localDB.dbPut('products', { ...prod, stock: prod.stock - item.qty }); } }
  return txn;
}

async function localGetSummary(date) {
  const all = await localDB.dbGetAll('transactions');
  const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const txns = all.filter(t => t.created_at && t.created_at.startsWith(today));
  const revenue = txns.reduce((s, t) => s + Number(t.total), 0);
  const vat_collected = txns.reduce((s, t) => s + Number(t.vat), 0);
  const mpesa = txns.filter(t => t.payment === 'mpesa').reduce((s, t) => s + Number(t.total), 0);
  const cash = txns.filter(t => t.payment === 'cash').reduce((s, t) => s + Number(t.total), 0);
  const card = txns.filter(t => t.payment === 'card').reduce((s, t) => s + Number(t.total), 0);
  const units_sold = txns.reduce((s, t) => s + (t.items || []).reduce((a, i) => a + i.qty, 0), 0);
  return { date: today, transactions: txns.length, revenue, vat_collected, mpesa, cash, card, units_sold };
}

async function localGetTransactions(limit = 100) {
  const all = await localDB.dbGetAll('transactions');
  return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

window.SyncManager = { setToken, updateStatusUI, syncFromServer, syncOfflineData, localGetProducts, localGetCategories, localGetSettings, localCheckout, localGetSummary, localGetTransactions, isOnline: () => isOnline };