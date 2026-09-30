import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PixelPageView } from "./lib/pixel";
import { AuthProvider, useAuth, canSee } from "./auth";
import { t } from "./i18n";
import { Shell } from "./components/Layout";

// تقسيم الحمولات: كل صفحة طلباً خاصاً — الشيفرة الأولية تبقى صغيرة (DCLP).
const ActivitySelect = lazy(() => import("./pages/ActivitySelect"));
const Signup = lazy(() => import("./pages/Signup"));
const Plans = lazy(() => import("./pages/Plans"));
const Login = lazy(() => import("./pages/Login"));
const BillingReturn = lazy(() => import("./pages/BillingReturn"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Ops = lazy(() => import("./pages/Ops"));
const Legal = lazy(() => import("./pages/Legal"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pos = lazy(() => import("./pages/Pos"));
const Shifts = lazy(() => import("./pages/Shifts"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Kitchen = lazy(() => import("./pages/Kitchen"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderPublic = lazy(() => import("./pages/OrderPublic"));
const Customers = lazy(() => import("./pages/Customers"));
const Staff = lazy(() => import("./pages/Staff"));
const Reports = lazy(() => import("./pages/Reports"));
const Branches = lazy(() => import("./pages/Branches"));
const Growth = lazy(() => import("./pages/Growth"));
const Settings = lazy(() => import("./pages/Settings"));

const PageFallback = () => (
  <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="…">
    <span aria-hidden className="size-8 animate-spin rounded-full border-2 border-line border-t-growth" />
  </div>
);
const lazyRoute = (el: React.ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

const app = (el: React.ReactNode) => <Shell>{el}</Shell>;

// إنتاج: كل مسارات التطبيق تتطلب جلسة دخول — لا وضع تجريبي.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePage({ page, children }: { page: string; children: React.ReactNode }) {
  const { session } = useAuth();
  const { s } = useStore();
  if (!session) return <Navigate to="/login" replace />;
  if (!canSee(session, page)) {
    const L = s.lang;
    return app(
      <div className="mx-auto max-w-[520px] py-16 text-center">
        <h1 className="text-2xl font-bold">{t(L, "forbiddenT")}</h1>
        <p className="mt-2 text-sm text-muted">{t(L, "forbiddenH")}</p>
      </div>,
    );
  }
  return <>{children}</>;
}

function RequireRestaurant({ children }: { children: React.ReactNode }) {
  const { s } = useStore();
  if (s.businessType !== "restaurant") {
    const L = s.lang;
    return app(
      <div className="mx-auto max-w-[520px] py-16 text-center">
        <h1 className="text-2xl font-bold">{t(L, "kitchenOnlyResto")}</h1>
        <p className="mt-2 text-sm text-muted">{t(L, "kitchenOnlyRestoH")}</p>
      </div>,
    );
  }
  return <>{children}</>;
}

function ToasterHost() {
  const { s } = useStore();
  return <Toaster position="bottom-center" dir={s.lang === "ar" ? "rtl" : "ltr"} gap={8} />;
}

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <ToasterHost />
        <ErrorBoundary>
        <BrowserRouter>
          <PixelPageView />
          <Routes>
            <Route path="/" element={lazyRoute(<ActivitySelect />)} />
            <Route path="/signup" element={lazyRoute(<Signup />)} />
            <Route path="/plans" element={<Navigate to="/signup" replace />} />
            <Route path="/login" element={lazyRoute(<Login />)} />
          <Route path="/billing/return" element={lazyRoute(<BillingReturn />)} />
          <Route path="/checkout" element={lazyRoute(<Checkout />)} />
          <Route path="/set-password" element={lazyRoute(<SetPassword />)} />
          <Route path="/ops" element={lazyRoute(<Ops />)} />
          <Route path="/privacy" element={lazyRoute(<Legal kind="privacy" />)} />
          <Route path="/terms" element={lazyRoute(<Legal kind="terms" />)} />
            <Route path="/o/:slug/menu" element={lazyRoute(<OrderPublic />)} />
            <Route path="/app" element={<RequireAuth>{app(lazyRoute(<Dashboard />))}</RequireAuth>} />
            <Route path="/app/pos" element={<RequireAuth><RequirePage page="pos">{app(lazyRoute(<Pos />))}</RequirePage></RequireAuth>} />
            <Route path="/app/shifts" element={<RequireAuth><RequirePage page="shifts">{app(lazyRoute(<Shifts />))}</RequirePage></RequireAuth>} />
            <Route path="/app/inventory" element={<RequireAuth><RequirePage page="inventory">{app(lazyRoute(<Inventory />))}</RequirePage></RequireAuth>} />
            <Route path="/app/kitchen" element={<RequireAuth><RequirePage page="kitchen"><RequireRestaurant>{app(lazyRoute(<Kitchen />))}</RequireRestaurant></RequirePage></RequireAuth>} />
            <Route path="/app/orders" element={<RequireAuth><RequirePage page="orders">{app(lazyRoute(<Orders />))}</RequirePage></RequireAuth>} />
            <Route path="/app/customers" element={<RequireAuth><RequirePage page="customers">{app(lazyRoute(<Customers />))}</RequirePage></RequireAuth>} />
            <Route path="/app/staff" element={<RequireAuth><RequirePage page="staff">{app(lazyRoute(<Staff />))}</RequirePage></RequireAuth>} />
            <Route path="/app/reports" element={<RequireAuth><RequirePage page="reports">{app(lazyRoute(<Reports />))}</RequirePage></RequireAuth>} />
            <Route path="/app/branches" element={<RequireAuth><RequirePage page="branches">{app(lazyRoute(<Branches />))}</RequirePage></RequireAuth>} />
            <Route path="/app/growth" element={<RequireAuth><RequirePage page="growth">{app(lazyRoute(<Growth />))}</RequirePage></RequireAuth>} />
            <Route path="/app/settings" element={<RequireAuth><RequirePage page="settings">{app(lazyRoute(<Settings />))}</RequirePage></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </StoreProvider>
  );
}
