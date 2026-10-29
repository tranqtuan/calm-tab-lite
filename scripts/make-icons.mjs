/**
 * Generates icons/icon{16,32,48,128}.png — a soft dusk gradient disc with a thin
 * crescent, rendered with 4× supersampling. Dependency-free (hand-rolled PNG encoder).
 *   node scripts/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
function sample(x, y) {
  // x, y in [0,1]
  const dx = x - 0.5, dy = y - 0.5, r = Math.hypot(dx, dy);
  if (r > 0.47) return [0, 0, 0, 0];
  const t = Math.min(1, Math.max(0, y * 1.1 - 0.05));
  let col = [mix(58, 34, t), mix(96, 52, t), mix(112, 74, t)]; // teal dusk → deep slate
  const glow = Math.max(0, 1 - Math.hypot(x - 0.5, y - 0.78) / 0.45);
  col = col.map((c, i) => c + [70, 60, 40][i] * glow * glow * 0.6);
  // crescent moon
  const m1 = Math.hypot(x - 0.56, y - 0.42), m2 = Math.hypot(x - 0.64, y - 0.36);
  if (m1 < 0.17 && m2 > 0.15) col = [246, 241, 228];
  return [...col, 255];
}
mkdirSync('icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const S = 4, buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const p = sample((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
      acc[0] += p[0] * p[3]; acc[1] += p[1] * p[3]; acc[2] += p[2] * p[3]; acc[3] += p[3];
    }
    const a = acc[3] / (S * S), i = (y * size + x) * 4;
    buf[i] = a ? acc[0] / acc[3] : 0; buf[i + 1] = a ? acc[1] / acc[3] : 0; buf[i + 2] = a ? acc[2] / acc[3] : 0; buf[i + 3] = a;
  }
  writeFileSync(`icons/icon${size}.png`, png(size, buf));
}
console.log('icons written');
