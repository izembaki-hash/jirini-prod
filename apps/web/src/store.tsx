import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Lang } from "./i18n";

// ─── الأنواع (مطابقة لعقد packages/shared) ───
export type BusinessType = "restaurant" | "shop";
export type PlanId = "starter" | "pro" | "mega";
export type Role = "owner" | "manager" | "cashier" | "cook";

export interface Product {
  id: string; name: string; nameFr: string; buy: number; sell: number;
  qty: number; min: number; barcode?: string; cat: string; shelf?: string; expiry?: string; wholesale?: number; active: boolean;
  saleable?: boolean; img?: string;
}
export interface OrderLine { productId: string; name: string; qty: number; price: number }
export type OrderStatus = "pending" | "preparing" | "ready" | "onway" | "delivered" | "cancelled";
export interface Order {
  id: string; kind: string; table?: string; status: OrderStatus; lines: OrderLine[];
  discount: number; pay: "cash" | "card" | "credit"; customer?: string; phone?: string; address?: string;
  at: string; total: number; num: number; driverId?: string | null; driverName?: string;
}
export interface Shift { id: string; by: string; openedAt: string; closedAt: string | null; opening: number; closing: number | null; note: string }
export interface Employee { id: string; name: string; role: Role; hired: string; half: number; title?: string }
export interface Advance { id: string; emp: string; amount: number; date: string; note?: string }
export type AttStatus = "full" | "half" | "absent";
export interface Att { id: string; emp: string; date: string; status: AttStatus }
export interface Customer { id: string; name: string; phone: string; address?: string; balance?: number }
export interface Goal { id: string; title: string; target: number; saved: number; monthly: number }
export interface RecipeItem { id: string; dishId: string; ingredientId: string; qty: number }
export interface Supplier { id: string; name: string; phone: string; address?: string; notes?: string; active: boolean; openingDebt?: number; owed?: number; paid?: number; balance?: number }
export interface PurchaseLine { productId: string; name: string; qty: number; unitCost: number }
export interface Purchase { id: string; num: number; supplierId: string | null; lines: PurchaseLine[]; total: number; paid: number; status: string; date: string; notes?: string }
export interface AlertItem { id: string; kind: string; refId: string | null; message: string; read: boolean }
export interface Driver { id: string; name: string; phone: string; vehicle?: string; kind: "internal" | "external"; active: boolean }
export interface Overhead { id: string; name: string; kind: string; monthly: number; active: boolean; notes?: string }

// حصة اليوم من مصروف شهري (÷30) — نفس اتفاقية الخادم.
export const dailySlice = (monthly: number) => Math.round((monthly / 30) * 100) / 100;

// الأجور على أساس الدوام الجزئي (نفس صيغة الخادم): الكامل = الجزئي × 2، الغياب = صفر.
export function laborFor(
  att: Att[], employees: Employee[], date?: string,
): number {
  let total = 0;
  for (const a of att) {
    if (date && a.date !== date) continue;
    const e = employees.find((x) => x.id === a.emp);
    if (!e) continue;
    if (a.status === "full") total += e.half * 2;
    else if (a.status === "half") total += e.half;
  }
  return Math.round(total);
}

// ملخص حضور موظف في فترة: أيام كاملة/جزئية/غياب + كلفة الأجور.
export function attSummary(att: Att[], empId: string) {
  const recs = att.filter((a) => a.emp === empId);
  const full = recs.filter((a) => a.status === "full").length;
  const half = recs.filter((a) => a.status === "half").length;
  const absent = recs.filter((a) => a.status === "absent").length;
  return { full, half, absent, days: recs.length };
}

// اسم العرض حسب اللغة: الفرنسية تستخدم nameFr عند توفره.
export const displayName = (p: { name: string; nameFr?: string }, lang: Lang) =>
  lang === "fr" ? (p.nameFr?.trim() ? p.nameFr : p.name) : p.name;

// ترجمة تصنيفات البذور الافتراضية فقط — تصنيفات المستخدم تبقى كما أدخلها.
const CAT_FR: Record<string, string> = {
  "أطباق": "Plats", "سندويش": "Sandwichs", "مشروبات": "Boissons", "مقبلات": "Entrées",
  "مكونات": "Ingrédients", "ألبان": "Laitiers", "مواد غذائية": "Épicerie", "جديد": "Nouveau",
};
export const catName = (cat: string, lang: Lang) =>
  lang === "fr" ? (CAT_FR[cat] ?? cat) : cat;

interface State {
  booted: boolean;
  businessType: BusinessType;
  businessName: string;
  shopPhone: string;
  shopAddress: string;
  shopLogo: string;
  plan: PlanId;
  lang: Lang;
  role: Role;
  crmOn: boolean;
  branch: string;
  branches: string[];
  tables: number;
  products: Product[];
  orders: Order[];
  shift: Shift | null;
  shifts: Shift[];
  employees: Employee[];
  att: Att[];
  advances: Advance[];
  customers: Customer[];
  goals: Goal[];
  recipes: RecipeItem[];
  suppliers: Supplier[];
  purchases: Purchase[];
  alerts: AlertItem[];
  drivers: Driver[];
  overheads: Overhead[];
}

const RESTO_SEED: Product[] = [
  { id: "p1", name: "كسكس بالخضرة", nameFr: "Couscous", buy: 180, sell: 350, qty: 40, min: 8, barcode: "6111001", cat: "أطباق", active: true },
  { id: "p2", name: "بيتزا 4 أجبان", nameFr: "Pizza 4 fromages", buy: 300, sell: 600, qty: 25, min: 5, barcode: "6111002", cat: "أطباق", active: true },
  { id: "p3", name: "طاكوس دجاج", nameFr: "Tacos poulet", buy: 250, sell: 500, qty: 30, min: 6, barcode: "6111003", cat: "سندويش", active: true },
  { id: "p4", name: "مشروب غازي", nameFr: "Soda", buy: 60, sell: 120, qty: 120, min: 24, barcode: "6111004", cat: "مشروبات", active: true },
  { id: "p5", name: "سلطة مشكلة", nameFr: "Salade", buy: 90, sell: 200, qty: 4, min: 5, barcode: "6111005", cat: "مقبلات", active: true },
  { id: "p6", name: "شخشوخة", nameFr: "Chakhchoukha", buy: 200, sell: 400, qty: 0, min: 5, barcode: "6111006", cat: "أطباق", active: true },
];
const RESTO_INGREDIENTS: Product[] = [
  { id: "g1", name: "سميد", nameFr: "Semoule", buy: 90, sell: 0, qty: 50, min: 10, cat: "مكونات", active: true, saleable: false },
  { id: "g2", name: "خضار مشكلة", nameFr: "Légumes", buy: 70, sell: 0, qty: 30, min: 8, cat: "مكونات", active: true, saleable: false },
];
const SHOP_SEED: Product[] = [
  { id: "s1", name: "حليب 1ل", nameFr: "Lait 1L", buy: 110, sell: 130, qty: 80, min: 20, barcode: "6112001", cat: "ألبان", shelf: "A1", active: true },
  { id: "s2", name: "سكر 1كغ", nameFr: "Sucre 1kg", buy: 85, sell: 100, qty: 60, min: 15, barcode: "6112002", cat: "مواد غذائية", shelf: "A2", active: true },
  { id: "s3", name: "زيت 5ل", nameFr: "Huile 5L", buy: 950, sell: 1100, qty: 3, min: 5, barcode: "6112003", cat: "مواد غذائية", shelf: "A3", expiry: "2026-11-01", active: true },
  { id: "s4", name: "قهوة 250غ", nameFr: "Café 250g", buy: 320, sell: 400, qty: 45, min: 10, barcode: "6112004", cat: "مواد غذائية", shelf: "B1", active: true },
  { id: "s5", name: "أرز 1كغ", nameFr: "Riz 1kg", buy: 140, sell: 170, qty: 50, min: 12, barcode: "6112005", cat: "مواد غذائية", shelf: "A2", active: true },
  { id: "s6", name: "عجائن 500غ", nameFr: "Pâtes 500g", buy: 65, sell: 85, qty: 70, min: 15, barcode: "6112006", cat: "مواد غذائية", shelf: "A2", active: true },
  { id: "s7", name: "جبن مثلثات", nameFr: "Fromage", buy: 180, sell: 230, qty: 36, min: 10, barcode: "6112007", cat: "ألبان", shelf: "A1", expiry: "2026-10-15", active: true },
  { id: "s8", name: "مشروب غازي 1ل", nameFr: "Soda 1L", buy: 90, sell: 130, qty: 90, min: 24, barcode: "6112008", cat: "مشروبات", shelf: "C1", active: true },
  { id: "s9", name: "صابون غار", nameFr: "Savon", buy: 75, sell: 110, qty: 40, min: 8, barcode: "6112009", cat: "تنظيف", shelf: "D1", active: true },
];

function seedOrders(products: Product[]): Order[] {
  const now = Date.now();
  const mk = (i: number, h: number, lines: OrderLine[], pay: "cash" | "card" | "credit", status: OrderStatus = "delivered"): Order => ({
    id: `seed${i}`, num: 100 + i, kind: i % 3 === 0 ? "delivery" : "dinein", status,
    lines, discount: i === 2 ? 100 : 0, pay, at: new Date(now - h * 3_600_000).toISOString(),
    total: lines.reduce((s, l) => s + l.qty * l.price, 0) - (i === 2 ? 100 : 0),
  });
  const p = (id: string, qty: number): OrderLine => {
    const pr = products.find((x) => x.id === id)!;
    return { productId: id, name: pr.name, qty, price: pr.sell };
  };
  return [
    mk(1, 1, [p(products[0].id, 2), p(products[3].id, 2)], "cash"),
    mk(2, 2, [p(products[1].id, 1)], "card"),
    mk(3, 3, [p(products[2].id, 3), p(products[3].id, 3)], "cash", "ready"),
    mk(4, 26, [p(products[0].id, 4)], "cash"),
    mk(5, 50, [p(products[1].id, 2), p(products[2].id, 2)], "card"),
  ];
}

function initial(type: BusinessType): State {
  const products = type === "restaurant" ? [...RESTO_SEED, ...RESTO_INGREDIENTS] : SHOP_SEED;
  const recipes: RecipeItem[] = type === "restaurant"
    ? [
        { id: "r1", dishId: "p1", ingredientId: "g1", qty: 0.4 },
        { id: "r2", dishId: "p1", ingredientId: "g2", qty: 0.3 },
      ]
    : [];
  const suppliers: Supplier[] = [
    { id: "sup1", name: type === "restaurant" ? "مطحنة الشرق" : "مورّد الجملة الكبير", phone: "0550777888", address: "السوق", active: true, owed: 5000, paid: 2000, balance: 3000 },
  ];
  const purchases: Purchase[] = [
    { id: "pur1", num: 1, supplierId: "sup1", lines: [{ productId: products[0].id, name: products[0].name, qty: 20, unitCost: products[0].buy }], total: products[0].buy * 20, paid: products[0].buy * 20, status: "paid", date: new Date().toISOString().slice(0, 10) },
  ];
  return {
    booted: false,
    businessType: type,
    businessName: type === "restaurant" ? "مطعم الدار" : "سوبرماركت النور",
    shopPhone: "0550 00 00 00", shopAddress: "الجزائر العاصمة", shopLogo: "",
    plan: "pro", lang: "ar", role: "owner",
    crmOn: true,
    branch: "الفرع الرئيسي", branches: ["الفرع الرئيسي"], tables: 4,
    products, orders: seedOrders(products),
    shift: { id: "sh1", by: "أمين (كاشير)", openedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(), closedAt: null, opening: 10000, closing: null, note: "" },
    shifts: [],
    employees: [
      { id: "e1", name: "أمين بن علي", role: "cashier", title: "كاشير", half: 1200, hired: "2024-03-01" },
      { id: "e2", name: "يوسف حمدي", role: "cook", title: "طباخ", half: 1400, hired: "2024-06-15" },
    ],
    att: [{ id: "a1", emp: "e1", date: new Date().toISOString().slice(0, 10), status: "full" }],
    advances: [{ id: "ad1", emp: "e1", amount: 2000, date: new Date().toISOString().slice(0, 10), note: "سلفة" }],
    customers: [{ id: "c1", name: "زبون وفِي", phone: "0550 12 34 56", address: "باب الزوار" }],
    goals: [{ id: "g1", title: "فتح فرع جديد", target: 1500000, saved: 420000, monthly: 120000 }],
    recipes, suppliers, purchases, alerts: [],
    overheads: [
      { id: "oh1", name: "كراء المحل", kind: "rent", monthly: 30000, active: true },
      { id: "oh2", name: "كهرباء وغاز", kind: "electricity", monthly: 4000, active: true },
    ],
    drivers: [
      { id: "drv1", name: "كريم السائق", phone: "0550111222", vehicle: "دراجة", kind: "internal", active: true },
      { id: "drv2", name: "توصيل سريع", phone: "0550333444", vehicle: "سيارة", kind: "external", active: true },
    ],
  };
}

const KEY = "dz-saas-v1";
const Ctx = createContext<{ s: State; update: (f: (s: State) => State) => void }>(null as never);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<State>(() => {
    // إنتاج فقط — لا تُحمَّل بذور عند توفّر API.
    // localStorage يُستخدم لتسهيل التفضيلات (اللغة، المظهر) فقط؛
    // البيانات التجارية (منتجات، طلبات، ...) مصدرها الخادم دائماً عبر Layout.tsx.
    const apiConfigured = typeof window !== "undefined" && Boolean((window as { __API_BASE?: string }).__API_BASE);
    const raw = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    if (raw && apiConfigured) {
      try {
        const p = JSON.parse(raw) as Partial<State>;
        if (p && Array.isArray(p.products) && Array.isArray(p.orders)) {
          return {
            ...p, booted: true,
            tables: typeof p.tables === "number" ? p.tables : 4,
            drivers: Array.isArray(p.drivers) ? p.drivers : [],
            overheads: Array.isArray(p.overheads) ? p.overheads : [],
            recipes: Array.isArray(p.recipes) ? p.recipes : [],
            suppliers: Array.isArray(p.suppliers) ? p.suppliers : [],
            purchases: Array.isArray(p.purchases) ? p.purchases : [],
            alerts: Array.isArray(p.alerts) ? p.alerts : [],
            advances: Array.isArray(p.advances) ? p.advances : [],
            shopPhone: typeof p.shopPhone === "string" ? p.shopPhone : "",
            shopAddress: typeof p.shopAddress === "string" ? p.shopAddress : "",
            shopLogo: typeof p.shopLogo === "string" ? p.shopLogo : "",
            // هجرة الشكل القديم (أجر الساعة) إلى أجر الجزئي
            employees: Array.isArray(p.employees) ? p.employees.map((e) => ({
              ...e,
              half: typeof (e as { half?: unknown }).half === "number"
                ? (e as unknown as Employee).half
                : ((e as unknown as { rate?: number }).rate ?? 0) * 4,
            })) : [],
          } as State;
        }
      } catch { /* تجاهل */ }
    }
    return initial("restaurant");
  });
  useEffect(() => {
    // كتابة محدودة بوجود منتجات فعلية (تجنّب البذور الوهمية في الإنتاج)
    try {
      if (s.products.length > 0 || s.orders.length > 0) {
        localStorage.setItem(KEY, JSON.stringify({ ...s, booted: true }));
      }
    } catch { /* تجاهل */ }
  }, [s]);
  const update = useCallback((f: (s: State) => State) => setS((prev) => f(prev)), []);
  const v = useMemo(() => ({ s, update }), [s, update]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// ─── Helpers ───
export const fmtDzd = (n: number) => {
  const fr = typeof document !== "undefined" && document.documentElement.lang === "fr";
  return `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} ${fr ? "DA" : "دج"}`;
};
export const todayKey = () => new Date().toISOString().slice(0, 10);

export function profitOf(orders: Order[], products: Product[]): number {
  const buy: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.buy]));
  return orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => {
    const gross = o.lines.reduce((x, l) => x + l.qty * l.price, 0);
    const cost = o.lines.reduce((x, l) => x + (buy[l.productId] ?? 0) * l.qty, 0);
    return sum + gross - o.discount - cost;
  }, 0);
}

export function resetDemo(type: BusinessType, update: (f: (s: State) => State) => void) {
  const fresh = initial(type);
  update(() => ({ ...fresh, booted: true }));
  try { localStorage.setItem(KEY, JSON.stringify({ ...fresh, booted: true })); } catch { /* تجاهل */ }
}
