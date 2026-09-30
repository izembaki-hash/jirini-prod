// مستشار الشهر: تجميع إحصائيات 30 يوماً من قاعدة البيانات (أرقام فقط — بلا أسماء أشخاص أو هواتف)
// ثم إنتاج نصائح عبر Groq. المفاتيح تُقرأ عند كل طلب (بلا إعادة تشغيل عند إضافتها).
import { salaryFor } from "./math.js";
import type { DbPort, InsightItem } from "./db.js";

export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
const DAY = 86_400_000;
const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface PeriodAgg {
  sales: number; orders: number; avgBasket: number; cancelled: number; cancelRate: number;
  discounts: number; cogs: number; labor: number; overheads: number; net: number; marginPct: number;
}
export interface MonthStats {
  month: string; businessType: string; branchCount: number; branches: string[];
  cur: PeriodAgg; prev: PeriodAgg;
  chg: { sales: number | null; orders: number | null; net: number | null; basket: number | null };
  labor: { employees: number; workDays: number; absentDays: number; cost: number; revPerLabor: number | null };
  products: { top: { name: string; qty: number; revenue: number }[]; dead: { name: string; stockValue: number }[]; lowStock: number };
  time: { bestDay: string | null; bestDaySales: number; worstDay: string | null; bestHour: number | null; bestHourSales: number };
  pay: { cash: number; card: number; credit: number };
}

export const currentMonthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const r0 = (n: number) => Math.round(n);
const pct = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

export async function buildMonthStats(
  dbx: DbPort, tenantId: string, businessType: string, branches: string[], now = new Date(),
): Promise<MonthStats> {
  const cut = now.getTime() - 30 * DAY;
  const cut60 = now.getTime() - 60 * DAY;
  const [orders, employees, att, products, overheads] = await Promise.all([
    dbx.listOrders(tenantId),
    dbx.listEmployees(tenantId),
    dbx.listAttendance(tenantId),
    dbx.listProducts(tenantId),
    dbx.listOverheads(tenantId),
  ]);
  const in60 = orders.filter((o) => new Date(o.createdAt).getTime() >= cut60);
  const curO = in60.filter((o) => new Date(o.createdAt).getTime() >= cut);
  const prevO = in60.filter((o) => new Date(o.createdAt).getTime() < cut);
  const buyMap: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.buyPrice]));
  const nameMap: Record<string, string> = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const ohMonth = overheads.filter((o) => o.active).reduce((s, o) => s + o.monthly, 0);

  const agg = (list: typeof orders, attFrom: number, attTo: number): PeriodAgg => {
    const live = list.filter((o) => o.status !== "cancelled");
    const sales = live.reduce((s, o) => s + o.total, 0);
    const discounts = live.reduce((s, o) => s + o.discount, 0);
    const cogs = live.reduce((s, o) => s + o.lines.reduce((x, l) => x + (buyMap[l.productId] ?? 0) * l.qty, 0), 0);
    const aIn = att.filter((a) => {
      const t = new Date(a.date.length <= 10 ? `${a.date}T00:00:00Z` : a.date).getTime();
      return t >= attFrom && t < attTo;
    });
    const labor = employees.reduce((s, e) => s + salaryFor(aIn.filter((a) => a.employeeId === e.id), e.halfWage), 0);
    const net = sales - discounts - cogs - labor - ohMonth;
    return {
      sales: r0(sales), orders: live.length,
      avgBasket: live.length ? r0(sales / live.length) : 0,
      cancelled: list.length - live.length,
      cancelRate: list.length ? Math.round(((list.length - live.length) / list.length) * 1000) / 10 : 0,
      discounts: r0(discounts), cogs: r0(cogs), labor: r0(labor), overheads: r0(ohMonth),
      net: r0(net), marginPct: sales > 0 ? Math.round((net / sales) * 1000) / 10 : 0,
    };
  };
  const cur = agg(curO, cut, now.getTime());
  const prev = agg(prevO, cut60, cut);

  const aCur = att.filter((a) => {
    const t = new Date(a.date.length <= 10 ? `${a.date}T00:00:00Z` : a.date).getTime();
    return t >= cut;
  });
  const workDays = aCur.filter((a) => a.status !== "absent").length;
  const absentDays = aCur.filter((a) => a.status === "absent").length;

  const revBy: Record<string, { qty: number; revenue: number }> = {};
  const sold60 = new Set<string>();
  for (const o of in60) {
    if (o.status === "cancelled") continue;
    for (const l of o.lines) {
      sold60.add(l.productId);
      const e = revBy[l.productId] ?? { qty: 0, revenue: 0 };
      e.qty += l.qty; e.revenue += l.qty * l.price;
      revBy[l.productId] = e;
    }
  }
  const top = Object.entries(revBy)
    .map(([id, v]) => ({ name: nameMap[id] ?? id, qty: v.qty, revenue: r0(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const dead = products
    .filter((p) => p.qty > 0 && !sold60.has(p.id))
    .map((p) => ({ name: p.name, stockValue: r0(p.qty * p.buyPrice) }))
    .sort((a, b) => b.stockValue - a.stockValue).slice(0, 5);
  const lowStock = products.filter((p) => p.qty <= p.minQty).length;

  const byDay: Record<number, number> = {};
  const byHour: Record<number, number> = {};
  for (const o of curO) {
    if (o.status === "cancelled") continue;
    const d = new Date(o.createdAt);
    byDay[d.getUTCDay()] = (byDay[d.getUTCDay()] ?? 0) + o.total;
    byHour[d.getUTCHours()] = (byHour[d.getUTCHours()] ?? 0) + o.total;
  }
  const dayEntries = Object.entries(byDay);
  const hourEntries = Object.entries(byHour);
  const bestD = dayEntries.sort((a, b) => b[1] - a[1])[0];
  const worstD = dayEntries.sort((a, b) => a[1] - b[1])[0];
  const bestH = hourEntries.sort((a, b) => b[1] - a[1])[0];
  const pay = { cash: 0, card: 0, credit: 0 };
  for (const o of curO) {
    if (o.status === "cancelled") continue;
    if (o.payMethod === "card") pay.card += o.total;
    else if (o.payMethod === "credit") pay.credit += o.total;
    else pay.cash += o.total;
  }

  return {
    month: currentMonthKey(now), businessType, branchCount: branches.length, branches,
    cur, prev,
    chg: { sales: pct(cur.sales, prev.sales), orders: pct(cur.orders, prev.orders), net: pct(cur.net, prev.net), basket: pct(cur.avgBasket, prev.avgBasket) },
    labor: {
      employees: employees.length, workDays, absentDays, cost: cur.labor,
      revPerLabor: cur.labor > 0 ? Math.round((cur.sales / cur.labor) * 100) / 100 : null,
    },
    products: { top, dead, lowStock },
    time: {
      bestDay: bestD ? AR_DAYS[Number(bestD[0])] : null, bestDaySales: r0(bestD?.[1] ?? 0),
      worstDay: worstD && worstD[0] !== bestD?.[0] ? AR_DAYS[Number(worstD[0])] : null,
      bestHour: bestH ? Number(bestH[0]) : null, bestHourSales: r0(bestH?.[1] ?? 0),
    },
    pay: { cash: r0(pay.cash), card: r0(pay.card), credit: r0(pay.credit) },
  };
}

const SYS_AR = `أنت مستشار عمليات خبير لمطاعم ومحلات الجزائر. مهمتك: تحليل أرقام الشهر وإنتاج نصائح عملية محددة بالأرقام.
القواعد الصارمة:
- أجب بـJSON فقط بهذا الشكل: {"insights":[{"title":"...","detail":"...","severity":"danger|warn|info|good"}]}
- من 3 إلى 6 نصائح مرتبة بالأهمية. كل detail: ملاحظة برقم محدد + إجراء عملي واحد + الأثر المتوقع. ممنوع العموميات وممنوع المديح الفارغ.
- قارن بالفترة السابقة عند توفر أرقامها (نسب التغير مئوية وجاهزة). العملة دج.
- انتبه خصوصاً: إنتاجية العمال (المبيعات مقابل كلفة الأجور)، المخزون الميت (قيمة مركونة بلا بيع)، المنتجات الرابحة والميتة، نسبة الإلغاء والخصومات، أفضل وأسوأ الأوقات.
- إن كانت البيانات شحيحة (نشاط جديد بلا مبيعات): نصيحة info صريحة واحدة بذلك + نصائح تأسيسية (تثبيت المنيو، تسجيل الحضور يومياً، جرد أسبوعي).
- العربية الفصحى المبسطة، جمل قصيرة.`;

const SYS_FR = `Tu es un consultant expert pour restaurants et commerces algériens. Analyse les chiffres du mois et produis des conseils concrets et chiffrés.
Règles strictes:
- Réponds en JSON uniquement: {"insights":[{"title":"...","detail":"...","severity":"danger|warn|info|good"}]}
- 3 à 6 conseils classés par importance. Chaque detail: observation chiffrée + une action concrète + effet attendu. Pas de généralités ni de flatterie.
- Compare avec la période précédente quand disponible. Monnaie: DA.
- Points d'attention: productivité du personnel (ventes vs salaires), stock mort (valeur immobilisée), produits gagnants/morts, annulations, remises, meilleurs/pires moments.
- Si données insuffisantes (nouvelle activité): un conseil info honnête + conseils de démarrage.
- Français simple, phrases courtes.`;

export function buildPrompt(stats: MonthStats, lang: "ar" | "fr"): { system: string; user: string } {
  const system = lang === "fr" ? SYS_FR : SYS_AR;
  const user = lang === "fr"
    ? `Données du mois (JSON):\n${JSON.stringify(stats)}`
    : `بيانات الشهر (JSON):\n${JSON.stringify(stats)}`;
  return { system, user };
}

const SEV = new Set(["danger", "warn", "info", "good"]);

export async function askGroq(opts: {
  base: string; key: string; model: string; system: string; user: string;
}): Promise<{ model: string; insights: InsightItem[] }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const r = await fetch(`${opts.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: 0.3,
        max_tokens: 1600,
        response_format: { type: "json_object" },
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`groq_${r.status}`);
    const j = (await r.json().catch(() => null)) as {
      model?: string; choices?: { message?: { content?: string } }[];
    } | null;
    const content = j?.choices?.[0]?.message?.content;
    if (!content) throw new Error("groq_empty");
    const parsed = JSON.parse(content) as { insights?: unknown };
    if (!Array.isArray(parsed.insights)) throw new Error("groq_shape");
    const insights: InsightItem[] = [];
    for (const it of parsed.insights.slice(0, 6)) {
      const o = it as { title?: unknown; detail?: unknown; severity?: unknown };
      if (typeof o.title !== "string" || typeof o.detail !== "string" || !o.title.trim() || !o.detail.trim()) continue;
      insights.push({
        title: o.title.trim().slice(0, 120),
        detail: o.detail.trim().slice(0, 600),
        severity: typeof o.severity === "string" && SEV.has(o.severity) ? (o.severity as InsightItem["severity"]) : "info",
      });
    }
    if (!insights.length) throw new Error("groq_shape");
    return { model: typeof j?.model === "string" ? j.model : opts.model, insights };
  } finally {
    clearTimeout(timer);
  }
}
