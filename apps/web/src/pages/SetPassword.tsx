import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { ApiError, api } from "../api";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "../ui";

// ضبط كلمة سر الدخول بعد الدفع الناجح (مستأجر جديد).
// لا توكن مطلوب — التحقق عبر paymentId في الرابط.
export default function SetPassword() {
  const { s } = useStore();
  const L = s.lang;
  const [q] = useSearchParams();
  const pref = q.get("pref") ?? "";
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const nav = useNavigate();

  useEffect(() => { document.title = t(L, "spTitle"); }, [L]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pwd.length < 6) { setErr(t(L, "spShort")); return; }
    if (pwd !== pwd2) { setErr(t(L, "spMismatch")); return; }
    setBusy(true);
    try {
      const r = await api.setPassword(pref, pwd);
      setOk(true);
      // مرّر slug في الـURL ليُملأ نموذج الدخول تلقائياً
      setTimeout(() => nav(`/login?slug=${encodeURIComponent(r.slug)}`), 800);
    } catch (ex) {
      setErr(ex instanceof ApiError
        ? ex.status === 402 ? t(L, "spUnpaid")
        : ex.status === 404 ? t(L, "spNotFound")
        : `${t(L, "errSaving")} (${ex.code})`
        : t(L, "eConn"));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[520px] place-items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t(L, "spTitle")}</CardTitle>
          <p className="text-sm text-muted">{t(L, "spSub")}</p>
        </CardHeader>
        <CardContent>
          {!ok ? (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Field label={t(L, "spPwd")} id="p1" hint={t(L, "spPwdHint")}>
                <Input id="p1" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t(L, "spPwd2")} id="p2">
                <Input id="p2" type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} dir="ltr" />
              </Field>
              {err && <p role="alert" className="rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{err}</p>}
              <Button type="submit" size="lg" loading={busy}>{t(L, "spSubmit")}</Button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-3xl" aria-hidden>✅</p>
              <p className="text-sm">{t(L, "spDone")}</p>
              <Button size="lg" onClick={() => nav("/login")}>{t(L, "spToLogin")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
