import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore, displayName, type Order, type OrderStatus } from "../store";
import { api, kitchenStream, type ApiOrder } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, Empty } from "../ui";

// شاشة المطبخ اللحظية: تستقبل من الكاشير وQR الزبون. تحديث تلقائي كل ثانيتين (onSnapshot في Firebase).
export default function Kitchen() {
  const { s, update } = useStore();
  const L = s.lang;
  const COLS: { id: OrderStatus; label: string }[] = [
    { id: "preparing", label: t(L, "colPreparing") },
    { id: "ready", label: t(L, "colReady") },
    { id: "onway", label: t(L, "colOnway") },
  ];
  const [, setTick] = useState(0);
  useEffect(() => {
    // متصل: SSE حقيقي من الخادم. تجريبي: تحديث محلي دوري.
    if (connected()) {
      const map = (o: ApiOrder): Order => ({
        id: o.id, num: o.num, kind: o.kind, table: o.tableNo ?? undefined,
        status: o.status as Order["status"],
        lines: o.lines.map((l) => {
          const p = { name: l.name, nameFr: l.name };
          return { productId: l.productId, name: displayName(p, L), qty: l.qty, price: l.price };
        }),
        discount: o.discount, pay: o.payMethod as Order["pay"], at: o.createdAt, total: o.total,
        driverId: o.driverId ?? null, driverName: o.driver?.name,
      });
      const merge = (m: Order) =>
        update((p) => (p.orders.some((x) => x.id === m.id) ? p : { ...p, orders: [m, ...p.orders] }));
      // جلب النشطة أولاً (طلبات وردت والمطبخ مغلق/تحدّث)، ثم البث الحي.
      api.listOrders().then((list) => {
        list.filter((o) => ["pending", "preparing", "ready", "onway"].includes(o.status))
          .forEach((o) => merge(map(o)));
      }).catch(() => null);
      return kitchenStream((e) => {
        if (e.type === "order.created" && e.order) {
          merge(map(e.order));
        } else if (e.type === "order.status" && e.order) {
          const { id, status } = e.order;
          update((p) => ({
            ...p,
            orders: p.orders.map((o) => (o.id === id
              ? { ...o, status: status as Order["status"], driverId: e.order!.driverId ?? o.driverId, driverName: e.order!.driver?.name ?? o.driverName }
              : o)),
          }));
        }
      });
    }
    const id = setInterval(() => setTick((x) => x + 1), 2000); // محاكاة Realtime — في الإنتاج: onSnapshot / SSE
    return () => clearInterval(id);
  }, [update, L]);
  const live = s.orders.filter((o) => ["pending", "preparing", "ready", "onway"].includes(o.status));
  const inCol = (o: (typeof live)[number], c: OrderStatus) =>
    c === "preparing" ? o.status === "preparing" || o.status === "pending" : o.status === c;

  const move = (id: string, st: OrderStatus) => {
    if (connected()) api.setOrderStatus(id, st).catch(() => toast.error(t(L, "errStatus")));
    update((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, status: st } : o)) }));
  };

  const kindLabel = (k: string) =>
    k === "delivery" ? t(L, "kindDelivery") : k === "takeaway" ? t(L, "kindTakeaway") : k === "qr_table" ? t(L, "kindQr") : t(L, "kindDinein");

  const elapsed = (at: string) => Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  const waitTone = (m: number): "neutral" | "warn" | "bad" => (m >= 15 ? "bad" : m >= 8 ? "warn" : "neutral");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2" role="status">
        <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-growth" />
        <h1 className="text-xl font-bold">{t(L, "kTitle")}</h1>
        <Badge tone="ok">{live.length} {t(L, "kActive")}</Badge>
      </div>
      {live.length === 0 ? <Empty title={t(L, "kEmpty")} hint={t(L, "kEmptyHint")} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COLS.map((c) => (
            <section key={c.id} aria-label={c.label} className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-3">
              <h2 className="px-1 text-sm font-bold">{c.label} ({live.filter((o) => inCol(o, c.id)).length})</h2>
              {live.filter((o) => inCol(o, c.id)).map((o) => (
                <Card key={o.id} className="border-s-4 border-s-hold">
                  <div className="flex flex-col gap-1.5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <b className="tnum">#{o.num} {o.table ? `· ${t(L, "tableN")} ${o.table}` : ""}</b>
                      <Badge tone={waitTone(elapsed(o.at))}>{t(L, "sinceMin")} <span className="tnum">{elapsed(o.at)}</span> {t(L, "minU")}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="warn">{kindLabel(o.kind)}</Badge>
                      {(o.driverName || o.driverId) && <Badge tone="ok">{t(L, "driverLb")}: {o.driverName ?? ""}</Badge>}
                    </div>
                    <ul className="text-sm">
                      {o.lines.map((l, i) => <li key={i}>×<span className="tnum font-bold">{l.qty}</span> {l.name}</li>)}
                    </ul>
                    <p className="tnum text-xs text-muted">{new Date(o.at).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" })}</p>
                    <Button size="sm" onClick={() => move(o.id, NEXT[o.status] ?? "delivered")}>
                      {c.id === "preparing" ? t(L, "btnReady") : c.id === "ready" ? t(L, "btnDelivered") : t(L, "btnDone")}
                    </Button>
                  </div>
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const NEXT: Record<string, OrderStatus> = { pending: "preparing", preparing: "ready", ready: "delivered", onway: "delivered" };
