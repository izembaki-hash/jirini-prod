import { createRoot, type Root } from "react-dom/client";
import QRCode from "react-qr-code";
import { fmtDzd, type Order } from "./store";
import { uploadUrl } from "./api";
import { t, type Lang } from "./i18n";

// ─── طباعة احترافية ───
// تُبنى وثيقة طباعة مخصصة في #print-root وتُطبع وحدها عبر @media print.
// لا نطبع الصفحة التفاعلية أبداً (كانت تطبع القوائم والأزرار معها — خطأ).

let root: Root | null = null;
let prevTitle = "";

function host(): HTMLElement {
  let el = document.getElementById("print-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "print-root";
    document.body.appendChild(el);
  }
  return el;
}

if (typeof window !== "undefined") {
  window.addEventListener("afterprint", () => {
    try { root?.unmount(); } catch { /* تجاهل */ }
    root = null;
    document.getElementById("print-root")?.replaceChildren();
    if (prevTitle) { document.title = prevTitle; prevTitle = ""; }
  });
}

export function printDoc(title: string, dir: "rtl" | "ltr", node: React.ReactNode) {
  const el = host();
  if (!root) root = createRoot(el);
  prevTitle = document.title;
  document.title = title;
  root.render(<div className="print-doc" dir={dir}>{node}</div>);
  // مهلة قصيرة لاكتمال التصيير قبل فتح حوار الطباعة
  requestAnimationFrame(() => window.setTimeout(() => window.print(), 90));
}

const payLabel = (pay: Order["pay"], lang: Lang) =>
  pay === "cash" ? t(lang, "cash") : pay === "card" ? t(lang, "card") : t(lang, "credit");

export interface ShopInfo { name: string; phone: string; address: string; logo: string | null }

// بيانات التاجر من الحالة للوثائق المطبوعة (شعار برابط كامل).
export function shopOf(s: { businessName: string; shopPhone: string; shopAddress: string; shopLogo: string }): ShopInfo {
  return { name: s.businessName, phone: s.shopPhone, address: s.shopAddress, logo: uploadUrl(s.shopLogo) };
}

function DocHead({ shop, title, lines }: { shop: ShopInfo; title: string; lines: string[] }) {
  return (
    <div className="p-head">
      <div className="p-shop-block">
        {shop.logo && <img src={shop.logo} alt="" className="p-logo" />}
        <div>
          <div className="p-shop">{shop.name}</div>
          {[shop.address, shop.phone].filter(Boolean).join(" · ") && (
            <div className="p-meta">{[shop.address, shop.phone].filter(Boolean).join(" · ")}</div>
          )}
          {lines.map((l, i) => <div key={i} className="p-meta">{l}</div>)}
        </div>
      </div>
      <div className="p-title">{title}</div>
    </div>
  );
}

// ─── فاتورة بيع: ترويسة ديناميكية من بيانات التاجر + تفاصيل الطلب الحقيقية ───
export function InvoiceDoc({ shop, lang, order, customer }: { shop: ShopInfo; lang: Lang; order: Order; customer?: string }) {
  const at = new Date(order.at).toLocaleString(lang === "ar" ? "ar-DZ" : "fr-DZ");
  return (
    <>
      <DocHead
        shop={shop}
        title={`${t(lang, "invTitle")} #${order.num}`}
        lines={[
          `${t(lang, "prPrintedAt")}: ${new Date().toLocaleString(lang === "ar" ? "ar-DZ" : "fr-DZ")}`,
          at,
          [order.table ? `${t(lang, "tableN")} ${order.table}` : "",
            order.kind === "dinein" ? t(lang, "kindDinein") : order.kind === "takeaway" ? t(lang, "kindTakeaway") : t(lang, "kindDelivery"),
            payLabel(order.pay, lang)].filter(Boolean).join(" · "),
          ...(customer ? [`${t(lang, "invCustomer")}: ${customer}`] : []),
        ]}
      />
      <table className="p-tab">
        <thead>
          <tr>
            <th>{t(lang, "prItem")}</th>
            <th className="n">{t(lang, "prQty")}</th>
            <th className="n">{t(lang, "prPrice")}</th>
            <th className="n">{t(lang, "prAmount")}</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td className="n">{l.qty}</td>
              <td className="n">{fmtDzd(l.price)}</td>
              <td className="n">{fmtDzd(l.qty * l.price)}</td>
            </tr>
          ))}
          {order.discount > 0 && (
            <tr className="neg">
              <td colSpan={3}>{t(lang, "discRow")}</td>
              <td className="n">−{fmtDzd(order.discount)}</td>
            </tr>
          )}
          <tr className="total">
            <td colSpan={3}>{t(lang, "totalRow")}</td>
            <td className="n">{fmtDzd(order.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="p-foot">
        <span>{payLabel(order.pay, lang)}</span>
        <span>{t(lang, "thanksNote")}</span>
      </div>
    </>
  );
}

// ─── تقرير فترة ───
export interface ReportDocData {
  shop: ShopInfo; lang: Lang; title: string; period: string;
  kpis: { label: string; value: string }[];
  pnl: { label: string; value: string; neg?: boolean; bold?: boolean }[];
  methods: { label: string; value: string }[];
  top: { name: string; qty: number; margin: string }[];
  attendance: { name: string; full: number; half: number; absent: number; salary: string }[];
}

export function ReportDoc({ d }: { d: ReportDocData }) {
  const L = d.lang;
  return (
    <>
      <DocHead
        shop={d.shop}
        title={d.title}
        lines={[`${t(L, "prPeriod")}: ${d.period}`, `${t(L, "prPrintedAt")}: ${new Date().toLocaleString(L === "ar" ? "ar-DZ" : "fr-DZ")}`]}
      />
      <div className="p-kpis">
        {d.kpis.map((k, i) => (
          <div key={i} className="p-kpi"><span>{k.label}</span><b>{k.value}</b></div>
        ))}
      </div>

      <h2 className="p-sec">{t(L, "pnlTitle")}</h2>
      <table className="p-tab">
        <tbody>
          {d.pnl.map((r, i) => (
            <tr key={i} className={r.bold ? "total" : r.neg ? "neg" : undefined}>
              <td>{r.label}</td>
              <td className="n">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.methods.length > 0 && (
        <>
          <h2 className="p-sec">{t(L, "byMethod")}</h2>
          <table className="p-tab">
            <tbody>
              {d.methods.map((m, i) => (
                <tr key={i}><td>{m.label}</td><td className="n">{m.value}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.top.length > 0 && (
        <>
          <h2 className="p-sec">{t(L, "byProduct")}</h2>
          <table className="p-tab">
            <thead><tr><th>{t(L, "prItem")}</th><th className="n">{t(L, "prQty")}</th><th className="n">{t(L, "statProfit")}</th></tr></thead>
            <tbody>
              {d.top.map((p, i) => (
                <tr key={i}><td>{p.name}</td><td className="n">×{p.qty}</td><td className="n">{p.margin}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.attendance.length > 0 && (
        <>
          <h2 className="p-sec">{t(L, "attReport")}</h2>
          <table className="p-tab">
            <thead><tr><th>{t(L, "empName")}</th><th className="n">{t(L, "attFull")}</th><th className="n">{t(L, "attHalf")}</th><th className="n">{t(L, "attAbsent")}</th><th className="n">{t(L, "salariesT")}</th></tr></thead>
            <tbody>
              {d.attendance.map((a, i) => (
                <tr key={i}><td>{a.name}</td><td className="n">{a.full}</td><td className="n">{a.half}</td><td className="n">{a.absent}</td><td className="n">{a.salary}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ─── ملصق طاولة QR ───
export function StickerDoc({ shop, lang, table, url }: { shop: string; lang: Lang; table: string; url: string }) {
  return (
    <div className="p-sticker" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="p-shop">{shop}</div>
      <div className="p-table-no">{t(lang, "tableN")} {table}</div>
      <QRCode value={url} size={256} />
      <div className="p-meta" style={{ marginTop: 8 }}>{t(lang, "stScan")}</div>
      <div className="p-url" dir="ltr">{url}</div>
    </div>
  );
}
