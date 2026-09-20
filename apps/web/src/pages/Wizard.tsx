import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDzd, useStore } from "../store";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "../ui";
import { Receipt } from "../components/Receipt";

// معالج الإعداد الأولي: أول منتج + أول موظف (اختياري) + معاينة فاتورة.
export default function Wizard() {
  const { s, update } = useStore();
  const L = s.lang;
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [pname, setPname] = useState("");
  const [sell, setSell] = useState("500");
  const [buy, setBuy] = useState("250");
  const [emp, setEmp] = useState("");

  const addProduct = () => {
    if (!pname.trim()) return;
    update((p) => ({
      ...p,
      products: [...p.products, {
        id: `w${Date.now()}`, name: pname.trim(), nameFr: pname.trim(),
        buy: Number(buy) || 0, sell: Number(sell) || 0, qty: 20, min: 5,
        cat: "جديد", active: true,
      }],
    }));
    setStep(1);
  };
  const finishEmp = () => {
    if (emp.trim()) update((p) => ({ ...p, employees: [...p.employees, { id: `e${Date.now()}`, name: emp.trim(), role: "cashier", title: undefined, half: 1000, hired: new Date().toISOString().slice(0, 10) }] }));
    setStep(2);
  };

  const demo = s.orders[0];

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <p className="text-xs font-bold text-growth-deep">{t(L, "wStep")} {step + 1} {t(L, "wOf")}</p>
      <h1 className="mt-1 text-3xl font-bold">{t(L, "wReady")} {s.businessName}</h1>

      {step === 0 && (
        <Card className="mt-5"><CardHeader><CardTitle>{t(L, "wP1")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t(L, "wProdName")} id="wp"><Input id="wp" value={pname} onChange={(e) => setPname(e.target.value)} placeholder={s.businessType === "restaurant" ? "رشتة" : "عسل حر"} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t(L, "wBuy")} id="wb"><Input id="wb" inputMode="numeric" value={buy} onChange={(e) => setBuy(e.target.value)} /></Field>
              <Field label={t(L, "wSell")} id="ws"><Input id="ws" inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} /></Field>
            </div>
            <Button onClick={addProduct}>{t(L, "wSaveNext")}</Button>
          </CardContent>
        </Card>
      )}
      {step === 1 && (
        <Card className="mt-5"><CardHeader><CardTitle>{t(L, "wP2")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t(L, "wEmpName")} id="we" hint={t(L, "wEmpHint")}>
              <Input id="we" value={emp} onChange={(e) => setEmp(e.target.value)} placeholder={L === "ar" ? "سمير" : "Samir"} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={finishEmp} className="flex-1">{emp.trim() ? t(L, "wSaveCont") : t(L, "wSolo")}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {step === 2 && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="text-sm text-muted">{t(L, "wP3")}</p>
          {demo && <Receipt order={demo} shop={s.businessName} lang={L} />}
          <p className="tnum text-sm">{t(L, "wMargin")} {fmtDzd((Number(sell) || 0) - (Number(buy) || 0))} {t(L, "wPerUnit")}</p>
          <Button size="lg" onClick={() => { update((p) => ({ ...p, booted: true })); nav("/app"); }}>{t(L, "wEnter")}</Button>
        </div>
      )}
    </div>
  );
}
