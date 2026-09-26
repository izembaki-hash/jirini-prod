import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fmtDzd, useStore, displayName } from "../store";
import { t } from "../i18n";
import { toast } from "sonner";
import { API_BASE, ApiError, api } from "../api";
import { Badge, Button, Card, Empty, Field, Input } from "../ui";
import { errMsg } from "../lib/err";

// 5ب. بوابة الزبون العامة (PWA): ?t=رقم الطاولة أو طلب توصيل. بدون تسجيل دخول.
// متصلة بالخادم عند ضبط VITE_API_URL، وإلا وضع تجريبي محلي.
interface MenuItem { id: string; name: string; nameFr?: string; sellPrice: number }

export default function OrderPublic() {
  const { s, update } = useStore();
  const L = s.lang;
  const { slug = "demo" } = useParams();
  const [q] = useSearchParams();
  const table = q.get("t") ?? "";
  const [mode, setMode] = useState<"table" | "delivery" | "pickup">(table ? "table" : "delivery");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [doneNum, setDoneNum] = useState<number | null>(null);
  const [apiMenu, setApiMenu] = useState<MenuItem[] | null>(null);
  const [apiStatus, setApiStatus] = useState<string>("pending");
  const [apiTotal, setApiTotal] = useState(0);
  const [apiDriver, setApiDriver] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [shopName, setShopName] = useState(s.businessName);

  const remote = API_BASE.length > 0;

  const refreshMenu = () => {
    api.menu(slug).then((m) => {
      setApiMenu(m.products.map((p) => ({ id: p.id, name: p.name, nameFr: (p as { nameFr?: string }).nameFr, sellPrice: p.sellPrice })));
      setShopName(m.shop);
    }).catch(() => setApiMenu([]));
  };

  useEffect(() => {
    if (!remote) return;
    refreshMenu();
  }, [remote, slug]);

  // تتبع حي للطلب المرسل عبر الخادم
  useEffect(() => {
    if (!remote || doneNum === null) return;
    let stop = false;
    const poll = async () => {
      try {
        const o = await api.trackOrder(slug, doneNum);
        if (!stop) { setApiStatus(o.status); setApiTotal(o.total); setApiDriver(o.driver?.name ?? null); }
      } catch { /* تجاهل */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [remote, slug, doneNum]);

  const menu: MenuItem[] = useMemo(() => {
    if (remote) return apiMenu ?? [];
    return s.products.filter((p) => p.active && p.saleable !== false && p.qty > 0).map((p) => ({ id: p.id, name: p.name, nameFr: p.nameFr, sellPrice: p.sell }));
  }, [remote, apiMenu, s.products]);
  const showName = (m: MenuItem) => displayName(m, L);

  const priceOf = (id: string) => menu.find((m) => m.id === id)?.sellPrice ?? 0;
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ id, name: menu.find((m) => m.id === id)?.name ?? "", qty }))
    .filter((x) => x.id && x.qty > 0);
  const total = lines.reduce((x, l) => x + l.qty * priceOf(l.id), 0);
  const placed = !remote ? s.orders.find((o) => o.num === doneNum) ?? null : null;

  const submit = async () => {
    if (lines.length === 0) return;
    if (mode === "delivery" && (!phone.trim() || !address.trim())) { toast.error(t(L, "needPhoneAddr")); return; }
    if (remote) {
      try {
        const r = await api.publicOrder(slug, {
          kind: mode, tableNo: mode === "table" ? table : undefined,
          lines: lines.map((l) => ({ productId: l.id, qty: l.qty })),
          customer: name || undefined, phone, address: mode === "delivery" ? address : undefined,
        });
        setCart({}); setDoneNum(r.num); setApiTotal(r.total); setApiStatus("pending");
      } catch (e) {
        // الأصناف تغيّرت في الخادم (إعادة تشغيل/تحديث): حدّث القائمة واطلب إعادة الاختيار
        if (e instanceof ApiError && e.code === "product_unavailable") {
          setCart({});
          refreshMenu();
          toast.error(t(L, "menuChanged"));
        } else {
          toast.error(errMsg(L, e, t(L, "sendFail")));
        }
      }
      return;
    }
    const id = `o${Date.now()}`;
    const num = Math.max(0, ...s.orders.map((o) => o.num)) + 1;
    update((p) => ({
      ...p,
      products: p.products.map((pr) => {
        const l = lines.find((x) => x.id === pr.id);
        return l ? { ...pr, qty: Math.max(0, pr.qty - l.qty) } : pr;
      }),
      orders: [{
        id, num, kind: mode === "table" ? "qr_table" : mode, table: mode === "table" ? table : undefined,
        status: "pending", lines: lines.map((l) => ({ productId: l.id, name: l.name, qty: l.qty, price: priceOf(l.id) })),
        discount: 0, pay: "cash", customer: name || undefined, phone: phone || undefined,
        address: mode === "delivery" ? address : undefined, at: new Date().toISOString(), total,
      }, ...p.orders],
    }));
    setCart({}); setDoneNum(num);
  };

  const tracked = remote && doneNum !== null
    ? { num: doneNum, status: apiStatus, total: apiTotal, driver: apiDriver }
    : placed ? { num: placed.num, status: placed.status, total: placed.total, driver: placed.driverName ?? null } : null;

  if (tracked) {
    const steps = ["pending", "preparing", "ready", "delivered"];
    const idx = Math.max(0, steps.indexOf(tracked.status === "onway" ? "ready" : tracked.status));
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-10" role="status" aria-live="polite">
        <h1 className="text-2xl font-bold">{t(L, "orderAt")} #{tracked.num} {tracked.status === "delivered" ? t(L, "deliveredOk") : t(L, "preparingDots")}</h1>
        <ol className="flex gap-1">
          {[t(L, "stepSent"), t(L, "stepPrep"), t(L, "stepReady"), t(L, "stepDone2")].map((lb, i) => (
            <li key={lb} className={`flex-1 rounded-full py-2 text-center text-xs font-bold ${i <= idx ? "bg-growth text-white" : "bg-line/60 text-muted"}`}>{lb}</li>
          ))}
        </ol>
        <p className="tnum text-xl font-bold">{fmtDzd(tracked.total)} · {t(L, "payOnPickup")}</p>
        {tracked.driver && (tracked.status === "onway" || tracked.status === "ready") && (
          <p className="text-sm font-bold text-growth-deep">{t(s.lang, "trackDriver")}: {tracked.driver}</p>
        )}
        {tracked.status === "delivered" && !remote && (
          <div className="flex items-center gap-1" role="group" aria-label={t(L, "rateYour")}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} onClick={() => setRating(r)} aria-pressed={rating === r} aria-label={`${r} ${t(L, "starsU")}`}
                className={`grid size-11 place-items-center rounded-xl border text-lg ${rating >= r ? "border-growth" : "border-line"}`}>★</button>
            ))}
          </div>
        )}
        {tracked.status === "delivered" && remote && rating === 0 && (
          <div className="flex items-center gap-1" role="group" aria-label={t(L, "rateYour")}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} onClick={() => { setRating(r); api.rateOrder(slug, tracked.num, r).catch(() => null); }} aria-label={`${r} ${t(L, "starsU")}`}
                className="grid size-11 place-items-center rounded-xl border border-line text-lg">★</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8">
      <p className="text-sm font-bold text-growth-deep">{shopName}</p>
      <h1 className="mt-1 text-3xl font-bold">{table ? `${t(L, "tableN")} ${table} — ${t(L, "tableOrderT")}` : t(L, "menuDeliveryT")}</h1>

      <div className="mt-4 flex gap-1 rounded-2xl border border-line bg-surface p-1" role="group" aria-label={t(L, "orderType")}>
        {([
          ...(table ? [["table", t(L, "mTable")] as const] : []),
          ["delivery", t(L, "mDelivery")] as const,
          ["pickup", t(L, "mPickup")] as const,
        ]).map(([m, lb]) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`h-11 flex-1 rounded-xl text-sm font-bold ${mode === m ? "bg-growth text-white" : ""}`}>{lb}</button>
        ))}
      </div>

      {menu.length === 0 ? <div className="mt-4"><Empty title={t(L, "menuEmpty")} hint={t(L, "menuEmptyH")} /></div> : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {menu.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{showName(p)}</b>
                <span className="tnum text-sm font-bold text-growth-deep">{fmtDzd(p.sellPrice)}</span>
              </span>
              <span className="flex items-center gap-1">
                <button className="grid size-10 place-items-center rounded-lg border border-line text-lg font-bold" aria-label={`${t(L, "dec")} ${showName(p)}`}
                  onClick={() => setCart((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))}>−</button>
                <span className="tnum w-6 text-center font-bold">{cart[p.id] ?? 0}</span>
                <button className="grid size-10 place-items-center rounded-lg border border-line text-lg font-bold" aria-label={`${t(L, "inc")} ${showName(p)}`}
                  onClick={() => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}>+</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <Card className="mt-4">
          <div className="flex flex-col gap-3 p-5">
            {mode === "delivery" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t(L, "custNameF")} id="cn"><Input id="cn" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
                <Field label={t(L, "custPhoneF")} id="cp"><Input id="cp" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
                <Field label={t(L, "custAddr")} id="ca"><Input id="ca" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" /></Field>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-bold">{t(L, "totalLb")}</span>
              <span className="tnum text-2xl font-bold text-growth-deep">{fmtDzd(total)}</span>
            </div>
            <Button size="lg" onClick={submit}>{t(L, "sendOrder")} {mode === "table" ? `${t(L, "forTable")} ${table}` : ""}</Button>
            <p className="text-xs text-muted">{t(L, "payCashNote")} · <Badge tone="ok">{t(L, "liveKitchen")}</Badge></p>
          </div>
        </Card>
      )}
    </div>
  );
}
