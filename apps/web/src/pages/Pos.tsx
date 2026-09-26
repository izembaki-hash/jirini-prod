import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "@phosphor-icons/react";
import { fmtDzd, useStore, displayName, catName } from "../store";
import { api, currentBranch, uploadUrl } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, Empty, Field, Input, Segmented } from "../ui";
import { Receipt } from "../components/Receipt";
import { ImagePicker } from "../components/ImagePicker";
import { InvoiceDoc, printDoc, shopOf } from "../print";
import { btSupported, btSavedName, btPrintReceipt, btErrorMessage } from "../lib/btprinter";
import type { Order } from "../store";
import { errMsg } from "../lib/err";

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
            payLabel: order.pay === "cash" ? t(L, "cash") : order.pay === "card" ? t(L, "card") : t(L, "credit"),
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
  const [pay, setPay] = useState<"cash" | "card" | "credit">("cash");
  const [creditCust, setCreditCust] = useState("");
  // العميل المطابق للمدخل (اسم أو هاتف) — الدين يُسجَّل على عميل مسجَّل فقط
  const normCust = (v: string) => v.trim().toLowerCase();
  const creditMatch = s.customers.find((c) =>
    normCust(c.name) === normCust(creditCust) || c.phone.replace(/\s/g, "") === creditCust.replace(/\s/g, ""));

  // سجل العملاء للاختيار عند الدين (متصل: من الخادم — تجريبي: البذور)
  useEffect(() => {
    if (connected()) {
      api.customersList().then((list) => update((p) => ({
        ...p,
        customers: list.map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address ?? undefined, balance: c.balance })),
      }))).catch(() => null);
    }
  }, [update]);
  const [table, setTable] = useState("");
  const [kind, setKind] = useState("dinein");
  const [discount, setDiscount] = useState("0");
  const [lastId, setLastId] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("all");
  // وضع الجملة (محل فقط): الأصناف الجديدة تُضاف بسعر الجملة حيث وُجد
  const [wholesale, setWholesale] = useState(false);
  // إضافة سريعة لصنف/طبق جديد من نقطة البيع نفسها (اسم + صنف + سعر + صورة)
  const [qaOpen, setQaOpen] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaPrice, setQaPrice] = useState("");
  const [qaCat, setQaCat] = useState("");
  const [qaImg, setQaImg] = useState<string | null>(null);
  const [qaBusy, setQaBusy] = useState(false);
  const [qaErr, setQaErr] = useState("");
  // تركيز البحث تلقائياً على الشاشات الكبيرة فقط — في الهاتف يفتح الكيبورد ويحجب المنتجات
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) searchRef.current?.focus();
  }, []);
  // Escape يغلق نافذة الإضافة السريعة
  useEffect(() => {
    if (!qaOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setQaOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qaOpen]);
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
  const cartCount = lines.reduce((x, l) => x + l.qty, 0);
  const priceOf = (l: { id: string; sell: number; wholesale?: number }) => {
    const p = s.products.find((x) => x.id === l.id);
    return p ? unitPrice(p) : l.sell;
  };
  const sub = lines.reduce((x, l) => x + l.qty * priceOf(l), 0);
  const total = Math.max(0, sub - (Number(discount) || 0));
  const last = s.orders.find((o) => o.id === lastId) ?? null;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));

  // فتح الإضافة السريعة: الصنف الافتراضي = المحدد حالياً في الشبكة
  const openQa = () => {
    setQaCat(cat === "all" ? "" : cat);
    setQaErr("");
    setQaOpen(true);
  };

  // حفظ الصنف الجديد (خادم أو محلي) ثم إدخاله في السلة مباشرة.
  // بلا أرقام يدوية: الشراء 0، المخزون مفتوح (999) يُضبط لاحقاً من المخزون.
  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setQaErr("");
    const sell = Number(qaPrice) || 0;
    if (!qaName.trim() || sell <= 0) { setQaErr(t(L, "qaNeed")); return; }
    const category = qaCat.trim() || (cat !== "all" ? cat : "عام");
    const row = {
      name: qaName.trim(), nameFr: qaName.trim(),
      branchId: currentBranch() ?? "",
      buyPrice: 0, sellPrice: sell, qty: 999, minQty: 5,
      category, active: true, saleable: true,
      imageUrl: qaImg || null,
    };
    setQaBusy(true);
    try {
      let id: string;
      if (connected()) {
        if (!row.branchId) { toast.error(t(L, "errPickBranch")); setQaBusy(false); return; }
        const created = await api.createProduct({ ...row });
        id = created.id;
        update((p) => ({
          ...p,
          products: [...p.products, {
            id: created.id, name: created.name, nameFr: created.nameFr ?? created.name,
            buy: created.buyPrice, sell: created.sellPrice, qty: created.qty, min: created.minQty,
            barcode: created.barcode ?? undefined, cat: created.category ?? category,
            active: created.active, saleable: created.saleable ?? true,
            img: created.imageUrl ?? qaImg ?? undefined,
          }],
        }));
      } else {
        id = `p${Date.now()}`;
        update((p) => ({
          ...p,
          products: [...p.products, {
            id, name: row.name, nameFr: row.name, buy: 0, sell,
            qty: 999, min: 5, cat: category, active: true, saleable: true,
            img: qaImg ?? undefined,
          }],
        }));
      }
      setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
      toast.success(t(L, "qaAdded"));
      setQaName(""); setQaPrice(""); setQaCat(""); setQaImg(null);
      setQaOpen(false);
    } catch (ex) {
      setQaErr(errMsg(L, ex));
    } finally { setQaBusy(false); }
  };

  const charge = async () => {
    if (lines.length === 0) return;
    if (!s.shift || s.shift.closedAt) { toast.error(t(L, "needShiftToast")); return; }
    if (pay === "credit" && !creditMatch) { toast.error(t(L, "creditCustReq")); return; }
    // المحل بلا طاولات: كل مبيعاته استلام/خارجية
    const effKind = s.businessType === "restaurant" ? kind : "takeaway";
    // متصل: الخادم هو مصدر الحقيقة (أسعار من المخزون + خصم تلقائي + ربط وردية).
    if (connected()) {
      try {
        const created = await api.createOrder({
          branchId: currentBranch() ?? "main", kind: effKind, tableNo: table || undefined,
          lines: lines.map((l) => ({ productId: l.id, qty: l.qty, price: priceOf(l) })),
          discount: Number(discount) || 0, tax: 0, payMethod: pay,
          ...(pay === "credit" && creditMatch ? { phone: creditMatch.phone, customer: creditMatch.name } : {}),
        });
        setCart({}); setDiscount("0"); setCreditCust("");
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
            customer: pay === "credit" && creditMatch ? creditMatch.name : undefined,
          }, ...p.orders],
        }));
        setLastId(created.id);
        toast.success(`${t(L, "soldOk")} #${created.num} — ${fmtDzd(created.total)}`);
        for (const w of created.warnings ?? []) toast.warning(`${t(L, "warnIng")}${w.name} (${t(L, "shortBy")} ${w.missing})`);
      } catch (e) {
        toast.error(errMsg(L, e, t(L, "sendFailApi")));
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
      customers: pay === "credit" && creditMatch
        ? p.customers.map((c) => (c.id === creditMatch.id ? { ...c, balance: (c.balance ?? 0) + total } : c))
        : p.customers,
      orders: [{
        id, num, kind: effKind, table: table || undefined, status: s.businessType === "restaurant" ? "preparing" : "delivered",
        lines: lines.map((l) => ({ productId: l.id, name: l.name, qty: l.qty, price: priceOf(l) })),
        discount: Number(discount) || 0, pay, at: new Date().toISOString(), total,
        customer: pay === "credit" && creditMatch ? creditMatch.name : undefined,
      }, ...p.orders],
    }));
    setCart({}); setDiscount("0"); setLastId(id); setCreditCust("");
    toast.success(`${t(L, "soldOk")} #${num} — ${fmtDzd(total)}`);
    for (const w of warns) toast.warning(`${t(L, "warnIng")}${w}`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
      <section className="flex flex-col gap-3" aria-label={t(L, "pos")}>
        <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
          placeholder={t(L, "search")} aria-label={t(L, "search")} inputMode="search" enterKeyHint="search" />
        <div className="flex items-stretch gap-2">
          <button type="button" onClick={openQa} title={t(L, "addProduct")} aria-label={t(L, "addProduct")}
            className="btn-press grid size-11 shrink-0 touch-manipulation place-items-center self-center rounded-full border border-dashed border-line-strong text-growth-deep transition-colors hover:border-growth hover:bg-growth/5">
            <Plus size={20} weight="bold" aria-hidden />
          </button>
          <div className="snap-row -mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="التصنيفات">
          {s.businessType !== "restaurant" && (
            <button onClick={() => setWholesale(!wholesale)} aria-pressed={wholesale}
              className={`btn-press min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors ${wholesale ? "border-growth bg-growth text-white" : "border-dashed border-line text-muted"}`}>
              {t(L, "wholesaleTicket")}
            </button>
          )}
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
                className={`btn-press min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors ${cat === c ? "border-growth bg-growth text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
                {c === "all" ? t(L, "posAll") : catName(c, L)}
              </button>
            ))}
          </div>
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
                  className={`btn-press min-h-11 min-w-11 touch-manipulation rounded-lg border px-2.5 text-sm font-bold transition-colors ${table === tb ? "border-growth bg-growth text-white" : "border-line bg-surface"}`}>
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
                  className="btn-press flex min-h-[104px] w-full touch-manipulation flex-col items-stretch justify-between gap-1.5 rounded-2xl border border-line bg-surface p-2.5 text-start transition-colors hover:border-growth active:border-growth disabled:opacity-50"
                  aria-label={`${t(L, "addVerb")} ${displayName(p, L)} — ${fmtDzd(unitPrice(p))}`}>
                  {p.img ? (
                    <img src={uploadUrl(p.img) ?? ""} alt="" loading="lazy"
                      className="h-20 w-full rounded-xl bg-canvas object-cover" />
                  ) : null}
                  <span className="px-0.5 text-sm font-bold leading-snug">{displayName(p, L)}</span>
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

      <aside id="cart" className="flex scroll-mt-20 flex-col gap-3 lg:sticky lg:top-20 lg:self-start" aria-label={t(L, "cart")}>
        <Card>
          <div className="flex flex-col gap-2 p-5">
            <h2 className="font-bold">{t(L, "cart")} <span className="tnum">({cartCount})</span></h2>
            {lines.length === 0 ? <p className="text-sm text-muted">{t(L, "cartEmpty")}</p> : (
              <ul className="flex flex-col gap-1.5">
                {lines.map((l) => {
                  const lp = s.products.find((pp) => pp.id === l.id);
                  const lname = lp ? displayName(lp, L) : l.name;
                  return (
                    <li key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium">{lname}</span>
                      <span className="flex items-center gap-1.5">
                        <button className="btn-press grid size-11 touch-manipulation place-items-center rounded-lg border border-line text-lg font-bold" onClick={() => setCart((c) => ({ ...c, [l.id]: Math.max(0, (c[l.id] ?? 0) - 1) }))} aria-label={`${t(L, "dec")} ${lname}`}>−</button>
                        <span className="tnum w-6 text-center font-bold">{l.qty}</span>
                        <button className="btn-press grid size-11 touch-manipulation place-items-center rounded-lg border border-line text-lg font-bold" onClick={() => add(l.id)} aria-label={`${t(L, "inc")} ${lname}`}>+</button>
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
                  options={[
                    { value: "cash", label: t(L, "cash") },
                    { value: "card", label: t(L, "card") },
                    { value: "credit", label: t(L, "credit") },
                  ]}
                  onChange={setPay} />
                {pay === "credit" && (
                  <>
                    <Field label={t(L, "creditCust")} id="crph" hint={s.customers.length === 0 ? t(L, "noCustHint") : t(L, "creditCustHint")}>
                      <Input id="crph" value={creditCust} onChange={(e) => setCreditCust(e.target.value)}
                        list="credit-custs" autoComplete="off" enterKeyHint="done"
                        placeholder={s.customers[0] ? s.customers[0].name : ""} />
                    </Field>
                    <datalist id="credit-custs">
                      {s.customers.map((c) => <option key={c.id} value={c.name}>{c.phone}</option>)}
                    </datalist>
                  </>
                )}
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
            <Button variant="outline" onClick={() => printDoc(
              `${t(L, "invTitle")} #${last.num} — ${s.businessName}`,
              L === "ar" ? "rtl" : "ltr",
              <InvoiceDoc shop={shopOf(s)} lang={L} order={last} customer={last.customer} />,
            )}>{t(L, "print")} / PDF</Button>
          </div>
        )}
      </aside>

      {/* شريط السلة الثابت للهاتف: المجموع دائماً تحت الإبهام فوق شريط الأقسام */}
      {cartCount > 0 && (
        <div className="fixed inset-x-3 z-30 lg:hidden" style={{ bottom: "calc(74px + env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => document.getElementById("cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="btn-press pop-in flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_8px_24px_oklch(0.3_0.02_250/0.35)]"
            aria-label={`${t(L, "cart")} — ${fmtDzd(total)}`}
          >
            <span className="tnum grid min-w-8 place-items-center rounded-full bg-growth px-2 py-1 text-sm font-bold text-white">{cartCount}</span>
            <span className="flex-1 text-start text-sm font-bold">{t(L, "cart")}</span>
            <span className="tnum text-lg font-bold">{fmtDzd(total)}</span>
          </button>
        </div>
      )}
      {cartCount > 0 && <div aria-hidden className="h-14 lg:hidden" />}

      {/* إضافة سريعة لصنف/طبق: ورقة سفلية في الهاتف، بطاقة متمركزة في المكتب */}
      {qaOpen && (
        <div className="dialog-scrim fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
          onClick={() => setQaOpen(false)} role="dialog" aria-modal="true" aria-label={t(L, "qaTitle")}>
          <Card className="pop-in w-full max-w-[440px] rounded-b-none rounded-t-3xl sm:rounded-3xl">
            <div onClick={(e) => e.stopPropagation()}>
              <form onSubmit={quickAdd} noValidate
                className="flex max-h-[92dvh] flex-col gap-3 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">{t(L, "qaTitle")}</h2>
                    <p className="text-xs text-muted">{t(L, "qaSub")}</p>
                  </div>
                  <button type="button" onClick={() => setQaOpen(false)} aria-label={t(L, "close")}
                    className="btn-press grid size-11 shrink-0 touch-manipulation place-items-center rounded-[10px] border border-line">
                    <X size={20} aria-hidden />
                  </button>
                </div>
                <Field label={t(L, "pName")} id="qa-name">
                  <Input id="qa-name" value={qaName} onChange={(e) => setQaName(e.target.value)}
                    autoFocus autoComplete="off" enterKeyHint="next" placeholder={s.businessType === "restaurant" ? "طاكوس دجاج" : "سكر 1كغ"} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t(L, "pCat")} id="qa-cat">
                    <Input id="qa-cat" value={qaCat} onChange={(e) => setQaCat(e.target.value)}
                      list="qa-cats" autoComplete="off" enterKeyHint="next" placeholder={cat !== "all" ? cat : "عام"} />
                    <datalist id="qa-cats">
                      {cats.filter((c) => c !== "all").map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                  <Field label={t(L, "qaPrice")} id="qa-price">
                    <Input id="qa-price" value={qaPrice} onChange={(e) => setQaPrice(e.target.value)}
                      inputMode="numeric" enterKeyHint="done" dir="ltr" placeholder="350" />
                  </Field>
                </div>
                <ImagePicker value={qaImg} onChange={setQaImg} />
                {qaErr && <p role="alert" className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{qaErr}</p>}
                <Button type="submit" size="lg" loading={qaBusy}>{t(L, "add")}</Button>
              </form>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
