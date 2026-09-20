// نسخة الخادم من حسابات packages/shared (مرآة مقصودة — حافظ على التطابق).
// المصدر الوحيد للمنطق المالي حتى خطوة التجميع (bundling) لاحقاً.
import type { OrderLineRow } from "./db.js";

export function orderTotal(lines: OrderLineRow[], discount: number, tax: number): number {
  const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
  return Math.max(0, sub - discount + tax);
}

export function profitOf(
  orders: { status: string; lines: OrderLineRow[]; discount: number }[],
  buyMap: Record<string, number>,
): number {
  return orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => {
      const gross = o.lines.reduce((s, l) => s + l.qty * l.price, 0);
      const cost = o.lines.reduce((s, l) => s + (buyMap[l.productId] ?? 0) * l.qty, 0);
      return sum + gross - o.discount - cost;
    }, 0);
}

export function shiftExpected(opening: number, cashSales: number): number {
  return opening + cashSales;
}

// الأجر على أساس الدوام الجزئي: الكامل = الجزئي × 2، الغياب = صفر.
export function salaryFor(
  records: { status: string }[],
  halfWage: number,
): number {
  let total = 0;
  for (const a of records) {
    if (a.status === "full") total += halfWage * 2;
    else if (a.status === "half") total += halfWage;
  }
  return Math.round(total);
}

// يوم الجزائر (UTC+1) — لا UTC الخام: قرب منتصف الليل كان اليوم ينقلب مبكراً بساعة.
export function algiersDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

// تفصيل الربح الكامل: مجمل − مصاريف ثابتة (موزعة يومياً ÷30) − عمالة = صافي.
export interface ProfitBreakdown {
  sales: number; discounts: number; cogs: number; gross: number;
  overheads: { name: string; amount: number }[];
  overheadsTotal: number; labor: number; net: number; marginPct: number;
}

export function profitBreakdown(
  orders: { status: string; lines: OrderLineRow[]; discount: number }[],
  buyMap: Record<string, number>,
  dailyOverheads: { name: string; amount: number }[],
  labor: number,
): ProfitBreakdown {
  const live = orders.filter((o) => o.status !== "cancelled");
  const sales = live.reduce((s, o) => s + o.lines.reduce((x, l) => x + l.qty * l.price, 0), 0);
  const discounts = live.reduce((s, o) => s + o.discount, 0);
  const cogs = live.reduce((s, o) => s + o.lines.reduce((x, l) => x + (buyMap[l.productId] ?? 0) * l.qty, 0), 0);
  const gross = sales - discounts - cogs;
  const overheadsTotal = Math.round(dailyOverheads.reduce((s, o) => s + o.amount, 0) * 100) / 100;
  const net = Math.round((gross - overheadsTotal - labor) * 100) / 100;
  return {
    sales, discounts, cogs, gross, overheads: dailyOverheads,
    overheadsTotal, labor: Math.round(labor), net,
    marginPct: sales > 0 ? Math.round((net / sales) * 1000) / 10 : 0,
  };
}

// حصة اليوم من مصروف شهري (اتفاقية ÷30) — نفس القاعدة في الواجهة والخادم.
export const dailySlice = (monthly: number) => Math.round((monthly / 30) * 100) / 100;

export const PLAN_LIMITS: Record<string, { branches: number; online: boolean; growth: boolean }> = {
  starter: { branches: 1, online: false, growth: false },
  pro: { branches: 2, online: true, growth: true },
  mega: { branches: 99, online: true, growth: true },
};
