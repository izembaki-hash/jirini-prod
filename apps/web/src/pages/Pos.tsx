import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, useStore, displayName, catName } from "../store";
import { ApiError, api, currentBranch } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, Empty, Field, Input, Segmented } from "../ui";
import { Receipt } from "../components/Receipt";
import { btSupported, btSavedName, btPrintReceipt, btErrorMessage } from "../lib/btprinter";
import type { Order } from "../store";

// 4. نقطة البيع: سريعة باللمس، بحث بالاسم/الباركود (يعمل 100% بدون قارئ).

// زر طباعة البلوتوث: يظهر فقط عند وجود طابعة محفوظة ومتصفح داعم.
function BtPrint({ order, shop }: { order: Order; shop: string }) {
  const { s } = useStore();
  const L = s.lang;
  const [busy, setBusy] = useState(false);
  if (!btSupported() || !btSavedName()) return null;
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await btPrintReceipt({
            shop, num: order.num, at: new Date(order.at).toLocaleString("fr-DZ"),
            lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, amount: l.qty * l.price })),
            discount: order.discount, total: order.total,
            payLabel: order.pay === "cash" ? t(L, "cash") : t(L, "card"),
            thanks: t(L, "thanksNote"), currency: L === "ar" ? "دج" : "DA",
          });
          toast.success(t(L, "btDone"));
        } catch (e) {
          toast.error(btErrorMessage(e, L));
        } finally { setBusy(false); }
      }}
    >
      {busy ? t(L, "btPrinting") : t(L, "btPrint")}
    </Button>
  );
}
export default function Pos() {
  const { s, update } = useStore();
  const L = s.lang;
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<"cash" | "card">("cash");
  const [table, setTable] = useState("");
  const [kind, setKind] = useState("dinein");
  const [discount, setDiscount] = useState("0");
  const [lastId, setLastId] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("all");
  // وضع الجملة (محل فقط): الأصناف الجديدة تُضاف بسعر الجملة حيث وُجد
  const [wholesale, setWholesale] = useState(false);
  const unitPrice = (p: { sell: number; wholesale?: number }) =>
    wholesale && s.businessType !== "restaurant" && p.wholesale ? p.wholesale : p.sell;

  const cats = useMemo(() => ["all", ...Array.from(new Set(s.products.map((p) => p.cat)))], [s.products]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.products.filter((p) => p.active && p.saleable !== false
      && (cat === "all" || p.cat === cat)
      && (!needle || p.name.includes(q.trim()) || p.nameFr.toLowerCase().includes(needle) || (p.barcode ?? "").includes(q.trim())));
  }, [s.products, q, cat]);

  // قارئ الباركود الخارجي يرسل Enter — نضيف أول نتيجة ونجهز للمسح التالي.
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && list.length > 0) {
      const first = list.find((p) => p.qty > 0) ?? list[0];
      add(first.id);
      setQ("");
    }
  };

  const lines = Object.entries(cart).map(([id, qty]) => ({ ...s.products.find((p) => p.id === id)!, qty })).filter((x) => x.id);
  const priceOf = (l: { id: string; sell: number; wholesale?: number }) => {
    const p = s.products.find((x) => x.id === l.id);
    return p ? unitPrice(p) : l.sell;
  };
  const sub = lines.reduce((x, l) => x + l.qty * priceOf(l), 0);
  const total = Math.max(0, sub - (Number(discount) || 0));
  const last = s.orders.find((o) => o.id === lastId) ?? null;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));

  const charge = async () => {
    if (lines.length === 0) return;
    if (!s.shift || s.shift.closedAt) { toast.error(t(L, "needShiftToast")); return; }
    // المحل بلا طاولات: كل مبيعاته استلام/خارجية
    const effKind = s.businessType === "restaurant" ? kind : "takeaway";
    // متصل: الخادم هو مصدر الحقيقة (أسعار من المخزون + خصم تلقائي + ربط وردية).
    if (connected()) {
      try {
        const created = await api.createOrder({
          branchId: currentBranch() ?? "main", kind: effKind, tableNo: table || undefined,
          lines: lines.map((l) => ({ productId: l.id, qty: l.qty, price: priceOf(l) })),
          discount: Number(discount) || 0, tax: 0, payMethod: pay,
        });
        setCart({}); setDiscount("0");
        update((p) => ({
          ...p,
          products: p.products.map((pr) => {
            const line = lines.find((l) => l.id === pr.id);
            return line ? { ...pr, qty: Math.max(0, pr.qty - line.qty) } : pr;
          }),
          orders: [{
            id: created.id, num: created.num, kind: effKind, table: table || undefined,
            status: "preparing",
            lines: created.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price })),
            discount: created.discount, pay, at: created.createdAt, total: created.total,
          }, ...p.orders],
        }));
        setLastId(created.id);
        toast.success(`${t(L, "soldOk")} #${created.num} — ${fmtDzd(created.total)}`);
        for (const w of created.warnings ?? []) toast.warning(`${t(L, "warnIng")}${w.name} (${t(L, "shortBy")} ${w.missing})`);
      } catch (e) {
        toast.error(e instanceof ApiError && e.code.startsWith("insufficient_stock")
          ? `${t(L, "insStock")}${e.code.split(":")[1] ?? ""}`
          : t(L, "sendFailApi"));
      }
      return;
    }
    const id = `o${Date.now()}`;
    const num = Math.max(0, ...s.orders.map((o) => o.num)) + 1;
    // الوضع التجريبي: خصم المكونات محلياً بنفس قاعدة الخادم (تحذير مع المتابعة)
    const ingQty: Record<string, number> = Object.fromEntries(s.products.map((p) => [p.id, p.qty]));
    const warns: string[] = [];
    for (const l of lines) {
      for (const r of s.recipes.filter((x) => x.dishId === l.id)) {
        const need = r.qty * l.qty;
        const cur = ingQty[r.ingredientId] ?? 0;
        const take = Math.min(cur, need);
        ingQty[r.ingredientId] = Math.max(0, cur - take);
        if (take < need) {
          const prod = s.products.find((p) => p.id === r.ingredientId);
          const nm = prod ? displayName(prod, L) : "?";
          warns.push(`${nm} (${t(L, "shortBy")} ${Math.round((need - take) * 100) / 100})`);
        }
      }
    }
    update((p) => ({
      ...p,
      products: p.products.map((pr) => {
        const line = lines.find((l) => l.id === pr.id);
        let q = line ? Math.max(0, pr.qty - line.qty) : pr.qty;
        if (pr.id in ingQty) q = Math.max(0, q - (pr.qty - ingQty[pr.id]));
        return { ...pr, qty: q };
      }),
      orders: [{
        id, num, kind: effKind, table: table || undefined, status: s.businessType === "restaurant" ? "preparing" : "delivered",
        lines: lines.map((l) => ({ productId: l.id, name: l.name, qty: l.qty, price: priceOf(l) })),
        discount: Number(discount) || 0, pay, at: new Date().toISOString(), total,
      }, ...p.orders],
    }));
    setCart({}); setDiscount("0"); setLastId(id);
    toast.success(`${t(L, "soldOk")} #${num} — ${fmtDzd(total)}`);
    for (const w of warns) toast.warning(`${t(L, "warnIng")}${w}`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
      <section className="flex flex-col gap-3" aria-label={t(L, "pos")}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
          placeholder={t(L, "search")} aria-label={t(L, "search")} inputMode="search" autoFocus />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="التصنيفات">
          {s.businessType !== "restaurant" && (
            <button onClick={() => setWholesale(!wholesale)} aria-pressed={wholesale}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors ${wholesale ? "border-growth bg-growth text-white" : "border-dashed border-line text-muted"}`}>
              {t(L, "wholesaleTicket")}
            </button>
          )}
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
              className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors ${cat === c ? "border-growth bg-growth text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
              {c === "all" ? t(L, "posAll") : catName(c, L)}
            </button>
          ))}
        </div>
        {s.businessType === "restaurant" && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
              <Input value={table} onChange={(e) => setTable(e.target.value)} placeholder={t(L, "tablePh")} aria-label={t(L, "tableN")} inputMode="numeric" />
              <Segmented label={t(L, "orderType")} value={kind}
                options={[{ value: "dinein", label: t(L, "kindDinein") }, { value: "takeaway", label: t(L, "kindTakeaway") }, { value: "delivery", label: t(L, "kindDelivery") }]}
                onChange={setKind} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t(L, "tableN")}>
              {Array.from({ length: s.tables }, (_, i) => String(i + 1)).map((tb) => (
                <button key={tb} onClick={() => setTable(tb)} aria-pressed={table === tb}
                  className={`h-9 min-w-11 rounded-lg border px-2.5 text-sm font-bold ${table === tb ? "border-growth bg-growth text-white" : "border-line"}`}>
                  {tb}
                </button>
              ))}
            </div>
          </div>
        )}
        {list.length === 0 ? <Empty title={t(L, "noResults")} hint={t(L, "noResultsH")} /> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => (
              <li key={p.id}>
                <button onClick={() => add(p.id)} disabled={p.qty <= 0}
                  className="btn-press flex min-h-[96px] w-full flex-col items-start justify-between gap-1.5 rounded-2xl border border-line bg-surface p-3 text-start transition-colors hover:border-growth disabled:opacity-50"
                  aria-label={`${t(L, "addVerb")} ${displayName(p, L)} — ${fmtDzd(unitPrice(p))}`}>
                  <span className="text-sm font-bold leading-snug">{displayName(p, L)}</span>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="tnum text-sm font-bold text-growth-deep">{fmtDzd(unitPrice(p))}{wholesale && p.wholesale ? ` (${t(L, "wholesaleLb")})` : ""}</span>
                    {p.qty <= 0 ? <Badge tone="bad">{t(L, "outOfStock")}</Badge> : p.qty <= p.min ? <Badge tone="warn">{t(L, "low")} <span className="tnum">{p.qty}</span></Badge> : <span className="tnum text-xs text-muted">{p.qty}</span>}
                  </span>
                  {p.qty > 0 && (
                    <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-line/70">
                      <span className={`block h-full rounded-full ${p.qty <= p.min ? "bg-hold" : "bg-growth"}`}
                        style={{ width: `${Math.min(100, (p.qty / Math.max(1, p.min * 4)) * 100)}%` }} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start" aria-label={t(L, "cart")}>
        <Card>
          <div className="flex flex-col gap-2 p-5">
            <h2 className="font-bold">{t(L, "cart")} ({lines.reduce((x, l) => x + l.qty, 0)})</h2>
            {lines.length === 0 ? <p className="text-sm text-muted">{t(L, "cartEmpty")}</p> : (
              <ul className="flex flex-col gap-1.5">
                {lines.map((l) => {
                  const lp = s.products.find((pp) => pp.id === l.id);
                  const lname = lp ? displayName(lp, L) : l.name;
                  return (
                    <li key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium">{lname}</span>
                      <span className="flex items-center gap-1">
                        <button className="grid size-9 place-items-center rounded-lg border border-line font-bold" onClick={() => setCart((c) => ({ ...c, [l.id]: Math.max(0, (c[l.id] ?? 0) - 1) }))} aria-label={`${t(L, "dec")} ${lname}`}>−</button>
                        <span className="tnum w-6 text-center font-bold">{l.qty}</span>
                        <button className="grid size-9 place-items-center rounded-lg border border-line font-bold" onClick={() => add(l.id)} aria-label={`${t(L, "inc")} ${lname}`}>+</button>
                      </span>
                      <span className="tnum w-20 text-end font-bold">{fmtDzd(l.qty * priceOf(l))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="grid grid-cols-2 items-end gap-2">
              <Field label={t(L, "discountLb")} id="disc"><Input id="disc" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{t(L, "payLb")}</span>
                <Segmented label={t(L, "payMethodLb")} value={pay}
                  options={[{ value: "cash", label: t(L, "cash") }, { value: "card", label: t(L, "card") }]}
                  onChange={setPay} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2">
              <span className="font-bold">{t(L, "total")}</span>
              <span className="tnum text-2xl font-bold text-growth-deep">{fmtDzd(total)}</span>
            </div>
            <Button size="lg" onClick={charge} disabled={lines.length === 0}>{t(L, "charge")}</Button>
            {!s.shift || s.shift.closedAt ? <p role="alert" className="text-xs font-bold text-ember">{t(L, "noShiftErr")}</p> : null}
          </div>
        </Card>
        {last && (
          <div className="flex flex-col gap-2">
            <Receipt order={last} shop={s.businessName} lang={L} />
            <BtPrint order={last} shop={s.businessName} />
            <Button variant="outline" onClick={() => window.print()}>{t(L, "print")} / PDF</Button>
          </div>
        )}
      </aside>
    </div>
  );
}
