import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, CardDesc, Field, Input } from "../ui";

// 1.2 نموذج معلومات النشاط (بدون عملة/منطقة — ثابتة).
export default function Signup() {
  const [q] = useSearchParams();
  const type = (q.get("type") === "shop" ? "shop" : "restaurant") as "restaurant" | "shop";
  const { s, update } = useStore();
  const L = s.lang;
  const nav = useNavigate();
  const [name, setName] = useState(s.businessName);
  const [phone, setPhone] = useState("0550 00 00 00");
  const [address, setAddress] = useState("الجزائر العاصمة");
  const [logo, setLogo] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setErr(t(L, "errName")); return; }
    if (!/^0[567]\d{8}$/.test(phone.replace(/\s/g, ""))) { setErr(t(L, "errPhone")); return; }
    update((p) => ({ ...p, businessName: name.trim(), businessType: type, booted: true }));
    nav("/plans");
  };

  return (
    <div className="mx-auto grid w-full max-w-[1000px] gap-6 px-4 py-10 md:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold text-growth-deep">{t(L, "activityIs")} {t(L, type)}</p>
        <h1 className="text-3xl font-bold md:text-4xl">{t(L, "sTitle")}</h1>
        <p className="max-w-[45ch] text-sm text-muted">{t(L, "sSub")}</p>
      </div>
      <Card><CardHeader><CardTitle>{t(L, "sCard")}</CardTitle><CardDesc>{t(L, "sStep")}</CardDesc></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label={t(L, "fName")} id="biz" error={err}>
              <Input id="biz" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(L, "fPhone")} id="phone" hint={t(L, "fPhoneHint")}>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" type="tel" autoComplete="tel" dir="ltr" />
              </Field>
              <Field label={t(L, "fAddr")} id="addr">
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
              </Field>
            </div>
            <Field label={t(L, "fLogo")} id="logo">
              <Input id="logo" type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setLogo(URL.createObjectURL(f));
              }} />
            </Field>
            {logo && <img src={logo} alt="logo" className="size-20 rounded-2xl border border-line object-cover" />}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">{t(L, "toPlans")}</Button>
              <Button type="button" variant="outline" onClick={() => nav("/")}>{t(L, "back")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
