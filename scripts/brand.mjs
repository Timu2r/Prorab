// Логотип «Прораб»: трафаретные буквы, собранные из прямоугольников и дуг.
// Источник правды для всех файлов логотипа. Поменяли размеры — запустите `pnpm brand`:
//   packages/core/src/logo.ts          контуры для сайта и приложения
//   apps/web/public/favicon.svg        значок вкладки
//   apps/web/public/*.png              значки для телефонов и старых браузеров
//   apps/mobile/assets/*.png           иконка приложения, адаптивная иконка Android, значок веб-версии
// Без зависимостей: PNG рисуются здесь же, со сглаживанием по 8×8 точек на пиксель.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GRAPHITE = "#17191c";
const ORANGE = "#d9480f";

/* ---------- Буквы ---------- */

// H — высота букв, S — вертикальный штрих, T — горизонтальный, G — перемычка трафарета, R — скругление
const H = 40, S = 10, T = 9, G = 3, R = 13;
const WIDTHS = [32, 29, 32, 29, 32, 30];
const TRACK = 5;

const n = (v) => +v.toFixed(2);
const rect = (x, y, w, h) => `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;

// «⊃»: открыт влево, плечи толщиной T, стенка S, внешний радиус r
function cupRight(x0, y0, x1, y1, r) {
  const h = y1 - y0;
  r = Math.min(r, h / 2, x1 - x0);
  const ri = Math.max(Math.min(r - S, (h - 2 * T) / 2), 0.01);
  return `M${n(x0)} ${n(y0)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}V${n(y1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}H${n(x0)}V${n(y1 - T)}H${n(x1 - S - ri)}A${n(ri)} ${n(ri)} 0 0 0 ${n(x1 - S)} ${n(y1 - T - ri)}V${n(y0 + T + ri)}A${n(ri)} ${n(ri)} 0 0 0 ${n(x1 - S - ri)} ${n(y0 + T)}H${n(x0)}Z`;
}

// «⊂»: зеркальная половина
function cupLeft(x0, y0, x1, y1, r) {
  const h = y1 - y0;
  r = Math.min(r, h / 2, x1 - x0);
  const ri = Math.max(Math.min(r - S, (h - 2 * T) / 2), 0.01);
  return `M${n(x1)} ${n(y0)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 0 ${n(x0)} ${n(y0 + r)}V${n(y1 - r)}A${n(r)} ${n(r)} 0 0 0 ${n(x0 + r)} ${n(y1)}H${n(x1)}V${n(y1 - T)}H${n(x0 + S + ri)}A${n(ri)} ${n(ri)} 0 0 1 ${n(x0 + S)} ${n(y1 - T - ri)}V${n(y0 + T + ri)}A${n(ri)} ${n(ri)} 0 0 1 ${n(x0 + S + ri)} ${n(y0 + T)}H${n(x1)}Z`;
}

// Каждая буква — контуры в своей ячейке шириной w, начиная с x
const LETTERS = {
  // Перекладина лежит на двух стойках, как балка на опорах
  П: (x, w) => [rect(x, 0, w, T), rect(x, T + G, S, H - T - G), rect(x + w - S, T + G, S, H - T - G)],
  Р: (x, w) => [rect(x, 0, S, H), cupRight(x + S + G, 0, x + w, H * 0.6, R)],
  О: (x, w) => [cupLeft(x, 0, x + w / 2 - G / 2, H, R), cupRight(x + w / 2 + G / 2, 0, x + w, H, R)],
  А: (x, w) => {
    const r = Math.min(R, w / 2), ri = r - S, c1 = H / 2, c2 = c1 + T;
    const gl = x + w / 2 - G / 2, gr = x + w / 2 + G / 2;
    return [
      `M${n(x)} ${H}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} 0H${n(gl)}V${T}H${n(x + S + ri)}A${n(ri)} ${n(ri)} 0 0 0 ${n(x + S)} ${n(T + ri)}V${n(c1)}H${n(x + w - S)}V${n(T + ri)}A${n(ri)} ${n(ri)} 0 0 0 ${n(x + w - S - ri)} ${T}H${n(gr)}V0H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(r)}V${H}H${n(x + w - S)}V${n(c2)}H${n(x + S)}V${H}Z`,
    ];
  },
  Б: (x, w) => [`M${n(x)} 0H${n(x + w - 1)}V${T}H${n(x + S)}V${H}H${n(x)}Z`, cupRight(x + S + G, H * 0.4, x + w, H, R)],
};

const letters = [];
let cursor = 0;
[..."ПРОРАБ"].forEach((ch, i) => {
  letters.push(LETTERS[ch](cursor, WIDTHS[i]).join(""));
  cursor += WIDTHS[i] + TRACK;
});
const wordWidth = cursor - TRACK;

// Знак: одна буква П на графитовом квадрате 64×64
const MARK = { size: 64, radius: 14, x: 17, y: 15, w: 30, h: 34, s: 9, t: 8 };
const markRects = [
  [MARK.x, MARK.y, MARK.w, MARK.t],
  [MARK.x, MARK.y + MARK.t + G, MARK.s, MARK.h - MARK.t - G],
  [MARK.x + MARK.w - MARK.s, MARK.y + MARK.t + G, MARK.s, MARK.h - MARK.t - G],
];
const markPath = markRects.map(([x, y, w, h]) => rect(x, y, w, h)).join("");

/* ---------- Файлы ---------- */

function write(rel, data) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log("  " + rel);
}

write(
  "packages/core/src/logo.ts",
  `// Создано scripts/brand.mjs — не править руками, правьте скрипт и запустите \`pnpm brand\`.

/** Цвета логотипа: графит и сигнальный оранжевый. */
export const LOGO_COLORS = { graphite: "${GRAPHITE}", orange: "${ORANGE}" } as const;

/** Надпись ПРОРАБ трафаретными буквами: по контуру на букву, чтобы первую можно было выделить цветом. */
export const LOGO_WORD = {
  width: ${wordWidth},
  height: ${H},
  letters: [
${letters.map((d) => `    "${d}",`).join("\n")}
  ],
} as const;

/** Знак для иконок: буква П на квадрате ${MARK.size}×${MARK.size} со скруглением ${MARK.radius}. */
export const LOGO_MARK = {
  size: ${MARK.size},
  radius: ${MARK.radius},
  d: "${markPath}",
} as const;
`,
);

write(
  "apps/web/public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${MARK.radius}" fill="${GRAPHITE}"/><path d="${markPath}" fill="${ORANGE}"/></svg>\n`,
);

/* ---------- PNG ---------- */

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// Фигуры в координатах 0..1 холста: { x, y, w, h, r, color }
function raster(size, shapes, samples = 8) {
  const px = Buffer.alloc(size * size * 4);
  const inside = (s, x, y) => {
    if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
    if (!s.r) return true;
    const cx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
    const cy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
  };
  const colors = shapes.map((s) => hex(s.color));
  for (let py = 0; py < size; py++)
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const x = (pxl + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          for (let k = shapes.length - 1; k >= 0; k--)
            if (inside(shapes[k], x, y)) {
              r += colors[k][0];
              g += colors[k][1];
              b += colors[k][2];
              a++;
              break;
            }
        }
      const o = (py * size + pxl) * 4;
      if (a) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / samples ** 2) * 255);
    }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 бит на канал
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Буква П знака: масштаб — доля холста на одну единицу сетки, (ox, oy) — сдвиг
const glyph = (unit, ox = 0, oy = 0) =>
  markRects.map(([x, y, w, h]) => ({ x: ox + x * unit, y: oy + y * unit, w: w * unit, h: h * unit, color: ORANGE }));

const u = 1 / MARK.size;
const rounded = [{ x: 0, y: 0, w: 1, h: 1, r: MARK.radius * u, color: GRAPHITE }, ...glyph(u)];
const square = [{ x: 0, y: 0, w: 1, h: 1, color: GRAPHITE }, ...glyph(u)];
// Адаптивная иконка Android: холст 108dp, система обрезает его до круга или квадрата ~72dp.
// Букву держим в безопасном круге 66dp: высота 44dp
const au = 44 / 108 / MARK.h;
const adaptive = glyph(au, 0.5 - (MARK.x + MARK.w / 2) * au, 0.5 - (MARK.y + MARK.h / 2) * au);

write("apps/web/public/favicon-32.png", raster(32, rounded));
write("apps/web/public/apple-touch-icon.png", raster(180, square));
write("apps/mobile/assets/icon.png", raster(1024, square, 4));
write("apps/mobile/assets/adaptive-icon.png", raster(1024, adaptive, 4));
write("apps/mobile/assets/favicon.png", raster(48, rounded));
