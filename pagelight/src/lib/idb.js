// Tiny IndexedDB wrapper for the offline chapter cache.
const DB = 'pagelight-offline', STORE = 'chapters'
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
const run = async (mode, fn) => {
  const db = await open()
  return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const rq = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error) })
}
export const offlineKey = (t, c, v = 'official') => `${t}:${c}:${v}`
export const offlinePut = (k, v) => run('readwrite', (s) => s.put(v, k))
export const offlineGet = (k) => run('readonly', (s) => s.get(k)).catch(() => null)
export const offlineDel = (k) => run('readwrite', (s) => s.delete(k))
