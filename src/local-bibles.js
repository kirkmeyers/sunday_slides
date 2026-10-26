/**
 * Translation files loaded on this machine (the NIV 84 made by
 * scripts/niv84.js). They're licensed text, so they never ship with the site:
 * each browser loads the file once from Settings and keeps it in IndexedDB.
 */

import { setLocalBible } from './bible.js';

const DB_NAME = 'sunday-slides';
const STORE = 'bibles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Count the verses in a translation file. */
export function verseCount(data) {
  let n = 0;
  for (const chapters of Object.values(data.books || {})) {
    for (const verses of Object.values(chapters)) n += Object.keys(verses).length;
  }
  return n;
}

/** Check a parsed file looks like scripts/niv84.js output. Returns an error message or ''. */
export function validateBible(data) {
  if (!data || typeof data !== 'object' || !data.translation || !data.books) return 'That isn’t a translation file made by npm run niv84.';
  if (Object.keys(data.books).length !== 66) return `That file has ${Object.keys(data.books).length} books, not 66.`;
  return '';
}

/** Load every stored translation into bible.js. Returns [{ code, name, verses }]. */
export async function restoreLocalBibles() {
  try {
    const all = (await withStore('readonly', store => store.getAll())) || [];
    for (const data of all) setLocalBible(data.translation, data);
    return all.map(data => ({ code: data.translation, name: data.name, verses: verseCount(data) }));
  } catch (err) {
    console.warn('Couldn’t read stored translations:', err);
    return [];
  }
}

/** Keep a translation file on this machine and start using it. */
export async function saveLocalBible(data) {
  await withStore('readwrite', store => store.put(data, data.translation));
  setLocalBible(data.translation, data);
}

/** Forget a stored translation. */
export async function removeLocalBible(code) {
  await withStore('readwrite', store => store.delete(code));
  setLocalBible(code, null);
}
