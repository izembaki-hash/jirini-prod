import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore, type PlanId, fmtDzd } from "../store";
import { API_BASE, ApiError, api } from "../api";
import { useAuth, connected } from "../auth";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "../ui";
import { btSupported, btSavedName, btForget, btTestPrint, btPair, btPrefs, btSavePrefs, btErrorMessage } from "../lib/btprinter";
import { t, type TKey } from "../i18n";

// 11. الإعدادات: اشتراك + ضرائب + أمان + نسخ احتياطي + أجهزة + أوفر تايم + CRM + لغة.
const PLAN_META: { id: PlanId; key: TKey; price: number }[] = [
  { id: "starter", key: "planStarter", price: 2500 },
  { id: "pro", key: "planPro", price: 3000 },
  { id: "mega", key: "planMega", price: 4500 },
];

// 11. الإعدادات: اشتراك + ضرائب + أمان + نسخ احتياطي + أجهزة + أوفر تايم + CRM + لغة.
export default function Settings() {
  const { s, update } = useStore();
  const L = s.lang;
  const { session } = useAuth();
  const [tax, setTax] = useState("0");

  const exportAll = () => {
    const blob = new Blob([localStorage.getItem("dz-saas-v1") ?? "{}"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backup-dz-saas.json";
    a.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <div id="sec-conn" className="scroll-mt-20" />
        <CardHeader><CardTitle>{t(L, "connT")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {API_BASE ? (
            <>
              <p><Badge tone={session ? "ok" : "warn"}>{session ? t(L, "connectedB") : t(L, "loginNeeded")}</Badge></p>
              <p className="tnum break-all text-xs text-muted" dir="ltr">{API_BASE}</p>
              {session
                ? <p className="text-muted">{session.tenant.name} · {session.name} ({session.role})</p>
                : <Link to="/login"><Button size="sm">{t(L, "lGo")}</Button></Link>}
            </>
          ) : (
            <p className="text-muted">{t(L, "demoModeH")}</p>
          )}
        </CardContent>
      </Card>
      <Card><div id="sec-bill" className="scroll-mt-20" /><CardHeader><CardTitle>{t(L, "billingT")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {session && <BillingPanel />}
          <div className="flex gap-2" role="group" aria-label={t(L, "billingT")}>
            {PLAN_META.map((p) => (
              <button key={p.id} onClick={() => update((prev) => ({ ...prev, plan: p.id }))} aria-pressed={s.plan === p.id}
                className={`h-11 flex-1 rounded-[10px] border text-sm font-bold ${s.plan === p.id ? "border-growth bg-growth/10 text-growth-deep" : "border-line"}`}>
                {t(L, p.key)} <span className="tnum">{p.price}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t(L, "billingNote")}</p>
          <Field label={t(L, "taxLb")} id="tax">
            <input id="tax" value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal"
              className="h-11 w-full rounded-[10px] border border-line bg-surface px-3" />
          </Field>
        </CardContent>
      </Card>

      {s.businessType === "restaurant" && <div id="sec-tables" className="contents scroll-mt-20"><TablesCard /></div>}

      <div id="sec-oh" className="contents scroll-mt-20"><OverheadsCard /></div>

      <Card><div id="sec-prefs" className="scroll-mt-20" /><CardHeader><CardTitle>{t(L, "prefsT")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Toggle label={t(L, "otToggle")} on={s.overtimeOn} onFlip={() => update((p) => ({ ...p, overtimeOn: !p.overtimeOn }))} />
          <Toggle label={t(L, "crmToggle")} on={s.crmOn} onFlip={() => update((p) => ({ ...p, crmOn: !p.crmOn }))} />
          <div className="flex items-center justify-between gap-2">
            <span>{t(L, "uiLang")}</span>
            <span className="flex gap-1">
              {(["ar", "fr"] as const).map((lg) => (
                <button key={lg} onClick={() => { update((p) => ({ ...p, lang: lg })); document.documentElement.lang = lg; document.documentElement.dir = lg === "ar" ? "rtl" : "ltr"; }}
                  aria-pressed={s.lang === lg} className={`h-10 rounded-[10px] border px-4 font-bold ${s.lang === lg ? "border-growth bg-growth/10 text-growth-deep" : "border-line"}`}>
                  {lg === "ar" ? "عربي" : "Français"}
                </button>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t(L, "theme")}</span>
            <Button size="sm" variant="outline" onClick={() => document.documentElement.classList.toggle("dark")}>{t(L, "themeToggle")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card><div id="sec-sec" className="scroll-mt-20" /><CardHeader><CardTitle>{t(L, "secT")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {connected() ? <PasswordForm /> : (
            <p className="text-muted">{t(L, "secLogin")}</p>
          )}
          <DevicesCard />
          <p><Badge>{t(L, "scannerB")}</Badge></p>
          <p className="text-xs text-muted">{t(L, "noHw")}</p>
        </CardContent>
      </Card>

      <Card><div id="sec-data" className="scroll-mt-20" /><CardHeader><CardTitle>{t(L, "backupT")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" onClick={exportAll}>{t(L, "dlBackup")}</Button>
          <Button variant="ghost" onClick={() => { if (confirm(t(L, "resetConfirm"))) localStorage.removeItem("dz-saas-v1"); location.reload(); }}>{t(L, "resetDemo")}</Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function BillingPanel() {
  const { s } = useStore();
  const L = s.lang;
  const [info, setInfo] = useState<{ plan?: string; status: string; expiresAt?: string; online?: boolean } | null>(null);
  const [plan, setPlan] = useState(s.plan);
  const [months, setMonths] = useState("1");
  const [email, setEmail] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.billingStatus().then((r) => setInfo(r)).catch(() => null);
  }, []);

  const stLabel = (st: string) =>
    st === "active" ? t(L, "billActiveOk") : st === "trialing" ? t(L, "billTrial")
    : st === "pending" ? t(L, "billPending") : st === "past_due" ? t(L, "billPastDue")
    : st === "suspended" || st === "expired" ? t(L, "billExpired") : st === "none" ? t(L, "billNone") : st;

  const pay = async () => {
    if (!email.includes("@")) { toast.error(t(L, "billEmail")); return; }
    setBusy(true);
    try {
      const r = await api.billingInitiate({ plan, months: Number(months), email });
      window.location.href = r.paymentUrl;
    } catch (ex) {
      toast.error(ex instanceof ApiError && ex.status === 501 ? t(L, "billNotConf") : t(L, "errSaving"));
      setBusy(false);
    }
  };

  const sendRef = async () => {
    if (ref.trim().length < 3) return;
    try {
      await api.billingSubmitManual(ref.trim(), Number(months) || 1);
      toast.success(t(L, "billPendingNote"));
      setRef("");
      api.billingStatus().then((r) => setInfo(r)).catch(() => null);
    } catch {
      toast.error(t(L, "errSaving"));
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>{t(L, "billStatus")}: {stLabel(info?.status ?? "none")}</b>
        {info?.expiresAt && <span className="tnum text-xs text-muted">{t(L, "billUntil")} {new Date(info.expiresAt).toLocaleDateString("fr-DZ")}</span>}
      </div>
      {info?.online === false && <p className="text-xs text-muted">{t(L, "billNotConf")}</p>}
      {info?.online !== false && (
        <>
          <b className="text-[13px]">{t(L, "billOnlineT")}</b>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t(L, "billPlan")} id="bp">
              <select id="bp" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} className="h-11 rounded-[10px] border border-line bg-surface px-2 text-sm">
                {PLAN_META.map((p) => <option key={p.id} value={p.id}>{t(L, p.key)} · <span className="tnum">{p.price}</span></option>)}
              </select>
            </Field>
            <Field label={t(L, "billMonths")} id="bm">
              <select id="bm" value={months} onChange={(e) => setMonths(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-2 text-sm">
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {t(L, "monthU")}</option>)}
              </select>
            </Field>
            <Field label={t(L, "billEmail")} id="be"><Input id="be" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field>
          </div>
          <Button size="sm" loading={busy} onClick={pay} className="w-fit">{t(L, "billPayBtn")}</Button>
        </>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2 border-t border-line pt-2">
        <Field label={`${t(L, "billManualT")} — ${t(L, "billRef")}`} id="bref"><Input id="bref" value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" /></Field>
        <Button size="sm" variant="outline" onClick={sendRef}>{t(L, "billSendRef")}</Button>
      </div>
    </div>
  );
}

const OH_KINDS = ["rent", "electricity", "gas", "water", "internet", "other"] as const;
const ohKindLabel = (k: string, L: "ar" | "fr") =>
  k === "rent" ? t(L, "ohRent") : k === "electricity" ? t(L, "ohElec") : k === "gas" ? t(L, "ohGas")
  : k === "water" ? t(L, "ohWater") : k === "internet" ? t(L, "ohNet") : t(L, "ohOther");

function OverheadsCard() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("rent");
  const [monthly, setMonthly] = useState("");

  useEffect(() => {
    if (!connected()) return;
    api.listOverheads().then((list) => update((p) => ({
      ...p,
      overheads: list.map((o) => ({ id: o.id, name: o.name, kind: o.kind, monthly: o.monthly, active: o.active, notes: o.notes ?? undefined })),
    }))).catch(() => null);
  }, [update]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !(Number(monthly) > 0)) return;
    if (connected()) {
      try {
        const o = await api.createOverhead({ name: name.trim(), kind, monthly: Number(monthly) });
        update((p) => ({ ...p, overheads: [...p.overheads, { id: o.id, name: o.name, kind: o.kind, monthly: o.monthly, active: o.active }] }));
      } catch { toast.error(t(L, "errSaving")); return; }
    } else {
      update((p) => ({ ...p, overheads: [...p.overheads, { id: `oh${Date.now()}`, name: name.trim(), kind, monthly: Number(monthly), active: true }] }));
    }
    setName(""); setMonthly("");
  };

  const toggle = async (id: string, active: boolean) => {
    if (connected()) {
      try { await api.updateOverhead(id, { active }); } catch { toast.error(t(L, "errSaving")); return; }
    }
    update((p) => ({ ...p, overheads: p.overheads.map((x) => x.id === id ? { ...x, active } : x) }));
  };

  const remove = async (id: string) => {
    if (connected()) {
      try { await api.deleteOverhead(id); } catch { toast.error(t(L, "errSaving")); return; }
    }
    update((p) => ({ ...p, overheads: p.overheads.filter((x) => x.id !== id) }));
  };

  return (
    <Card><CardHeader><CardTitle>{t(L, "ohTitle")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {s.overheads.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-sm">
              <button role="switch" aria-checked={o.active} aria-label={o.name} onClick={() => toggle(o.id, !o.active)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${o.active ? "bg-growth" : "bg-line"}`}>
                <span aria-hidden className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${o.active ? "inset-inline-end-1" : "inset-inline-start-1"}`} />
              </button>
              <span className="flex-1 font-medium">{o.name} <span className="text-xs font-normal text-muted">· {ohKindLabel(o.kind, L)}</span></span>
              <span className="tnum text-xs text-muted">{fmtDzd(o.monthly)}</span>
              <button className="rounded-lg border border-line px-2 py-1 text-xs font-bold text-ember" onClick={() => remove(o.id)}>{t(L, "del")}</button>
            </li>
          ))}
          {s.overheads.length === 0 && <li className="text-sm text-muted">—</li>}
        </ul>
        <form onSubmit={add} className="grid grid-cols-[1fr_auto_auto] items-end gap-2 border-t border-line pt-3">
          <Field label={t(L, "ohName")} id="ohn"><Input id="ohn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t(L, "ohKind")} id="ohk">
            <select id="ohk" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-2 text-sm">
              {OH_KINDS.map((k) => <option key={k} value={k}>{ohKindLabel(k, L)}</option>)}
            </select>
          </Field>
          <Field label={t(L, "ohMonthly")} id="ohm"><Input id="ohm" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-28" /></Field>
          <Button type="submit">{t(L, "add")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TablesCard() {
  const { s, update } = useStore();
  const L = s.lang;
  const save = async (n: number) => {
    const v = Math.min(60, Math.max(1, n));
    update((p) => ({ ...p, tables: v }));
    if (connected()) {
      try { await api.tenantPatch({ tablesCount: v }); }
      catch { toast.error(t(L, "errSaving")); }
    }
  };
  return (
    <Card><CardHeader><CardTitle>{t(L, "tablesT")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button className="grid size-11 place-items-center rounded-[10px] border border-line text-xl font-bold" onClick={() => save(s.tables - 1)} aria-label="−">−</button>
          <b className="tnum w-12 text-center text-2xl">{s.tables}</b>
          <button className="grid size-11 place-items-center rounded-[10px] border border-line text-xl font-bold" onClick={() => save(s.tables + 1)} aria-label="+">+</button>
        </div>
        <p className="text-xs text-muted">{t(L, "tablesH")}</p>
      </CardContent>
    </Card>
  );
}

function DevicesCard() {
  const { s } = useStore();
  const L = s.lang;
  const [saved, setSaved] = useState<string | null>(btSavedName());
  const [prefs, setPrefs] = useState(btPrefs());
  const [busy, setBusy] = useState(false);

  if (!btSupported()) {
    return <p className="rounded-xl bg-canvas p-3 text-xs text-muted">{t(L, "btSupport")}</p>;
  }

  const connect = async (test: boolean) => {
    setBusy(true);
    try {
      if (test) {
        await btTestPrint();
        setSaved(btSavedName());
        toast.success(t(L, "btTest"));
      } else {
        const name = await btPair();
        setSaved(name);
        toast.success(`${t(L, "btConnected")}: ${name}`);
      }
    } catch (e) {
      toast.error(btErrorMessage(e, L));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[13px]">{t(L, "btTitle")}</b>
        {saved
          ? <Badge tone="ok">{t(L, "btSaved")}: {saved}</Badge>
          : <Badge>{t(L, "btConnect")}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} onClick={() => connect(false)}>{t(L, "btConnect")}</Button>
        <Button size="sm" variant="outline" loading={busy} onClick={() => connect(true)}>{t(L, "btTest")}</Button>
        {saved && <Button size="sm" variant="ghost" onClick={() => { btForget(); setSaved(null); }}>{t(L, "btForget")}</Button>}
        <label className="ms-auto flex items-center gap-2 text-xs">
          {t(L, "paperW")}
          <select value={prefs.paper} onChange={(e) => {
            const p = { ...prefs, paper: (Number(e.target.value) === 80 ? 80 : 58) as 58 | 80 };
            setPrefs(p); btSavePrefs(p);
          }} className="h-9 rounded-lg border border-line bg-surface px-2">
            <option value={58}>58mm</option>
            <option value={80}>80mm</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={prefs.latin} onChange={(e) => {
            const p = { ...prefs, latin: e.target.checked };
            setPrefs(p); btSavePrefs(p);
          }} className="size-4 accent-[var(--color-growth)]" />
          {t(L, "btLatin")}
        </label>
      </div>
      <p className="text-[11px] text-muted">{t(L, "btHow")}</p>
    </div>
  );
}

function PasswordForm() {
  const { s } = useStore();
  const L = s.lang;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-3 rounded-xl bg-canvas p-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        await api.changePassword(cur, next);
        setCur(""); setNext("");
        toast.success(t(L, "pwChanged"));
      } catch (ex) {
        toast.error(ex instanceof ApiError && ex.status === 401 ? t(L, "pwBadCur") : t(L, "pwFail"));
      } finally { setBusy(false); }
    }}>
      <b className="text-[13px]">{t(L, "pwTitle")}</b>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={t(L, "pwCur")} id="pw0"><Input id="pw0" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label={t(L, "pwNew")} id="pw1"><Input id="pw1" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <Button size="sm" type="submit" loading={busy} className="w-fit">{t(L, "pwSave")}</Button>
    </form>
  );
}

function Toggle({ label, on, onFlip }: { label: string; on: boolean; onFlip: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <button role="switch" aria-checked={on} onClick={onFlip} aria-label={label}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-growth" : "bg-line"}`}>
        <span aria-hidden className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? "inset-inline-end-1" : "inset-inline-start-1"}`} />
      </button>
    </div>
  );
}
