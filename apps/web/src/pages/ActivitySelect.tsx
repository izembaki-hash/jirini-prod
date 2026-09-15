import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, DeviceMobile, Wallet, Translate } from "@phosphor-icons/react";
import { useStore, resetDemo } from "../store";
import { t } from "../i18n";
import { cn } from "../ui";

// صفحة الهبوط/اختيار النشاط: انطباع أول بلا قالب — عنوان يسار، وبطاقتا اختيار كبيرتان.
const CARDS = [
  {
    type: "restaurant" as const, title: "مطعم", fr: "Restaurant",
    sub: "طاولات، شاشة مطبخ لحظية، طلب QR، توصيل",
    subFr: "Tables, cuisine live, QR, livraison",
    feats: ["QR لكل طاولة يطبع ويُلصق", "شاشة مطبخ تستقبل فوراً", "منيو رقمي يخفي النافد تلقائياً"],
    featsFr: ["QR imprimable par table", "Écran cuisine instantané", "Menu qui masque les ruptures"],
    img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop",
  },
  {
    type: "shop" as const, title: "محل", fr: "Boutique",
    sub: "سوبرماركت، بقالة، كاشير سريع بالباركود",
    subFr: "Supérette, épicerie, caisse code-barres",
    feats: ["بحث يدوي كامل — القارئ اختياري", "تنبيه الصلاحية والرفوف", "أسعار جملة وتجزئة"],
    featsFr: ["Recherche manuelle complète", "Alertes péremption et rayons", "Prix gros et détail"],
    img: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop",
  },
];

export default function ActivitySelect() {
  const { s, update } = useStore();
  const L = s.lang;
  const nav = useNavigate();

  const pick = (type: "restaurant" | "shop") => {
    update((p) => ({ ...p, businessType: type }));
    nav(`/signup?type=${type}`);
  };
  const setLang = (lang: "ar" | "fr") => {
    update((p) => ({ ...p, lang }));
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col px-4 pb-10 pt-5 sm:px-6">
      {/* شريط العلامة */}
      <header className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-growth text-lg font-bold text-white">د</span>
        <span>
          <span className="block text-sm font-bold leading-tight">دكّان برو</span>
          <span className="block text-[11px] text-muted">{t(L, "tagline")}</span>
        </span>
        <span className="ms-auto flex items-center gap-2">
          <span className="flex gap-1" role="group" aria-label="Language">
            {(["ar", "fr"] as const).map((lg) => (
              <button key={lg} onClick={() => setLang(lg)} aria-pressed={L === lg}
                className={cn("h-9 rounded-[10px] border px-3 text-xs font-bold", L === lg ? "border-growth bg-growth/10 text-growth-deep" : "border-line")}>
                {lg === "ar" ? "عربي" : "FR"}
              </button>
            ))}
          </span>
          <Link to="/login" className="rounded-[10px] border border-line px-4 py-2.5 text-sm font-bold hover:bg-canvas">
            {t(L, "clientLogin")}
          </Link>
        </span>
      </header>

      {/* العنوان */}
      <div className="rise-in mt-10 max-w-[640px] md:mt-14">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t(L, "heroTitle")}</h1>
        <p className="mt-3 max-w-[55ch] text-[15px] leading-relaxed text-muted">
          {t(L, "heroSub")} <b className="tnum text-ink">{t(L, "fromPrice")}</b>
        </p>
      </div>

      {/* البطاقتان */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {CARDS.map((c, i) => (
          <button
            key={c.type}
            onClick={() => pick(c.type)}
            style={{ animationDelay: `${i * 90}ms` }}
            className="rise-in group relative min-h-[46dvh] overflow-hidden rounded-2xl text-start focus-visible:outline-none md:min-h-[52dvh]"
            aria-label={`${t(L, "startAs")}${c.title}`}
          >
            <img src={c.img} alt="" loading={i === 0 ? "eager" : "lazy"}
              className="absolute inset-0 h-full w-full bg-ink object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/5" />
            <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 p-6 md:p-8">
              <span className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white md:text-4xl">{c.title}</span>
                <span className="text-sm text-white/70">{c.fr}</span>
              </span>
              <span className="text-sm text-white/85">{L === "ar" ? c.sub : c.subFr}</span>
              <ul className="mt-1 flex flex-col gap-1.5">
                {(L === "ar" ? c.feats : c.featsFr).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-white/90">
                    <CheckCircle size={16} weight="fill" aria-hidden className="shrink-0 text-emerald-300" />{f}
                  </li>
                ))}
              </ul>
              <span className="btn-press mt-2 inline-flex w-fit items-center gap-2 rounded-[10px] bg-white px-6 py-3 text-sm font-bold text-black">
                {t(L, "startAs")}{c.title}<ArrowLeft size={18} aria-hidden />
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* شريط الثقة */}
      <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
        <li className="flex items-center gap-1.5"><Wallet size={17} aria-hidden />{t(L, "trustCash")}</li>
        <li className="flex items-center gap-1.5"><Translate size={17} aria-hidden />{t(L, "trustLang")}</li>
        <li className="flex items-center gap-1.5"><DeviceMobile size={17} aria-hidden />{t(L, "trustMobile")}</li>
      </ul>
    </div>
  );
}
