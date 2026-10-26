/**
 * Share links, same encoding as porch_slides: the payload is zipped (DEFLATE,
 * single file named "d") and URL-safe base64 encoded without padding.
 *   #outline=<payload>   a request file, as written by the listener
 *   #review=<payload>    a deck (JSON) for someone to look over and edit
 */

import JSZip from 'jszip';

async function zipToHash(content) {
  const zip = new JSZip();
  zip.file('d', content);
  const b64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToText(hashStr) {
  let b64 = hashStr.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const file = zip.file('d');
  if (!file) throw new Error('Link payload is missing its data');
  return file.async('string');
}

export const compressOutlinePayload = text => zipToHash(text);
export const decompressOutlinePayload = hash => hashToText(hash);
export const compressDeckPayload = payload => zipToHash(JSON.stringify(payload));
export const decompressDeckPayload = async hash => JSON.parse(await hashToText(hash));

/** Full #outline= link for a request file (the listener's Start Here button uses this format). */
export async function encodeOutlineLink(text, baseUrl) {
  const base = baseUrl || `${window.location.origin}${window.location.pathname}`;
  return `${base}#outline=${await compressOutlinePayload(text)}`;
}
