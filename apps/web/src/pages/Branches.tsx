import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fmtDzd, useStore, displayName } from "../store";
import { ApiError, api } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input } from "../ui";

// 9. الفروع: إضافة ضمن حد الخطة + مقارنة + نقل مخزون.
const LIMIT: Record<string, number> = { starter: 1, pro: 2, mega: 99 };

export default function Branches() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [movePid, setMovePid] = useState("");
  const [moveQty, setMoveQty] = useState("5");
  const limit = LIMIT[s.plan];
  const sales = s.orders.filter((o) => o.status !== "cancelled").reduce((x, o) => x + o.total, 0);

  useEffect(() => {
    if (!connected()) return;
    api.branchesList().then((list) => update((p) => ({
      ...p,
      branches: list.map((b) => b.name),
      branch: list[0]?.name ?? p.branch,
    }))).catch(() => null);
  }, [update]);

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (connected()) {
      try {
        const b = await api.branchesCreate({ name: name.trim() });
        update((p) => ({ ...p, branches: [...p.branches, b.name] }));
      } catch (ex) {
        toast.error(ex instanceof ApiError && ex.status === 403 ? t(L, "brUpgradeH") : t(L, "errSaving"));
        return;
      }
    } else {
      update((p) => ({ ...p, branches: [...p.branches, name.trim()] }));
    }
    setName("");
  };

  if (s.plan === "starter") {
    return (
      <Empty title={t(L, "brOnePlan")}
        hint={t(L, "brUpgradeH")}
        action={<Link to="/app/settings"><Button>{t(L, "upgradePlan")}</Button></Link>} />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{t(L, "branchesN")} ({s.branches.length}/{limit === 99 ? "∞" : limit})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {s.branches.map((b) => (
              <li key={b} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm">
                <b className="flex-1">{b}</b>
                <span className="tnum font-bold text-growth-deep">{fmtDzd(sales / s.branches.length)}</span>
              </li>
            ))}
          </ul>
          {s.branches.length < limit && (
            <form className="flex gap-2" onSubmit={addBranch}>
              <Field label={t(L, "newBranch")} id="br"><Input id="br" value={name} onChange={(e) => setName(e.target.value)} placeholder={t(L, "brEx")} /></Field>
              <Button type="submit" className="mt-7">{t(L, "add")}</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>{t(L, "moveTitle")}</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            const q = Number(moveQty) || 0;
            if (!movePid || q <= 0) return;
            update((p) => ({ ...p, products: p.products.map((x) => x.id === movePid ? { ...x, qty: Math.max(0, x.qty - q) } : x) }));
            toast.success(t(L, "moveDone"));
          }}>
            <Field label={t(L, "prodLb")} id="mp">
              <select id="mp" value={movePid} onChange={(e) => setMovePid(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                <option value="">{t(L, "chooseEll")}</option>
                {s.products.map((p) => <option key={p.id} value={p.id}>{displayName(p, L)} ({p.qty})</option>)}
              </select>
            </Field>
            <Field label={t(L, "pQty")} id="mq"><Input id="mq" inputMode="numeric" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /></Field>
            <Button type="submit">{t(L, "confirmMove")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
