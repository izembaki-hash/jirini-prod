import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { ApiError, api } from "../api";
import { t } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Steps, cn } from "../ui";

// صفحة الدفع بعد إدخال معلومات النشاط — خطة + دورة + تحويل لـSofizPay.
const PLANS = [
  { id: "starter" as const, branches: 1, hot: false,
    featsAr: ["نقطة بيع لمسية", "مخزون ومنتجات", "عمال ورواتب", "تقارير أساسية", "حساب الأرباح"],
    featsFr: ["Caisse tactile", "Stock et produits", "Personnel", "Rapports de base", "Calcul des bénéfices"] },
  { id: "pro" as const, branches: 2, hot: true,
    featsAr: ["كل ميزات الستارتر", "طلبات الزبائن QR", "التوصيل", "مخطط النمو المالي"],
    featsFr: ["Tout Starter", "Commandes QR", "Livraison", "Plan de croissance"] },
  { id: "mega" as const, branches: 5, hot: false,
    featsAr: ["كل ميزات البرو", "حتى 5 فروع", "حركة المخزون بين الفروع", "دعم مخصّص"],
    featsFr: ["Tout Pro", "Jusqu'à 5 branches", "Mouvements inter-branches", "Support dédié"] },
];
const PRICES = { starter: 2500, pro: 3000, mega: 4500 } as const;

export default function Checkout() {
  const { s } = useStore();
  const L = s.lang;
  const [q] = useSearchParams();
  const nav = useNavigate();
  const tenantId = q.get("tenantId") ?? "";
  const slug = q.get("slug") ?? "";
  const type = q.get("type") === "shop" ? "shop" : "restaurant";
  const businessName = q.get("name") ?? "";
  const phone = q.get("phone") ?? "";
  const initEmail = q.get("email") ?? "";
  const [plan, setPlan] = useState<"starter" | "pro" | "mega">(s.plan || "pro");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [months, setMonths] = useState("1");
  const [email, setEmail] = useState(initEmail);
  const [fullName] = useState(businessName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!tenantId || !slug) {
    return (
      <div className="mx-auto grid min-h-[60dvh] max-w-[520px] place-items-center px-4 text-center">
        <Card className="w-full"><CardContent className="flex flex-col gap-3 p-8">
          <h1 className="text-xl font-bold">{t(L, "cpNeedInfo")}</h1>
          <p className="text-sm text-muted">{t(L, "cpNeedInfoH")}</p>
          <Link to="/"><Button>{t(L, "back")}</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  const monthlyPrice = PRICES[plan];
  const yearlyTotal = monthlyPrice * 10;
  const monthlyTotal = monthlyPrice * Math.max(1, Number(months) || 1);
  const amount = cycle === "yearly" ? yearlyTotal : monthlyTotal;
  const isYearly = cycle === "yearly";
  const finalMonths = isYearly ? 12 : Math.max(1, Number(months) || 1);

  const pay = async () => {
    setErr("");
    if (!email.includes("@")) { setErr(t(L, "billEmail")); return; }
    setBusy(true);
    try {
      const r = await api.publicCheckout({
        tenantId,
        plan,
        months: finalMonths,
        cycle,
        email,
        fullName,
      });
      // حوّل لصفحة CIB/Edahabia
      window.location.href = r.paymentUrl;
    } catch (ex) {
      setErr(ex instanceof ApiError
        ? ex.status === 502 ? `${t(L, "errSaving")} (${ex.code})`
        : ex.status === 501 ? t(L, "billNotConf")
        : `${t(L, "errSaving")} (${ex.code})`
        : t(L, "eConn"));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:py-8">
      <Steps current={1} steps={[t(L, "stInfo"), t(L, "stPay"), t(L, "stPwd")]} />
      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr]">
        {/* عمود الخطط */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-growth-deep">{t(L, "activityIs")} {t(L, type)} · {businessName}</p>
          <h1 className="text-2xl font-bold md:text-3xl">{t(L, "cpChoosePlan")}</h1>
          <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label={t(L, "cpChoosePlan")}>
            {PLANS.map((p) => {
              const active = plan === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                  role="radio" aria-checked={active}
                  className={cn("btn-press relative touch-manipulation rounded-2xl border p-4 text-start transition-[border-color,background-color,box-shadow,transform] duration-150",
                    active ? "border-growth bg-growth/5 shadow-[0_0_0_1px_var(--color-growth)]" : "border-line bg-surface hover:border-line-strong")}>
                  {p.hot && <Badge tone="ok">{t(L, "mostPicked")}</Badge>}
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold">{L === "ar" ? (p.id === "starter" ? "ستارتر" : p.id === "pro" ? "برو" : "ميغا") : p.id}</span>
                    <span className="tnum text-lg font-bold text-growth-deep">{PRICES[p.id]} <span className="text-xs font-normal text-muted">{t(L, "billPerMonth")}</span></span>
                  </div>
                  <p className="text-xs text-muted">{p.branches} {L === "ar" ? "فروع" : "branches"}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs">
                    {(L === "ar" ? p.featsAr : p.featsFr).map((f, i) => (
                      <li key={i} className="flex gap-1.5"><span aria-hidden className="text-growth">✓</span><span>{f}</span></li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* عمود الدفع */}
        <Card>
          <CardHeader><CardTitle>{t(L, "cpPayTitle")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Toggle شهري/سنوي */}
            <div role="group" aria-label="cycle" className="mx-auto inline-flex items-center rounded-full border border-line bg-surface p-1">
              <button type="button" onClick={() => setCycle("monthly")} aria-pressed={cycle === "monthly"}
                className={cn("rounded-full px-5 py-1.5 text-sm font-bold transition",
                  cycle === "monthly" ? "bg-growth text-white shadow" : "text-muted")}>
                {t(L, "billCycleMonthly")}
              </button>
              <button type="button" onClick={() => setCycle("yearly")} aria-pressed={cycle === "yearly"}
                className={cn("flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-bold transition",
                  cycle === "yearly" ? "bg-growth text-white shadow" : "text-muted")}>
                {t(L, "billCycleYearly")}
                <span className={cn("tnum rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                  cycle === "yearly" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800")}>
                  {t(L, "billYearlySave")}
                </span>
              </button>
            </div>

            {cycle === "monthly" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold">{t(L, "billMonths")}</label>
                <select value={months} onChange={(e) => setMonths(e.target.value)}
                  className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm">
                  {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {t(L, "monthU")}</option>)}
                </select>
              </div>
            )}

            {/* ملخص السعر */}
            <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-canvas px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted">{t(L, "billTotalPay")}</span>
                <span className="tnum text-2xl font-extrabold text-growth-deep">{amount.toLocaleString("fr-DZ")} {L === "ar" ? "دج" : "DA"}</span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{cycle === "yearly" ? t(L, "billBilledOnce") : `${monthlyPrice} × ${finalMonths}`}</span>
                {cycle === "yearly" && <span className="tnum font-bold text-amber-700">−{(monthlyPrice * 2).toLocaleString("fr-DZ")}</span>}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold">{t(L, "cpEmail")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr"
                className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm"
                placeholder="you@example.com" />
              <span className="text-xs text-muted">{t(L, "cpEmailHint")}</span>
            </div>

            {err && <p role="alert" className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{err}</p>}

            <div className="sticky bottom-0 -mx-1 bg-surface/95 py-2 backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:backdrop-none">
              <Button size="lg" loading={busy} onClick={pay} className="w-full">
                {t(L, "cpPayBtn")} · <span className="tnum ms-1">{amount.toLocaleString("fr-DZ")} {L === "ar" ? "دج" : "DA"}</span>
              </Button>
            </div>
            <p className="-mt-2 text-center text-xs text-muted">{t(L, "cpSecure")}</p>

            <div className="rounded-[10px] border border-line bg-canvas px-3 py-2 text-xs text-muted">
              <p className="font-bold text-ink">{t(L, "cpSummary")}</p>
              <p>· {L === "ar" ? "النشاط" : "Activité"}: <b className="text-ink">{businessName}</b></p>
              <p>· {L === "ar" ? "المعرّف" : "Slug"}: <b className="tnum text-ink">{slug}</b></p>
              <p>· {L === "ar" ? "الهاتف" : "Téléphone"}: <b className="tnum text-ink" dir="ltr">{phone}</b></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
