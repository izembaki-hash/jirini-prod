import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider, useAuth, isApiConfigured, canSee } from "./auth";
import { t } from "./i18n";
import { Shell } from "./components/Layout";
import ActivitySelect from "./pages/ActivitySelect";
import Signup from "./pages/Signup";
import Plans from "./pages/Plans";
import Wizard from "./pages/Wizard";
import Login from "./pages/Login";
import BillingReturn from "./pages/BillingReturn";
import SetPassword from "./pages/SetPassword";
import Checkout from "./pages/Checkout";
import Ops from "./pages/Ops";
import Dashboard from "./pages/Dashboard";
import Pos from "./pages/Pos";
import Shifts from "./pages/Shifts";
import Inventory from "./pages/Inventory";
import Kitchen from "./pages/Kitchen";
import Orders from "./pages/Orders";
import OrderPublic from "./pages/OrderPublic";
import Customers from "./pages/Customers";
import Staff from "./pages/Staff";
import Reports from "./pages/Reports";
import Branches from "./pages/Branches";
import Growth from "./pages/Growth";
import Settings from "./pages/Settings";

const app = (el: React.ReactNode) => <Shell>{el}</Shell>;

// بدون API مضبوط: وضع تجريبي محلي مفتوح. مع API: جلسة دخول = متصل، وبدونها = تجريبي مع شريط دعوة للدخول (لا حائط).
function RequireAuth({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function RequirePage({ page, children }: { page: string; children: React.ReactNode }) {
  const { session } = useAuth();
  const { s } = useStore();
  if (!isApiConfigured || !session) return <>{children}</>;
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
          <Routes>
            <Route path="/" element={<ActivitySelect />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/plans" element={<Navigate to="/signup" replace />} />
            <Route path="/wizard" element={<Navigate to="/signup" replace />} />
            <Route path="/login" element={<Login />} />
          <Route path="/billing/return" element={<BillingReturn />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/ops" element={<Ops />} />
            <Route path="/o/:slug/menu" element={<OrderPublic />} />
            <Route path="/app" element={<RequireAuth>{app(<Dashboard />)}</RequireAuth>} />
            <Route path="/app/pos" element={<RequireAuth><RequirePage page="pos">{app(<Pos />)}</RequirePage></RequireAuth>} />
            <Route path="/app/shifts" element={<RequireAuth><RequirePage page="shifts">{app(<Shifts />)}</RequirePage></RequireAuth>} />
            <Route path="/app/inventory" element={<RequireAuth><RequirePage page="inventory">{app(<Inventory />)}</RequirePage></RequireAuth>} />
            <Route path="/app/kitchen" element={<RequireAuth><RequirePage page="kitchen"><RequireRestaurant>{app(<Kitchen />)}</RequireRestaurant></RequirePage></RequireAuth>} />
            <Route path="/app/orders" element={<RequireAuth><RequirePage page="orders">{app(<Orders />)}</RequirePage></RequireAuth>} />
            <Route path="/app/customers" element={<RequireAuth><RequirePage page="customers">{app(<Customers />)}</RequirePage></RequireAuth>} />
            <Route path="/app/staff" element={<RequireAuth><RequirePage page="staff">{app(<Staff />)}</RequirePage></RequireAuth>} />
            <Route path="/app/reports" element={<RequireAuth><RequirePage page="reports">{app(<Reports />)}</RequirePage></RequireAuth>} />
            <Route path="/app/branches" element={<RequireAuth><RequirePage page="branches">{app(<Branches />)}</RequirePage></RequireAuth>} />
            <Route path="/app/growth" element={<RequireAuth><RequirePage page="growth">{app(<Growth />)}</RequirePage></RequireAuth>} />
            <Route path="/app/settings" element={<RequireAuth><RequirePage page="settings">{app(<Settings />)}</RequirePage></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </StoreProvider>
  );
}
