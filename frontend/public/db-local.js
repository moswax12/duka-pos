const DB_NAME = 'duka_pos_local';
const DB_VERSION = 1;
let _db = null;
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        const ps = db.createObjectStore('products', { keyPath: 'id' });
        ps.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('transactions')) {
        const ts = db.createObjectStore('transactions', { keyPath: 'id' });
        ts.createIndex('synced', 'synced', { unique: false });
        ts.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}
async function dbGetAll(store) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readonly').objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function dbGet(store, key) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readonly').objectStore(store).get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function dbPut(store, value) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readwrite').objectStore(store).put(value); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function dbPutAll(store, items) { const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); const os = tx.objectStore(store); items.forEach(item => os.put(item)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
async function dbDelete(store, key) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readwrite').objectStore(store).delete(key); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
async function dbGetByIndex(store, indexName, value) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readonly').objectStore(store).index(indexName).getAll(value); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function dbClear(store) { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(store, 'readwrite').objectStore(store).clear(); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
window.localDB = { openDB, dbGetAll, dbGet, dbPut, dbPutAll, dbDelete, dbGetByIndex, dbClear };