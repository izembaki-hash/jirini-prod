import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GitBranch, Key, ShieldCheck } from "@phosphor-icons/react";
import { fmtDzd, useStore, displayName, type Product } from "../store";
import { api, currentBranch, toProduct, type ApiLoginUser, type ApiOrder, type ApiShift } from "../api";
import { connected, useAuth } from "../auth";
import { t } from "../i18n";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input,
  Progress, Segmented,
} from "../ui";
import { Bars } from "../components/Charts";
import { errToast } from "../lib/err";

// الفروع: مؤشرات حقيقية لكل فرع (branchId) + مبدّل + نقل مخزون فعلي عبر الخادم.
const LIMIT: Record<string, number> = { starter: 1, pro: 2, mega: 5 };
const DAYS = { "7": 7, "30": 30 } as const;

type Period = keyof typeof DAYS;

export default function Branches() {
  const { s, update } = useStore();
  const { session } = useAuth();
  const L = s.lang;
  const isOwner = !!session && session.role === "owner";
  // الخادم: النقل للمالك والمدير فقط (الكاشير يُرفض 403)
  const canTransfer = isOwner || session?.role === "manager";
  const pinnedB = session?.branchId ?? null;

  const [period, setPeriod] = useState<Period>("7");
  const [remoteOrders, setRemoteOrders] = useState<ApiOrder[] | null>(null);
  const [shifts, setShifts] = useState<ApiShift[] | null>(null);
  // منتجات كل فرع (للحصص والنواقص) — null = لم تُجلب (لا صلاحية/لا اتصال)
  const [branchProds, setBranchProds] = useState<Record<string, Product[] | null>>({});

  // حسابات الدخول (المالك فقط — 403 يعني مدراء/كاشير: يبقى null ويبخَر القسم)
  const [users, setUsers] = useState<ApiLoginUser[] | null>(null);
  const [accFor, setAccFor] = useState<string | null>(null);
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accPass, setAccPass] = useState("");
  const [accBusy, setAccBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [creds, setCreds] = useState<{ branch: string; phone: string; password: string } | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tFrom, setTFrom] = useState(pinnedB ?? "");
  const [tTo, setTTo] = useState("");
  const [tPid, setTPid] = useState("");
  const [tQty, setTQty] = useState("5");

  const limit = LIMIT[s.plan];
  const activeId = s.branches.find((b) => b.name === s.branch)?.id ?? currentBranch() ?? "";

  // ── جلب البيانات ──
  useEffect(() => {
    if (!connected()) return;
    // حساب مثبّت على فرع: GET /branches محجوب لغير فرعه — تبقى لائحة الجلسة
    // (/tenant كاملة) حتى تظهر وجهات النقل والعدّاد صحيحاً
    if (session?.branchId) return;
    api.branchesList().then((list) => update((p) => ({
      ...p,
      branches: list,
      branch: p.branch || list[0]?.name || p.branch,
    }))).catch(() => null);
  }, [update]);

  const since = useMemo(() => new Date(Date.now() - DAYS[period] * 86_400_000).toISOString(), [period]);
  useEffect(() => {
    if (!connected()) { setRemoteOrders(null); return; }
    api.listOrders(undefined, { since }).then(setRemoteOrders).catch(() => setRemoteOrders(null));
  }, [since]);

  useEffect(() => {
    if (!connected()) return;
    api.shiftsList().then(setShifts).catch(() => setShifts(null));
  }, []);

  // حسابات الفروع (للمالك فقط — فشل أي صلاحية = إخفاء القسم)
  useEffect(() => {
    if (!connected() || !isOwner) return;
    api.loginUsers().then(setUsers).catch(() => setUsers(null));
  }, [isOwner]);

  // ── حساب دخول الفرع ──
  const createAcc = async (branchId: string, branchName: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    setAccBusy(true);
    try {
      await api.createEmployeeAccount({
        name: accName.trim() || branchName, phone: accPhone.trim(), password: accPass,
        role: "manager", branchId,
      });
      setUsers(await api.loginUsers());
      setCreds({ branch: branchName, phone: accPhone.trim(), password: accPass });
      setAccFor(null); setAccName(""); setAccPhone(""); setAccPass("");
      toast.success(t(L, "brAccCreated"));
    } catch (ex) { errToast(L, ex); }
    finally { setAccBusy(false); }
  };

  const resetAcc = async (userId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    setAccBusy(true);
    try {
      await api.userPasswordReset(userId, resetPass);
      setResetFor(null); setResetPass("");
      toast.success(t(L, "brAccResetOk"));
    } catch (ex) { errToast(L, ex); }
    finally { setAccBusy(false); }
  };

  const toggleAcc = async (userId: string, active: boolean) => {
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    try {
      await api.userSetActive(userId, active);
      setUsers(await api.loginUsers());
      toast.success(t(L, "brAccToggled"));
    } catch (ex) { errToast(L, ex); }
  };

  useEffect(() => {
    if (!connected()) return;
    let live = true;
    Promise.all(s.branches.map(async (b) => {
      try { return [b.id, await api.listProducts(b.id)] as const; }
      catch { return [b.id, null] as const; }
    })).then((rows) => {
      if (!live) return;
      setBranchProds(Object.fromEntries(rows.map(([id, list]) => [id, list ? list.map(toProduct) : null])));
    });
    return () => { live = false; };
  }, [s.branches]);

  // ── مؤشرات الفترة لكل فرع ──
  const stats = useMemo(() => {
    const list = remoteOrders
      ? remoteOrders.map((o) => ({ at: o.createdAt, status: o.status, total: o.total, branchId: o.branchId ?? null }))
      : s.orders.map((o) => ({ at: o.at, status: o.status, total: o.total, branchId: o.branchId ?? null }));
    const rows = list.filter((o) => o.status !== "cancelled" && o.at >= since);
    const per = s.branches.map((b) => {
      const mine = rows.filter((o) => o.branchId === b.id);
      const sales = mine.reduce((x, o) => x + o.total, 0);
      return { ...b, sales, count: mine.length, avg: mine.length ? Math.round(sales / mine.length) : 0 };
    });
    const total = per.reduce((x, b) => x + b.sales, 0);
    return per.map((b) => ({ ...b, share: total > 0 ? (b.sales / total) * 100 : 0 }));
  }, [remoteOrders, s.orders, s.branches, since]);

  const ZERO = { sales: 0, count: 0, avg: 0, share: 0 };
  // ترتيب الأعمدة حسب اتجاه اللغة (في RTL يبدأ التخطيط من اليمين)
  const bars = L === "ar" ? [...stats].reverse() : stats;

  // ── إضافة فرع (حد الخطة يُفرض في الخادم أيضاً) ──
  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    try {
      const b = await api.branchesCreate({ name: name.trim(), address: address.trim() });
      update((p) => ({ ...p, branches: [...p.branches, b], branch: p.branch || b.name }));
      setBranchProds((prev) => ({ ...prev, [b.id]: [] }));
      setName(""); setAddress("");
      toast.success(t(L, "brAdded"));
    } catch (ex) {
      errToast(L, ex, t(L, "brUpgradeH"));
    }
  };

  // ── نقل حقيقي: الخادم يخصم من المصدر ويضيف للوجهة ──
  const fromProds = tFrom ? branchProds[tFrom] : undefined;
  const srcProd = fromProds?.find((p) => p.id === tPid);
  const qty = Number(tQty) || 0;
  const left = srcProd ? Math.max(0, srcProd.qty - qty) : 0;
  const canMove = Boolean(tFrom && tTo && tFrom !== tTo && tPid && qty > 0);

  const transfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMove) return;
    if (!connected()) { toast.error(t(L, "eConn")); return; }
    try {
      const r = await api.branchesTransfer({ productId: tPid, fromBranchId: tFrom, toBranchId: tTo, qty });
      toast.success(t(L, "moveDone"));
      const fromP = toProduct(r.from);
      const toP = toProduct(r.to);
      setBranchProds((prev) => {
        const next = { ...prev };
        if (next[tFrom]) next[tFrom] = next[tFrom].map((x) => (x.id === fromP.id ? fromP : x));
        if (next[tTo]) {
          next[tTo] = next[tTo].some((x) => x.id === toP.id)
            ? next[tTo].map((x) => (x.id === toP.id ? toP : x))
            : [...next[tTo], toP];
        } else {
          next[tTo] = [toP];
        }
        return next;
      });
      const cur = currentBranch();
      update((p) => {
        let products = p.products;
        if (cur === tFrom) products = products.map((x) => (x.id === r.from.id ? { ...x, qty: r.from.qty } : x));
        if (cur === tTo) {
          products = products.some((x) => x.id === r.to.id)
            ? products.map((x) => (x.id === r.to.id ? { ...x, qty: r.to.qty } : x))
            : [...products, toProduct(r.to)];
        }
        return { ...p, products };
      });
      setTPid("");
    } catch (ex) {
      errToast(L, ex);
    }
  };

  if (s.plan === "starter") {
    return (
      <Empty icon={<GitBranch size={32} weight="bold" aria-hidden />}
        title={t(L, "brUpsellT")}
        hint={`${t(L, "brUpsellH")} ${t(L, "brOnePlan")}.`}
        action={<Link to="/app/settings"><Button>{t(L, "upgradePlan")}</Button></Link>} />
    );
  }

  if (s.branches.length === 0) {
    return <Empty icon={<GitBranch size={32} weight="bold" aria-hidden />} title={t(L, "branchesN")} hint={t(L, "brSyncing")} />;
  }

  const multi = s.branches.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* الرأس: العنوان + عدّاد الخطة + فترة العرض */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {t(L, "branchesN")}
            <span className="tnum ms-2 text-sm font-normal text-muted">({s.branches.length}/{limit === 99 ? "∞" : limit})</span>
          </h1>
          <p className="text-xs text-muted">{t(L, "brBranchSales")} · {period === "7" ? t(L, "brP7") : t(L, "brP30")}</p>
        </div>
        <Segmented label={t(L, "brPeriod")} value={period} onChange={setPeriod}
          options={[{ value: "7", label: t(L, "brP7") }, { value: "30", label: t(L, "brP30") }]} />
      </div>

      {/* مقارنة بصرية عند أكثر من فرع */}
      {multi && (
        <Card>
          <CardHeader><CardTitle>{t(L, "brBranchSales")}</CardTitle></CardHeader>
          <CardContent>
            {/* في RTL يبدأ التخطيط من اليمين → تُعكس ترتيب الأعمدة ليتطابق مع التسميات */}
            <div className="h-40">
              <Bars data={bars.map((b) => b.sales)} height={140} stretch
                highlight={bars.findIndex((b) => b.id === activeId)} />
            </div>
            <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
              {stats.map((b) => (
                <div key={b.id} className="min-w-0 text-center">
                  <p className="truncate text-xs text-muted">{b.name}</p>
                  <p className="tnum text-sm font-bold">{fmtDzd(b.sales)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* بطاقات الفروع: مؤشرات حقيقية من branchId */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {s.branches.map((b) => {
          const st = stats.find((x) => x.id === b.id) ?? ZERO;
          const open = shifts?.find((sh) => sh.branchId === b.id && !sh.closedAt);
          const prods = branchProds[b.id];
          const low = prods ? prods.filter((p) => p.qty <= p.min).length : null;
          const acc = users?.find((u) => u.branchId === b.id);
          return (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate">{b.name}</span>
                  {b.id === activeId && <Badge tone="ok">{t(L, "brCurrent")}</Badge>}
                </CardTitle>
                <p className="truncate text-sm text-muted">{b.address || "—"}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-xs text-muted">{t(L, "brSales")}</p>
                    <p className="tnum text-lg font-bold text-growth-deep">{fmtDzd(st.sales)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t(L, "brShare")}</p>
                    <p className="tnum text-lg font-bold">{Math.round(st.share)}%</p>
                    <Progress value={st.share} className="mt-1" />
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t(L, "ordersU")}</p>
                    <p className="tnum text-lg font-bold">{st.count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t(L, "brBasket")}</p>
                    <p className="tnum text-lg font-bold">{fmtDzd(st.avg)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  {shifts !== null && (
                    <Badge tone={open ? "ok" : "neutral"}>{open ? t(L, "openShiftB") : t(L, "noOpenShift")}</Badge>
                  )}
                  {low !== null && (low > 0
                    ? <Badge tone="warn">{t(L, "brLowN").replace("{n}", String(low))}</Badge>
                    : <Badge tone="ok">{t(L, "brNoLow")}</Badge>)}
                </div>
                {/* حساب دخول مدير الفرع (المالك فقط) */}
                {users !== null && (
                  <div className="border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <Key size={14} weight="bold" aria-hidden /> {t(L, "brAcc")}
                      </span>
                      {acc && (
                        <Badge tone={acc.active ? "ok" : "warn"}>{acc.active ? t(L, "brAccOn") : t(L, "brAccOff")}</Badge>
                      )}
                    </div>
                    {acc ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="text-sm">
                          <span className="text-muted">{t(L, "brAccPhone")}:</span>{" "}
                          <span className="tnum font-semibold" dir="ltr">{acc.phone}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => { setResetFor(resetFor === b.id ? null : b.id); setResetPass(""); }}>
                            {t(L, "brAccReset")}
                          </Button>
                          <Button type="button" size="sm" variant={acc.active ? "danger" : "primary"}
                            onClick={() => toggleAcc(acc.id, !acc.active)}>
                            {acc.active ? t(L, "brAccDisable") : t(L, "brAccEnable")}
                          </Button>
                        </div>
                        {resetFor === b.id && (
                          <form className="flex flex-col gap-2" onSubmit={(e) => resetAcc(acc.id, e)}>
                            <Field label={t(L, "brAccNewPass")} id={`rp-${b.id}`}>
                              <Input id={`rp-${b.id}`} type="text" value={resetPass}
                                onChange={(e) => setResetPass(e.target.value)} autoComplete="new-password" dir="ltr" />
                            </Field>
                            <Button type="submit" size="sm" disabled={resetPass.length < 6 || accBusy}>{t(L, "save")}</Button>
                          </form>
                        )}
                      </div>
                    ) : accFor !== b.id ? (
                      <Button type="button" size="sm" variant="outline" className="mt-2"
                        onClick={() => { setAccFor(b.id); setAccName(b.name); setAccPhone(""); setAccPass(""); }}>
                        {t(L, "brAccCreate")}
                      </Button>
                    ) : (
                      <form className="mt-2 flex flex-col gap-2" onSubmit={(e) => createAcc(b.id, b.name, e)}>
                        <Field label={t(L, "brAccName")} id={`an-${b.id}`}>
                          <Input id={`an-${b.id}`} value={accName} onChange={(e) => setAccName(e.target.value)} />
                        </Field>
                        <Field label={t(L, "brAccPhone")} id={`ap-${b.id}`}>
                          <Input id={`ap-${b.id}`} inputMode="tel" value={accPhone}
                            onChange={(e) => setAccPhone(e.target.value)} dir="ltr" autoComplete="off" />
                        </Field>
                        <Field label={t(L, "brAccPass")} id={`aw-${b.id}`} hint={t(L, "brAccPassHint")}>
                          <Input id={`aw-${b.id}`} type="text" value={accPass}
                            onChange={(e) => setAccPass(e.target.value)} dir="ltr" autoComplete="new-password" />
                        </Field>
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={accBusy || accPhone.trim().length < 9 || accPass.length < 6}>{t(L, "add")}</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setAccFor(null)}>{t(L, "cancel")}</Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* نقل مخزون حقيقي بين الفروع */}
        {canTransfer && (
        <Card>
          <CardHeader><CardTitle>{t(L, "moveTitle")}</CardTitle></CardHeader>
          <CardContent>
            {multi ? (
              <form className="flex flex-col gap-3" onSubmit={transfer}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t(L, "brFrom")} id="tfrom">
                    <select id="tfrom" value={tFrom} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm"
                      onChange={(e) => { setTFrom(e.target.value); setTPid(""); if (tTo === e.target.value) setTTo(""); }}>
                      <option value="">{t(L, "chooseEll")}</option>
                      {(pinnedB ? s.branches.filter((b) => b.id === pinnedB) : s.branches).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t(L, "brTo")} id="tto">
                    <select id="tto" value={tTo} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm"
                      onChange={(e) => setTTo(e.target.value)}>
                      <option value="">{t(L, "chooseEll")}</option>
                      {s.branches.filter((b) => b.id !== tFrom).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={t(L, "prodLb")} id="tpid">
                  <select id="tpid" value={tPid} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm"
                    onChange={(e) => setTPid(e.target.value)} disabled={!tFrom}>
                    <option value="">{t(L, "chooseEll")}</option>
                    {(fromProds ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{displayName(p, L)} ({p.qty})</option>
                    ))}
                  </select>
                </Field>
                {tFrom && fromProds != null && fromProds.length === 0 && (
                  <p className="text-xs text-muted">{t(L, "brNoProd")}</p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t(L, "pQty")} id="tqty">
                    <Input id="tqty" inputMode="numeric" value={tQty} onChange={(e) => setTQty(e.target.value)} />
                  </Field>
                  {srcProd && (
                    <div className="flex items-end pb-2 text-xs text-muted">
                      {t(L, "brLeft").replace("{n}", s.branches.find((b) => b.id === tFrom)?.name ?? "").replace("{q}", String(left))}
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={!canMove}>{t(L, "confirmMove")}</Button>
              </form>
            ) : (
              <p className="text-sm text-muted">{t(L, "brCompare")}</p>
            )}
          </CardContent>
        </Card>
        )}

        {/* إضافة فرع داخل حد الخطة — المالك فقط (الخادم يرفض غير المالك) */}
        {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{t(L, "newBranch")}</CardTitle>
            <p className="text-xs text-muted">{s.branches.length}/{limit === 99 ? "∞" : limit}</p>
          </CardHeader>
          <CardContent>
            {s.branches.length < limit ? (
              <form className="flex flex-col gap-3" onSubmit={addBranch}>
                <Field label={t(L, "brName")} id="br">
                  <Input id="br" value={name} onChange={(e) => setName(e.target.value)} placeholder={t(L, "brEx")} />
                </Field>
                <Field label={t(L, "brAddr")} id="braddr">
                  <Input id="braddr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t(L, "brAddrPh")} />
                </Field>
                <Button type="submit" disabled={!name.trim()} className="self-start">{t(L, "add")}</Button>
              </form>
            ) : s.plan === "mega" ? (
              <p className="text-sm text-muted">{t(L, "brMax")}</p>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">{t(L, "brUpgradeH")}</p>
                <Link to="/app/settings"><Button>{t(L, "upgradePlan")}</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* بيانات الدخول بعد الإنشاء — تظهر مرة واحدة ثم تُغلق */}
      {creds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t(L, "brAccCredsT")}>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck size={18} weight="bold" aria-hidden />{t(L, "brAccCredsT")}
              </CardTitle>
              <p className="text-xs text-muted">{t(L, "brAccCredsH")}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted">{t(L, "brAccBranch")}</span><b>{creds.branch}</b></div>
              <div className="flex justify-between gap-2"><span className="text-muted">{t(L, "lSlug")}</span><b className="tnum" dir="ltr">{session?.tenant.slug ?? ""}</b></div>
              <div className="flex justify-between gap-2"><span className="text-muted">{t(L, "brAccPhone")}</span><b className="tnum" dir="ltr">{creds.phone}</b></div>
              <div className="flex justify-between gap-2"><span className="text-muted">{t(L, "brAccPass")}</span><b className="tnum" dir="ltr">{creds.password}</b></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const line = `${session?.tenant.slug ?? ""} · ${creds.phone} · ${creds.password}`;
                  navigator.clipboard?.writeText(line).catch(() => null);
                  toast.success(t(L, "copied"));
                }}>{t(L, "brAccCopy")}</Button>
                <Button size="sm" onClick={() => setCreds(null)}>{t(L, "done")}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
