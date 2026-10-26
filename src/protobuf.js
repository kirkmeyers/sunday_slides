/**
 * Minimal schema-less Protocol Buffers reader and writer.
 *
 * ProPresenter 7 files (.pro presentations and theme files) are protobuf
 * messages. We don't ship ProPresenter's .proto schema; instead we read a
 * message into a flat list of fields, change the few we care about, and write
 * it back. Unknown fields round-trip byte for byte.
 *
 * A field is { field, wire, value }:
 *   wire 0 (varint)  -> value is a BigInt
 *   wire 1 (64-bit)  -> value is a Uint8Array(8)
 *   wire 2 (bytes)   -> value is a Uint8Array
 *   wire 5 (32-bit)  -> value is a Uint8Array(4)
 */

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (pos >= buf.length) throw new Error('protobuf: truncated varint');
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, pos];
    shift += 7n;
    if (shift > 70n) throw new Error('protobuf: varint too long');
  }
}

function writeVarint(out, value) {
  let v = BigInt.asUintN(64, BigInt(value));
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
}

/** Decode one message into its fields. Throws if the bytes aren't a valid message. */
export function decode(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field === 0) throw new Error('protobuf: field 0');
    let value;
    if (wire === 0) {
      [value, pos] = readVarint(buf, pos);
    } else if (wire === 1 || wire === 5) {
      const n = wire === 1 ? 8 : 4;
      if (pos + n > buf.length) throw new Error('protobuf: truncated fixed field');
      value = buf.subarray(pos, pos + n);
      pos += n;
    } else if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      const n = Number(len);
      if (pos + n > buf.length) throw new Error('protobuf: truncated bytes');
      value = buf.subarray(pos, pos + n);
      pos += n;
    } else {
      throw new Error(`protobuf: unsupported wire type ${wire}`);
    }
    fields.push({ field, wire, value });
  }
  return fields;
}

/** Encode a list of fields back into bytes. */
export function encode(fields) {
  const parts = [];
  let total = 0;
  for (const f of fields) {
    const head = [];
    writeVarint(head, (BigInt(f.field) << 3n) | BigInt(f.wire));
    let body;
    if (f.wire === 0) {
      const tmp = [];
      writeVarint(tmp, f.value);
      body = Uint8Array.from(tmp);
    } else if (f.wire === 2) {
      const len = [];
      writeVarint(len, f.value.length);
      head.push(...len);
      body = f.value;
    } else {
      body = f.value;
    }
    const h = Uint8Array.from(head);
    parts.push(h, body);
    total += h.length + body.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Try to decode; returns null if the bytes aren't a message. */
export function tryDecode(buf) {
  try {
    return decode(buf);
  } catch {
    return null;
  }
}

export function getAll(fields, num) {
  return fields.filter(f => f.field === num);
}

export function get(fields, num) {
  return fields.find(f => f.field === num) || null;
}

/** Decode the first submessage with this field number, or null. */
export function getMessage(fields, num) {
  const f = get(fields, num);
  return f && f.wire === 2 ? tryDecode(f.value) : null;
}

/** Follow a path of field numbers through nested messages. */
export function getPath(fields, path) {
  let cur = fields;
  for (let i = 0; i < path.length - 1; i++) {
    cur = getMessage(cur, path[i]);
    if (!cur) return null;
  }
  return get(cur, path[path.length - 1]);
}

export function asString(f) {
  if (!f || f.wire !== 2) return null;
  try {
    return textDecoder.decode(f.value);
  } catch {
    return null;
  }
}

export function asDouble(f) {
  if (!f) return 0;
  if (f.wire === 1) return new DataView(f.value.buffer, f.value.byteOffset, 8).getFloat64(0, true);
  if (f.wire === 5) return new DataView(f.value.buffer, f.value.byteOffset, 4).getFloat32(0, true);
  return 0;
}

export function asInt(f) {
  return f && f.wire === 0 ? Number(f.value) : 0;
}

export function stringField(field, str) {
  return { field, wire: 2, value: textEncoder.encode(str) };
}

export function messageField(field, fields) {
  return { field, wire: 2, value: encode(fields) };
}

export function varintField(field, n) {
  return { field, wire: 0, value: BigInt(n) };
}

export function doubleField(field, x) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, x, true);
  return { field, wire: 1, value: b };
}

export function floatField(field, x) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, x, true);
  return { field, wire: 5, value: b };
}

/** Replace (or append) the first field with this number. Returns a new list. */
export function setField(fields, replacement) {
  let done = false;
  const out = fields.map(f => {
    if (!done && f.field === replacement.field) {
      done = true;
      return replacement;
    }
    return f;
  });
  if (!done) out.push(replacement);
  return out;
}
