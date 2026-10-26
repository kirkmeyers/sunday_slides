/**
 * Parse a Sunday request file (format "sunday-requests 1", see
 * reference/sunday-request-format.md) into its header and entries.
 */

const ENTRY_TYPES = {
  point: 'point',
  scripture: 'scripture',
  quote: 'quote',
  text: 'text',
  cue: 'cue',
};

/**
 * @returns {{
 *   header: Record<string,string>,
 *   flags: string[],
 *   entries: Array<{ type: string, value: string, lines: string[], checks: string[] }>,
 *   warnings: string[]
 * }}
 */
export function parseRequestFile(text) {
  const header = {};
  const flags = [];
  const entries = [];
  const warnings = [];

  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const m = line.match(/^#\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      const last = entries[entries.length - 1];
      if (key === 'check' && last) {
        last.checks.push(value);
      } else if (key === 'flag' || key === 'check') {
        flags.push(value);
      } else if (entries.length === 0) {
        header[key] = value; // unknown keys are kept but unused
      }
      continue;
    }

    if (line.startsWith('>')) {
      const last = entries[entries.length - 1];
      if (last && last.type === 'scripture') {
        last.lines.push(line.replace(/^>\s?/, ''));
      } else {
        warnings.push(`Verse text with no scripture line before it was skipped: "${line.slice(0, 40)}…"`);
      }
      continue;
    }

    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    const type = m && ENTRY_TYPES[m[1].toLowerCase()];
    if (!type) {
      warnings.push(`Unrecognized line skipped: "${line.slice(0, 60)}"`);
      continue;
    }
    entries.push({ type, value: m[2].trim(), lines: [], checks: [] });
  }

  if (header.format && !/^sunday-requests 1\b/.test(header.format)) {
    warnings.push(`Request file format "${header.format}" is newer than this tool knows; some lines may be ignored.`);
  }
  return { header, flags, entries, warnings };
}

/** "Timothy Ateek" -> "Ateek", skipping suffixes like Jr. or III. */
export function extractCommunicatorLastName(fullName) {
  if (!fullName || typeof fullName !== 'string') return '';
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const suffixRegex = /^(jr\.?|sr\.?|ii|iii|iv|v|vi)$/i;
  for (let i = words.length - 1; i >= 0; i--) {
    const clean = words[i].replace(/[,.]/g, '').trim();
    if (clean && !suffixRegex.test(clean)) {
      return clean.replace(/[/\\?%*:|"<>]/g, '').trim();
    }
  }
  return '';
}

/** "2026-10-25" -> "20261025" (falls back to today). */
export function serviceDateCode(service) {
  const m = (service || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
