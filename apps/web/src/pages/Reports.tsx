import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, profitOf, useStore, displayName, dailySlice, laborFor, attSummary, type Order } from "../store";
import { api, toOrder, type MonthInsight } from "../api";
import { connected, useAuth } from "../auth";
import { t } from "../i18n";
import { errToast } from "../lib/err";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Segmented, Stat } from "../ui";
import { ReportDoc, printDoc, shopOf } from "../print";
import { Bars } from "../components/Charts";

// 8. التقارير: مبيعات/أرباح/منتج/موظف/فرع/حضور + حساب P&L + تصدير (طباعة/PDF وCSV).
export default function Reports() {
  const { s } = useStore();
  const { session } = useAuth();
  const L = s.lang;
  const [range, setRange] = useState<7 | 30>(7);
  // المالك وحده يصفّي التقارير بفرع (المدير مقيّد بفرعه من الخادم أصلاً)
  const isOwner = !!session && session.role === "owner";
  const showBranchFilter = isOwner && s.branches.length > 1;
  const [repBranch, setRepBranch] = useState("");
  const scopeB = showBranchFilter ? repBranch : "";
  // مالك وحده: جلب الطلبات حسب الفلتر من الخادم (س orders يخص الفرع النشط فقط)
  const [repOrders, setRepOrders] = useState<Order[] | null>(null);
  // مستشار الشهر (Groq — المالك فقط): يُجلب المخزّن، والتوليد عند الطلب فقط.
  const [insight, setInsight] = useState<MonthInsight | null>(null);
  const [insBusy, setInsBusy] = useState(false);
  useEffect(() => {
    if (!connected() || !isOwner) return;
    api.insightsGet().then(setInsight).catch(() => null);
  }, [isOwner]);
  const genInsight = async (force: boolean) => {
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    setInsBusy(true);
    try {
      setInsight(await api.insightsGenerate(force));
      toast.success(t(L, "done"));
    } catch (ex) { errToast(L, ex); } finally { setInsBusy(false); }
  };
  const sevTone = (sev: string): "bad" | "warn" | "info" | "ok" =>
    sev === "danger" ? "bad" : sev === "warn" ? "warn" : sev === "good" ? "ok" : "info";
  const sevLabel = (sev: string) =>
    sev === "danger" ? t(L, "insSevDanger") : sev === "warn" ? t(L, "insSevWarn") : sev === "good" ? t(L, "insSevGood") : t(L, "insSevInfo");
  useEffect(() => {
    if (!showBranchFilter) return;
    let alive = true;
    api.listOrders(undefined, { branch: scopeB || undefined })
      .then((list) => { if (alive) setRepOrders(list.map(toOrder)); })
      .catch(() => null);
    return () => { alive = false; };
  }, [showBranchFilter, scopeB]);
  const baseOrders = showBranchFilter && repOrders ? repOrders : s.orders;
  const scopedOrders = scopeB ? baseOrders.filter((o) => (o.branchId ?? null) === scopeB) : baseOrders;
  const scopedEmps = scopeB ? s.employees.filter((e) => e.branchId === scopeB) : s.employees;
  const days = Array.from({ length: range }, (_, i) => {
    const d = new Date(Date.now() - (range - 1 - i) * 86_400_000);
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("fr-DZ", { day: "numeric", month: "numeric" }) };
  });
  const inRange = scopedOrders.filter((o) => days.some((d) => d.key === o.at.slice(0, 10)));
  const live = inRange.filter((o) => o.status !== "cancelled");
  const sales = live.reduce((x, o) => x + o.total, 0);
  const profit = profitOf(inRange, s.products);
  const buyMap: Record<string, number> = Object.fromEntries(s.products.map((p) => [p.id, p.buy]));
  const discounts = live.reduce((x, o) => x + o.discount, 0);
  const cogs = live.reduce((x, o) => x + o.lines.reduce((s2, l) => s2 + (buyMap[l.productId] ?? 0) * l.qty, 0), 0);
  const ohLines = s.overheads.filter((o) => o.active).map((o) => ({ name: o.name, amount: Math.round(dailySlice(o.monthly) * range * 100) / 100 }));
  const ohTotal = ohLines.reduce((x, o) => x + o.amount, 0);
  const attIn = s.att.filter((a) => a.date >= days[0].key);
  const labor = scopedEmps.reduce((sum, e) => sum + laborFor(attIn.filter((a) => a.emp === e.id), [e]), 0);
  const net = Math.round(sales - discounts - cogs - ohTotal - labor);
  const perDay = days.map((d) => inRange.filter((o) => o.at.slice(0, 10) === d.key).reduce((x, o) => x + o.total, 0));
  const cashSales = live.filter((o) => o.pay === "cash").reduce((x, o) => x + o.total, 0);
  const cardSales = live.filter((o) => o.pay === "card").reduce((x, o) => x + o.total, 0);
  const creditSales = live.filter((o) => o.pay === "credit").reduce((x, o) => x + o.total, 0);

  const counts: Record<string, number> = {};
  const rev: Record<string, number> = {};
  const cost: Record<string, number> = {};
  for (const o of live) for (const l of o.lines) {
    counts[l.name] = (counts[l.name] ?? 0) + l.qty;
    rev[l.name] = (rev[l.name] ?? 0) + l.qty * l.price;
    cost[l.name] = (cost[l.name] ?? 0) + (buyMap[l.productId] ?? 0) * l.qty;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxExpense = Math.max(1, cogs + discounts + ohTotal + labor);
  const expParts = [
    { k: t(L, "bdCogs"), v: cogs },
    { k: t(L, "bdDiscounts"), v: discounts },
    { k: t(L, "bdOverheads"), v: ohTotal },
    { k: t(L, "bdLabor"), v: labor },
  ];

  const periodLb = `${new Date(`${days[0].key}T12:00:00`).toLocaleDateString(L === "ar" ? "ar-DZ" : "fr-DZ")} — ${new Date(`${days[days.length - 1].key}T12:00:00`).toLocaleDateString(L === "ar" ? "ar-DZ" : "fr-DZ")}`;

  const printReport = () => {
    const marginPct = sales > 0 ? Math.round((net / sales) * 1000) / 10 : 0;
    printDoc(
      `${t(L, "repTitle")} — ${s.businessName}`,
      L === "ar" ? "rtl" : "ltr",
      <ReportDoc d={{
        shop: shopOf(s), lang: L, title: t(L, "repTitle"), period: periodLb,
        kpis: [
          { label: t(L, "statSales"), value: fmtDzd(sales) },
          { label: t(L, "statProfit"), value: fmtDzd(profit) },
          { label: t(L, "bdNet"), value: `${fmtDzd(net)} (${marginPct}%)` },
          { label: t(L, "statBasket"), value: fmtDzd(live.length ? sales / live.length : 0) },
        ],
        pnl: [
          { label: t(L, "bdSales"), value: fmtDzd(sales) },
          { label: `− ${t(L, "bdDiscounts")}`, value: `−${fmtDzd(discounts)}`, neg: true },
          { label: `− ${t(L, "bdCogs")}`, value: `−${fmtDzd(cogs)}`, neg: true },
          { label: t(L, "bdGross"), value: fmtDzd(sales - discounts - cogs), bold: true },
          ...ohLines.map((o) => ({ label: `− ${o.name}`, value: `−${fmtDzd(o.amount)}`, neg: true })),
          { label: `− ${t(L, "bdLabor")}`, value: `−${fmtDzd(labor)}`, neg: true },
          { label: t(L, "bdNet"), value: fmtDzd(net), bold: true },
        ],
        methods: [
          { label: t(L, "cash"), value: fmtDzd(cashSales) },
          { label: t(L, "card"), value: fmtDzd(cardSales) },
          ...(creditSales > 0 ? [{ label: t(L, "credit"), value: fmtDzd(creditSales) }] : []),
        ],
        top: ranked.slice(0, 10).map(([n, q]) => {
          const pm = s.products.find((pp) => pp.name === n);
          const m = (rev[n] ?? 0) - (cost[n] ?? 0);
          return { name: pm ? displayName(pm, L) : n, qty: q, margin: `${m >= 0 ? "+" : ""}${fmtDzd(m)}` };
        }),
        attendance: scopedEmps.map((e) => {
          const sm = attSummary(attIn.filter((a) => a.emp === e.id), e.id);
          return { name: e.name, full: sm.full, half: sm.half, absent: sm.absent, salary: fmtDzd(laborFor(attIn.filter((a) => a.emp === e.id), [e])) };
        }),
      }} />,
    );
  };

  const csv = () => {    const rows = [["num", "date", "items", "total", "pay", "status"],
      ...inRange.map((o) => [o.num, o.at.slice(0, 10), o.lines.reduce((x, l) => x + l.qty, 0), o.total, o.pay, o.status])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport-${range}j.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{t(L, "repTitle")}</h1>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {showBranchFilter && (
            <select value={repBranch} onChange={(e) => setRepBranch(e.target.value)}
              aria-label={t(L, "repBranch")}
              className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm font-semibold">
              <option value="">{t(L, "repAllBranches")}</option>
              {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <Segmented label={t(L, "period")} value={String(range) as "7" | "30"}
            options={[{ value: "7", label: t(L, "d7") }, { value: "30", label: t(L, "d30") }]}
            onChange={(v) => setRange(Number(v) as 7 | 30)} />
          <Button variant="outline" onClick={printReport}>{t(L, "pdfPrint")}</Button>
          <Button variant="outline" onClick={csv}>Excel (CSV)</Button>
        </span>
      </div>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{t(L, "insTitle")}</CardTitle>
            <p className="text-xs text-muted">{t(L, "insSub")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {insight?.content ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="tnum">{insight.month}</span>
                  {insight.createdAt && <span>· {insight.createdAt.slice(0, 10)}</span>}
                  <Button size="sm" variant="ghost" loading={insBusy} onClick={() => genInsight(true)} className="ms-auto">
                    {t(L, "insRegen")}
                  </Button>
                </div>
                {insight.content.insights.map((it, i) => (
                  <div key={i} className="rounded-[10px] border border-line bg-canvas p-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={sevTone(it.severity)}>{sevLabel(it.severity)}</Badge>
                      <b className="text-sm">{it.title}</b>
                    </div>
                    <p className="mt-1 text-sm leading-7 text-muted">{it.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted">{t(L, "insEmpty")}</p>
                <Button loading={insBusy} onClick={() => genInsight(false)}>{t(L, "insGen")}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t(L, "statSales")} value={fmtDzd(sales)} />
        <Stat label={t(L, "statProfit")} value={fmtDzd(profit)} />
        <Stat label={t(L, "bdNet")} value={fmtDzd(net)} sub={`${t(L, "bdMargin")}: ${sales > 0 ? Math.round((net / sales) * 1000) / 10 : 0}%`} />
        <Stat label={t(L, "statBasket")} value={fmtDzd(live.length ? sales / live.length : 0)} />
      </div>

      <Card>
        <CardHeader><CardTitle>{t(L, "pnlTitle")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between"><span>{t(L, "bdSales")}</span><b className="tnum">{fmtDzd(sales)}</b></div>
            <div className="flex justify-between text-ember"><span>− {t(L, "bdDiscounts")}</span><span className="tnum">−{fmtDzd(discounts)}</span></div>
            <div className="flex justify-between text-ember"><span>− {t(L, "bdCogs")}</span><span className="tnum">−{fmtDzd(cogs)}</span></div>
            <div className="flex justify-between font-bold"><span>{t(L, "bdGross")}</span><span className="tnum text-growth-deep">{fmtDzd(sales - discounts - cogs)}</span></div>
            {ohLines.map((o, i) => (
              <div key={i} className="flex justify-between text-ember"><span>− {o.name}</span><span className="tnum">−{fmtDzd(o.amount)}</span></div>
            ))}
            <div className="flex justify-between text-ember"><span>− {t(L, "bdLabor")}</span><span className="tnum">−{fmtDzd(labor)}</span></div>
            <div className="my-1 h-px bg-line" />
            <div className="flex justify-between"><b>{t(L, "bdNet")}</b><b className="tnum text-xl text-growth-deep">{fmtDzd(net)}</b></div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-muted">{t(L, "byMethod")}:</span>
              <Badge>{t(L, "cash")}: <span className="tnum">{fmtDzd(cashSales)}</span></Badge>
              <Badge>{t(L, "card")}: <span className="tnum">{fmtDzd(cardSales)}</span></Badge>
              {creditSales > 0 && <Badge>{t(L, "credit")}: <span className="tnum">{fmtDzd(creditSales)}</span></Badge>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {expParts.map((e) => (
              <div key={e.k} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 truncate">{e.k}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/60">
                  <span className="block h-full rounded-full bg-ember/70" style={{ width: `${(e.v / maxExpense) * 100}%` }} />
                </span>
                <b className="tnum w-20 text-end text-xs">{fmtDzd(e.v)}</b>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t(L, "salesOverTime")}</CardTitle></CardHeader>
          <CardContent><Bars data={perDay} />
            <div className="tnum mt-1 flex justify-between text-[10px] text-muted">{days.filter((_, i) => i % Math.ceil(days.length / 8) === 0).map((d) => <span key={d.key}>{d.label}</span>)}</div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{t(L, "byProduct")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
              {ranked.map(([n, q], i) => {
                const pm = s.products.find((pp) => pp.name === n);
                const m = (rev[n] ?? 0) - (cost[n] ?? 0);
                return (
                  <li key={n} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{pm ? displayName(pm, L) : n}</span>
                    <span className="tnum text-xs text-muted">×{q}</span>
                    <b className={`tnum w-20 text-end text-xs ${m >= 0 ? "text-growth-deep" : "text-ember"}`}>{m >= 0 ? "+" : ""}{fmtDzd(m)}</b>
                    {i === 0 && <Badge tone="ok">{t(L, "most")}</Badge>}
                    {i === ranked.length - 1 && ranked.length > 1 && <Badge tone="bad">{t(L, "least")}</Badge>}
                  </li>
                );
              })}
              {ranked.length === 0 && <li className="text-muted">{t(L, "noDataPeriod")}</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card><CardHeader><CardTitle>{t(L, "attReport")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col text-sm">
            {scopedEmps.map((e) => {
              const sm = attSummary(attIn.filter((a) => a.emp === e.id), e.id);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-0 first:pt-0">
                  <span className="min-w-28 flex-1 font-bold">{e.name}</span>
                  <Badge tone="ok"><span className="tnum">{sm.full}</span> {t(L, "attFull")}</Badge>
                  <Badge tone="warn"><span className="tnum">{sm.half}</span> {t(L, "attHalf")}</Badge>
                  <Badge tone={sm.absent ? "bad" : "neutral"}><span className="tnum">{sm.absent}</span> {t(L, "attAbsent")}</Badge>
                  <b className="tnum ms-auto text-growth-deep">{fmtDzd(laborFor(attIn.filter((a) => a.emp === e.id), [e]))}</b>
                </li>
              );
            })}
            {scopedEmps.length === 0 && <li className="text-muted">{t(L, "noEmpHint")}</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
