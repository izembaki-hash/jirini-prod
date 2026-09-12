// ─── الأنواع المشتركة: نفس العقد يعمل على Firebase وPostgreSQL ───
// كل سجل يحمل tenant_id (عزل المستأجرين). العملة ثابتة: دج. المنطقة: Africa/Algiers.

export const CURRENCY = "دج" as const;
export const TIMEZONE = "Africa/Algiers" as const;

export type BusinessType = "restaurant" | "shop";
export type PlanId = "starter" | "pro" | "mega";
export type Role = "owner" | "manager" | "cashier" | "cook";
export type Lang = "ar" | "fr";

export interface Plan {
  id: PlanId;
  priceDzd: number;
  maxBranches: number;
  onlineOrdering: boolean;
  growthPlanner: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", priceDzd: 2500, maxBranches: 1, onlineOrdering: false, growthPlanner: false },
  pro: { id: "pro", priceDzd: 3000, maxBranches: 2, onlineOrdering: true, growthPlanner: true },
  mega: { id: "mega", priceDzd: 4500, maxBranches: 5, onlineOrdering: true, growthPlanner: true },
};

export function canUse(plan: PlanId, feature: "onlineOrdering" | "growthPlanner" | "branches"): boolean {
  const p = PLANS[plan];
  if (feature === "onlineOrdering") return p.onlineOrdering;
  if (feature === "growthPlanner") return p.growthPlanner;
  return p.maxBranches > 1;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  type: BusinessType;
  lang: Lang;
  plan: PlanId;
  phone: string;
  address: string;
  logoUrl?: string;
  crmEnabled: boolean;
  overtimeEnabled: boolean;
}

export interface Branch { id: string; tenant_id: string; name: string; address: string; }
export interface Category { id: string; tenant_id: string; name: string; }
export interface Product {
  id: string; tenant_id: string; branch_id: string;
  name: string; nameFr?: string;
  buyPrice: number; sellPrice: number; qty: number; minQty: number;
  barcode?: string; imageUrl?: string; categoryId?: string;
  shelf?: string; expiryDate?: string; wholesalePrice?: number;
  active: boolean;
}
export interface RecipeLine { productId: string; ingredientId: string; qty: number; tenant_id: string; }
export interface RecipeItem { id: string; tenant_id: string; dishId: string; ingredientId: string; qty: number; }
export interface Supplier {
  id: string; tenant_id: string; name: string; phone: string;
  address?: string; notes?: string; active: boolean;
  owed?: number; paid?: number; balance?: number;
}
export interface PurchaseLine { productId: string; name: string; qty: number; unitCost: number; }
export interface Purchase {
  id: string; num: number; tenant_id: string; supplierId: string;
  lines: PurchaseLine[]; total: number; paid: number;
  status: "unpaid" | "partial" | "paid"; date: string; notes?: string;
}
export interface AlertItem {
  id: string; tenant_id: string; kind: string; refId?: string;
  message: string; read: boolean;
}
export type OverheadKind = "rent" | "electricity" | "gas" | "water" | "internet" | "other";
export interface Overhead {
  id: string; tenant_id: string; name: string; kind: OverheadKind;
  monthly: number; active: boolean; notes?: string;
}
export type DriverKind = "internal" | "external";
export interface Driver {
  id: string; tenant_id: string; name: string; phone: string;
  vehicle?: string; kind: DriverKind; active: boolean;
}
export type PaymentStatus = "initiated" | "paid" | "failed" | "cancelled" | "expired";
export interface Payment {
  id: string; tenant_id: string; ref: string; plan: string; months: number;
  amountDzd: number; email?: string; status: PaymentStatus;
  sofizTransactionId?: string; cibTransactionId?: string;
}
export interface Employee {
  id: string; tenant_id: string; branch_id: string;
  name: string; role: Role; hiredAt: string; hourlyRate: number;
}
export interface Attendance { id: string; tenant_id: string; employeeId: string; date: string; inAt: string; outAt: string | null; overtimeMin: number; }
export interface Shift {
  id: string; tenant_id: string; branch_id: string; cashierId: string;
  openedAt: string; closedAt: string | null; openingCash: number;
  closingCash: number | null; note: string;
}
export type PayMethod = "cash" | "card";
export type OrderKind = "dinein" | "takeaway" | "delivery" | "qr_table";
export type OrderStatus = "pending" | "preparing" | "ready" | "onway" | "delivered" | "cancelled";
export interface OrderLine { productId: string; name: string; qty: number; unitPrice: number; }
export interface Order {
  id: string; tenant_id: string; branch_id: string; shiftId?: string;
  kind: OrderKind; tableNo?: string; status: OrderStatus;
  lines: OrderLine[]; discount: number; tax: number;
  payMethod: PayMethod; customerName?: string; customerPhone?: string; address?: string;
  createdAt: string; total: number;
}
export interface Customer { id: string; tenant_id: string; name: string; phone: string; address?: string; }
export interface Goal {
  id: string; tenant_id: string; title: string; target: number; saved: number; monthly: number;
}

// ─── حسابات خالصة (تُستخدم في الواجهة والخلفية معاً) ───

export function orderTotal(o: Pick<Order, "lines" | "discount" | "tax">): number {
  const sub = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  return Math.max(0, sub - o.discount + o.tax);
}

/** صافي ربح اليوم = Σ(بيع − شراء) − خصومات. buyMap: productId → buyPrice */
export function dailyProfit(orders: Order[], buyMap: Record<string, number>): number {
  return orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => {
      const cost = o.lines.reduce((s, l) => s + (buyMap[l.productId] ?? 0) * l.qty, 0);
      return sum + (o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) - o.discount - cost);
    }, 0);
}

export function shiftExpected(opening: number, cashSales: number, cashRefunds: number): number {
  return opening + cashSales - cashRefunds;
}

export function salaryFor(att: Attendance[], hourlyRate: number, overtimeRate = 1.5, overtimeOn = true): number {
  let total = 0;
  for (const a of att) {
    if (!a.outAt) continue;
    const h = (new Date(a.outAt).getTime() - new Date(a.inAt).getTime()) / 3_600_000;
    const otH = overtimeOn ? a.overtimeMin / 60 : 0;
    total += Math.max(0, h - otH) * hourlyRate + otH * hourlyRate * overtimeRate;
  }
  return Math.round(total);
}

/** خطة الادخار: المدة = الهدف / الشهري */
export function savingsPlan(target: number, monthlyAvgProfit: number, monthlySave: number) {
  const months = monthlySave > 0 ? Math.ceil(target / monthlySave) : Infinity;
  const pctOfProfit = monthlyAvgProfit > 0 ? Math.round((monthlySave / monthlyAvgProfit) * 100) : 0;
  return { months, pctOfProfit };
}

export function fmtDzd(n: number): string {
  return `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} ${CURRENCY}`;
}
