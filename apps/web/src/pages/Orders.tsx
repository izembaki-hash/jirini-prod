import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Link } from "react-router-dom";
import { fmtDzd, useStore, type Order, type OrderStatus } from "../store";
import { toast } from "sonner";
import { api, type ApiOrder } from "../api";
import { connected, useAuth } from "../auth";
import { t, type TKey } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input, Segmented, StatusDot } from "../ui";
import { StickerDoc, printDoc } from "../print";
import { errToast } from "../lib/err";

// 5. إدارة طلبات الزبائن + روابط QR الطاولات (مطاعم) + التوصيل والسائقون — برو/ميغا فقط.
const STKEY: Record<OrderStatus, TKey> = {
  pending: "stPending", preparing: "stPending", ready: "stReady",
  onway: "stOnway", delivered: "stDelivered", cancelled: "stCancelled",
};

const mapApi = (o: ApiOrder): Order => ({
  id: o.id, num: o.num, kind: o.kind, table: o.tableNo ?? undefined,
  status: o.status as Order["status"],
  lines: o.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price })),
  discount: o.discount, pay: o.payMethod as Order["pay"], at: o.createdAt, total: o.total,
  driverId: o.driverId ?? null, driverName: o.driver?.name,
});

export default function Orders() {
  const { s, update } = useStore();
  const L = s.lang;
  const { session } = useAuth();
  const gated = s.plan === "starter";
  const slug = session?.tenant.slug ?? "";
  const base = `${window.location.origin}/o/${slug}/menu`;
  const [remoteOrders, setRemoteOrders] = useState<Order[] | null>(null);
  const [tab, setTab] = useState<"orders" | "delivery">("orders");

  useEffect(() => {
    if (connected()) {
      api.listOrders().then((list) => setRemoteOrders(list.map(mapApi))).catch(() => null);
      api.listDrivers().then((list) => update((p) => ({
        ...p,
        drivers: list.map((d) => ({ id: d.id, name: d.name, phone: d.phone, vehicle: d.vehicle ?? undefined, kind: (d.kind === "external" ? "external" : "internal") as "internal" | "external", active: d.active })),
      }))).catch(() => null);
    }
  }, [update]);

  const orders = remoteOrders ?? s.orders;
  const setStatus = (id: string, st: OrderStatus) => {
    const o = orders.find((x) => x.id === id);
    if (st === "onway" && o && o.kind === "delivery" && !o.driverId) toast.warning(t(L, "onwayNoDriver"));
    if (connected()) api.setOrderStatus(id, st).catch((ex) => errToast(L, ex, t(L, "errStatus")));
    if (remoteOrders) setRemoteOrders(remoteOrders.map((x) => (x.id === id ? { ...x, status: st } : x)));
    update((p) => ({ ...p, orders: p.orders.map((x) => (x.id === id ? { ...x, status: st } : x)) }));
  };
  const assign = async (id: string, driverId: string | null) => {
    const d = s.drivers.find((x) => x.id === driverId);
    if (connected()) {
      try { await api.assignDriver(id, driverId); }
      catch (ex) { errToast(L, ex, t(L, "drvErr")); return; }
    }
    const patch = { driverId, driverName: d?.name };
    if (remoteOrders) setRemoteOrders(remoteOrders.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    update((p) => ({ ...p, orders: p.orders.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    if (driverId) toast.success(t(L, "drvAssigned"));
  };

  if (gated) {
    return (
      <Empty title={t(L, "ordUpgradeT")}
        hint={t(L, "ordUpgradeH")}
        action={<Link to="/app/settings"><Button>{t(L, "upgradePlan")}</Button></Link>} />
    );
  }

  const deliveries = orders.filter((o) => o.kind === "delivery" && o.status !== "cancelled" && o.status !== "delivered");

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full sm:w-72">
        <Segmented label="tabs" value={tab}
          options={[{ value: "orders", label: t(L, "ordTitle") }, { value: "delivery", label: t(L, "drvTab") }]}
          onChange={setTab} />
      </div>
      {tab === "orders" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle>{t(L, "ordTitle")} ({orders.length})</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 text-sm first:border-0 first:pt-0">
                    <StatusDot status={o.status} />
                    <b className="tnum">#{o.num}</b>
                    <Badge tone={o.status === "delivered" ? undefined : o.status === "cancelled" ? "bad" : "warn"}>{t(L, STKEY[o.status])}</Badge>
                    <span className="text-muted">{o.lines.reduce((x, l) => x + l.qty, 0)} {t(L, "itemsU")} · {o.table ? `${t(L, "tableN")} ${o.table}` : o.kind}</span>
                    {(o.driverName || o.driverId) && <Badge tone="ok">{t(L, "driverLb")}: {o.driverName ?? ""}</Badge>}
                    <b className="tnum ms-auto">{fmtDzd(o.total)}</b>
                    <span className="flex gap-1">
                      {(["preparing", "ready", "onway", "delivered"] as OrderStatus[]).map((st) => (
                        <button key={st} onClick={() => setStatus(o.id, st)}
                          aria-pressed={o.status === st} aria-label={`${t(L, "statusLb")} ${t(L, STKEY[st])}`}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-bold ${o.status === st ? "border-growth bg-growth/10 text-growth-deep" : "border-line"}`}>
                          {t(L, STKEY[st])}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {s.businessType === "restaurant" && (
              <Card>
                <CardHeader><CardTitle>{t(L, "qrTitle")}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  {Array.from({ length: s.tables }, (_, i) => i + 1).map((tb) => {
                    const busy = orders.some((o) => o.table === String(tb) && ["pending", "preparing", "ready"].includes(o.status));
                    return (
                      <div key={tb} className="flex flex-col items-center gap-1 rounded-xl border border-line p-3">
                        <QRCode value={`${base}?t=${tb}`} size={110} aria-label={`QR ${t(L, "tableN")} ${tb}`} />
                        <b className="flex items-center gap-1.5 text-sm">
                          <span aria-hidden className={`size-2 rounded-full ${busy ? "bg-ember" : "bg-growth"}`} />
                          {t(L, "tableN")} {tb} · {busy ? t(L, "occupied") : t(L, "free")}
                        </b>
                        <button className="text-xs text-growth-deep underline" onClick={() => printDoc(
                          `${t(L, "tableN")} ${tb} — ${s.businessName}`,
                          L === "ar" ? "rtl" : "ltr",
                          <StickerDoc shop={s.businessName} lang={L} table={String(tb)} url={`${base}?t=${tb}`} />,
                        )}>{t(L, "printSticker")}</button>
                      </div>
                    );
                  })}
                  <p className="col-span-2 text-xs text-muted">{t(L, "qrNote")}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>{s.businessType === "restaurant" ? t(L, "menuLink") : t(L, "menuLinkShop")}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <code className="tnum break-all rounded-lg bg-canvas p-2 text-xs" dir="ltr">{base}</code>
                <Link to={`/o/${slug}/menu`}><Button variant="outline">{t(L, "openPortal")}</Button></Link>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <DeliveryTab deliveries={deliveries} onAssign={assign} />
      )}
    </div>
  );
}

// ─── التوصيل: دليل السائقين + إسناد الطلبات ───
function DeliveryTab({ deliveries, onAssign }: { deliveries: Order[]; onAssign: (id: string, driverId: string | null) => void }) {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [kind, setKind] = useState<"internal" | "external">("internal");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (connected()) {
      try {
        const d = await api.createDriver({ name: name.trim(), phone: phone.trim(), vehicle: vehicle || undefined, kind });
        update((p) => ({ ...p, drivers: [...p.drivers, { id: d.id, name: d.name, phone: d.phone, vehicle: d.vehicle ?? undefined, kind: (d.kind === "external" ? "external" : "internal") as "internal" | "external", active: d.active }] }));
        toast.success(t(L, "drvAdded"));
      } catch (ex) {
        errToast(L, ex);
        return;
      }
    } else {
      if (s.drivers.some((x) => x.phone === phone.trim())) { toast.error(t(L, "supExistsErr")); return; }
      update((p) => ({ ...p, drivers: [...p.drivers, { id: `drv${Date.now()}`, name: name.trim(), phone: phone.trim(), vehicle: vehicle || undefined, kind, active: true }] }));
      toast.success(t(L, "drvAdded"));
    }
    setName(""); setPhone(""); setVehicle(""); setKind("internal");
  };

  const actives = s.drivers.filter((d) => d.active);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>{t(L, "drvNew")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="flex flex-col gap-3">
              <Field label={t(L, "drvName")} id="dn"><Input id="dn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t(L, "drvPhone")} id="dp"><Input id="dp" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" /></Field>
                <Field label={t(L, "drvVehicle")} id="dv"><Input id="dv" value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></Field>
              </div>
              <Segmented label={t(L, "drvKind")} value={kind}
                options={[{ value: "internal", label: t(L, "drvInternal") }, { value: "external", label: t(L, "drvExternal") }]}
                onChange={setKind} />
              <Button type="submit">{t(L, "add")}</Button>
            </form>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{t(L, "drvTitle")} ({s.drivers.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {s.drivers.map((d) => (
                <li key={d.id} className="flex items-center gap-2 border-t border-line py-2 text-sm first:border-0 first:pt-0">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas font-bold">{d.name.slice(0, 1)}</span>
                  <span className="flex-1"><b className="block">{d.name}</b><span className="tnum text-xs text-muted" dir="ltr">{d.phone}{d.vehicle ? ` · ${d.vehicle}` : ""}</span></span>
                  <Badge>{d.kind === "external" ? t(L, "drvExternal") : t(L, "drvInternal")}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{t(L, "kindDelivery")} ({deliveries.length})</CardTitle></CardHeader>
        <CardContent>
          {deliveries.length === 0 ? <Empty title={t(L, "kEmpty")} hint={t(L, "kEmptyHint")} /> : (
            <ul className="flex flex-col">
              {deliveries.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 text-sm first:border-0 first:pt-0">
                  <b className="tnum">#{o.num}</b>
                  <Badge tone="warn">{t(L, STKEY[o.status])}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted" dir="auto">{o.address ?? ""} · <span className="tnum" dir="ltr">{o.phone ?? ""}</span></span>
                  <b className="tnum">{fmtDzd(o.total)}</b>
                  <select value={o.driverId ?? ""} onChange={(e) => onAssign(o.id, e.target.value || null)}
                    aria-label={`${t(L, "drvAssign")} #${o.num}`} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-xs font-bold">
                    <option value="">{t(L, "drvUnassign")}</option>
                    {actives.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.kind === "external" ? t(L, "drvExternal") : t(L, "drvInternal")})</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
