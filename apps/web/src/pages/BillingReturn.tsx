import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { t } from "../i18n";
import { ApiError, api } from "../api";
import { connected } from "../auth";
import { Button, Card, CardContent } from "../ui";

// صفحة العودة من الدفع: تستعلم الحالة من الخادم (المصدر الوحيد للحقيقة).
export default function BillingReturn() {
  const { s } = useStore();
  const L = s.lang;
  const [q] = useSearchParams();
  const okParam = q.get("ok");
  const pref = q.get("pref") ?? "";
  const [state, setState] = useState<"checking" | "paid" | "failed" | "pending">("checking");

  useEffect(() => {
    if (!pref || !connected()) { setState(okParam === "1" ? "paid" : "failed"); return; }
    let stop = false;
    const poll = async () => {
      try {
        const r = await api.billingReturnStatus(pref);
        if (stop) return;
        if (r.status === "paid") setState("paid");
        else if (r.status === "failed" || r.status === "expired") setState("failed");
        else setState("pending");
      } catch (e) {
        if (!stop && e instanceof ApiError && e.status === 404) setState("failed");
      }
    };
    poll();
    const id = setInterval(() => {
      if (state === "paid" || state === "failed") { clearInterval(id); return; }
      poll();
    }, 4000);
    return () => { stop = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref]);

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[520px] place-items-center px-4">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <h1 className="text-xl font-bold">
            {state === "paid" ? t(L, "retTitleOk") : state === "failed" ? t(L, "retTitleFail") : t(L, "retChecking")}
          </h1>
          {state === "checking" || state === "pending" ? (
            <span aria-hidden className="size-8 animate-spin rounded-full border-2 border-line border-t-growth" />
          ) : null}
          {state === "failed" && (
            connected()
              ? <Link to="/app/settings"><Button>{t(L, "retRetry")}</Button></Link>
              : <Link to="/signup"><Button>{t(L, "retRetry")}</Button></Link>
          )}
          {state === "paid" && (
            <Link to="/app"><Button>{t(L, "wEnter")}</Button></Link>
          )}
          <Link to={connected() ? "/app/settings" : "/login"} className="text-xs text-muted underline">{t(L, "retBack")}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
