// sync.js — Online/offline detection and sync manager
const { dbGetAll, dbGet, dbPut, dbPutAll, dbDelete, dbGetByIndex, dbClear } = window.localDB;

let isOnline = navigator.onLine;
let syncInProgress = false;
let token = null;

function setToken(t) { token = t; }

function getStatusEl() { return document.getElementById('onlineStatus'); }

function updateStatusUI() {
  const el = getStatusEl();
  if (!el) return;
  el.innerHTML = isOnline
    ? '<span style="color:var(--green)">🟢 Online</span>'
    : '<span style="color:var(--danger)">🔴 Offline</span>';
}

window.addEventListener('online',  () => { isOnline = true;  updateStatusUI(); syncOfflineData(); });
window.addEventListener('offline', () => { isOnline = false; updateStatusUI(); });

// ── SYNC: pull from server → local DB ────────────────────────────────────────
async function syncFromServer() {
  if (!isOnline || !token) return;
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

    // Sync products
    const pRes = await fetch('/api/products', { headers });
    if (pRes.ok) {
      const products = await pRes.json();
      await dbClear('products');
      await dbPutAll('products', products);
    }

    // Sync categories
    const cRes = await fetch('/api/categories', { headers });
    if (cRes.ok) {
      const cats = await cRes.json();
      await dbClear('categories');
      await dbPutAll('categories', cats);
    }

    // Sync settings
    const sRes = await fetch('/api/settings', { headers });
    if (sRes.ok) {
      const settings = await sRes.json();
      for (const [key, value] of Object.entries(settings)) {
        await dbPut('settings', { key, value });
      }
    }

    // Sync recent transactions (last 100)
    const tRes = await fetch('/api/transactions?limit=100', { headers });
    if (tRes.ok) {
      const txns = await tRes.json();
      for (const t of txns) {
        await dbPut('transactions', { ...t, synced: true });
      }
    }

    console.log('✓ Synced from server');
  } catch(e) {
    console.log('Sync from server failed:', e.message);
  }
}

// ── SYNC: push offline transactions → server ──────────────────────────────────
async function syncOfflineData() {
  if (!isOnline || !token || syncInProgress) return;
  syncInProgress = true;

  try {
    const unsynced = await dbGetByIndex('transactions', 'synced', false);
    if (!unsynced.length) { syncInProgress = false; return; }

    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    let synced = 0;

    for (const txn of unsynced) {
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customer: txn.customer,
            items: txn.items.map(i => ({ product_id: i.product_id, qty: i.qty })),
            discount_pct: txn.discount_pct,
            payment: txn.payment,
            offline_id: txn.id
          })
        });
        if (res.ok) {
          await dbPut('transactions', { ...txn, synced: true });
          synced++;
        }
      } catch(e) { /* skip failed, retry next time */ }
    }

    if (synced > 0) {
      showToast(`☁️ ${synced} offline sale${synced>1?'s':''} synced!`);
      await syncFromServer(); // refresh product stocks
      if (typeof loadProducts === 'function') { 
        window.allProducts = await dbGetAll('products');
        renderProducts();
      }
    }
  } catch(e) {
    console.log('Sync push failed:', e.message);
  }
  syncInProgress = false;
}

// ── LOCAL API: products ───────────────────────────────────────────────────────
async function localGetProducts(search, category) {
  let products = await dbGetAll('products');
  products = products.filter(p => p.active !== false);
  if (category && category !== 'All') products = products.filter(p => p.category === category);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return products.sort((a,b) => a.name.localeCompare(b.name));
}

async function localGetCategories() {
  return dbGetAll('categories');
}

async function localGetSettings() {
  const rows = await dbGetAll('settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── LOCAL CHECKOUT ────────────────────────────────────────────────────────────
async function localCheckout({ customer, items, discount_pct, payment, cashier }) {
  const settings = await localGetSettings();
  const products = await dbGetAll('products');
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  // Validate stock
  for (const item of items) {
    const prod = productMap[item.product_id];
    if (!prod) throw new Error(`Product not found`);
    if (prod.stock !== 999 && prod.stock < item.qty)
      throw new Error(`Not enough stock for "${prod.name}"`);
  }

  const subtotal = items.reduce((s, i) => s + Number(productMap[i.product_id].price) * i.qty, 0);
  const disc = Math.min(parseFloat(discount_pct) || 0, 100);
  const after = subtotal * (1 - disc / 100);
  const vatRate = (parseFloat(settings.vat_rate) || 16) / 100;
  const vat = after * vatRate;
  const total = after + vat;
  const txnId = 'OFF-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const now = new Date().toISOString();

  const txn = {
    id: txnId,
    customer: customer || 'Walk-in Customer',
    cashier_name: cashier,
    items: items.map(i => ({
      product_id: i.product_id,
      product_name: productMap[i.product_id].name,
      qty: i.qty,
      unit_price: Number(productMap[i.product_id].price),
      total_price: Number(productMap[i.product_id].price) * i.qty
    })),
    discount_pct: disc,
    subtotal, vat, total, payment,
    created_at: now,
    synced: false // will sync when online
  };

  // Save transaction locally
  await dbPut('transactions', txn);

  // Deduct stock locally
  for (const item of items) {
    const prod = productMap[item.product_id];
    if (prod.stock !== 999) {
      await dbPut('products', { ...prod, stock: prod.stock - item.qty });
    }
  }

  return txn;
}

// ── LOCAL REPORTS ─────────────────────────────────────────────────────────────
async function localGetSummary(date) {
  const allTxns = await dbGetAll('transactions');
  const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const txns = allTxns.filter(t => t.created_at && t.created_at.startsWith(today));
  
  const revenue = txns.reduce((s,t) => s + Number(t.total), 0);
  const vat_collected = txns.reduce((s,t) => s + Number(t.vat), 0);
  const mpesa = txns.filter(t=>t.payment==='mpesa').reduce((s,t)=>s+Number(t.total),0);
  const cash = txns.filter(t=>t.payment==='cash').reduce((s,t)=>s+Number(t.total),0);
  const card = txns.filter(t=>t.payment==='card').reduce((s,t)=>s+Number(t.total),0);
  const units_sold = txns.reduce((s,t)=>s+(t.items||[]).reduce((a,i)=>a+i.qty,0),0);

  return { date: today, transactions: txns.length, revenue, vat_collected, mpesa, cash, card, units_sold };
}

async function localGetTransactions(limit=100) {
  const all = await dbGetAll('transactions');
  return all
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

window.SyncManager = {
  setToken, updateStatusUI, syncFromServer, syncOfflineData,
  localGetProducts, localGetCategories, localGetSettings,
  localCheckout, localGetSummary, localGetTransactions,
  isOnline: () => isOnline
};
