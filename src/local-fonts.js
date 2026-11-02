/**
 * Licensed theme font files kept on this machine (ported from porch_slides_v2).
 * Gotham and Acros are commercial, so they never ship with the site. Fonts
 * installed with Font Book come first; these files are the backup for a
 * computer that doesn't have them installed. Each browser loads the files once
 * from Settings and keeps them in IndexedDB.
 */

const DB_NAME = 'sunday-slides-fonts';
const STORE = 'fonts';

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

/**
 * The names inside a font file's name table (OpenType/TrueType):
 * { family, fullName, postScriptName }.
 */
export function fontNames(buffer) {
  const view = new DataView(buffer);
  const names = {};
  const tables = view.getUint16(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...new Uint8Array(buffer, rec, 4));
    if (tag !== 'name') continue;
    const off = view.getUint32(rec + 8);
    const count = view.getUint16(off + 2);
    const strings = off + view.getUint16(off + 4);
    for (let j = 0; j < count; j++) {
      const r = off + 6 + j * 12;
      const platform = view.getUint16(r);
      const id = view.getUint16(r + 6);
      const len = view.getUint16(r + 8);
      const at = strings + view.getUint16(r + 10);
      if (platform !== 3) continue; // Windows names, UTF-16BE
      let s = '';
      for (let k = 0; k < len; k += 2) s += String.fromCharCode(view.getUint16(at + k));
      if (id === 16 || (id === 1 && !names.family)) names.family = s;
      if (id === 4) names.fullName = s;
      if (id === 6) names.postScriptName = s;
    }
  }
  return names;
}

/** Check a font file is the one a theme needs. Returns an error message or ''. */
export function checkFontFile(buffer, wanted) {
  let names;
  try {
    names = fontNames(buffer);
  } catch {
    return 'That isn’t a font file.';
  }
  const all = Object.values(names).join(' ');
  return wanted.some(w => all.includes(w)) ? '' : `That font is ${names.fullName || names.family || 'something else'}, not ${wanted[0]}.`;
}

/** Add a stored font to the page under the family name the themes use. */
export async function useFont(record) {
  const face = new FontFace(record.family, record.data, { weight: String(record.weight), style: 'normal' });
  await face.load();
  document.fonts.add(face);
}

/**
 * The font files stored in this browser, [{ family, weight, name, data }],
 * without using them yet: the caller adds them only for fonts not installed.
 */
export async function readLocalFonts() {
  try {
    return (await withStore('readonly', store => store.getAll())) || [];
  } catch (err) {
    console.warn('Couldn’t read stored fonts:', err);
    return [];
  }
}

/** Keep a font file on this machine. Returns the stored record. */
export async function saveLocalFont({ family, weight, name, data }) {
  const record = { family, weight, name, data };
  await withStore('readwrite', store => store.put(record, `${family}|${weight}`));
  return record;
}

/** Forget a stored font (it stays in use until the page reloads). */
export async function removeLocalFont(family, weight) {
  await withStore('readwrite', store => store.delete(`${family}|${weight}`));
}
