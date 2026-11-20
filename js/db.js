// Tiny IndexedDB wrapper. Each world is stored as one record (images included as data URLs).
const DB_NAME = 'loreforge';
const STORE = 'worlds';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export const dbAll = () => tx('readonly', s => s.getAll());
export const dbGet = id => tx('readonly', s => s.get(id));
export const dbPut = world => tx('readwrite', s => s.put(world));
export const dbDel = id => tx('readwrite', s => s.delete(id));
