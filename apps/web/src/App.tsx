import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider, useAuth, isApiConfigured } from "./auth";
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

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { session } = useAuth();
  const { s } = useStore();
  if (!isApiConfigured || !session) return <>{children}</>;
  if (!roles.includes(session.role)) {
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

const FIN = ["owner", "manager"]; // التقارير والمالية
const OPS = ["owner", "manager", "cashier"]; // التشغيل اليومي
const ALL = ["owner", "manager", "cashier", "cook"];

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
            <Route path="/app/pos" element={<RequireAuth><RequireRole roles={OPS}>{app(<Pos />)}</RequireRole></RequireAuth>} />
            <Route path="/app/shifts" element={<RequireAuth><RequireRole roles={OPS}>{app(<Shifts />)}</RequireRole></RequireAuth>} />
            <Route path="/app/inventory" element={<RequireAuth><RequireRole roles={FIN}>{app(<Inventory />)}</RequireRole></RequireAuth>} />
            <Route path="/app/kitchen" element={<RequireAuth><RequireRole roles={ALL}><RequireRestaurant>{app(<Kitchen />)}</RequireRestaurant></RequireRole></RequireAuth>} />
            <Route path="/app/orders" element={<RequireAuth><RequireRole roles={OPS}>{app(<Orders />)}</RequireRole></RequireAuth>} />
            <Route path="/app/customers" element={<RequireAuth><RequireRole roles={OPS}>{app(<Customers />)}</RequireRole></RequireAuth>} />
            <Route path="/app/staff" element={<RequireAuth><RequireRole roles={FIN}>{app(<Staff />)}</RequireRole></RequireAuth>} />
            <Route path="/app/reports" element={<RequireAuth><RequireRole roles={FIN}>{app(<Reports />)}</RequireRole></RequireAuth>} />
            <Route path="/app/branches" element={<RequireAuth><RequireRole roles={FIN}>{app(<Branches />)}</RequireRole></RequireAuth>} />
            <Route path="/app/growth" element={<RequireAuth><RequireRole roles={["owner"]}>{app(<Growth />)}</RequireRole></RequireAuth>} />
            <Route path="/app/settings" element={<RequireAuth><RequireRole roles={FIN}>{app(<Settings />)}</RequireRole></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </StoreProvider>
  );
}
