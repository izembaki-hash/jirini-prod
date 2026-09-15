// عميل الـAPI الإنتاجي. بدون VITE_API_URL → وضع تجريبي محلي (localStorage).
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function getToken(): string | null {
  try { return localStorage.getItem("dz-token"); } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem("dz-token", t) : localStorage.removeItem("dz-token"); } catch { /* تجاهل */ }
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

async function req<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string }).error ?? "internal");
  return body as T;
}

export interface LoginResp {
  token: string;
  user: { name: string; role: string; branchId: string | null };
  tenant: { id: string; slug: string; name: string; type: string; plan: string; lang: string };
}

export interface ApiProduct {
  id: string; name: string; nameFr: string | null; buyPrice: number; sellPrice: number;
  qty: number; minQty: number; barcode: string | null; category: string | null; active: boolean;
  saleable?: boolean | null; shelf?: string | null; expiryDate?: string | null; wholesalePrice?: number | null;
}

export interface ApiRecipeItem { id: string; dishId: string; ingredientId: string; qty: number }
export interface ApiSupplier {
  id: string; name: string; phone: string; address: string | null;
  notes: string | null; active: boolean; openingDebt?: number; owed?: number; paid?: number; balance?: number;
}
export interface ApiPurchaseLine { productId: string; name: string; qty: number; unitCost: number }
export interface ApiPurchase {
  id: string; num: number; supplierId: string; lines: ApiPurchaseLine[];
  total: number; paid: number; status: string; date: string; notes: string | null;
}
export interface ApiAlert { id: string; kind: string; refId: string | null; message: string; read: boolean }
export interface ApiOverhead { id: string; name: string; kind: string; monthly: number; active: boolean; notes: string | null }

export interface ApiEmployee { id: string; name: string; role: string; hourlyRate: number; hiredAt: string; branchId: string }
export interface ApiShift { id: string; branchId: string; cashierId: string; openedAt: string; closedAt: string | null; openingCash: number; closingCash: number | null; note: string }
export interface ApiAtt { id: string; employeeId: string; date: string; inAt: string; outAt: string | null; overtimeMin: number }
export interface ApiCustomer { id: string; name: string; phone: string; address: string | null; balance: number }
export interface ApiCustomerPayment { id: string; customerId: string; amount: number; method: string; ref: string | null; date: string }
export interface ApiGoal { id: string; title: string; target: number; saved: number; monthly: number }
export interface ApiBranch { id: string; name: string; address: string }

export const api = {
  base: API_BASE,
  login: (slug: string, phone: string, password: string) =>
    req<LoginResp>("/auth/login", { method: "POST", body: JSON.stringify({ slug, phone, password }) }, false),
  me: () => req<{ auth: { role: string; name: string; tenant_id: string }; tenant: Record<string, unknown> }>("/auth/me"),
  changePassword: (current: string, next: string) =>
    req<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ current, next }) }),
  tenantInfo: () => req<{
    tenant: { id: string; name: string; type: string; plan: string; lang: string; tablesCount?: number };
    branches: { id: string; name: string; address: string }[];
  }>("/tenant"),
  tenantPatch: (patch: Record<string, unknown>) =>
    req<Record<string, unknown>>("/tenant", { method: "PATCH", body: JSON.stringify(patch) }),
  listProducts: () => req<ApiProduct[]>("/products"),
  createProduct: (p: Record<string, unknown>) =>
    req<ApiProduct>("/products", { method: "POST", body: JSON.stringify(p) }),
  adjustStock: (id: string, delta: number, reason: string) =>
    req<ApiProduct>(`/products/${id}/stock`, { method: "POST", body: JSON.stringify({ delta, reason }) }),
  summary: (days = 7) =>
    req<{ sales: number; profit: number; invoices: number; avgBasket: number; todaySales: number; todayProfit: number; todayNet?: number; breakdown?: ProfitBd; methodSplit?: { cash: number; card: number }; todayBreakdown?: ProfitBd; perDay: { date: string; sales: number; profit?: number; net?: number }[]; top: { name: string; qty: number; revenue?: number; cost?: number; margin?: number }[] }>(`/reports/summary?days=${days}`),
  listOrders: (status?: string) =>
    req<ApiOrder[]>(`/orders${status ? `?status=${status}` : ""}`),
  setOrderStatus: (id: string, status: string) =>
    req<ApiOrder>(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createOrder: (o: Record<string, unknown>) =>
    req<ApiOrder>("/orders", { method: "POST", body: JSON.stringify(o) }),
  menu: (slug: string) =>
    req<{ shop: string; type: string; products: { id: string; name: string; sellPrice: number; imageUrl: string | null; category: string | null }[] }>(`/public/${slug}/menu`, undefined, false),
  publicOrder: (slug: string, o: Record<string, unknown>) =>
    req<{ id: string; num: number; total: number }>(`/public/${slug}/orders`, { method: "POST", body: JSON.stringify(o) }, false),
  trackOrder: (slug: string, num: number) =>
    req<{ num: number; status: string; total: number; lines: { name: string; qty: number; price: number }[]; driver?: { name: string } | null }>(`/public/${slug}/orders/${num}`, undefined, false),
  rateOrder: (slug: string, num: number, rating: number) =>
    req<{ ok: boolean }>(`/public/${slug}/orders/${num}/rate`, { method: "POST", body: JSON.stringify({ rating }) }, false),
  // وصفات ومورّدون ومشتريات وهدر وتنبيهات
  listRecipes: (dish?: string) => req<ApiRecipeItem[]>(`/recipes${dish ? `?dish=${dish}` : ""}`),
  setDishRecipe: (dishId: string, lines: { ingredientId: string; qty: number }[]) =>
    req<ApiRecipeItem[]>(`/recipes/dish/${dishId}`, { method: "PUT", body: JSON.stringify({ lines }) }),
  deleteRecipeLine: (id: string) => req<{ ok: boolean }>(`/recipes/${id}`, { method: "DELETE" }),
  listSuppliers: () => req<ApiSupplier[]>("/suppliers"),
  createSupplier: (s: { name: string; phone: string; address?: string; notes?: string; openingDebt?: number }) =>
    req<ApiSupplier>("/suppliers", { method: "POST", body: JSON.stringify(s) }),
  createPurchase: (p: { supplierId: string; lines: { productId: string; qty: number; unitCost: number }[]; paid?: number; method?: string; ref?: string; notes?: string }) =>
    req<ApiPurchase>("/purchases", { method: "POST", body: JSON.stringify(p) }),
  listPurchases: (supplierId?: string) => req<ApiPurchase[]>(`/purchases${supplierId ? `?supplier=${supplierId}` : ""}`),
  payPurchase: (id: string, amount: number, method = "cash", ref?: string) =>
    req<ApiPurchase>(`/purchases/${id}/pay`, { method: "POST", body: JSON.stringify({ amount, method, ref }) }),
  wastage: (productId: string, qty: number, reason?: string) =>
    req<{ ok: boolean; qty: number }>("/wastage", { method: "POST", body: JSON.stringify({ productId, qty, reason: reason ?? "" }) }),
  listAlerts: (unreadOnly = false) => req<ApiAlert[]>(`/alerts${unreadOnly ? "?unread=1" : ""}`),
  markAlertRead: (id: string) => req<{ ok: boolean }>(`/alerts/${id}/read`, { method: "POST" }),
  listOverheads: () => req<ApiOverhead[]>("/overheads"),
  createOverhead: (o: { name: string; kind?: string; monthly: number; active?: boolean; notes?: string }) =>
    req<ApiOverhead>("/overheads", { method: "POST", body: JSON.stringify(o) }),
  updateOverhead: (id: string, patch: Partial<ApiOverhead>) =>
    req<ApiOverhead>(`/overheads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOverhead: (id: string) => req<{ ok: boolean }>(`/overheads/${id}`, { method: "DELETE" }),
  listDrivers: () => req<ApiDriver[]>("/drivers"),
  createDriver: (d: { name: string; phone: string; vehicle?: string; kind?: string }) =>
    req<ApiDriver>("/drivers", { method: "POST", body: JSON.stringify(d) }),
  assignDriver: (orderId: string, driverId: string | null) =>
    req<ApiOrder>(`/orders/${orderId}/driver`, { method: "PATCH", body: JSON.stringify({ driverId }) }),
  billingStatus: () => req<{ plan?: string; status: string; expiresAt?: string; amountDzd?: number; online?: boolean; payInstructions?: { ar: string; ccp: string } }>("/billing/status"),
  billingInitiate: (b: { plan?: string; months: number; email: string; fullName?: string }) =>
    req<{ paymentId: string; paymentUrl: string }>(`/billing/sofizpay/initiate`, { method: "POST", body: JSON.stringify(b) }),
  billingReturnStatus: (paymentId: string) =>
    req<{ status: string; expiresAt?: string | null }>(`/billing/sofizpay/status/${paymentId}`),
  billingSubmitManual: (ref: string, months: number) =>
    req<{ ok: boolean; status: string }>(`/billing/submit-payment`, { method: "POST", body: JSON.stringify({ ref, months }) }),
  // ورديات وحضور ورواتب وموظفون
  employees: () => req<ApiEmployee[]>("/employees"),
  createEmployeeAccount: (e: { name: string; phone: string; password: string; role: string; hourlyRate?: number; branchId?: string }) =>
    req<{ id: string; employeeId: string }>("/auth/users", { method: "POST", body: JSON.stringify(e) }),
  shiftOpenInfo: () => req<ApiShift | null>("/shifts/open"),
  shiftOpen: (branchId: string, openingCash: number, cashierId: string) =>
    req<ApiShift>("/shifts/open", { method: "POST", body: JSON.stringify({ branchId, openingCash, cashierId }) }),
  shiftClose: (id: string, closingCash: number, note: string) =>
    req<{ shift: ApiShift; expected: number; diff: number }>(`/shifts/${id}/close`, { method: "POST", body: JSON.stringify({ closingCash, note }) }),
  shiftsList: () => req<ApiShift[]>("/shifts"),
  attIn: (employeeId: string) => req<ApiAtt>("/attendance/in", { method: "POST", body: JSON.stringify({ employeeId }) }),
  attOut: (id: string) => req<ApiAtt>(`/attendance/${id}/out`, { method: "POST" }),
  attList: (date?: string) => req<ApiAtt[]>(`/attendance${date ? `?date=${date}` : ""}`),
  salaries: () => req<{ employee: ApiEmployee; total: number }[]>("/salaries"),
  customersList: () => req<ApiCustomer[]>("/customers"),
  customersCreate: (c: { name: string; phone: string; address?: string }) =>
    req<ApiCustomer>("/customers", { method: "POST", body: JSON.stringify(c) }),
  customersPay: (id: string, p: { amount: number; method?: string; ref?: string }) =>
    req<{ customer: ApiCustomer; payment: ApiCustomerPayment }>(`/customers/${id}/pay`, { method: "POST", body: JSON.stringify(p) }),
  customerPayments: (id: string) => req<ApiCustomerPayment[]>(`/customers/${id}/payments`),
  goalsList: () => req<ApiGoal[]>("/goals"),
  goalsCreate: (g: { title: string; target: number; monthly: number }) =>
    req<ApiGoal>("/goals", { method: "POST", body: JSON.stringify(g) }),
  goalsUpdate: (id: string, patch: Partial<ApiGoal>) =>
    req<ApiGoal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  goalsDelete: (id: string) => req<{ ok: boolean }>(`/goals/${id}`, { method: "DELETE" }),
  branchesList: () => req<ApiBranch[]>("/branches"),
  branchesCreate: (b: { name: string; address?: string }) =>
    req<ApiBranch>("/branches", { method: "POST", body: JSON.stringify(b) }),
};

// ─── لوحة المشغّل: مفتاح OPERATOR_KEY في الترويسة (لا JWT) ───
export function getOperatorKey(): string | null {
  try { return localStorage.getItem("dz-ops-key"); } catch { return null; }
}
export function setOperatorKey(k: string | null) {
  try { k ? localStorage.setItem("dz-ops-key", k) : localStorage.removeItem("dz-ops-key"); } catch { /* تجاهل */ }
}

async function opsReq<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-operator-key": getOperatorKey() ?? "", ...(init?.headers as Record<string, string> ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string }).error ?? "internal");
  return body as T;
}

export interface OpsOverview {
  tenants: number; users: number; ordersToday: number; revenueToday: number;
  subs: Record<string, number>;
  recentPayments: { id: string; tenantSlug: string; tenantName: string; plan: string; months: number; amountDzd: number; status: string; ref: string }[];
  generatedAt: string;
}
export interface OpsTenant {
  id: string; slug: string; name: string; type: string; plan: string; lang: string; phone: string;
  users: number; branches: number;
  subscription: { status: string; expiresAt: string; plan: string } | null;
  orders30d: number; revenue30d: number;
}

export const ops = {
  overview: () => opsReq<OpsOverview>("/ops/overview"),
  tenants: () => opsReq<OpsTenant[]>("/ops/tenants"),
  tenant: (id: string) => opsReq<Record<string, unknown>>(`/ops/tenants/${id}`),
  setPlan: (id: string, plan: string) => opsReq<Record<string, unknown>>(`/ops/tenants/${id}`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  suspend: (id: string) => opsReq<{ ok: boolean }>(`/ops/tenants/${id}/suspend`, { method: "POST" }),
  unsuspend: (id: string) => opsReq<{ ok: boolean; status: string }>(`/ops/tenants/${id}/unsuspend`, { method: "POST" }),
  extend: (id: string, months: number) => opsReq<{ ok: boolean; expiresAt: string }>(`/ops/tenants/${id}/extend`, { method: "POST", body: JSON.stringify({ months }) }),
  payments: (status?: string) => opsReq<{ id: string; tenantSlug: string; tenantName: string; plan: string; months: number; amountDzd: number; status: string; ref: string; createdAt: string }[]>(`/ops/payments${status ? `?status=${status}` : ""}`),
  confirmManual: (tenantSlug: string, months: number) =>
    opsReq<{ ok: boolean; expiresAt: string }>("/billing/admin/confirm", { method: "POST", body: JSON.stringify({ tenantSlug, months }) }),
  health: () => opsReq<{ ok: boolean; db: string; uptimeSec: number; time: string; env: Record<string, unknown> }>("/ops/health"),
};

export interface ApiDriver { id: string; name: string; phone: string; vehicle: string | null; kind: string; active: boolean }
export interface ProfitBd {
  sales: number; discounts: number; cogs: number; gross: number;
  overheads: { name: string; amount: number }[]; overheadsTotal: number;
  labor: number; net: number; marginPct: number;
}
export interface ApiOrder {
  id: string; num: number; kind: string; tableNo: string | null; status: string;
  lines: { productId: string; name: string; qty: number; price: number }[];
  total: number; discount: number; payMethod: string; createdAt: string;
  driverId?: string | null; driver?: { id: string; name: string } | null;
  warnings?: { productId: string; name: string; missing: number }[];
}

// فرع الخادم الحالي (يُضبط بعد المزامنة) — يُستخدم في POS بدل القيمة الوهمية.
let branchId: string | null = null;
try { branchId = localStorage.getItem("dz-branch"); } catch { /* تجاهل */ }
export const currentBranch = () => branchId;
export const setBranch = (id: string | null) => {
  branchId = id;
  try { id ? localStorage.setItem("dz-branch", id) : localStorage.removeItem("dz-branch"); } catch { /* تجاهل */ }
};
// SSE للمطبخ — التوكن في الاستعلام (EventSource لا يرسل ترويسات).
export function kitchenStream(onEvent: (e: { type: string; order?: ApiOrder }) => void): () => void {
  const t = getToken();
  const es = new EventSource(`${API_BASE}/stream/kitchen${t ? `?token=${encodeURIComponent(t)}` : ""}`);
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data)); } catch { /* تجاهل */ }
  };
  return () => es.close();
}
