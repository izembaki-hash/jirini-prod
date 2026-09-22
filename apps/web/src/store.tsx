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

// لا بذور ولا بيانات تجريبية: الحالة تبدأ فارغة ويملؤها الخادم عبر Layout.tsx.
function initial(type: BusinessType): State {
  return {
    booted: false,
    businessType: type,
    businessName: "",
    shopPhone: "", shopAddress: "", shopLogo: "",
    plan: "starter", lang: "ar", role: "owner",
    crmOn: true,
    branch: "", branches: [], tables: 4,
    products: [], orders: [],
    shift: null, shifts: [],
    employees: [], att: [], advances: [],
    customers: [], goals: [], recipes: [],
    suppliers: [], purchases: [], alerts: [],
    drivers: [], overheads: [],
  };
}

const KEY = "dz-saas-v1";
const Ctx = createContext<{ s: State; update: (f: (s: State) => State) => void }>(null as never);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<State>(() => {
    // التفضيلات فقط (اللغة/النشاط) — البيانات التجارية من الخادم دائماً.
    const raw = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    if (raw) {
      try {
        const p = JSON.parse(raw) as Partial<State>;
        if (p && typeof p === "object") {
          const base = initial(p.businessType === "shop" ? "shop" : "restaurant");
          return {
            ...base,
            lang: p.lang === "fr" ? "fr" : "ar",
            crmOn: typeof p.crmOn === "boolean" ? p.crmOn : true,
          };
        }
      } catch { /* تجاهل */ }
    }
    return initial("restaurant");
  });
  useEffect(() => {
    // حفظ التفضيلات فقط — لا منتجات ولا طلبات في localStorage.
    try {
      localStorage.setItem(KEY, JSON.stringify({ lang: s.lang, crmOn: s.crmOn, businessType: s.businessType }));
    } catch { /* تجاهل */ }
  }, [s.lang, s.crmOn, s.businessType]);
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
