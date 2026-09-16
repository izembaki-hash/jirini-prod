import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TrendUp, CashRegister, CookingPot } from "@phosphor-icons/react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useStore } from "../store";
import { t } from "../i18n";
import { Button, Card, CardContent, Field, Input } from "../ui";

// الدخول للإنتاج: slug النشاط + هاتف الموظف + كلمة السر.
export default function Login() {
  const { login } = useAuth();
  const { s } = useStore();
  const L = s.lang;
  const nav = useNavigate();
  const [q] = useSearchParams();
  const [slug, setSlug] = useState(q.get("slug") ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(slug.trim(), phone.trim(), password);
      nav("/app");
    } catch (ex) {
      setErr(ex instanceof ApiError
        ? ex.status === 401 ? t(L, "eBad") : `${t(L, "eSrv")} (${ex.code})`
        : t(L, "eConn"));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1000px] place-items-center px-4 py-10">
      <div className="grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[1fr_1.1fr]">
        {/* لوحة العلامة */}
        <div className="relative flex min-h-56 flex-col justify-end gap-3 overflow-hidden bg-growth-deep p-7 text-white">
          <div aria-hidden className="absolute -left-16 -top-16 size-56 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -bottom-20 -right-10 size-64 rounded-full bg-black/10" />
          <p className="text-sm font-bold text-white/80">دكّان برو</p>
          <p className="relative text-2xl font-bold leading-snug md:text-[28px]">{t(L, "tagline")}</p>
          <ul className="relative mt-1 flex flex-col gap-2 text-[13px] text-white/90">
            <li className="flex items-center gap-2"><TrendUp size={17} aria-hidden />{t(L, "brandLine1")}</li>
            <li className="flex items-center gap-2"><CashRegister size={17} aria-hidden />{t(L, "brandLine2")}</li>
            <li className="flex items-center gap-2"><CookingPot size={17} aria-hidden />{t(L, "brandLine3")}</li>
          </ul>
        </div>
        {/* النموذج */}
        <Card className="rounded-none border-0">
          <CardContent className="flex h-full flex-col justify-center gap-4 p-7">
            <div>
              <h1 className="text-2xl font-bold">{t(L, "lTitle")}</h1>
              <p className="mt-1 text-sm text-muted">{t(L, "lSub")}</p>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label={t(L, "lSlug")} id="slug" hint={t(L, "lSlugHint")}>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} autoComplete="username" enterKeyHint="next" dir="ltr" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t(L, "lPhone")} id="lphone">
                  <Input id="lphone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" enterKeyHint="next" dir="ltr" />
                </Field>
                <Field label={t(L, "lPass")} id="lpw">
                  <Input id="lpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" enterKeyHint="go" />
                </Field>
              </div>
              {err && <p role="alert" className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{err}</p>}
              <Button type="submit" size="lg" loading={busy}>{t(L, "lGo")}</Button>
              <Link to="/" className="mx-auto w-fit rounded-lg px-2 py-2 text-xs font-bold text-muted underline underline-offset-4">{t(L, "back")}</Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
