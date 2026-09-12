// طابعة بلوتوث BLE عبر Web Bluetooth.
// قيود صريحة: BLE فقط (لا SPP الكلاسيكية)، يتطلب HTTPS وضغطة مستخدم،
/// Chrome-Android/Windows. iOS غير مدعوم إطلاقاً → PDF دائماً كبديل.
import { buildReceiptBytes, type ReceiptData } from "./escpos";

export const btSupported = () =>
  typeof navigator !== "undefined" && "bluetooth" in navigator;

export interface BtPrefs { paper: 58 | 80; latin: boolean; name: string | null }

const PREF_KEY = "dz-bt-printer";
const PREFS_KEY = "dz-bt-prefs";

export function btSavedName(): string | null {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as { name: string }).name ?? null : null;
  } catch { return null; }
}
export function btForget() {
  try { localStorage.removeItem(PREF_KEY); } catch { /* تجاهل */ }
}
export function btPrefs(): { paper: 58 | 80; latin: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<BtPrefs>;
      return { paper: p.paper === 80 ? 80 : 58, latin: !!p.latin };
    }
  } catch { /* تجاهل */ }
  return { paper: 58, latin: false };
}
export function btSavePrefs(p: { paper: 58 | 80; latin: boolean }) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* تجاهل */ }
}

type BtDevice = { name?: string; gatt?: { connect(): Promise<BtServer> } };
type BtServer = { getPrimaryServices(): Promise<BtService[]> };
type BtService = { getCharacteristics(): Promise<BtChar[]> };
type BtChar = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithResponse(v: BufferSource): Promise<void>;
  writeValueWithoutResponse(v: BufferSource): Promise<void>;
  service?: { device?: { name?: string } };
};

async function findWritable(): Promise<{ char: BtChar; noResp: boolean; name: string }> {
  const nav = navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<BtDevice> } };
  const device = await nav.bluetooth.requestDevice({
    // قبول الكل: الطابعات الحرارية تخدماتها خاصة بكل مصنّع
    acceptAllDevices: true,
    optionalServices: [
      "49535343-fe7b-4ae5-8fa9-9fafd205e455", // Nordic UART (شائع في المحوّلات)
      "0000ff00-0000-1000-8000-00805f9b34fb", // خدمة FF00 الشائعة للطابعات
      "0000ff01-0000-1000-8000-00805f9b34fb",
      "000018f0-0000-1000-8000-00805f9b34fb",
    ],
  });
  const name = device.name ?? "printer";
  const server = await device.gatt?.connect();
  if (!server) throw new Error("gatt");
  // معروف أولاً: خصائص الكتابة الشائعة، ثم مسح شامل
  const services = await server.getPrimaryServices();
  const candidates: BtChar[] = [];
  for (const svc of services) {
    try {
      const chars = await svc.getCharacteristics();
      for (const c of chars) {
        if (c.properties.writeWithoutResponse || c.properties.write) candidates.push(c);
      }
    } catch { /* خدمة محمية — تخطَّ */ }
  }
  const char = candidates.find((c) => c.properties.writeWithoutResponse) ?? candidates[0];
  if (!char) throw new Error("no-writable");
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ name })); } catch { /* تجاهل */ }
  return { char, noResp: !!char.properties.writeWithoutResponse, name };
}

async function writeAll(char: BtChar, noResp: boolean, data: Uint8Array) {
  const CHUNK = noResp ? 128 : 20;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const buf = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer;
    if (noResp) await char.writeValueWithoutResponse(buf);
    else await char.writeValueWithResponse(buf);
  }
}

export async function btPair(): Promise<string> {
  const { name } = await findWritable();
  return name;
}

export async function btPrintReceipt(r: ReceiptData): Promise<void> {
  const prefs = btPrefs();
  const bytes = await buildReceiptBytes(r, { paper: prefs.paper, latin: prefs.latin });
  const { char, noResp } = await findWritable();
  await writeAll(char, noResp, bytes);
}

export async function btTestPrint(): Promise<void> {
  await btPrintReceipt({
    shop: "TEST", num: 0, at: new Date().toLocaleString("fr-DZ"),
    lines: [{ name: "Test OK", qty: 1, amount: 0 }],
    discount: 0, total: 0, payLabel: "TEST", thanks: "OK", currency: "دج",
  });
}

export function btErrorMessage(e: unknown, L: "ar" | "fr"): string {
  const name = e instanceof Error ? e.message : String(e);
  if (name.includes("User cancelled") || name.includes("cancelled") || name.includes("NotFoundError")) {
    return L === "ar" ? "أُلغي الاختيار." : "Annulé.";
  }
  if (name === "no-writable" || name === "gatt") {
    return L === "ar"
      ? "الطابعة لا تكشف خاصية كتابة BLE — جرّب طابعة BLE أخرى (الكلاسيكية SPP غير مدعومة ويباً)."
      : "Pas de BLE writable (SPP non supporté).";
  }
  if (name === "no-canvas") {
    return L === "ar" ? "المتصفح لا يدعم الرسم — استخدم PDF." : "Utilisez le PDF.";
  }
  return L === "ar" ? "فشلت الطباعة — أعد المحاولة." : "Échec.";
}
