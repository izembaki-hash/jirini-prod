import { useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  SquaresFour, CashRegister, Timer, Package, CookingPot, Receipt, Users,
  CalendarCheck, ChartBar, GitBranch, TrendUp, Gear,
} from "@phosphor-icons/react";
import { useStore, type PlanId } from "../store";
import { useAuth, isApiConfigured, connected } from "../auth";
import { api, setBranch, ApiError } from "../api";
import { t, type Lang } from "../i18n";
import { cn } from "../ui";

const PRICE_OF: Record<PlanId, number> = { starter: 2500, pro: 3000, mega: 4500 };
const roleLabel = (role: string, L: Lang) =>
  role === "owner" ? t(L, "roleOwner") : role === "manager" ? t(L, "roleManager") : role === "cashier" ? t(L, "roleCashier") : role === "cook" ? t(L, "roleCook") : role;

const LINKS = [
  { to: "/app", key: "dashboard", Icon: SquaresFour },
  { to: "/app/pos", key: "pos", Icon: CashRegister },
  { to: "/app/shifts", key: "shifts", Icon: Timer },
  { to: "/app/inventory", key: "inventory", Icon: Package },
  { to: "/app/kitchen", key: "kitchen", Icon: CookingPot },
  { to: "/app/orders", key: "orders", Icon: Receipt },
  { to: "/app/customers", key: "customers", Icon: Users },
  { to: "/app/staff", key: "staff", Icon: CalendarCheck },
  { to: "/app/reports", key: "reports", Icon: ChartBar },
  { to: "/app/branches", key: "branches", Icon: GitBranch },
  { to: "/app/growth", key: "growth", Icon: TrendUp },
  { to: "/app/settings", key: "settings", Icon: Gear },
] as const;

// الخمسة الأهم للشريط السفلي في الهاتف (POS أولاً لطبيعة الاستخدام)
const MOBILE_TABS = ["/app", "/app/pos", "/app/kitchen", "/app/orders", "/app/settings"] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { s, update } = useStore();
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const L = s.lang;

  const setLang = (lang: "ar" | "fr") => {
    update((p) => ({ ...p, lang }));
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  };

  // متصل: الخادم مصدر الحقيقة —زامن الكتالوج والنشاط والفروع عند الدخول (مرة لكل جلسة).
  const syncedFor = useRef<string | null>(null);
  const sessionKey = session ? `in:${session.tenant.id}` : "demo";
  useEffect(() => {
    if (!connected() || syncedFor.current === sessionKey) return;
    syncedFor.current = sessionKey;
    (async () => {
      try {
        const [{ tenant, branches }, products] = await Promise.all([api.tenantInfo(), api.listProducts()]);
        if (!tenant) { logout(); nav("/login"); return; }
        setBranch(branches[0]?.id ?? null);
        update((p) => ({
          ...p,
          businessName: tenant.name || p.businessName,
          businessType: tenant.type === "shop" ? "shop" : "restaurant",
          plan: (["starter", "pro", "mega"] as PlanId[]).includes(tenant.plan as PlanId) ? (tenant.plan as PlanId) : p.plan,
          branches: branches.map((b) => b.name),
          branch: branches[0]?.name ?? p.branch,
          tables: typeof (tenant as { tablesCount?: unknown }).tablesCount === "number"
            ? Math.min(60, Math.max(1, (tenant as { tablesCount: number }).tablesCount))
            : p.tables,
          products: products.map((sp) => ({
            id: sp.id, name: sp.name, nameFr: sp.nameFr ?? sp.name,
            buy: sp.buyPrice, sell: sp.sellPrice, qty: sp.qty, min: sp.minQty,
            barcode: sp.barcode ?? undefined, cat: sp.category ?? "عام", active: sp.active,
            saleable: sp.saleable ?? true,
          })),
        }));
        // المصاريف الثابتة: فشلها لا يكسر المزامنة (الكاشير مثلاً بلا صلاحية)
        api.listOverheads().then((list) => update((p) => ({
          ...p,
          overheads: list.map((o) => ({ id: o.id, name: o.name, kind: o.kind, monthly: o.monthly, active: o.active, notes: o.notes ?? undefined })),
        }))).catch(() => null);
      } catch (e) {
        // مستأجر ممسوح أو توكن ميت → خروج صريح بدل بيانات محلية مضللة
        if (e instanceof ApiError && (e.code === "tenant_gone" || e.status === 401)) { logout(); nav("/login"); return; }
        /* غير ذلك: يبقى المحلي كاحتياط */
      }
    })();
  }, [update, sessionKey]);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {L === "ar" ? "تخطَّ إلى المحتوى" : "Aller au contenu"}
      </a>
      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-e border-line bg-surface p-4 print:hidden md:flex" aria-label={L === "ar" ? "التنقل" : "Navigation"}>
        <button onClick={() => nav("/app")} className="mb-3 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-start hover:bg-canvas">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-growth text-lg font-bold text-white">د</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{s.businessName}</span>
            <span className="block truncate text-[11px] text-muted">{t(L, "tagline")}</span>
          </span>
        </button>
        {LINKS.filter((l) => s.businessType === "restaurant" || l.to !== "/app/kitchen").map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/app"}
            className={({ isActive }) => cn(
              "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-canvas",
              isActive && "bg-growth/10 font-bold text-growth-deep",
            )}
          >
            <l.Icon size={20} weight="regular" aria-hidden className="shrink-0" />
            {t(L, l.key as never)}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex gap-2" role="group" aria-label="Language / اللغة">
            {(["ar", "fr"] as const).map((lg) => (
              <button key={lg} onClick={() => setLang(lg)} aria-pressed={L === lg}
                className={cn("h-9 flex-1 rounded-[10px] border text-sm font-bold transition-colors", L === lg ? "border-growth bg-growth/10 text-growth-deep" : "border-line")}>
                {lg === "ar" ? "عربي" : "Français"}
              </button>
            ))}
          </div>
          <p className="tnum text-center text-xs text-muted">{t(L, s.plan === "starter" ? "planStarter" : s.plan === "pro" ? "planPro" : "planMega")} · {PRICE_OF[s.plan]} {t(L, "dzd")} · {s.branch}</p>
        </div>
      </aside>

      {/* المحتوى */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header style={{ paddingTop: "env(safe-area-inset-top)" }} className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur print:hidden">
          <button onClick={() => nav("/app")} className="flex items-center gap-2 md:hidden" aria-label={s.businessName}>
            <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-growth font-bold text-white">د</span>
            <span className="max-w-[40vw] truncate text-sm font-bold">{s.businessName}</span>
          </button>
          <div className="ms-auto flex items-center gap-2">
            {isApiConfigured && session ? (
              <>
                <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:inline">
                  {session.name} · {roleLabel(session.role, L)}
                </span>
                <button onClick={() => { logout(); nav("/login"); }} className="h-11 rounded-[10px] border border-line px-3 text-sm font-bold" aria-label={L === "ar" ? "خروج" : "Déconnexion"}>
                  {L === "ar" ? "خروج" : "Sortie"}
                </button>
              </>
            ) : (
              <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:inline">{roleLabel(s.role, L)}</span>
            )}
            <button onClick={() => setLang(L === "ar" ? "fr" : "ar")} className="h-11 min-w-11 rounded-[10px] border border-line px-3 text-sm font-bold" aria-label="Language">
              {L === "ar" ? "FR" : "عر"}
            </button>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
          {isApiConfigured && !session && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-hold/40 bg-hold/10 px-4 py-2.5 text-sm">
              <span className="flex-1 font-medium">{t(L, "demoBanner")}</span>
              <button onClick={() => nav("/login")} className="btn-press rounded-[10px] bg-growth px-4 py-2 text-[13px] font-bold text-white">
                {t(L, "lGo")}
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* شريط سفلي للهاتف: الأقسام الأهم بإبهام واحد — حبة نشطة + وزن مملوء */}
      <nav aria-label={L === "ar" ? "أقسام" : "Sections"}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden md:hidden">
        <ul className={`mx-auto grid max-w-[560px] px-1 pt-1 ${s.businessType === "restaurant" ? "grid-cols-5" : "grid-cols-4"}`}>
          {LINKS.filter((l) => (MOBILE_TABS as readonly string[]).includes(l.to) && (s.businessType === "restaurant" || l.to !== "/app/kitchen")).map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.to === "/app"}
                className={({ isActive }) => cn(
                  "flex min-h-[62px] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition-[background-color,color,transform] duration-150 active:scale-95",
                  isActive ? "bg-growth/10 text-growth-deep" : "text-muted active:bg-canvas",
                )}
              >
                {({ isActive }) => (
                  <>
                    <l.Icon size={23} weight={isActive ? "fill" : "regular"} aria-hidden />
                    {t(L, l.key as never)}
                    <span aria-hidden className={cn("h-1 w-1 rounded-full transition-opacity", isActive ? "bg-growth-deep opacity-100" : "opacity-0")} />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
