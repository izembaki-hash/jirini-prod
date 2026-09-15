import { fmtDzd, type Order } from "../store";
import { t, type Lang } from "../i18n";

// إيصال قابل للطباعة (ورقي أو PDF عبر حوار الطباعة — يعمل بدون عتاد).
export function Receipt({ order, shop, lang = "ar" }: { order: Order; shop: string; lang?: Lang }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 text-sm" dir={lang === "ar" ? "rtl" : "ltr"}>
      <p className="text-center font-bold">{shop}</p>
      <p className="tnum text-center font-mono text-xs text-muted">{t(lang, "invTitle")} #{order.num} · {new Date(order.at).toLocaleString("fr-DZ")}</p>
      <div className="my-3 h-px bg-line" />
      {order.lines.map((l, i) => (
        <div key={i} className="flex justify-between py-0.5">
          <span>{l.name} × {l.qty}</span>
          <span className="tnum">{fmtDzd(l.qty * l.price)}</span>
        </div>
      ))}
      {order.discount > 0 && (
        <div className="flex justify-between text-ember">
          <span>{t(lang, "discRow")}</span><span className="tnum">−{fmtDzd(order.discount)}</span>
        </div>
      )}
      <div className="my-3 h-px bg-line" />
      <div className="flex justify-between font-bold">
        <span>{t(lang, "totalRow")}</span><span className="tnum">{fmtDzd(order.total)}</span>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{order.pay === "cash" ? t(lang, "cash") : order.pay === "card" ? t(lang, "card") : t(lang, "credit")} · {t(lang, "thanksNote")}</p>
    </div>
  );
}
