import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, todayKey, useStore, attSummary, laborFor, FULL_DAY_HOURS, type AttStatus, type Role } from "../store";
import { api, type ApiEmployee } from "../api";
import { connected } from "../auth";
import { t, type TKey } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, cn } from "../ui";

// 7. العمال: سجل + حضور يومي (دوام كامل/جزئي/غياب) + رواتب بالأيام + تقارير الحضور.
const ROLE_KEY: Record<Role, TKey> = { owner: "roleOwner", manager: "roleManager", cashier: "roleCashier", cook: "roleCook" };
const ATT_KEY: Record<AttStatus, TKey> = { full: "attFull", half: "attHalf", absent: "attAbsent" };

const toLocalEmp = (e: ApiEmployee) => ({ id: e.id, name: e.name, role: e.role as Role, rate: e.hourlyRate, hired: e.hiredAt.slice(0, 10) });

export default function Staff() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [rate, setRate] = useState("300");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [serverSalaries, setServerSalaries] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!connected()) return;
    (async () => {
      try {
        const [emps, att] = await Promise.all([api.employees(), api.attList()]);
        update((p) => ({
          ...p,
          employees: emps.map(toLocalEmp),
          att: att.map((a) => ({ id: a.id, emp: a.employeeId, date: a.date, status: a.status })),
        }));
        const sal = await api.salaries();
        setServerSalaries(Object.fromEntries(sal.map((x) => [x.employee.id, x.total])));
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

  const salary = (empId: string) => {
    if (serverSalaries && empId in serverSalaries) return serverSalaries[empId];
    const e = s.employees.find((x) => x.id === empId)!;
    return laborFor(s.att.filter((a) => a.emp === empId), [e]);
  };

  const addEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (connected()) {
      if (phone.trim().length < 7 || password.length < 6) { toast.error(t(L, "empNeedAccount")); return; }
      try {
        const r = await api.createEmployeeAccount({ name: name.trim(), phone: phone.trim(), password, role, hourlyRate: Number(rate) || 0 });
        const list = await api.employees();
        update((p) => ({ ...p, employees: list.map(toLocalEmp) }));
        setName(""); setPhone(""); setPassword("");
        void r;
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, employees: [...p.employees, { id: `e${Date.now()}`, name: name.trim(), role, rate: Number(rate) || 0, hired: todayKey() }] }));
    setName("");
  };

  return (
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
                <Field label={t(L, "hourlyRate")} id="rt"><Input id="rt" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
              </div>
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
                    <span className="font-medium">{e.name} <span className="text-xs font-normal text-muted">({t(L, ROLE_KEY[e.role])})</span></span>
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
          <ul className="flex flex-col">
            {s.employees.map((e) => {
              const sm = attSummary(s.att, e.id);
              return (
                <li key={e.id} className="flex items-center gap-3 border-t border-line py-3 text-sm first:border-0 first:pt-0">
                  <span className="flex-1"><b className="block">{e.name}</b>
                    <span className="tnum text-xs text-muted">
                      <span className="tnum">{fmtDzd(e.rate * FULL_DAY_HOURS)}</span> {t(L, "perDay")} ·
                      <span className="tnum"> {sm.full}</span> {t(L, "attFull")} ·
                      <span className="tnum"> {sm.half}</span> {t(L, "attHalf")} ·
                      <span className="tnum"> {sm.absent}</span> {t(L, "attAbsent")}
                    </span></span>
                  <Badge tone="ok"><span className="tnum">{fmtDzd(salary(e.id))}</span></Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
