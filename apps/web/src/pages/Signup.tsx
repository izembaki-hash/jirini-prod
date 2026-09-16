import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { ApiError, api } from "../api";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, CardDesc, Field, Input, Steps } from "../ui";

// معلومات النشاط — تسبق الدفع. لا كلمة سر هنا (تُضبط بعد الدفع).
export default function Signup() {
  const [q] = useSearchParams();
  const type = (q.get("type") === "shop" ? "shop" : "restaurant") as "restaurant" | "shop";
  const { s } = useStore();
  const L = s.lang;
  const nav = useNavigate();
  const [name, setName] = useState(s.businessName || "");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("0550 00 00 00");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("الجزائر العاصمة");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 2) { setErr(t(L, "errName")); return; }
    if (ownerName.trim().length < 2) { setErr(t(L, "errOwnerName")); return; }
    if (!/^0[567]\d{8}$/.test(phone.replace(/\s/g, ""))) { setErr(t(L, "errPhone")); return; }
    if (email && !email.includes("@")) { setErr(t(L, "billEmail")); return; }
    setBusy(true);
    try {
      const r = await api.publicSignup({
        name: name.trim(),
        type,
        phone: phone.replace(/\s/g, ""),
        address: address.trim(),
        ownerName: ownerName.trim(),
        email: email.trim() || undefined,
        lang: L,
      });
      // انتقل إلى صفحة الدفع مع tenantId ليُهيّئ الدفع.
      const q = new URLSearchParams({
        tenantId: r.tenantId,
        slug: r.slug,
        phone: r.ownerPhone,
        email: email.trim(),
        name: name.trim(),
        type,
      });
      nav(`/checkout?${q.toString()}`);
    } catch (ex) {
      setErr(ex instanceof ApiError ? `${t(L, "errSaving")} (${ex.code})` : t(L, "eConn"));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1000px] content-start gap-6 px-4 py-6 sm:py-10 md:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-3">
        <Steps current={0} steps={[t(L, "stInfo"), t(L, "stPay"), t(L, "stPwd")]} />
        <p className="text-xs font-bold text-growth-deep">{t(L, "activityIs")} {t(L, type)}</p>
        <h1 className="text-3xl font-bold md:text-4xl">{t(L, "sTitle")}</h1>
        <p className="max-w-[45ch] text-sm leading-relaxed text-muted">{t(L, "sSub")}</p>
      </div>
      <Card className="rise-in"><CardHeader><CardTitle>{t(L, "sCard")}</CardTitle><CardDesc>{t(L, "sStep")}</CardDesc></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label={t(L, "fName")} id="biz">
              <Input id="biz" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(L, "fOwnerName")} id="owner">
                <Input id="owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label={t(L, "fPhone")} id="phone" hint={t(L, "fPhoneHint")}>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" type="tel" autoComplete="tel" dir="ltr" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(L, "cpEmail")} id="email" hint={t(L, "cpEmailHint")}>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="email" />
              </Field>
              <Field label={t(L, "fAddr")} id="addr">
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
              </Field>
            </div>
            {err && <p role="alert" className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{err}</p>}
            <div className="sticky bottom-0 -mx-1 flex gap-2 bg-surface/95 py-2 backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:backdrop-none">
              <Button type="submit" size="lg" loading={busy} className="flex-1">{t(L, "toPay")}</Button>
              <Button type="button" size="lg" variant="outline" onClick={() => nav("/")}>{t(L, "back")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
