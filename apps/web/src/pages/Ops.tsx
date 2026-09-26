import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, useStore } from "../store";
import { API_BASE, ApiError, getOperatorKey, setOperatorKey, ops, type OpsOverview, type OpsTenant, type OpsSupportTicket } from "../api";
import { t, type Lang } from "../i18n";
import { errMsg } from "../lib/err";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input, Segmented, Stat } from "../ui";

function opsErr(L: Lang, e: unknown) {
  toast.error(e instanceof ApiError && (e.status === 401 || e.status === 403) ? t(L, "erOpsKey") : errMsg(L, e, t(L, "eSrv")));
}

// لوحة مشغّل المنصة: كل المستأجرين والمستخدمين والمدفوعات + إجراءات.
// مستقلة عن Shell (مستوى المنصة لا المستأجر). تتطلب API + مفتاح المشغّل.
type Tab = "overview" | "tenants" | "payments" | "support" | "system";

export default function Ops() {
  const { s } = useStore();
  const L = s.lang;
  const [key, setKey] = useState(getOperatorKey() ?? "");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!getOperatorKey()) return;
    setChecking(true);
    ops.health().then(() => setAuthed(true)).catch(() => setOperatorKey(null)).finally(() => setChecking(false));
  }, []);
  const [tab, setTab] = useState<Tab>("overview");

  const submitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setChecking(true);
    setOperatorKey(key.trim());
    try {
      await ops.health();
      setAuthed(true);
    } catch {
      setOperatorKey(null);
      toast.error(t(L, "opsBadKey"));
    } finally { setChecking(false); }
  };

  if (!API_BASE) return <div className="mx-auto max-w-[520px] px-4 py-16 text-center text-sm text-muted">{t(L, "opsNeedApi")}</div>;

  if (!authed) {
    return (
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[420px] place-items-center px-4">
        <Card className="w-full">
          <CardHeader><CardTitle>{t(L, "opsTitle")}</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={submitKey}>
              <Field label={t(L, "opsKey")} id="opk"><Input id="opk" type="password" value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" autoComplete="off" /></Field>
              <Button type="submit" loading={checking}>{t(L, "opsEnter")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6" dir={L === "ar" ? "rtl" : "ltr"}>
      <header className="flex items-center gap-2">
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-ink text-lg font-bold text-white">⚙</span>
        <h1 className="text-xl font-bold">{t(L, "opsTitle")}</h1>
        <button onClick={() => { setOperatorKey(null); setAuthed(false); }} className="ms-auto h-10 rounded-[10px] border border-line px-4 text-sm font-bold">
          {t(L, "logoutOp")}
        </button>
      </header>
      <div className="w-full sm:w-96">
        <Segmented label="tabs" value={tab}
          options={[
            { value: "overview", label: t(L, "tabOverview") },
            { value: "tenants", label: t(L, "tabTenants") },
            { value: "payments", label: t(L, "tabPayments") },
            { value: "support", label: t(L, "tabSupport") },
            { value: "system", label: t(L, "tabSystem") },
          ]}
          onChange={setTab} />
      </div>
      {tab === "overview" && <OverviewTab onBadKey={() => { setOperatorKey(null); setAuthed(false); }} />}
      {tab === "tenants" && <TenantsTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "support" && <SupportTab />}
      {tab === "system" && <SystemTab />}
    </div>
  );
}

function useOps<T>(loader: () => Promise<T>, onBadKey: () => void, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  const reload = () => {
    setErr(false);
    loader().then(setData).catch((e) => {
      if (e instanceof ApiError && e.status === 401) onBadKey();
      else setErr(true);
    });
  };
  useEffect(reload, deps);
  return { data, err, reload };
}

function OverviewTab({ onBadKey }: { onBadKey: () => void }) {
  const { s } = useStore();
  const L = s.lang;
  const { data, err, reload } = useOps<OpsOverview>(() => ops.overview(), onBadKey, []);
  useEffect(() => { const id = setInterval(reload, 30000); return () => clearInterval(id); }, []);
  if (err) return <Empty title={t(L, "eSrv")} hint="" action={<Button onClick={reload}>{t(L, "reloadB")}</Button>} />;
  if (!data) return <p className="text-sm text-muted">…</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t(L, "mTenants")} value={String(data.tenants)} />
        <Stat label={t(L, "mUsers")} value={String(data.users)} />
        <Stat label={t(L, "mOrdersToday")} value={String(data.ordersToday)} />
        <Stat label={t(L, "mRevenueToday")} value={fmtDzd(data.revenueToday)} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="ok">{t(L, "subActive")}: <span className="tnum">{data.subs.active ?? 0}</span></Badge>
        <Badge>{t(L, "subTrial")}: <span className="tnum">{data.subs.trialing ?? 0}</span></Badge>
        <Badge tone="warn">{t(L, "subPending")}: <span className="tnum">{data.subs.pending ?? 0}</span></Badge>
        <Badge tone="bad">{t(L, "subPastDue")}: <span className="tnum">{data.subs.past_due ?? 0}</span></Badge>
        <Badge tone="bad">{t(L, "subSuspended")}: <span className="tnum">{data.subs.suspended ?? 0}</span></Badge>
      </div>
      {data.byPlanType && (
        <Card>
          <CardHeader><CardTitle>{t(L, "subsByPlanType")}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-start text-xs text-muted">
                  <th className="py-2 text-start font-medium">{t(L, "colType")}</th>
                  <th className="py-2 text-center font-medium">{t(L, "planStarter")}</th>
                  <th className="py-2 text-center font-medium">{t(L, "planPro")}</th>
                  <th className="py-2 text-center font-medium">{t(L, "planMega")}</th>
                  <th className="py-2 text-center font-medium">{t(L, "totalLb")}</th>
                </tr>
              </thead>
              <tbody>
                {(["restaurant", "shop"] as const).map((type) => {
                  const row = data.byPlanType![type] ?? {};
                  const sum = (row.starter ?? 0) + (row.pro ?? 0) + (row.mega ?? 0);
                  return (
                    <tr key={type} className="border-b border-line last:border-0">
                      <td className="py-2 font-bold">{t(L, type)}</td>
                      <td className="tnum py-2 text-center">{row.starter ?? 0}</td>
                      <td className="tnum py-2 text-center">{row.pro ?? 0}</td>
                      <td className="tnum py-2 text-center">{row.mega ?? 0}</td>
                      <td className="tnum py-2 text-center font-bold">{sum}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>{t(L, "recentPay")}</CardTitle></CardHeader>
        <CardContent>
          {data.recentPayments.length === 0 ? <p className="text-sm text-muted">{t(L, "noData")}</p> : (
            <ul className="flex flex-col">
              {data.recentPayments.slice(0, 10).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-sm first:border-0 first:pt-0">
                  <b>{p.tenantName}</b>
                  <span className="tnum text-xs text-muted" dir="ltr">{p.tenantSlug}</span>
                  <Badge tone={p.status === "paid" ? "ok" : p.status === "initiated" ? "warn" : undefined}>{p.status}</Badge>
                  <b className="tnum ms-auto">{fmtDzd(p.amountDzd)}</b>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TenantsTab() {
  const { s } = useStore();
  const L = s.lang;
  const [list, setList] = useState<OpsTenant[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [months, setMonths] = useState("1");
  const load = () => ops.tenants().then(setList).catch((e) => opsErr(L, e));
  useEffect(() => { load(); }, []);
  const open = async (id: string) => {
    setSel(id);
    try { setDetail(await ops.tenant(id)); } catch (e) { opsErr(L, e); }
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); load(); if (sel) open(sel); }
    catch (e) { opsErr(L, e); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader><CardTitle>{t(L, "tabTenants")} ({list?.length ?? "…"})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex max-h-[560px] flex-col gap-1 overflow-y-auto">
            {(list ?? []).map((tn) => (
              <li key={tn.id}>
                <button onClick={() => open(tn.id)}
                  className={`flex w-full flex-wrap items-center gap-2 rounded-xl border p-3 text-start text-sm ${sel === tn.id ? "border-growth" : "border-line"}`}>
                  <span className="min-w-0 flex-1"><b className="block truncate">{tn.name}</b>
                    <span className="tnum text-xs text-muted" dir="ltr">{tn.slug} · {tn.phone}</span></span>
                  <Badge>{tn.plan}</Badge>
                  <Badge tone={tn.subscription?.status === "active" ? "ok" : tn.subscription?.status === "trialing" ? undefined : "bad"}>
                    {tn.subscription?.status ?? t(L, "billNone")}
                  </Badge>
                  <span className="tnum text-xs text-muted">{tn.users}👤 {tn.orders30d}🧾</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t(L, "tDetail")}</CardTitle></CardHeader>
        <CardContent>
          {!detail ? <p className="text-sm text-muted">…</p> : (
            <TenantDetail
              d={detail as { tenant: { id: string; slug: string; name: string; plan: string }; subscription: { status: string; expiresAt: string; plan: string; lastRef?: string } | null; users: { name: string; phone: string; role: string }[]; branches: { name: string }[]; payments: { ref: string; amountDzd: number; status: string }[] }}
              months={months} setMonths={setMonths}
              onAct={act} onReload={() => sel && open(sel)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TenantDetail({ d, months, setMonths, onAct, onReload }: {
  d: { tenant: { id: string; slug: string; name: string; plan: string }; subscription: { status: string; expiresAt: string; plan: string; lastRef?: string } | null; users: { name: string; phone: string; role: string }[]; branches: { name: string }[]; payments: { ref: string; amountDzd: number; status: string }[] };
  months: string; setMonths: (v: string) => void;
  onAct: (fn: () => Promise<unknown>, msg: string) => void; onReload: () => void;
}) {
  const { s } = useStore();
  const L = s.lang;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div><b className="text-base">{d.tenant.name}</b>
        <p className="tnum text-xs text-muted" dir="ltr">{d.tenant.slug} · {d.subscription ? `${d.subscription.status} → ${new Date(d.subscription.expiresAt).toLocaleDateString("fr-DZ")}` : t(L, "billNone")}</p>
      </div>
      <p className="text-xs text-muted">{t(L, "mUsers")}: {d.users.map((u) => `${u.name} (${u.role})`).join("، ")} · {t(L, "branchesN")}: {d.branches.map((b) => b.name).join("، ")}</p>
      {d.subscription?.status === "pending" && (
        <p className="rounded-lg bg-hold/10 px-2 py-1 text-xs font-bold">{t(L, "billPendingNote")} <span className="tnum" dir="ltr">{d.subscription.lastRef ?? ""}</span></p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(L, "actSetPlan")} id="op-plan">
          <select id="op-plan" defaultValue={d.tenant.plan} onChange={(e) => onAct(() => ops.setPlan(d.tenant.id, e.target.value), t(L, "done"))} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-xs font-bold">
            {(["starter", "pro", "mega"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={`${t(L, "actExtend")} (${t(L, "monthsN")})`} id="op-ext">
          <span className="flex gap-1">
            <Input id="op-ext" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className="h-10" />
            <Button size="sm" onClick={() => onAct(() => ops.extend(d.tenant.id, Number(months) || 1), t(L, "done"))}>{t(L, "actExtend")}</Button>
          </span>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onAct(() => ops.suspend(d.tenant.id), t(L, "done"))}>{t(L, "actSuspend")}</Button>
        <Button size="sm" variant="outline" onClick={() => onAct(() => ops.unsuspend(d.tenant.id), t(L, "done"))}>{t(L, "actUnsuspend")}</Button>
        <Button size="sm" onClick={() => onAct(() => ops.confirmManual(d.tenant.slug, Number(months) || 1), t(L, "done"))}>{t(L, "actConfirm")}</Button>
      </div>
      <div>
        <b className="text-xs">{t(L, "recentPay")}</b>
        <ul className="mt-1 flex flex-col gap-1">
          {d.payments.slice(0, 5).map((p, i) => (
            <li key={i} className="flex justify-between text-xs"><span className="tnum" dir="ltr">{p.ref}</span><span>{p.status} · <span className="tnum">{fmtDzd(p.amountDzd)}</span></span></li>
          ))}
          {d.payments.length === 0 && <li className="text-xs text-muted">{t(L, "noData")}</li>}
        </ul>
      </div>
      <Button size="sm" variant="ghost" onClick={onReload}>{t(L, "reloadB")}</Button>
    </div>
  );
}

function PaymentsTab() {
  const { s } = useStore();
  const L = s.lang;
  const [f, setF] = useState("");
  const [list, setList] = useState<{ id: string; tenantSlug: string; tenantName: string; plan: string; months: number; amountDzd: number; status: string; ref: string; createdAt: string }[] | null>(null);
  useEffect(() => { ops.payments(f || undefined).then(setList).catch((e) => opsErr(L, e)); }, [f]);
  return (
    <Card>
      <CardHeader><CardTitle>{t(L, "tabPayments")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-1" role="group" aria-label="filter">
          {["", "initiated", "paid", "failed", "pending"].map((x) => (
            <button key={x} onClick={() => setF(x)} aria-pressed={f === x}
              className={`h-9 rounded-lg border px-3 text-xs font-bold ${f === x ? "border-growth bg-growth/10 text-growth-deep" : "border-line"}`}>
              {x === "" ? t(L, "fAll") : x}
            </button>
          ))}
        </div>
        <ul className="flex flex-col">
          {(list ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-sm first:border-0 first:pt-0">
              <b>{p.tenantName}</b>
              <span className="tnum text-xs text-muted" dir="ltr">{p.tenantSlug}</span>
              <Badge tone={p.status === "paid" ? "ok" : p.status === "initiated" || p.status === "pending" ? "warn" : "bad"}>{p.status}</Badge>
              <span className="tnum text-xs text-muted" dir="ltr">{p.ref}</span>
              <b className="tnum ms-auto">{fmtDzd(p.amountDzd)}</b>
            </li>
          ))}
          {list?.length === 0 && <li className="text-sm text-muted">{t(L, "noData")}</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

function SupportTab() {
  const { s } = useStore();
  const L = s.lang;
  const [list, setList] = useState<OpsSupportTicket[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => ops.tickets().then(setList).catch((e) => opsErr(L, e));
  useEffect(() => { load(); }, []);
  const resolve = async (id: string) => {
    setBusy(id);
    try { await ops.resolveTicket(id); await load(); }
    catch (e) { opsErr(L, e); }
    finally { setBusy(null); }
  };
  if (!list) return <p className="text-sm text-muted">…</p>;
  if (list.length === 0) return <Empty title={t(L, "noData")} hint="" />;
  return (
    <Card>
      <CardHeader><CardTitle>{t(L, "tabSupport")}</CardTitle></CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {list.map((tk) => (
            <li key={tk.id} className="flex flex-col gap-1 border-t border-line py-3 text-sm first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <b>{tk.tenantName}</b>
                <span className="tnum text-xs text-muted" dir="ltr">{tk.tenantSlug}</span>
                <Badge tone={tk.status === "resolved" ? "ok" : "warn"}>{tk.status === "resolved" ? t(L, "ticketResolved") : t(L, "ticketOpen")}</Badge>
                <span className="tnum ms-auto text-xs text-muted">{new Date(tk.createdAt).toLocaleString("fr-DZ")}</span>
              </div>
              <p className="text-ink">{tk.message}</p>
              {tk.contact && <p className="text-xs text-muted" dir="ltr">{tk.contact}</p>}
              {tk.status === "open" && (
                <Button size="sm" variant="outline" className="mt-1 w-fit" loading={busy === tk.id} onClick={() => resolve(tk.id)}>
                  {t(L, "ticketResolve")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SystemTab() {
  const { s } = useStore();
  const L = s.lang;
  const [h, setH] = useState<{ db: string; uptimeSec: number; time: string; env: Record<string, unknown> } | null>(null);
  useEffect(() => { ops.health().then(setH).catch((e) => opsErr(L, e)); }, []);
  if (!h) return <p className="text-sm text-muted">…</p>;
  const up = `${Math.floor(h.uptimeSec / 3600)}h ${Math.floor((h.uptimeSec % 3600) / 60)}m`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat2 label={t(L, "sysDb")} value={h.db} />
      <Stat2 label={t(L, "sysUptime")} value={up} />
      <Stat2 label={t(L, "sysTime")} value={new Date(h.time).toLocaleString("fr-DZ")} />
      <Stat2 label="SofizPay" value={h.env.sofizpay ? "✓" : "✗"} />
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <Card><div className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted">{label}</span>
      <b className="tnum text-lg">{value}</b>
    </div></Card>
  );
}
