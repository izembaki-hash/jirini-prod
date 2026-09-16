import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fmtDzd, profitOf, useStore, laborFor } from "../store";
import { api } from "../api";
import { connected } from "../auth";
import { t, type Lang } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input, Progress } from "../ui";

// 10. مخطط النمو المالي: هدف + تحليل الربح الشهري + خطة ادخار + شريط تقدم + مراحل.
type PresetKey = "gBranch" | "gCar" | "gEquip" | "gFree";
const GOAL_PRESETS: PresetKey[] = ["gBranch", "gCar", "gEquip", "gFree"];
const PRESET_AR: Record<PresetKey, string> = { gBranch: "فتح فرع جديد", gCar: "شراء سيارة توصيل", gEquip: "شراء معدات", gFree: "هدف حر" };
const presetAr = (k: PresetKey) => PRESET_AR[k];
const goalName = (title: string, L: Lang) => {
  const hit = (Object.keys(PRESET_AR) as PresetKey[]).find((k) => PRESET_AR[k] === title);
  return hit && L === "fr" ? t(L, hit) : title;
};

export default function Growth() {
  const { s, update } = useStore();
  const L = s.lang;
  const [title, setTitle] = useState(presetAr("gBranch"));
  const [target, setTarget] = useState("1500000");
  const [monthly, setMonthly] = useState("120000");

  useEffect(() => {
    if (!connected()) return;
    api.goalsList().then((list) => update((p) => ({
      ...p,
      goals: list.map((g) => ({ id: g.id, title: g.title, target: g.target, saved: g.saved, monthly: g.monthly })),
    }))).catch(() => null);
  }, [update]);

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connected()) {
      try {
        const g = await api.goalsCreate({ title, target: Number(target) || 0, monthly: Number(monthly) || 0 });
        update((p) => ({ ...p, goals: [{ id: g.id, title: g.title, target: g.target, saved: g.saved, monthly: g.monthly }, ...p.goals] }));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, goals: [{ id: `g${Date.now()}`, title, target: Number(target) || 0, saved: 0, monthly: Number(monthly) || 0 }, ...p.goals] }));
  };

  const deposit = async (id: string) => {
    const goal = s.goals.find((x) => x.id === id);
    if (!goal) return;
    const saved = Math.min(goal.target, goal.saved + goal.monthly);
    if (connected()) {
      try {
        await api.goalsUpdate(id, { saved });
        update((prev) => ({ ...prev, goals: prev.goals.map((x) => (x.id === id ? { ...x, saved } : x)) }));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((prev) => ({ ...prev, goals: prev.goals.map((x) => (x.id === id ? { ...x, saved } : x)) }));
  };

  const remove = async (id: string) => {
    if (connected()) {
      try { await api.goalsDelete(id); }
      catch { toast.error(t(L, "errSaving")); return; }
    }
    update((prev) => ({ ...prev, goals: prev.goals.filter((x) => x.id !== id) }));
  };

  if (s.plan === "starter") {
    return (
      <Empty title={t(L, "growthGateT")}
        hint={t(L, "growthGateH")}
        action={<Link to="/app/settings"><Button>{t(L, "upgradePlan")}</Button></Link>} />
    );
  }

  const monthOrders = s.orders.filter((o) => Date.now() - new Date(o.at).getTime() < 30 * 86_400_000);
  const monthCut = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  // صافي شهري حقيقي: مجمل − مصاريف ثابتة − عمالة الفترة
  const avgProfit = Math.round(
    profitOf(monthOrders.length ? monthOrders : s.orders, s.products)
    - s.overheads.filter((o) => o.active).reduce((x, o) => x + o.monthly, 0)
    - s.employees.reduce((sum, e) => sum + laborFor(s.att.filter((a) => a.emp === e.id && a.date >= monthCut), [e]), 0),
  );
  const g = s.goals[0];
  const pct = g ? Math.min(100, (g.saved / g.target) * 100) : 0;
  const months = g && g.monthly > 0 ? Math.ceil((g.target - g.saved) / g.monthly) : Infinity;
  const milestone = pct >= 100 ? t(L, "msDone") : pct >= 75 ? t(L, "ms75") : pct >= 50 ? t(L, "ms50") : pct >= 25 ? t(L, "ms25") : t(L, "msStart");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t(L, "newGoal")}</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={saveGoal}>
            <Field label={t(L, "goalLb")} id="gt">
              <select id="gt" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm font-semibold">
                {GOAL_PRESETS.map((k) => <option key={k} value={presetAr(k)}>{t(L, k)}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t(L, "estCost")} id="gc"><Input id="gc" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
              <Field label={t(L, "monthlySave")} id="gm"><Input id="gm" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
            </div>
            <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
              {t(L, "avgProfitM")} <b className="tnum">{fmtDzd(avgProfit)}</b> —
              {t(L, "suggestedIs")} <b className="tnum">{avgProfit > 0 ? Math.round(((Number(monthly) || 0) / avgProfit) * 100) : 0}%</b>
            </p>
            <Button type="submit">{t(L, "saveGoal")}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {s.goals.length === 0 && <Empty title={t(L, "noGoals")} hint={t(L, "noGoalsH")} />}
        {s.goals.map((goal) => {
          const p = Math.min(100, (goal.saved / goal.target) * 100);
          return (
            <Card key={goal.id}>
              <CardContent className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-2">
                  <b className="flex-1">{goalName(goal.title, L)}</b>
                  <Badge tone={p >= 100 ? "ok" : p >= 50 ? "warn" : undefined}>{milestone}</Badge>
                </div>
                <p className="tnum text-2xl font-bold"><span className="tnum">{fmtDzd(goal.saved)}</span> <span className="text-sm font-normal text-muted">/ {fmtDzd(goal.target)}</span></p>
                <Progress value={p} />
                <p className="tnum text-xs text-muted">{Math.round(p)}% · {goal.monthly > 0 ? `${t(L, "monthsLeft")}: ${Math.ceil((goal.target - goal.saved) / goal.monthly)} (${fmtDzd(goal.monthly)}/${t(L, "monthU")})` : t(L, "setMonthly")}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => deposit(goal.id)}>
                    {t(L, "depositM")} {fmtDzd(goal.monthly)}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(goal.id)}>{t(L, "del")}</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {g && <p className="text-center text-xs text-muted">{t(L, "etaFirst")} {months === Infinity ? "—" : `${months} ${t(L, "monthU")}`}</p>}
      </div>
    </div>
  );
}
