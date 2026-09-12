import { useNavigate } from "react-router-dom";
import { useStore, type PlanId } from "../store";
import { t, type TKey } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from "../ui";

// 1.3 خطط الاشتراك — بدون تجربة مجانية.
const PLANS: { id: PlanId; branches: TKey; feats: TKey[]; missing: TKey[]; hot?: boolean }[] = [
  { id: "starter", branches: "br1",
    feats: ["fPos", "fStock", "fStaff", "fReports", "fProfit"],
    missing: ["xOnline", "xGrowth"] },
  { id: "pro", branches: "br2", hot: true,
    feats: ["fAllStarter", "fOnline", "fGrowth"],
    missing: [] },
  { id: "mega", branches: "br5",
    feats: ["fAllPro", "fBranchesFull", "fStockMove"],
    missing: [] },
];
const NAMES: Record<PlanId, string> = { starter: "ستارتر · Starter", pro: "برو · Pro", mega: "ميغا · Méga" };
const PRICES: Record<PlanId, number> = { starter: 2500, pro: 3000, mega: 4500 };

export default function Plans() {
  const { s, update } = useStore();
  const L = s.lang;
  const nav = useNavigate();
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <h1 className="text-3xl font-bold">{t(L, "pTitle")}</h1>
      <p className="mt-1 max-w-[60ch] text-sm text-muted">{t(L, "pSub")}</p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <Card key={p.id} style={{ animationDelay: `${i * 70}ms` }} className={cn("card-rise flex flex-col", s.plan === p.id && "border-growth ring-1 ring-growth")}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{NAMES[p.id]}</CardTitle>
                {p.hot && <Badge tone="ok">{t(L, "mostPicked")}</Badge>}
              </div>
              <p className="tnum text-2xl font-bold text-growth-deep">{PRICES[p.id]} {t(L, "perMonth")}</p>
              <p className="text-xs text-muted">{t(L, p.branches)}</p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              <ul className="flex flex-col gap-1.5 text-sm">
                {p.feats.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-growth">✓</span>{t(L, f)}</li>)}
                {p.missing.map((f) => <li key={f} className="flex gap-2 text-muted"><span aria-hidden>✗</span>{t(L, f)}</li>)}
              </ul>
              <Button className="mt-auto w-full" variant={s.plan === p.id ? "primary" : "outline"}
                onClick={() => { update((prev) => ({ ...prev, plan: p.id })); nav("/wizard"); }}>
                {s.plan === p.id ? t(L, "continueWith") : `${t(L, "choose")} ${NAMES[p.id].split(" ")[0]}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
