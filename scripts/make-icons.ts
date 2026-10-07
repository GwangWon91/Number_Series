/**
 * PWA 아이콘 생성 (외부 이미지 도구 없이 재현 가능하도록 코드로 그린다).
 * 디자인: 파란 배경 위에 커지는 막대 3개 + 점선 빈칸 1개 = "다음 항은?"
 *   npx tsx scripts/make-icons.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { ROOT } from '../src/node/load';

const BG = [0x1f, 0x6f, 0xeb];
const FG = [0xff, 0xff, 0xff];

/** 512 기준 좌표의 막대들: [x, y, w, h] */
const BARS = [
  [96, 300, 64, 116],
  [184, 236, 64, 180],
  [272, 172, 64, 244],
];
const BLANK = [360, 108, 64, 308];

function pixel(x: number, y: number): number[] {
  for (const [bx, by, bw, bh] of BARS) if (x >= bx && x < bx + bw && y >= by && y < by + bh) return FG;
  const [bx, by, bw, bh] = BLANK;
  const inside = x >= bx && x < bx + bw && y >= by && y < by + bh;
  const border = inside && (x < bx + 10 || x >= bx + bw - 10 || y < by + 10 || y >= by + bh - 10);
  const dash = Math.floor((x + y) / 24) % 2 === 0;
  if (border && dash) return FG;
  return BG;
}

function png(size: number): Buffer {
  const scale = 512 / size;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = pixel(Math.floor(x * scale), Math.floor(y * scale));
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#1f6feb"/>
${BARS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff"/>`).join('\n')}
<rect x="${BLANK[0] + 5}" y="${BLANK[1] + 5}" width="${BLANK[2] - 10}" height="${BLANK[3] - 10}" rx="6" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="22 14"/>
</svg>
`;

writeFileSync(join(ROOT, 'public/icon.svg'), svg);
for (const size of [192, 512]) writeFileSync(join(ROOT, `public/icon-${size}.png`), png(size));
console.log('public/icon.svg, icon-192.png, icon-512.png 생성');
