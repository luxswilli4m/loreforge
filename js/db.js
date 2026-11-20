// Tiny IndexedDB wrapper. Each world is stored as one record (images included as data URLs).
// A second store keeps app-wide assets such as background images.
const DB_NAME = 'loreforge';
const STORE = 'worlds';
const ASSETS = 'assets';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export const dbAll = () => tx(STORE, 'readonly', s => s.getAll());
export const dbGet = id => tx(STORE, 'readonly', s => s.get(id));
export const dbPut = world => tx(STORE, 'readwrite', s => s.put(world));
export const dbDel = id => tx(STORE, 'readwrite', s => s.delete(id));

export const assetGet = key => tx(ASSETS, 'readonly', s => s.get(key));
export const assetPut = (key, val) => tx(ASSETS, 'readwrite', s => s.put(val, key));
export const assetDel = key => tx(ASSETS, 'readwrite', s => s.delete(key));
