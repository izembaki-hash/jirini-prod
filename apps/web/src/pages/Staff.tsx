import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PencilSimple, Trash, X } from "@phosphor-icons/react";
import { fmtDzd, todayKey, useStore, attSummary, laborFor, type Advance, type AttStatus, type Employee, type Role } from "../store";
import { api, APP_PAGES, type ApiEmployee, type ApiLoginUser } from "../api";
import { connected, useAuth } from "../auth";
import { t, type TKey } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, cn } from "../ui";

// 7. العمال: سجل + مسمى حر + حضور يومي (كامل/جزئي/غياب) + أجر الجزئي أساساً (الكامل ×2) + سلف = صافي.
const ROLE_KEY: Record<Role, TKey> = { owner: "roleOwner", manager: "roleManager", cashier: "roleCashier", cook: "roleCook" };
const ATT_KEY: Record<AttStatus, TKey> = { full: "attFull", half: "attHalf", absent: "attAbsent" };

const toLocalEmp = (e: ApiEmployee): Employee => ({
  id: e.id, name: e.name, role: e.role as Role, title: e.title ?? undefined,
  half: e.halfWage ?? 0, hired: e.hiredAt.slice(0, 10),
});
const toLocalAdv = (a: { id: string; employeeId: string; amount: number; date: string; note: string | null }): Advance => ({
  id: a.id, emp: a.employeeId, amount: a.amount, date: a.date, note: a.note ?? undefined,
});

export default function Staff() {
  const { s, update } = useStore();
  const { session } = useAuth();
  const L = s.lang;
  const isOwner = !!session && session.role === "owner";
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [title, setTitle] = useState("");
  const [half, setHalf] = useState("1000");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [serverSalaries, setServerSalaries] = useState<Record<string, number> | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [openAdv, setOpenAdv] = useState<string | null>(null);
  const [advAmt, setAdvAmt] = useState("");
  const [advNote, setAdvNote] = useState("");
  const [accounts, setAccounts] = useState<ApiLoginUser[]>([]);
  const [freshPin, setFreshPin] = useState<{ userId: string; pin: string } | null>(null);
  const [pagesBusy, setPagesBusy] = useState<string | null>(null);

  const empName = (e: Employee) => e.title?.trim() ? e.title : `${e.name}`;
  const titles = Array.from(new Set([
    ...s.employees.map((e) => e.title?.trim()).filter(Boolean) as string[],
    ...((Object.keys(ROLE_KEY) as Role[]).map((r) => t(L, ROLE_KEY[r]))),
  ]));

  useEffect(() => {
    if (!connected()) return;
    (async () => {
      try {
        const [emps, att, advs] = await Promise.all([api.employees(), api.attList(), api.advancesList()]);
        update((p) => ({
          ...p,
          employees: emps.map(toLocalEmp),
          att: att.map((a) => ({ id: a.id, emp: a.employeeId, date: a.date, status: a.status })),
          advances: advs.map(toLocalAdv),
        }));
        const sal = await api.salaries();
        setServerSalaries(Object.fromEntries(sal.map((x) => [x.employee.id, x.total])));
        try {
          const users = await api.loginUsers();
          setAccounts(users);
        } catch { /* المدراء بلا صلاحية — يُخفى القسم */ }
      } catch { /* يبقى المحلي */ }
    })();
  }, [update]);

  // تسجيل يومي واحد لكل موظف/يوم (upsert) — متصل أو محلي بنفس القاعدة.
  const mark = async (emp: string, status: AttStatus, date: string = todayKey()) => {
    if (connected()) {
      try {
        const a = await api.attMark(emp, status, date);
        update((p) => ({
          ...p,
          att: [...p.att.filter((x) => !(x.emp === a.employeeId && x.date === a.date)),
            { id: a.id, emp: a.employeeId, date: a.date, status: a.status }],
        }));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({
      ...p,
      att: [...p.att.filter((x) => !(x.emp === emp && x.date === date)),
        { id: `a${Date.now()}`, emp, date, status }],
    }));
  };

  const wageOf = (empId: string) => {
    if (serverSalaries && empId in serverSalaries) return serverSalaries[empId];
    const e = s.employees.find((x) => x.id === empId)!;
    return laborFor(s.att.filter((a) => a.emp === empId), [e]);
  };
  const advTotal = (empId: string) => s.advances.filter((a) => a.emp === empId).reduce((x, a) => x + a.amount, 0);

  const addEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const hw = Math.max(0, Number(half) || 0);
    const ttl = title.trim() || undefined;
    if (connected()) {
      if (phone.trim().length < 7 || password.length < 6) { toast.error(t(L, "empNeedAccount")); return; }
      try {
        const r = await api.createEmployeeAccount({ name: name.trim(), phone: phone.trim(), password, role, title: ttl, halfWage: hw });
        const [list, users] = await Promise.all([api.employees(), api.loginUsers().catch(() => null)]);
        update((p) => ({ ...p, employees: list.map(toLocalEmp) }));
        if (users) setAccounts(users);
        setName(""); setTitle(""); setPhone(""); setPassword("");
        void r;
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, employees: [...p.employees, { id: `e${Date.now()}`, name: name.trim(), role, title: ttl, half: hw, hired: todayKey() }] }));
    setName(""); setTitle("");
  };

  const addAdv = async (empId: string) => {
    const amt = Number(advAmt) || 0;
    if (amt <= 0) return;
    if (connected()) {
      try {
        const a = await api.advanceCreate({ employeeId: empId, amount: amt, note: advNote.trim() || undefined });
        update((p) => ({ ...p, advances: [toLocalAdv(a), ...p.advances] }));
      } catch { toast.error(t(L, "errSaving")); return; }
    } else {
      update((p) => ({ ...p, advances: [{ id: `ad${Date.now()}`, emp: empId, amount: amt, date: todayKey(), note: advNote.trim() || undefined }, ...p.advances] }));
    }
    setAdvAmt(""); setAdvNote("");
  };

  const delAdv = async (id: string) => {
    if (connected()) {
      try { await api.advanceDelete(id); } catch { toast.error(t(L, "errSaving")); return; }
    }
    update((p) => ({ ...p, advances: p.advances.filter((a) => a.id !== id) }));
  };

  const delEmp = async (e: Employee) => {
    if (!window.confirm(t(L, "empDelConfirm"))) return;
    if (connected()) {
      try { await api.employeeDelete(e.id); } catch { toast.error(t(L, "errSaving")); return; }
    }
    update((p) => ({
      ...p,
      employees: p.employees.filter((x) => x.id !== e.id),
      advances: p.advances.filter((a) => a.emp !== e.id),
      att: p.att.filter((a) => a.emp !== e.id),
    }));
    if (editing?.id === e.id) setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>{t(L, "newEmp")}</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={addEmp}>
              <Field label={t(L, "empName")} id="en"><Input id="en" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t(L, "empRole")} id="er">
                  <select id="er" value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm font-semibold">
                    {(Object.keys(ROLE_KEY) as Role[]).filter((r) => s.businessType === "restaurant" || r !== "cook").map((r) => <option key={r} value={r}>{t(L, ROLE_KEY[r])}</option>)}
                  </select>
                </Field>
                <Field label={t(L, "empTitle")} id="et" hint={t(L, "empTitleHint")}>
                  <Input id="et" value={title} onChange={(e) => setTitle(e.target.value)} list="emp-titles" autoComplete="off" />
                  <datalist id="emp-titles">{titles.map((x) => <option key={x} value={x} />)}</datalist>
                </Field>
              </div>
              <Field label={t(L, "halfWageLb")} id="hw" hint={t(L, "halfWageHint")}>
                <Input id="hw" inputMode="numeric" value={half} onChange={(e) => setHalf(e.target.value)} dir="ltr" />
              </Field>
              {connected() && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t(L, "empPhone")} id="ep"><Input id="ep" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" /></Field>
                  <Field label={t(L, "empPass")} id="epw"><Input id="epw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
                </div>
              )}
              <Button type="submit">{t(L, "add")}</Button>
            </form>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{t(L, "todayAtt")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {s.employees.map((e) => {
                const cur = s.att.find((a) => a.emp === e.id && a.date === todayKey())?.status;
                return (
                  <li key={e.id} className="flex flex-col gap-1.5">
                    <span className="font-medium">{empName(e)} <span className="text-xs font-normal text-muted">({t(L, ROLE_KEY[e.role])})</span></span>
                    <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-canvas p-1" role="radiogroup" aria-label={`${t(L, "todayAtt")} — ${e.name}`}>
                      {(Object.keys(ATT_KEY) as AttStatus[]).map((st) => (
                        <button
                          key={st} type="button" role="radio" aria-checked={cur === st}
                          onClick={() => mark(e.id, st)}
                          className={cn(
                            "btn-press min-h-10 touch-manipulation whitespace-nowrap rounded-lg px-2 text-[13px] font-bold transition-colors duration-150",
                            cur === st
                              ? st === "full" ? "bg-growth text-white shadow-sm"
                              : st === "half" ? "bg-hold text-ink shadow-sm"
                              : "bg-ember text-white shadow-sm"
                              : "text-muted hover:text-ink",
                          )}
                        >
                          {t(L, ATT_KEY[st])}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
              {s.employees.length === 0 && <li className="text-muted">{t(L, "noEmpHint")}</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t(L, "salariesT")} <span className="text-sm font-normal text-muted">{t(L, "salariesSub")})</span></CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {s.employees.map((e) => {
              const sm = attSummary(s.att, e.id);
              const wage = wageOf(e.id);
              const adv = advTotal(e.id);
              const net = wage - adv;
              const list = s.advances.filter((a) => a.emp === e.id);
              return (
                <li key={e.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex-1"><b className="block">{empName(e)}</b>
                      <span className="tnum text-xs text-muted">
                        <span className="tnum">{sm.full + sm.half}</span> {t(L, "workDays")} ·
                        <span className="tnum"> {sm.full}</span> {t(L, "attFull")} ·
                        <span className="tnum"> {sm.half}</span> {t(L, "attHalf")} ·
                        <span className="tnum"> {sm.absent}</span> {t(L, "attAbsent")}
                      </span></span>
                    <button onClick={() => setEditing(e)} aria-label={`${t(L, "editEmp")} ${e.name}`}
                      className="btn-press grid size-10 shrink-0 touch-manipulation place-items-center rounded-[10px] border border-line">
                      <PencilSimple size={17} aria-hidden />
                    </button>
                    <button onClick={() => delEmp(e)} aria-label={`${t(L, "del")} ${e.name}`}
                      className="btn-press grid size-10 shrink-0 touch-manipulation place-items-center rounded-[10px] border border-line text-ember">
                      <Trash size={17} aria-hidden />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-canvas px-2 py-2">
                      <span className="block text-[11px] text-muted">{t(L, "totalWage")}</span>
                      <b className="tnum text-sm">{fmtDzd(wage)}</b>
                    </div>
                    <div className="rounded-xl bg-canvas px-2 py-2">
                      <span className="block text-[11px] text-muted">{t(L, "totalAdv")}</span>
                      <b className={cn("tnum text-sm", adv > 0 ? "text-ember" : "")}>{fmtDzd(adv)}</b>
                    </div>
                    <div className="rounded-xl bg-growth/10 px-2 py-2">
                      <span className="block text-[11px] text-muted">{t(L, "netSalary")}</span>
                      <b className="tnum text-sm text-growth-deep">{fmtDzd(net)}</b>
                    </div>
                  </div>
                  <button onClick={() => { setOpenAdv(openAdv === e.id ? null : e.id); setAdvAmt(""); setAdvNote(""); }}
                    aria-expanded={openAdv === e.id}
                    className="w-fit rounded-lg text-xs font-bold text-growth-deep underline underline-offset-4">
                    {t(L, "advTitle")} ({list.length})
                  </button>
                  {openAdv === e.id && (
                    <div className="pop-in flex flex-col gap-2">
                      {list.length > 0 && (
                        <ul className="flex flex-col gap-1 text-sm">
                          {list.map((a) => (
                            <li key={a.id} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-1.5">
                              <span className="tnum flex-1"><b>{fmtDzd(a.amount)}</b> <span className="text-xs text-muted">{a.date}{a.note ? ` · ${a.note}` : ""}</span></span>
                              <button onClick={() => delAdv(a.id)} aria-label={`${t(L, "advDel")} ${fmtDzd(a.amount)}`}
                                className="btn-press grid size-9 place-items-center rounded-lg border border-line text-ember">
                                <Trash size={16} aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <Field label={t(L, "advAmount")} id={`aa-${e.id}`}>
                          <Input id={`aa-${e.id}`} inputMode="numeric" value={advAmt} onChange={(ev) => setAdvAmt(ev.target.value)} dir="ltr" placeholder="5000" />
                        </Field>
                        <Field label={t(L, "advNote")} id={`an-${e.id}`}>
                          <Input id={`an-${e.id}`} value={advNote} onChange={(ev) => setAdvNote(ev.target.value)} />
                        </Field>
                        <Button size="sm" onClick={() => addAdv(e.id)} className="min-h-11">{t(L, "advAdd")}</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {s.employees.length === 0 && <li className="text-sm text-muted">{t(L, "noEmpHint")}</li>}
          </ul>
        </CardContent>
      </Card>
    </div>

      {isOwner && connected() && (
        <AccessCard
          employees={s.employees}
          accounts={accounts}
          freshPin={freshPin}
          pagesBusy={pagesBusy}
          onTogglePage={async (userId, page, list) => {
            const next = list === null ? [page] : list.includes(page) ? list.filter((p) => p !== page) : [...list, page];
            setPagesBusy(userId);
            try {
              const r = await api.userPagesUpdate(userId, next.length === APP_PAGES.length ? null : next);
              setAccounts((a) => a.map((u) => (u.id === userId ? { ...u, pages: r.pages } : u)));
              toast.success(t(L, "pinSaved"));
            } catch { toast.error(t(L, "errSaving")); }
            finally { setPagesBusy(null); }
          }}
          onSetAll={async (userId, all) => {
            setPagesBusy(userId);
            try {
              const r = await api.userPagesUpdate(userId, all ? null : []);
              setAccounts((a) => a.map((u) => (u.id === userId ? { ...u, pages: r.pages } : u)));
              toast.success(t(L, "pinSaved"));
            } catch { toast.error(t(L, "errSaving")); }
            finally { setPagesBusy(null); }
          }}
          onGenPin={async (userId) => {
            try {
              const r = await api.userPinCreate(userId);
              setFreshPin({ userId, pin: r.pin });
              setAccounts((a) => a.map((u) => (u.id === userId ? { ...u, hasPin: true } : u)));
            } catch { toast.error(t(L, "errSaving")); }
          }}
          onCopyPin={async (pin) => {
            try { await navigator.clipboard.writeText(pin); toast.success(t(L, "pinCopied")); }
            catch { toast.error(t(L, "errSaving")); }
          }}
        />
      )}

      {editing && (
        <EmpEditDialog
          key={editing.id}
          e={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            if (connected()) {
              try {
                const u = await api.updateEmployee(editing.id, patch);
                update((p) => ({ ...p, employees: p.employees.map((x) => (x.id === editing.id ? toLocalEmp(u) : x)) }));
              } catch { toast.error(t(L, "errSaving")); return false; }
            } else {
              update((p) => ({ ...p, employees: p.employees.map((x) => (x.id === editing.id ? { ...x, name: patch.name, title: patch.title ?? undefined, half: patch.half } : x)) }));
            }
            toast.success(t(L, "prodUpdated"));
            return true;
          }}
        />
      )}
    </div>
  );
}

// ─── صلاحيات الصفحات + الأكواد السرية (مالك فقط) ───
function AccessCard({ employees, accounts, freshPin, pagesBusy, onTogglePage, onSetAll, onGenPin, onCopyPin }: {
  employees: Employee[]; accounts: ApiLoginUser[];
  freshPin: { userId: string; pin: string } | null; pagesBusy: string | null;
  onTogglePage: (userId: string, page: string, list: string[] | null) => void;
  onSetAll: (userId: string, all: boolean) => void;
  onGenPin: (userId: string) => void; onCopyPin: (pin: string) => void;
}) {
  const { s } = useStore();
  const L = s.lang;
  const withAccount = employees
    .map((e) => ({ e, u: accounts.find((a) => a.employeeId === e.id) }))
    .filter((x) => x.u && x.u.role !== "owner");
  if (withAccount.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(L, "permT")}</CardTitle>
        <p className="text-xs text-muted">{t(L, "permHint")}</p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {withAccount.map(({ e, u }) => {
            const list = u!.pages;
            const all = list === null;
            return (
              <li key={e.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4">
                <div className="flex items-center gap-2">
                  <b className="flex-1">{e.name}</b>
                  <button onClick={() => onSetAll(u!.id, true)} disabled={pagesBusy === u!.id}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">{t(L, "permAll")}</button>
                  <button onClick={() => onSetAll(u!.id, false)} disabled={pagesBusy === u!.id}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">{t(L, "permNone")}</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label={`${t(L, "permT")} — ${e.name}`}>
                  {APP_PAGES.map((p) => {
                    const on = all || list.includes(p);
                    return (
                      <button
                        key={p} type="button" role="checkbox" aria-checked={on}
                        disabled={pagesBusy === u!.id}
                        onClick={() => onTogglePage(u!.id, p, list)}
                        className={cn(
                          "btn-press flex min-h-10 touch-manipulation items-center gap-2 rounded-[10px] border px-2.5 text-[13px] font-bold transition-colors disabled:opacity-50",
                          on ? "border-growth bg-growth/10 text-growth-deep" : "border-line text-muted",
                        )}
                      >
                        <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded border text-[10px]", on ? "border-growth bg-growth text-white" : "border-line-strong")}>
                          {on ? "✓" : ""}
                        </span>
                        {t(L, p as never)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2">
                  <span className="text-xs font-bold text-muted">{t(L, "pinT")}</span>
                  {freshPin?.userId === u!.id ? (
                    <>
                      <b className="tnum rounded-lg bg-surface px-3 py-1.5 text-xl tracking-[0.3em]" dir="ltr">{freshPin.pin}</b>
                      <button onClick={() => onCopyPin(freshPin.pin)}
                        className="btn-press rounded-lg bg-growth px-3 py-1.5 text-xs font-bold text-white">{t(L, "pinCopy")}</button>
                      <span className="w-full text-[11px] text-ember">{t(L, "pinShowOnce")}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted">{u!.hasPin ? "••••••" : t(L, "pinNone")}</span>
                      <button onClick={() => onGenPin(u!.id)}
                        className="btn-press ms-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold">
                        {u!.hasPin ? t(L, "pinRegen") : t(L, "pinGen")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── تعديل موظف (اسم/مسمى/أجر الجزئي) ───
function EmpEditDialog({ e, onClose, onSave }: {
  e: Employee; onClose: () => void;
  onSave: (patch: { name: string; title: string | null; half: number }) => Promise<boolean>;
}) {
  const { s } = useStore();
  const L = s.lang;
  const [name, setName] = useState(e.name);
  const [title, setTitle] = useState(e.title ?? "");
  const [half, setHalf] = useState(String(e.half));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onSave({ name: name.trim(), title: title.trim() || null, half: Math.max(0, Number(half) || 0) });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="dialog-scrim fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label={`${e.name}`}>
      <Card className="pop-in w-full max-w-[440px] rounded-b-none rounded-t-3xl sm:rounded-3xl">
        <div onClick={(ev) => ev.stopPropagation()}>
          <form onSubmit={submit} noValidate
            className="flex max-h-[92dvh] flex-col gap-3 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-lg font-bold">{e.name}</h2>
              <button type="button" onClick={onClose} aria-label={t(L, "close")}
                className="btn-press grid size-11 shrink-0 touch-manipulation place-items-center rounded-[10px] border border-line">
                <X size={20} aria-hidden />
              </button>
            </div>
            <Field label={t(L, "empName")} id="ee-name">
              <Input id="ee-name" value={name} onChange={(ev) => setName(ev.target.value)} autoFocus autoComplete="off" />
            </Field>
            <Field label={t(L, "empTitle")} id="ee-title" hint={t(L, "empTitleHint")}>
              <Input id="ee-title" value={title} onChange={(ev) => setTitle(ev.target.value)} autoComplete="off" />
            </Field>
            <Field label={t(L, "halfWageLb")} id="ee-half" hint={t(L, "halfWageHint")}>
              <Input id="ee-half" inputMode="numeric" value={half} onChange={(ev) => setHalf(ev.target.value)} dir="ltr" />
            </Field>
            <Button type="submit" size="lg" loading={busy}>{t(L, "editEmp")}</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
