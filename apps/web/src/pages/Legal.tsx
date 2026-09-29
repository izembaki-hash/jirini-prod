import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { api, ApiError, type LegalKey, type LegalContent } from "../api";
import { t } from "../i18n";
import { setCanonical } from "../lib/seo";

// صفحة عامة (خصوصية/شروط) — تُقرأ من API وتعرض المحتوى المحفوظ أو الافتراضي.
export default function Legal({ kind }: { kind: LegalKey }) {
  const { s } = useStore();
  const L = s.lang;
  const [content, setContent] = useState<LegalContent | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setContent(null); setErr("");
    api.legalGet(kind)
      .then((page) => { if (alive) setContent(page[L]); })
      .catch((e) => { if (alive) setErr(e instanceof ApiError ? e.code : "network"); });
    return () => { alive = false; };
  }, [kind, L]);

  useEffect(() => { setCanonical(kind === "privacy" ? "/privacy" : "/terms"); }, [kind]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10" dir={L === "ar" ? "rtl" : "ltr"}>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/login" className="rounded-[10px] border border-line px-3 py-2 text-sm font-bold text-muted">
          {t(L, "back")}
        </Link>
        <h1 className="text-2xl font-bold">{content?.title ?? t(L, kind === "privacy" ? "privacyT" : "termsT")}</h1>
      </div>
      {err && (
        <p className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-sm font-bold text-ember">{err}</p>
      )}
      {!content && !err && <p className="text-sm text-muted">…</p>}
      {content && (
        <article className="whitespace-pre-wrap rounded-2xl border border-line bg-surface p-5 text-[15px] leading-8 sm:p-7">
          {content.body}
        </article>
      )}
      <p className="mt-6 text-xs text-muted">Jirini</p>
    </div>
  );
}
