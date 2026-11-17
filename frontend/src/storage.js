// localStorage, or an in-memory stand-in when the browser blocks site storage
// (for example "block all cookies"). The game still runs; progress just
// doesn't survive a reload.
function pickStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('lingo_storage_test', '1');
    s.removeItem('lingo_storage_test');
    return s;
  } catch {
    const memory = new Map();
    return {
      getItem: k => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => { memory.set(k, String(v)); },
      removeItem: k => { memory.delete(k); },
    };
  }
}

export const storage = pickStorage();
