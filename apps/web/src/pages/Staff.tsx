import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, todayKey, useStore, type Role } from "../store";
import { api, type ApiEmployee } from "../api";
import { connected } from "../auth";
import { t, type TKey } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "../ui";

// 7. العمال: سجل + حضور يدوي + رواتب بالساعة الفعلية + أوفر تايم اختياري.
const ROLE_KEY: Record<Role, TKey> = { owner: "roleOwner", manager: "roleManager", cashier: "roleCashier", cook: "roleCook" };

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
          att: att.map((a) => ({ id: a.id, emp: a.employeeId, date: a.date, inAt: a.inAt, outAt: a.outAt, ot: a.overtimeMin })),
        }));
        const sal = await api.salaries();
        setServerSalaries(Object.fromEntries(sal.map((x) => [x.employee.id, x.total])));
      } catch { /* يبقى المحلي */ }
    })();
  }, [update]);

  const checkIn = async (emp: string) => {
    if (connected()) {
      try {
        const a = await api.attIn(emp);
        update((p) => ({ ...p, att: [...p.att, { id: a.id, emp: a.employeeId, date: a.date, inAt: a.inAt, outAt: null, ot: 0 }] }));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, att: [...p.att, { id: `a${Date.now()}`, emp, date: todayKey(), inAt: new Date().toISOString(), outAt: null, ot: 0 }] }));
  };
  const checkOut = async (id: string) => {
    if (connected()) {
      try {
        const a = await api.attOut(id);
        update((p) => ({ ...p, att: p.att.map((x) => (x.id === id ? { ...x, outAt: a.outAt } : x)) }));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, att: p.att.map((a) => (a.id === id ? { ...a, outAt: new Date().toISOString() } : a)) }));
  };

  const salary = (empId: string) => {
    if (serverSalaries && empId in serverSalaries) return serverSalaries[empId];
    const e = s.employees.find((x) => x.id === empId)!;
    return s.att.filter((a) => a.emp === empId && a.outAt).reduce((sum, a) => {
      const h = (new Date(a.outAt!).getTime() - new Date(a.inAt).getTime()) / 3_600_000;
      const ot = s.overtimeOn ? a.ot / 60 : 0;
      return sum + Math.max(0, h - ot) * e.rate + ot * e.rate * 1.5;
    }, 0);
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
            <ul className="flex flex-col gap-2 text-sm">
              {s.employees.map((e) => {
                const open = s.att.find((a) => a.emp === e.id && a.date === todayKey() && !a.outAt);
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{e.name} <span className="text-xs text-muted">({t(L, ROLE_KEY[e.role])})</span></span>
                    {open ? (
                      <Button size="sm" variant="outline" onClick={() => checkOut(open.id)}>{t(L, "checkOutB")} {new Date(open.inAt).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" })}</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => checkIn(e.id)}>{t(L, "checkInB")}</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t(L, "salariesT")} {t(L, "salariesSub")}{s.overtimeOn ? t(L, "otSuffix") : ""})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {s.employees.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-t border-line py-3 text-sm first:border-0 first:pt-0">
                <span className="flex-1"><b className="block">{e.name}</b>
                  <span className="tnum text-xs text-muted"><span className="tnum">{e.rate}</span> {t(L, "perHour")} · {s.att.filter((a) => a.emp === e.id).length} {t(L, "recordsU")}</span></span>
                <Badge tone="ok"><span className="tnum">{fmtDzd(salary(e.id))}</span></Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
