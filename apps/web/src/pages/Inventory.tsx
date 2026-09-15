import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, useStore, displayName } from "../store";
import { ApiError, api, currentBranch } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input, Segmented } from "../ui";

// 3. المخزون: منتجات + وصفات (مطاعم) + مورّدون + مشتريات/ديون + هدر + تنبيهات.
type Tab = "products" | "recipes" | "suppliers" | "purchases";

export default function Inventory() {
  const { s } = useStore();
  const L = s.lang;
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem("dz-inv-tab");
      return v === "recipes" || v === "suppliers" || v === "purchases" ? v : "products";
    } catch { return "products"; }
  });
  useEffect(() => {
    try { localStorage.removeItem("dz-inv-tab"); } catch { /* تجاهل */ }
  }, []);
  const isResto = s.businessType === "restaurant";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{t(L, "inventory")}</h1>
        <span className="ms-auto w-full sm:w-72">
          <Segmented label="tabs" value={tab}
            options={[
              { value: "products", label: t(L, "tabProducts") },
              ...(isResto ? [{ value: "recipes" as Tab, label: t(L, "tabRecipes") }] : []),
              { value: "suppliers" as Tab, label: t(L, "tabSuppliers") },
              { value: "purchases" as Tab, label: t(L, "tabPurchases") },
            ]}
            onChange={setTab} />
        </span>
      </div>
      <AlertsStrip />
      {tab === "products" && <ProductsTab />}
      {tab === "recipes" && isResto && <RecipesTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "purchases" && <PurchasesTab />}
    </div>
  );
}

function errToast(L: "ar" | "fr", e: unknown, fallback: string) {
  if (e instanceof ApiError) {
    if (e.code === "supplier_exists") { toast.error(t(L, "supExistsErr")); return; }
    if (e.code === "overpay") { toast.error(t(L, "overpayErr")); return; }
  }
  toast.error(fallback || t(L, "errSaving"));
}

// ─── تنبيهات المخزون (الخادم) ───
function AlertsStrip() {
  const { s, update } = useStore();
  const L = s.lang;
  const [server, setServer] = useState<{ id: string; message: string }[] | null>(null);
  useEffect(() => {
    if (connected()) api.listAlerts(true).then((a) => setServer(a.map((x) => ({ id: x.id, message: x.message })))).catch(() => null);
  }, []);
  if (!connected() || !server || server.length === 0) return null;
  return (
    <Card>
      <div className="flex flex-col gap-1.5 p-4">
        <b className="text-sm">{t(L, "alertsT")} ({server.length})</b>
        {server.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{a.message}</span>
            <button className="rounded-lg border border-line px-2 py-1 text-xs font-bold" onClick={() => {
              api.markAlertRead(a.id).catch(() => null);
              setServer(server.filter((x) => x.id !== a.id));
              update((p) => p);
            }}>{t(L, "markRead")}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// أيام متبقية على الصلاحية (سالب = منتهٍ)
export const daysLeft = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

// ─── المنتجات + الهدر ───
function ProductsTab() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [sell, setSell] = useState("");
  const [buy, setBuy] = useState("");
  const [qty, setQty] = useState("");
  const [barcode, setBarcode] = useState("");
  const [saleable, setSaleable] = useState(true);
  const [shelf, setShelf] = useState("");
  const [expiry, setExpiry] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [wPid, setWPid] = useState("");
  const [wQty, setWQty] = useState("");
  const [wWhy, setWWhy] = useState("");
  const isResto = s.businessType === "restaurant";

  const refresh = async () => {
    if (!connected()) return;
    try {
      const list = await api.listProducts();
      update((p) => ({
        ...p,
        products: list.map((sp) => ({
          id: sp.id, name: sp.name, nameFr: sp.nameFr ?? sp.name,
          buy: sp.buyPrice, sell: sp.sellPrice, qty: sp.qty, min: sp.minQty,
          barcode: sp.barcode ?? undefined, cat: sp.category ?? "عام", active: sp.active,
          saleable: sp.saleable ?? true, shelf: sp.shelf ?? undefined,
          expiry: sp.expiryDate ? String(sp.expiryDate).slice(0, 10) : undefined,
          wholesale: sp.wholesalePrice ?? undefined,
        })),
      }));
    } catch { /* تجاهل */ }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sell) return;
    const row = {
      name: name.trim(), nameFr: name.trim(),
      branchId: currentBranch() ?? "",
      buyPrice: Number(buy) || 0, sellPrice: Number(sell) || 0, qty: Number(qty) || 0,
      minQty: 5, barcode: barcode || undefined, category: "جديد", active: true, saleable,
      shelf: !isResto && shelf.trim() ? shelf.trim() : undefined,
      expiryDate: !isResto && expiry ? expiry : undefined,
      wholesalePrice: !isResto && wholesale ? Number(wholesale) || 0 : undefined,
    };
    if (!row.branchId) { toast.error(t(L, "errSaving")); return; }
    if (connected()) {
      try {
        await api.createProduct({ ...row });
        await refresh();
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      update((p) => ({ ...p, products: [...p.products, { id: `p${Date.now()}`, name: row.name, nameFr: row.name, buy: row.buyPrice, sell: row.sellPrice, qty: row.qty, min: 5, barcode: row.barcode, cat: "جديد", shelf: row.shelf, expiry: row.expiryDate, wholesale: row.wholesalePrice, active: true, saleable }] }));
    }
    setName(""); setSell(""); setBuy(""); setQty(""); setBarcode(""); setSaleable(true);
    setShelf(""); setExpiry(""); setWholesale("");
  };

  const bump = async (id: string, d: number) => {
    if (connected()) {
      try {
        const p = await api.adjustStock(id, d, "adjust");
        update((prev) => ({ ...prev, products: prev.products.map((x) => x.id === id ? { ...x, qty: p.qty, buy: p.buyPrice, sell: p.sellPrice } : x) }));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); }
      return;
    }
    update((prev) => ({ ...prev, products: prev.products.map((x) => x.id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x) }));
  };

  const waste = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(wQty) || 0;
    if (!wPid || q <= 0) return;
    if (connected()) {
      try {
        const r = await api.wastage(wPid, q, wWhy || undefined);
        update((prev) => ({ ...prev, products: prev.products.map((x) => x.id === wPid ? { ...x, qty: r.qty } : x) }));
        toast.success(t(L, "wastDone"));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      update((prev) => ({ ...prev, products: prev.products.map((x) => x.id === wPid ? { ...x, qty: Math.max(0, x.qty - q) } : x) }));
      toast.success(t(L, "wastDone"));
    }
    setWPid(""); setWQty(""); setWWhy("");
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>{t(L, "newProduct")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="flex flex-col gap-3">
              <Field label={t(L, "pName")} id="n"><Input id="n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t(L, "pBuy")} id="b"><Input id="b" inputMode="numeric" value={buy} onChange={(e) => setBuy(e.target.value)} /></Field>
                <Field label={t(L, "pSell")} id="sl"><Input id="sl" inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} /></Field>
                <Field label={t(L, "pQty")} id="qq"><Input id="qq" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              </div>
              <Field label={t(L, "pBarcode")} id="bc" hint={t(L, "pBarcodeHint")}>
                <Input id="bc" value={barcode} onChange={(e) => setBarcode(e.target.value)} inputMode="numeric" />
              </Field>
              {!isResto && (
                <div className="grid grid-cols-3 gap-2">
                  <Field label={t(L, "shelfLb")} id="sh"><Input id="sh" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="A1" /></Field>
                  <Field label={t(L, "expiryLb")} id="ex"><Input id="ex" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
                  <Field label={t(L, "wholesaleLb")} id="ws"><Input id="ws" inputMode="numeric" value={wholesale} onChange={(e) => setWholesale(e.target.value)} /></Field>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={saleable} onChange={(e) => setSaleable(e.target.checked)} className="size-5 accent-[var(--color-growth)]" />
                {t(L, "saleableLb")}
              </label>
              <Button type="submit">{t(L, "add")}</Button>
            </form>
            <div className="mt-4 rounded-xl bg-canvas p-3 text-xs text-muted">
              {isResto ? t(L, "restoHint") : t(L, "shopStockHint")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t(L, "wastTitle")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={waste} className="grid grid-cols-[1fr_auto] items-end gap-2">
              <Field label={t(L, "prodLb")} id="wp">
                <select id="wp" value={wPid} onChange={(e) => setWPid(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                  <option value="">…</option>
                  {s.products.map((p) => <option key={p.id} value={p.id}>{displayName(p, L)} ({p.qty})</option>)}
                </select>
              </Field>
              <Field label={t(L, "wastQty")} id="wq"><Input id="wq" inputMode="numeric" value={wQty} onChange={(e) => setWQty(e.target.value)} /></Field>
              <Field label={t(L, "wastReason")} id="wr"><Input id="wr" value={wWhy} onChange={(e) => setWWhy(e.target.value)} /></Field>
              <Button type="submit">{t(L, "wastSave")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t(L, "productsN")} ({s.products.length})</CardTitle></CardHeader>
        <CardContent>
          {s.products.length === 0 ? <Empty title={t(L, "noProducts")} hint={t(L, "noProductsHint")} /> : (
            <ul className="flex flex-col">
              {s.products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-0 first:pt-0">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-lg font-bold text-muted">{displayName(p, L).slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{displayName(p, L)}</span>
                    <span className="tnum block font-mono text-xs text-muted">{p.barcode ?? "—"} · {t(L, "buyLabel")} {fmtDzd(p.buy)}{p.shelf ? ` · ${t(L, "shelfLb")} ${p.shelf}` : ""}{p.wholesale ? ` · ${t(L, "wholesaleLb")} ${fmtDzd(p.wholesale)}` : ""}</span>
                    {p.expiry && daysLeft(p.expiry) <= 30 && (
                      <span className={`text-xs font-bold ${daysLeft(p.expiry) < 0 ? "text-ember" : "text-hold"}`}>
                        {t(L, "expSoon")}: <span className="tnum">{p.expiry}</span>
                      </span>
                    )}
                  </span>
                  {p.qty <= 0 ? <Badge tone="bad">{t(L, "outOfStock")}</Badge> : p.qty <= p.min ? <Badge tone="warn">{t(L, "low")} <span className="tnum">{p.qty}</span></Badge> : <Badge><span className="tnum">{p.qty}</span></Badge>}
                  {p.saleable === false ? <Badge>{t(L, "ingredient")}</Badge> : (
                    <span className="tnum w-20 text-end text-sm font-bold">{fmtDzd(p.sell)}</span>
                  )}
                  <span className="flex gap-1">
                    <button className="grid size-9 place-items-center rounded-lg border border-line font-bold" aria-label={`− ${displayName(p, L)}`} onClick={() => bump(p.id, -1)}>−</button>
                    <button className="grid size-9 place-items-center rounded-lg border border-line font-bold" aria-label={`+ ${displayName(p, L)}`} onClick={() => bump(p.id, 1)}>+</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── الوصفات (مطاعم) ───
function RecipesTab() {
  const { s, update } = useStore();
  const L = s.lang;
  const dishes = useMemo(() => s.products.filter((p) => p.active && p.saleable !== false), [s.products]);
  const [dishId, setDishId] = useState(dishes[0]?.id ?? "");
  const [rows, setRows] = useState<{ ingredientId: string; qty: string }[]>([{ ingredientId: "", qty: "" }]);
  const cur = s.recipes.filter((r) => r.dishId === (dishId || dishes[0]?.id));
  const effDish = dishId || dishes[0]?.id || "";

  useEffect(() => {
    if (connected()) {
      api.listRecipes().then((list) => update((p) => ({
        ...p,
        recipes: list.map((r) => ({ id: r.id, dishId: r.dishId, ingredientId: r.ingredientId, qty: r.qty })),
      }))).catch(() => null);
    }
  }, [update]);

  const save = async () => {
    const lines = rows.filter((r) => r.ingredientId && Number(r.qty) > 0)
      .map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) }));
    if (!effDish) return;
    if (connected()) {
      try {
        const saved = await api.setDishRecipe(effDish, lines);
        update((p) => ({
          ...p,
          recipes: [...p.recipes.filter((x) => x.dishId !== effDish), ...saved.map((r) => ({ id: r.id, dishId: r.dishId, ingredientId: r.ingredientId, qty: r.qty }))],
        }));
        toast.success(t(L, "recSaved"));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      update((p) => ({
        ...p,
        recipes: [...p.recipes.filter((x) => x.dishId !== effDish), ...lines.map((l, i) => ({ id: `r${Date.now()}${i}`, dishId: effDish, ...l }))],
      }));
      toast.success(t(L, "recSaved"));
    }
    setRows([{ ingredientId: "", qty: "" }]);
  };

  const del = async (id: string) => {
    if (connected()) {
      try { await api.deleteRecipeLine(id); } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    }
    update((p) => ({ ...p, recipes: p.recipes.filter((x) => x.id !== id) }));
  };

  const ingName = (id: string) => {
    const p = s.products.find((x) => x.id === id);
    return p ? displayName(p, L) : id;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t(L, "recTitle")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field label={t(L, "recDish")} id="rd">
            <select id="rd" value={effDish} onChange={(e) => { setDishId(e.target.value); setRows([{ ingredientId: "", qty: "" }]); }} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
              {dishes.map((d) => <option key={d.id} value={d.id}>{displayName(d, L)}</option>)}
            </select>
          </Field>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
              <select value={r.ingredientId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ingredientId: e.target.value } : x))}
                aria-label={t(L, "prodLb")} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                <option value="">…</option>
                {s.products.filter((p) => p.id !== effDish).map((p) => <option key={p.id} value={p.id}>{displayName(p, L)} ({p.qty})</option>)}
              </select>
              <Input value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                inputMode="decimal" placeholder={t(L, "recQtyU")} aria-label={t(L, "recQtyU")} className="w-28" />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRows([...rows, { ingredientId: "", qty: "" }])}>{t(L, "recAddIng")}</Button>
            <Button onClick={save} className="flex-1">{t(L, "recSave")}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t(L, "recDish")}: {effDish ? ingName(effDish) : "…"}</CardTitle></CardHeader>
        <CardContent>
          {cur.length === 0 ? <Empty title={t(L, "noRecipe")} hint={t(L, "recEmpty")} /> : (
            <ul className="flex flex-col">
              {cur.map((r) => (
                <li key={r.id} className="flex items-center gap-2 border-t border-line py-2 text-sm first:border-0 first:pt-0">
                  <span className="flex-1">{ingName(r.ingredientId)}</span>
                  <span className="tnum text-muted">{r.qty} {t(L, "recQtyU")}</span>
                  <button className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-ember" onClick={() => del(r.id)}>{t(L, "recDelete")}</button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── المورّدون ───
function SuppliersTab() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [opening, setOpening] = useState("");

  useEffect(() => {
    if (connected()) {
      api.listSuppliers().then((list) => update((p) => ({
        ...p,
        suppliers: list.map((x) => ({ id: x.id, name: x.name, phone: x.phone, address: x.address ?? undefined, notes: x.notes ?? undefined, active: x.active, openingDebt: x.openingDebt ?? 0, owed: x.owed, paid: x.paid, balance: x.balance })),
      }))).catch(() => null);
    }
  }, [update]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (connected()) {
      try {
        const created = await api.createSupplier({ name: name.trim(), phone: phone.trim(), openingDebt: Number(opening) || 0 });
        update((p) => ({ ...p, suppliers: [...p.suppliers, { id: created.id, name: created.name, phone: created.phone, active: true, openingDebt: created.openingDebt ?? 0, owed: created.owed ?? 0, paid: created.paid ?? 0, balance: created.balance ?? 0 }] }));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      if (s.suppliers.some((x) => x.phone === phone.trim())) { toast.error(t(L, "supExistsErr")); return; }
      const od = Number(opening) || 0;
      update((p) => ({ ...p, suppliers: [...p.suppliers, { id: `sup${Date.now()}`, name: name.trim(), phone: phone.trim(), active: true, openingDebt: od, owed: od, paid: 0, balance: od }] }));
    }
    setName(""); setPhone(""); setOpening("");
  };

  const bal = (supId: string, owed?: number, balance?: number) => {
    if (owed !== undefined) return { owed, balance: balance ?? 0 };
    const sup = s.suppliers.find((x) => x.id === supId);
    const open = sup?.openingDebt ?? 0;
    const mine = s.purchases.filter((x) => x.supplierId === supId);
    const o = open + mine.reduce((x, p) => x + p.total, 0);
    const pd = mine.reduce((x, p) => x + p.paid, 0);
    return { owed: o, balance: o - pd };
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
      <Card><CardHeader><CardTitle>{t(L, "supNew")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-col gap-3">
            <Field label={t(L, "supName")} id="sn"><Input id="sn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t(L, "supPhone")} id="sp"><Input id="sp" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" /></Field>
            <Field label={t(L, "openingDebtLb")} id="sod"><Input id="sod" value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0" /></Field>
            <Button type="submit">{t(L, "add")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t(L, "supTitle")} ({s.suppliers.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {s.suppliers.map((x) => {
              const b = bal(x.id, x.owed, x.balance);
              return (
                <li key={x.id} className="flex items-center gap-3 border-t border-line py-2.5 text-sm first:border-0 first:pt-0">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas font-bold">{x.name.slice(0, 1)}</span>
                  <span className="flex-1"><b className="block">{x.name}</b><span className="tnum text-xs text-muted" dir="ltr">{x.phone}</span></span>
                  {b.balance > 0
                    ? <Badge tone="bad">{t(L, "supDebt")}: <span className="tnum">{fmtDzd(b.balance)}</span></Badge>
                    : <Badge tone="ok">{t(L, "stPaid")}</Badge>}
                </li>
              );
            })}
            {s.suppliers.length === 0 && <li className="text-sm text-muted">—</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── المشتريات والديون ───
function PurchasesTab() {
  const { s, update } = useStore();
  const L = s.lang;
  const [supId, setSupId] = useState(s.suppliers[0]?.id ?? "");
  const [rows, setRows] = useState<{ productId: string; qty: string; unitCost: string }[]>([{ productId: "", qty: "", unitCost: "" }]);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");
  const [payFor, setPayFor] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const effSup = supId || s.suppliers[0]?.id || "";

  // تعبئة مسبقة من تنبيه نفاد في اللوحة
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dz-purchase-prefill");
      if (!raw) return;
      localStorage.removeItem("dz-purchase-prefill");
      const { productId } = JSON.parse(raw) as { productId: string };
      const p = s.products.find((x) => x.id === productId);
      if (p) setRows([{ productId, qty: String(Math.max(1, p.min * 2)), unitCost: String(p.buy) }]);
    } catch { /* تجاهل */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (connected()) {
      api.listPurchases().then((list) => update((p) => ({
        ...p,
        purchases: list.map((x) => ({ id: x.id, num: x.num, supplierId: x.supplierId, lines: x.lines, total: x.total, paid: x.paid, status: x.status, date: x.date, notes: x.notes ?? undefined })),
      }))).catch(() => null);
    }
  }, [update]);

  const total = rows.reduce((x, r) => x + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);

  const save = async () => {
    const lines = rows.filter((r) => r.productId && Number(r.qty) > 0)
      .map((r) => {
        const p = s.products.find((x) => x.id === r.productId)!;
        return { productId: r.productId, name: p.name, qty: Number(r.qty), unitCost: Number(r.unitCost) || 0 };
      });
    if (!effSup || lines.length === 0) return;
    const paidNow = Number(paid) || 0;
    if (connected()) {
      try {
        const created = await api.createPurchase({ supplierId: effSup, lines, paid: paidNow, method });
        update((p) => ({
          ...p,
          purchases: [{ id: created.id, num: created.num, supplierId: created.supplierId, lines: created.lines, total: created.total, paid: created.paid, status: created.status, date: created.date }, ...p.purchases],
          products: p.products.map((pr) => {
            const l = lines.find((x) => x.productId === pr.id);
            return l ? { ...pr, qty: pr.qty + l.qty, buy: l.unitCost } : pr;
          }),
        }));
        toast.success(t(L, "purDone"));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      const num = s.purchases.length + 1;
      const st = paidNow <= 0 ? "unpaid" : paidNow >= total ? "paid" : "partial";
      update((p) => ({
        ...p,
        purchases: [{ id: `pur${Date.now()}`, num, supplierId: effSup, lines, total, paid: paidNow, status: st, date: new Date().toISOString().slice(0, 10) }, ...p.purchases],
        products: p.products.map((pr) => {
          const l = lines.find((x) => x.productId === pr.id);
          return l ? { ...pr, qty: pr.qty + l.qty, buy: l.unitCost } : pr;
        }),
        suppliers: p.suppliers.map((x) => x.id === effSup ? { ...x, owed: (x.owed ?? 0) + total, paid: (x.paid ?? 0) + paidNow, balance: (x.balance ?? 0) + total - paidNow } : x),
      }));
      toast.success(t(L, "purDone"));
    }
    setRows([{ productId: "", qty: "", unitCost: "" }]); setPaid("");
  };

  const pay = async (id: string) => {
    const amt = Number(payAmt) || 0;
    if (!amt) return;
    if (connected()) {
      try {
        const u = await api.payPurchase(id, amt, method);
        update((p) => ({ ...p, purchases: p.purchases.map((x) => x.id === id ? { ...x, paid: u.paid, status: u.status } : x) }));
        toast.success(t(L, "payDone"));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    } else {
      const pur = s.purchases.find((x) => x.id === id);
      if (!pur || pur.paid + amt > pur.total + 1e-9) { toast.error(t(L, "overpayErr")); return; }
      const paid2 = pur.paid + amt;
      update((p) => ({
        ...p,
        purchases: p.purchases.map((x) => x.id === id ? { ...x, paid: paid2, status: paid2 >= x.total ? "paid" : "partial" } : x),
        suppliers: p.suppliers.map((x) => x.id === pur.supplierId ? { ...x, paid: (x.paid ?? 0) + amt, balance: (x.balance ?? 0) - amt } : x),
      }));
      toast.success(t(L, "payDone"));
    }
    setPayFor(""); setPayAmt("");
  };

  const stTone = (st: string) => st === "paid" ? "ok" : st === "partial" ? "warn" : "bad";
  const stLabel = (st: string) => st === "paid" ? t(L, "stPaid") : st === "partial" ? t(L, "stPartial") : t(L, "stUnpaid");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t(L, "purTitle")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field label={t(L, "purSup")} id="ps">
            <select id="ps" value={effSup} onChange={(e) => setSupId(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
              {s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2">
              <select value={r.productId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}
                aria-label={t(L, "prodLb")} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                <option value="">…</option>
                {s.products.map((p) => <option key={p.id} value={p.id}>{displayName(p, L)}</option>)}
              </select>
              <Input value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} inputMode="decimal" placeholder={t(L, "pQty")} aria-label={t(L, "pQty")} className="w-20" />
              <Input value={r.unitCost} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, unitCost: e.target.value } : x))} inputMode="decimal" placeholder={t(L, "pBuy")} aria-label={t(L, "pBuy")} className="w-24" />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => setRows([...rows, { productId: "", qty: "", unitCost: "" }])}>{t(L, "purAddLine")}</Button>
            <Field label={t(L, "purPaidNow")} id="pp"><Input id="pp" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
            <Field label={t(L, "purMethod")} id="pm">
              <select id="pm" value={method} onChange={(e) => setMethod(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                <option value="cash">{t(L, "cashM")}</option>
                <option value="card">{t(L, "card")}</option>
              </select>
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <span className="tnum font-bold">{t(L, "total")}: {fmtDzd(total)}</span>
            <Button onClick={save}>{t(L, "purSave")}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t(L, "purTitle")} ({s.purchases.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
            {s.purchases.map((x) => {
              const sup = s.suppliers.find((s2) => s2.id === x.supplierId);
              return (
                <li key={x.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <b className="tnum">#{x.num}</b>
                    <span className="flex-1">{sup?.name ?? ""} · <span className="tnum">{x.date.slice(0, 10)}</span></span>
                    <Badge tone={stTone(x.status) as "ok" | "warn" | "bad"}>{stLabel(x.status)}</Badge>
                  </div>
                  <div className="tnum text-xs text-muted">{x.lines.map((l) => `${l.name} ×${l.qty}`).join(L === "ar" ? "، " : ", ")}</div>
                  <div className="flex items-center gap-2">
                    <b className="tnum">{fmtDzd(x.total)}</b>
                    <span className="tnum text-xs text-muted">{t(L, "supPaid")}: {fmtDzd(x.paid)}</span>
                    {x.status !== "paid" && payFor !== x.id && (
                      <button className="ms-auto rounded-lg border border-line px-2 py-1 text-xs font-bold" onClick={() => { setPayFor(x.id); setPayAmt(String(Math.round(x.total - x.paid))); }}>{t(L, "purPay")}</button>
                    )}
                  </div>
                  {payFor === x.id && (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} inputMode="numeric" aria-label={t(L, "purAmount")} />
                      <Button size="sm" onClick={() => pay(x.id)}>{t(L, "purPayTitle")}</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
