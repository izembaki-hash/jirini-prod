import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDzd, todayKey, useStore, displayName, dailySlice, laborFor } from "../store";
import { api } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Progress, StatusDot } from "../ui";
import { Bars, Spark } from "../components/Charts";

// 2. لوحة التحكم — الفائدة اليومية هي البطل التسويقي.
function Row({ k, v, neg = false, bold = false }: { k: string; v: string; neg?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-bold" : ""}>{k}</span>
      <span className={`tnum ${neg ? "text-ember" : bold ? "text-growth-deep" : ""} ${bold ? "font-bold" : ""}`}>{v}</span>
    </div>
  );
}

// قائمة البدء للمبتدئين: تظهر فقط للبنود الناقصة، وتُصرف نهائياً.
function Checklist({ done, items }: { done: string[]; items: { key: string; label: string; to: string }[] }) {
  const { s } = useStore();
  const L = s.lang;
  const [hide, setHide] = useState(() => {
    try { return localStorage.getItem("dz-checklist-hide") === "1"; } catch { return false; }
  });
  const pending = items.filter((i) => !done.includes(i.key));
  if (hide || pending.length === 0) return null;
  return (
    <Card>
      <div className="flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          <b className="flex-1">{t(L, "clTitle")}</b>
          <button className="text-xs text-muted underline" onClick={() => {
            try { localStorage.setItem("dz-checklist-hide", "1"); } catch { /* تجاهل */ }
            setHide(true);
          }}>{t(L, "clHide")}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.map((i) => (
            <Link key={i.key} to={i.to}><Button size="sm" variant="outline">{i.label}</Button></Link>
          ))}
        </div>
        <Progress value={((items.length - pending.length) / items.length) * 100} />
      </div>
    </Card>
  );
}
export default function Dashboard() {
  const { s } = useStore();
  const L = s.lang;
  const today = s.orders.filter((o) => o.at.slice(0, 10) === todayKey());
  const [remote, setRemote] = useState<{
    sales: number; profit: number; perDay: number[]; top: { name: string; qty: number }[];
    invoices: number; todayNet?: number; todayBreakdown?: import("../api").ProfitBd;
  } | null>(null);
  const [showBd, setShowBd] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Escape يغلق نافذة التفصيل ويعيد التركيز لزر الفتح (better-accessibility §3)
  useEffect(() => {
    if (!showBd) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowBd(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBd]);
  useEffect(() => {
    if (connected()) {
      api.summary(7).then((r) => setRemote({
        sales: r.todaySales,
        profit: r.todayProfit,
        perDay: r.perDay.map((d) => d.sales),
        top: r.top.slice(0, 5),
        invoices: r.invoices,
        todayNet: r.todayNet,
        todayBreakdown: r.todayBreakdown,
      })).catch(() => null);
    }
  }, []);
  const sales = remote?.sales ?? today.filter((o) => o.status !== "cancelled").reduce((x, o) => x + o.total, 0);
  // تفصيل اليوم محلياً (الخادم يرجع الجاهز عند الاتصال)
  const tLive = today.filter((o) => o.status !== "cancelled");
  const tSales = tLive.reduce((x, o) => x + o.lines.reduce((s2, l) => s2 + l.qty * l.price, 0), 0);
  const tDisc = tLive.reduce((x, o) => x + o.discount, 0);
  const buyMap: Record<string, number> = Object.fromEntries(s.products.map((p) => [p.id, p.buy]));
  const tCogs = tLive.reduce((x, o) => x + o.lines.reduce((s2, l) => s2 + (buyMap[l.productId] ?? 0) * l.qty, 0), 0);
  const ohList = s.overheads.filter((o) => o.active).map((o) => ({ name: o.name, amount: dailySlice(o.monthly) }));
  const tOh = ohList.reduce((x, o) => x + o.amount, 0);
  const tLabor = laborFor(s.att, s.employees, todayKey());
  const tNet = Math.round(tSales - tDisc - tCogs - tOh - tLabor);
  const heroNet = remote?.todayNet ?? tNet;
  const bd = remote?.todayBreakdown ?? {
    sales: tSales, discounts: tDisc, cogs: tCogs, gross: tSales - tDisc - tCogs,
    overheads: ohList, overheadsTotal: tOh, labor: tLabor, net: tNet,
    marginPct: tSales > 0 ? Math.round((tNet / tSales) * 1000) / 10 : 0,
  };
  const last7 = remote?.perDay ?? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    return s.orders.filter((o) => o.at.slice(0, 10) === d).reduce((x, o) => x + o.total, 0);
  });

  const counts: Record<string, number> = {};
  for (const o of s.orders) for (const l of o.lines) counts[l.name] = (counts[l.name] ?? 0) + l.qty;
  const top5 = remote?.top.map((x) => [x.name, x.qty] as [string, number])
    ?? Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const invoiceCount = remote?.invoices ?? s.orders.length;

  const low = s.products.filter((p) => p.qty <= p.min);
  const expiring = s.products.filter((p) => p.expiry && p.qty > 0 &&
    Math.ceil((new Date(p.expiry).getTime() - Date.now()) / 86_400_000) <= 30);
  const openShift = s.shift && !s.shift.closedAt;
  const noCheck = s.employees.filter((e) => !s.att.some((a) => a.emp === e.id && a.date === todayKey()));

  return (
    <div className="flex flex-col gap-4">
      <Checklist
        done={[
          ...(s.products.length > 0 ? ["p"] : []),
          ...(s.orders.some((o) => !o.id.startsWith("seed")) ? ["s"] : []),
          ...(openShift ? ["sh"] : []),
          ...(s.employees.length > 1 ? ["e"] : []),
        ]}
        items={[
          { key: "p", label: t(L, "clAddProduct"), to: "/app/inventory" },
          { key: "s", label: t(L, "clFirstSale"), to: "/app/pos" },
          { key: "sh", label: t(L, "clOpenShift"), to: "/app/shifts" },
          { key: "e", label: t(L, "clInvite"), to: "/app/staff" },
        ]}
      />
      {/* البطل: الفائدة اليومية */}
      <section aria-labelledby="profit-h" className="card-rise grid grid-cols-1 gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-semibold text-muted">{t(L, "dailyProfit")}</p>
          <h1 id="profit-h" className="tnum mt-1 text-4xl font-bold tracking-tight text-growth-deep sm:text-5xl">{fmtDzd(heroNet)}</h1>
          <p className="mt-1 text-xs text-muted">{t(L, "netProfitToday")}</p>
          <button onClick={() => setShowBd(true)} className="mt-1 w-fit rounded-lg text-xs font-bold text-growth-deep underline underline-offset-4">
            {t(L, "drillHint")}
          </button>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="ok"><span className="tnum">{fmtDzd(sales)}</span> · {t(L, "salesToday")}</Badge>
            <Badge>{invoiceCount} {t(L, "invoicesU")}</Badge>
            {openShift && <Badge tone="warn">{t(L, "openShiftB")}</Badge>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/app/pos"><Button>{t(L, "openPos")}</Button></Link>
            <Link to="/app/inventory"><Button variant="outline">{t(L, "addProduct")}</Button></Link>
            <Link to="/app/reports"><Button variant="outline">{t(L, "viewReports")}</Button></Link>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <Bars data={last7} />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t(L, "last7d")}</span><Spark data={last7} />
          </div>
        </div>
      </section>

      {showBd && (
        <div className="dialog-scrim fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4 pb-[env(safe-area-inset-bottom)]" onClick={() => setShowBd(false)}
          role="dialog" aria-modal="true" aria-label={t(L, "bdTitle")}>
          <Card className="pop-in w-full max-w-[480px]" >
            <div onClick={(e) => e.stopPropagation()}>
              <CardHeader><CardTitle>{t(L, "bdTitle")}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                <Row k={t(L, "bdSales")} v={fmtDzd(bd.sales)} />
                <Row k={`− ${t(L, "bdDiscounts")}`} v={`−${fmtDzd(bd.discounts)}`} neg />
                <Row k={`− ${t(L, "bdCogs")}`} v={`−${fmtDzd(bd.cogs)}`} neg />
                <Row k={t(L, "bdGross")} v={fmtDzd(bd.gross)} bold />
                {bd.overheads.map((o, i) => (
                  <Row key={i} k={`− ${o.name}`} v={`−${fmtDzd(o.amount)}`} neg />
                ))}
                <Row k={`− ${t(L, "bdLabor")}`} v={`−${fmtDzd(bd.labor)}`} neg />
                <div className="my-1 h-px bg-line" />
                <div className="flex items-center justify-between">
                  <b>{t(L, "bdNet")}</b>
                  <b className="tnum text-xl text-growth-deep">{fmtDzd(bd.net)}</b>
                </div>
                <p className="tnum text-xs text-muted">{t(L, "bdMargin")}: {bd.marginPct}%</p>
                <Button ref={closeRef} onClick={() => setShowBd(false)}>{t(L, "close")}</Button>
              </CardContent>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rise-in" ><CardHeader><CardTitle>{t(L, "top5")}</CardTitle></CardHeader>
          <CardContent>
            {top5.length === 0 ? <Empty title={t(L, "noSales")} hint={t(L, "noSalesHint")} /> : (
              <ol className="flex flex-col gap-2">
                {top5.map(([n, q], i) => {
                  const pm = s.products.find((pp) => pp.name === n);
                  return (
                    <li key={n} className="flex items-center gap-3 border-t border-line pt-2 first:border-0 first:pt-0">
                      <span className="tnum grid size-7 place-items-center rounded-full bg-canvas text-xs font-bold">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium">{pm ? displayName(pm, L) : n}</span>
                      <span className="tnum text-sm font-bold">×{q}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="rise-in" style={{ animationDelay: "60ms" }}><CardHeader><CardTitle>{t(L, "alerts")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm" role="list">
              {low.map((p) => <li key={p.id} className="flex items-center gap-2"><StatusDot status="cancelled" />{t(L, "lowStock")}: <b>{displayName(p, L)}</b> <span className="tnum text-muted">({p.qty})</span><Link to="/app/inventory" onClick={() => { try { localStorage.setItem("dz-purchase-prefill", JSON.stringify({ productId: p.id })); localStorage.setItem("dz-inv-tab", "purchases"); } catch { /* تجاهل */ } }} className="ms-auto rounded-lg border border-line px-2 py-1 text-xs font-bold">{t(L, "buyIt")}</Link></li>)}
              {expiring.slice(0, 3).map((p) => {
                const d = Math.ceil((new Date(p.expiry!).getTime() - Date.now()) / 86_400_000);
                return <li key={p.id} className="flex items-center gap-2"><StatusDot status="pending" />{t(L, "expSoonIn")} <b>{displayName(p, L)}</b> <span className="tnum text-muted">{d} {t(L, "daysU")}</span></li>;
              })}
              {!openShift && <li className="flex items-center gap-2"><StatusDot status="pending" />{t(L, "noOpenShift")}</li>}
              {noCheck.slice(0, 3).map((e) => <li key={e.id} className="flex items-center gap-2"><StatusDot status="pending" />{t(L, "noCheckin")} <b>{e.name}</b></li>)}
              {low.length === 0 && expiring.length === 0 && openShift && noCheck.length === 0 && <li className="text-muted">{t(L, "allGood")}</li>}
            </ul>
          </CardContent>
        </Card>

        <Card className="rise-in" style={{ animationDelay: "120ms" }}><CardHeader><CardTitle>{t(L, "branchesN")}</CardTitle></CardHeader>
          <CardContent>
            {s.branches.length < 2 ? (
              <p className="text-sm text-muted">{t(L, "oneBranch")} ({s.branch}). {t(L, "brCompare")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {s.branches.map((b) => <li key={b} className="flex justify-between border-t border-line pt-2 first:border-0 first:pt-0"><span>{b}</span><span className="tnum font-bold">{fmtDzd(sales / s.branches.length)}</span></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
