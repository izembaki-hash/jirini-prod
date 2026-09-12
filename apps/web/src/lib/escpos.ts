// بناء أوامر ESC/POS + طباعة نقطية للإيصالات العربية.
// الطابعات الرخيصة بلا حروف عربية → نرسم الإيصال على canvas ونطبعه نقطياً (GS v 0).

export interface ReceiptLine { text: string; bold?: boolean; big?: boolean; align?: "right" | "center" | "left" }

const DOTS_58 = 384;
const DOTS_80 = 576;

function bytes(...xs: number[]): number[] { return xs; }
const INIT = () => bytes(0x1b, 0x40);
const ALIGN = (n: 0 | 1 | 2) => bytes(0x1b, 0x61, n);
const BOLD = (on: boolean) => bytes(0x1b, 0x45, on ? 1 : 0);
const SIZE = (big: boolean) => bytes(0x1d, 0x21, big ? 0x11 : 0x00);
const FEED = (n: number) => bytes(...new Array(n).fill(0x0a));
const CUT = () => bytes(0x1d, 0x56, 0x00);

// نص لاتيني خام (للاحتياطي): ASCII فقط، الباقي يُستبدل بـ ?
export function latinBytes(s: string): number[] {
  return [...s].map((c) => {
    const n = c.codePointAt(0) ?? 63;
    return n < 128 ? n : 63;
  });
}

// تحويل صورة أحادية إلى أمر GS v 0
function rasterCmd(widthPx: number, rows: Uint8Array[]): number[] {
  const wBytes = Math.ceil(widthPx / 8);
  const h = rows.length;
  const out: number[] = [0x1d, 0x76, 0x30, 0x00, wBytes & 0xff, (wBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff];
  for (const r of rows) for (let i = 0; i < wBytes; i++) out.push(r[i] ?? 0);
  return out;
}

// رسم سطور على canvas وتحويلها لنقط (أسود=1). يتطلب تحميل الخط أولاً.
export async function rasterize(lines: ReceiptLine[], widthPx: number, rtl: boolean): Promise<number[]> {
  try {
    await (document as Document).fonts.load('700 28px "IBM Plex Sans Arabic"');
    await (document as Document).fonts.load('400 24px "IBM Plex Sans Arabic"');
  } catch { /* خط احتياطي */ }
  const lh = 40;
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = Math.max(1, lines.length * lh + 8);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no-canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  lines.forEach((l, i) => {
    ctx.font = `${l.bold ? "700" : "400"} ${l.big ? 32 : 24}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.textAlign = l.align === "center" ? "center" : rtl ? "right" : "left";
    const x = l.align === "center" ? widthPx / 2 : rtl ? widthPx - 8 : 8;
    // التفاف بسيط للأسطر الطويلة
    const words = l.text.split(" ");
    let line = "";
    let y = i * lh + 4;
    const maxW = widthPx - 16;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lh;
        line = w;
      } else line = t;
    }
    ctx.fillText(line, x, y);
  });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const wBytes = Math.ceil(widthPx / 8);
  const rows: Uint8Array[] = [];
  for (let y = 0; y < canvas.height; y++) {
    const row = new Uint8Array(wBytes);
    for (let x = 0; x < widthPx; x++) {
      const px = data[(y * widthPx + x) * 4];
      if (px < 128) row[x >> 3] |= 0x80 >> (x & 7);
    }
    rows.push(row);
  }
  // قص الصفوف البيضاء السفلية
  let last = rows.length - 1;
  while (last > 0 && rows[last]!.every((b) => b === 0)) last--;
  return rasterCmd(widthPx, rows.slice(0, last + 1));
}

export interface ReceiptData {
  shop: string;
  num: number;
  at: string;
  lines: { name: string; qty: number; amount: number }[];
  discount: number;
  total: number;
  payLabel: string;
  thanks: string;
  currency: string;
}

export async function buildReceiptBytes(r: ReceiptData, opts: { paper?: 58 | 80; latin?: boolean; rtl?: boolean }): Promise<Uint8Array> {
  const widthPx = opts.paper === 80 ? DOTS_80 : DOTS_58;
  const rtl = opts.rtl ?? true;
  const out: number[] = [...INIT()];
  if (opts.latin) {
    // مسار التوافق: نص لاتيني فقط
    out.push(...ALIGN(1), ...SIZE(true), ...latinBytes(r.shop.slice(0, 24)), ...FEED(1));
    out.push(...ALIGN(rtl ? 2 : 0), ...SIZE(false), ...BOLD(false));
    for (const l of r.lines) {
      out.push(...latinBytes(`${l.qty}x ${l.name.slice(0, 20)} ${l.amount}`), ...FEED(1));
    }
    out.push(...BOLD(true), ...latinBytes(`TOTAL ${r.total} ${r.currency}`), ...BOLD(false), ...FEED(2));
  } else {
    const lines: ReceiptLine[] = [
      { text: r.shop, bold: true, big: true, align: "center" },
      { text: `#${r.num} · ${r.at}`, align: "center" },
      { text: "— — —", align: "center" },
      ...r.lines.map((l) => ({ text: `${l.name} ×${l.qty}  ${l.amount}`, align: rtl ? ("right" as const) : ("left" as const) })),
    ];
    if (r.discount > 0) lines.push({ text: `${r.discount}-`, align: rtl ? "right" : "left" });
    lines.push({ text: `${r.total} ${r.currency}`, bold: true, big: true, align: "center" });
    lines.push({ text: `${r.payLabel} · ${r.thanks}`, align: "center" });
    out.push(...(await rasterize(lines, widthPx, rtl)));
    out.push(...FEED(2));
  }
  out.push(...CUT());
  return Uint8Array.from(out);
}
