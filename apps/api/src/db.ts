// منفذ قاعدة البيانات الكامل: نفس الواجهة لـ Postgres (VPS) وFirestore وMemory.
// قاعدة العزل: كل عملية تُمرَّر مع tenant_id — لا يوجد أي مسار يقرأ خارج المستأجر.

export interface TenantRow {
  id: string; slug: string; name: string; type: string; lang: string; plan: string;
  phone: string; address: string; logoUrl: string | null;
  crmEnabled: boolean; overtimeEnabled: boolean; tablesCount: number;
}
export interface UserRow {
  id: string; tenantId: string; employeeId: string | null; name: string;
  phone: string; passwordHash: string; pinHash: string | null; pages: string[] | null;
  role: string; branchId: string | null; active: boolean;
}
export interface ProductRow {
  id: string; tenantId: string; branchId: string; name: string; nameFr: string | null;
  buyPrice: number; sellPrice: number; qty: number; minQty: number;
  barcode: string | null; imageUrl: string | null; category: string | null;
  shelf: string | null; expiryDate: string | null; wholesalePrice: number | null; active: boolean;
  saleable?: boolean | null;
}
export interface OrderLineRow { productId: string; name: string; qty: number; price: number }
export interface OrderRow {
  id: string; num: number; tenantId: string; branchId: string; shiftId: string | null;
  kind: string; tableNo: string | null; status: string; lines: OrderLineRow[];
  discount: number; tax: number; total: number; payMethod: string;
  customer: string | null; phone: string | null; address: string | null;
  rating: number | null; consumed?: ConsumedRow[] | null; driverId?: string | null; createdAt: string;
}
export interface ShiftRow {
  id: string; tenantId: string; branchId: string; cashierId: string;
  openedAt: string; closedAt: string | null; openingCash: number; closingCash: number | null; note: string;
}
export interface EmployeeRow {
  id: string; tenantId: string; branchId: string; name: string; role: string; hiredAt: string; hourlyRate: number;
  title: string | null; halfWage: number;
}
export interface SalaryAdvanceRow {
  id: string; tenantId: string; employeeId: string; amount: number; date: string; note: string | null;
}
export type AttendanceStatus = "full" | "half" | "absent";
export interface AttendanceRow {
  id: string; tenantId: string; employeeId: string; date: string;
  status: AttendanceStatus;
}
export interface CustomerRow { id: string; tenantId: string; name: string; phone: string; address: string | null; balance: number }
export interface CustomerPaymentRow {
  id: string; tenantId: string; customerId: string;
  amount: number; method: string; ref: string | null; date: string;
}
export interface GoalRow { id: string; tenantId: string; title: string; target: number; saved: number; monthly: number }
export interface BranchRow { id: string; tenantId: string; name: string; address: string }
export interface StockMoveRow { id: string; tenantId: string; productId: string; delta: number; reason: string; createdAt: string }
export interface SubscriptionRow {
  id: string; tenantId: string; plan: string; status: string;
  startedAt: string; expiresAt: string; amountDzd: number;
  lastRef: string | null; confirmedBy: string | null; confirmedAt: string | null;
}
export interface ConsumedRow { ingredientId: string; qty: number }
export interface RecipeItemRow { id: string; tenantId: string; dishId: string; ingredientId: string; qty: number }
export interface SupplierRow {
  id: string; tenantId: string; name: string; phone: string;
  address: string | null; notes: string | null; active: boolean; openingDebt: number;
}
export interface PurchaseLineRow { productId: string; name: string; qty: number; unitCost: number }
export interface PurchaseRow {
  id: string; num: number; tenantId: string; supplierId: string | null;
  lines: PurchaseLineRow[]; total: number; paid: number; status: string;
  date: string; notes: string | null;
}
export interface SupplierPaymentRow {
  id: string; tenantId: string; supplierId: string; purchaseId: string;
  amount: number; method: string; ref: string | null; date: string;
}
export interface AlertRow {
  id: string; tenantId: string; kind: string; refId: string | null;
  message: string; read: boolean;
}
export interface SupportTicketRow {
  id: string; tenantId: string; message: string; contact: string | null;
  status: string; createdAt: string;
}
export interface OverheadRow {
  id: string; tenantId: string; name: string; kind: string;
  monthly: number; active: boolean; notes: string | null;
}
export interface DriverRow {
  id: string; tenantId: string; name: string; phone: string;
  vehicle: string | null; kind: string; active: boolean;
}
export interface PaymentRow {
  id: string; tenantId: string; ref: string; plan: string; months: number;
  amountDzd: number; email: string | null; status: string;
  sofizTransactionId: string | null; cibTransactionId: string | null;
  createdAt: string; confirmedAt: string | null;
}

// قاعدة حالة الفاتورة الموحدة (مطبقة في كلا المحوّلين): paid الكامل → paid، صفر → unpaid، وإلا partial.
export function purchaseStatus(total: number, paid: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export interface DbPort {
  kind: "postgres" | "firestore" | "memory";
  // مستأجرون ومستخدمون
  getTenantBySlug(slug: string): Promise<TenantRow | null>;
  getTenant(id: string): Promise<TenantRow | null>;
  createTenant(t: Omit<TenantRow, "id">): Promise<TenantRow>;
  updateTenant(id: string, patch: Partial<TenantRow>): Promise<TenantRow>;
  listTenants(): Promise<TenantRow[]>;
  findUserByPhone(tenantId: string, phone: string): Promise<UserRow | null>;
  findUserById(tenantId: string, userId: string): Promise<UserRow | null>;
  listUsers(tenantId: string): Promise<UserRow[]>;
  listAllUsers(): Promise<Omit<UserRow, "passwordHash" | "pinHash">[]>;
  setUserPassword(tenantId: string, userId: string, passwordHash: string): Promise<void>;
  setUserPin(tenantId: string, userId: string, pinHash: string | null): Promise<void>;
  setUserPages(tenantId: string, userId: string, pages: string[] | null): Promise<UserRow>;
  listEmployees(tenantId: string): Promise<EmployeeRow[]>;
  createEmployee(e: Omit<EmployeeRow, "id">): Promise<EmployeeRow>;
  updateEmployee(tenantId: string, id: string, patch: Partial<EmployeeRow>): Promise<EmployeeRow>;
  // سلف الموظفين
  listAdvances(tenantId: string, employeeId?: string): Promise<SalaryAdvanceRow[]>;
  createAdvance(a: Omit<SalaryAdvanceRow, "id">): Promise<SalaryAdvanceRow>;
  deleteAdvance(tenantId: string, id: string): Promise<void>;
  createUser(u: Omit<UserRow, "id">): Promise<UserRow>;
  // منتجات ومخزون
  listProducts(tenantId: string, branchId?: string): Promise<ProductRow[]>;
  createProduct(p: Omit<ProductRow, "id">): Promise<ProductRow>;
  updateProduct(tenantId: string, id: string, patch: Partial<ProductRow>): Promise<ProductRow>;
  adjustStock(tenantId: string, id: string, delta: number, reason: string): Promise<ProductRow>;
  listMoves(tenantId: string, productId?: string): Promise<StockMoveRow[]>;
  // طلبات
  nextOrderNum(tenantId: string): Promise<number>;
  createOrder(o: Omit<OrderRow, "id" | "createdAt">): Promise<OrderRow>;
  listOrders(tenantId: string, f?: { status?: string; branchId?: string; since?: string }): Promise<OrderRow[]>;
  getOrder(tenantId: string, id: string): Promise<OrderRow | null>;
  setOrderStatus(tenantId: string, id: string, status: string): Promise<OrderRow>;
  setOrderConsumed(tenantId: string, id: string, consumed: ConsumedRow[]): Promise<void>;
  rateOrder(tenantId: string, id: string, rating: number): Promise<void>;
  // ورديات
  getOpenShift(tenantId: string, branchId?: string): Promise<ShiftRow | null>;
  openShift(s: Omit<ShiftRow, "id" | "closedAt" | "closingCash">): Promise<ShiftRow>;
  closeShift(tenantId: string, id: string, closingCash: number, note: string): Promise<ShiftRow>;
  listShifts(tenantId: string): Promise<ShiftRow[]>;
  // حضور يومي (upsert لكل موظف/يوم)
  markAttendance(a: Omit<AttendanceRow, "id">): Promise<AttendanceRow>;
  listAttendance(tenantId: string, date?: string): Promise<AttendanceRow[]>;
  // عملاء وأهداف وفروع
  listCustomers(tenantId: string): Promise<CustomerRow[]>;
  createCustomer(c: Omit<CustomerRow, "id" | "balance"> & { balance?: number }): Promise<CustomerRow>;
  findOrCreateCustomer(tenantId: string, name: string, phone: string): Promise<CustomerRow>;
  addCustomerDebt(tenantId: string, customerId: string, delta: number): Promise<CustomerRow>;
  recordCustomerPayment(tenantId: string, customerId: string, amount: number, method?: string, ref?: string): Promise<{ customer: CustomerRow; payment: CustomerPaymentRow }>;
  listCustomerPayments(tenantId: string, customerId?: string): Promise<CustomerPaymentRow[]>;
  listGoals(tenantId: string): Promise<GoalRow[]>;
  createGoal(g: Omit<GoalRow, "id">): Promise<GoalRow>;
  updateGoal(tenantId: string, id: string, patch: Partial<GoalRow>): Promise<GoalRow>;
  deleteGoal(tenantId: string, id: string): Promise<void>;
  listBranches(tenantId: string): Promise<BranchRow[]>;
  createBranch(b: Omit<BranchRow, "id">): Promise<BranchRow>;
  getSubscription(tenantId: string): Promise<SubscriptionRow | null>;
  saveSubscription(s: Omit<SubscriptionRow, "id"> & { id?: string }): Promise<SubscriptionRow>;
  // وصفات
  listRecipes(tenantId: string, dishId?: string): Promise<RecipeItemRow[]>;
  setDishRecipe(tenantId: string, dishId: string, lines: { ingredientId: string; qty: number }[]): Promise<RecipeItemRow[]>;
  deleteRecipeLine(tenantId: string, id: string): Promise<void>;
  // مورّدون ومشتريات وديون
  listSuppliers(tenantId: string): Promise<SupplierRow[]>;
  createSupplier(s: Omit<SupplierRow, "id">): Promise<SupplierRow>;
  updateSupplier(tenantId: string, id: string, patch: Partial<SupplierRow>): Promise<SupplierRow>;
  nextPurchaseNum(tenantId: string): Promise<number>;
  createPurchase(p: Omit<PurchaseRow, "id" | "num" | "status">): Promise<PurchaseRow>;
  listPurchases(tenantId: string, supplierId?: string): Promise<PurchaseRow[]>;
  getPurchase(tenantId: string, id: string): Promise<PurchaseRow | null>;
  payPurchase(tenantId: string, id: string, amount: number, method?: string, ref?: string): Promise<PurchaseRow>;
  // تنبيهات
  createAlert(a: Omit<AlertRow, "id" | "createdAt">): Promise<AlertRow>;
  listAlerts(tenantId: string, unreadOnly?: boolean): Promise<AlertRow[]>;
  markAlertRead(tenantId: string, id: string): Promise<void>;
  // تذاكر الدعم
  createSupportTicket(t: Omit<SupportTicketRow, "id" | "createdAt" | "status">): Promise<SupportTicketRow>;
  listSupportTickets(status?: string): Promise<SupportTicketRow[]>;
  resolveSupportTicket(id: string): Promise<void>;
  // مصاريف ثابتة
  listOverheads(tenantId: string): Promise<OverheadRow[]>;
  createOverhead(o: Omit<OverheadRow, "id">): Promise<OverheadRow>;
  updateOverhead(tenantId: string, id: string, patch: Partial<OverheadRow>): Promise<OverheadRow>;
  deleteOverhead(tenantId: string, id: string): Promise<void>;
  // سائقون
  listDrivers(tenantId: string): Promise<DriverRow[]>;
  createDriver(d: Omit<DriverRow, "id">): Promise<DriverRow>;
  updateDriver(tenantId: string, id: string, patch: Partial<DriverRow>): Promise<DriverRow>;
  assignDriver(tenantId: string, orderId: string, driverId: string | null): Promise<OrderRow>;
  // مدفوعات SofizPay
  createBillingPayment(p: Omit<PaymentRow, "id" | "createdAt" | "confirmedAt">): Promise<PaymentRow>;
  getBillingPayment(tenantId: string, id: string): Promise<PaymentRow | null>;
  getBillingPaymentById(id: string): Promise<PaymentRow | null>;
  getBillingPaymentByRef(tenantId: string, ref: string): Promise<PaymentRow | null>;
  setBillingPayment(tenantId: string, id: string, patch: Partial<Pick<PaymentRow, "status" | "sofizTransactionId" | "cibTransactionId" | "confirmedAt">>): Promise<PaymentRow>;
  listBillingPayments(tenantId: string): Promise<PaymentRow[]>;
  listAllBillingPayments(status?: string, limit?: number): Promise<PaymentRow[]>;
}

// ─── ذاكرة: تطوير محلي واختبارات — نفس العقد تماماً ───
export class MemoryAdapter implements DbPort {
  kind = "memory" as const;
  tenants: TenantRow[] = [];
  users: UserRow[] = [];
  employees: EmployeeRow[] = [];
  products: ProductRow[] = [];
  orders: OrderRow[] = [];
  shifts: ShiftRow[] = [];
  att: AttendanceRow[] = [];
  customers: CustomerRow[] = [];
  customerPayments: CustomerPaymentRow[] = [];
  goals: GoalRow[] = [];
  branches: BranchRow[] = [];
  moves: StockMoveRow[] = [];
  subscriptions: SubscriptionRow[] = [];
  recipes: RecipeItemRow[] = [];
  suppliers: SupplierRow[] = [];
  purchases: PurchaseRow[] = [];
  payments: SupplierPaymentRow[] = [];
  alerts: AlertRow[] = [];
  drivers: DriverRow[] = [];
  private seq = 100;

  async getTenantBySlug(slug: string) { return this.tenants.find((t) => t.slug === slug) ?? null; }
  async getTenant(id: string) { return this.tenants.find((t) => t.id === id) ?? null; }
  async listTenants() { return [...this.tenants]; }
  async createTenant(t: Omit<TenantRow, "id">) { const r = { ...t, id: uid("t") }; this.tenants.push(r); return r; }
  async updateTenant(id: string, patch: Partial<TenantRow>) {
    const t = this.tenants.find((x) => x.id === id); if (!t) throw new Error("tenant");
    Object.assign(t, patch); return t;
  }
  async findUserByPhone(tenantId: string, phone: string) {
    return this.users.find((u) => u.tenantId === tenantId && u.phone === phone && u.active) ?? null;
  }
  async setUserPassword(tenantId: string, userId: string, passwordHash: string) {
    const u = this.users.find((x) => x.id === userId && x.tenantId === tenantId);
    if (!u) throw new Error("user");
    u.passwordHash = passwordHash;
  }
  async setUserPin(tenantId: string, userId: string, pinHash: string | null) {
    const u = this.users.find((x) => x.id === userId && x.tenantId === tenantId);
    if (!u) throw new Error("user");
    u.pinHash = pinHash;
  }
  async setUserPages(tenantId: string, userId: string, pages: string[] | null) {
    const u = this.users.find((x) => x.id === userId && x.tenantId === tenantId);
    if (!u) throw new Error("user");
    u.pages = pages; return u;
  }
  async listUsers(tenantId: string) {
    return this.users.filter((x) => x.tenantId === tenantId);
  }
  async findUserById(tenantId: string, userId: string) {
    return this.users.find((x) => x.id === userId && x.tenantId === tenantId && x.active) ?? null;
  }
  async listEmployees(tenantId: string) { return this.employees.filter((e) => e.tenantId === tenantId); }
  async createEmployee(e: Omit<EmployeeRow, "id">) { const r = { ...e, id: uid("e") }; this.employees.push(r); return r; }
  async updateEmployee(tenantId: string, id: string, patch: Partial<EmployeeRow>) {
    const e = this.employees.find((x) => x.id === id && x.tenantId === tenantId); if (!e) throw new Error("employee");
    Object.assign(e, patch); return e;
  }
  advances: SalaryAdvanceRow[] = [];
  async listAdvances(tenantId: string, employeeId?: string) {
    return this.advances.filter((a) => a.tenantId === tenantId && (!employeeId || a.employeeId === employeeId));
  }
  async createAdvance(a: Omit<SalaryAdvanceRow, "id">) {
    const r = { ...a, id: uid("adv") }; this.advances.push(r); return r;
  }
  async deleteAdvance(tenantId: string, id: string) {
    this.advances = this.advances.filter((a) => !(a.id === id && a.tenantId === tenantId));
  }
  async createUser(u: Omit<UserRow, "id">) { const r = { ...u, id: uid("u") }; this.users.push(r); return r; }
  async listAllUsers() {
    return this.users.map(({ passwordHash: _drop, pinHash: _pin, ...u }) => u);
  }

  async listProducts(tenantId: string, branchId?: string) {
    return this.products.filter((p) => p.tenantId === tenantId && (!branchId || p.branchId === branchId));
  }
  async createProduct(p: Omit<ProductRow, "id">) { const r = { ...p, id: uid("p") }; this.products.push(r); return r; }
  async updateProduct(tenantId: string, id: string, patch: Partial<ProductRow>) {
    const p = this.products.find((x) => x.id === id && x.tenantId === tenantId); if (!p) throw new Error("product");
    Object.assign(p, patch); return p;
  }
  async adjustStock(tenantId: string, id: string, delta: number, reason: string) {
    const p = await this.updateProduct(tenantId, id, {});
    p.qty = Math.max(0, p.qty + delta);
    this.moves.unshift({ id: uid("m"), tenantId, productId: id, delta, reason, createdAt: now() });
    return p;
  }
  async listMoves(tenantId: string, productId?: string) {
    return this.moves.filter((m) => m.tenantId === tenantId && (!productId || m.productId === productId)).slice(0, 200);
  }

  async nextOrderNum(_t: string) { return ++this.seq; }
  async createOrder(o: Omit<OrderRow, "id" | "createdAt">) {
    const r = { ...o, id: uid("o"), createdAt: now() };
    this.orders.unshift(r); return r;
  }
  async listOrders(tenantId: string, f?: { status?: string; branchId?: string; since?: string }) {
    return this.orders.filter((o) => o.tenantId === tenantId
      && (!f?.status || o.status === f.status)
      && (!f?.branchId || o.branchId === f.branchId)
      && (!f?.since || o.createdAt >= f.since));
  }
  async getOrder(tenantId: string, id: string) {
    return this.orders.find((o) => o.id === id && o.tenantId === tenantId) ?? null;
  }
  async setOrderStatus(tenantId: string, id: string, status: string) {
    const o = await this.getOrder(tenantId, id); if (!o) throw new Error("order");
    o.status = status; return o;
  }
  async setOrderConsumed(tenantId: string, id: string, consumed: ConsumedRow[]) {
    const o = await this.getOrder(tenantId, id); if (o) o.consumed = consumed;
  }
  async rateOrder(tenantId: string, id: string, rating: number) {
    const o = await this.getOrder(tenantId, id); if (o) o.rating = rating;
  }

  async getOpenShift(tenantId: string, branchId?: string) {
    return this.shifts.find((s) => s.tenantId === tenantId && !s.closedAt && (!branchId || s.branchId === branchId)) ?? null;
  }
  async openShift(s: Omit<ShiftRow, "id" | "closedAt" | "closingCash">) {
    const r = { ...s, id: uid("sh"), closedAt: null, closingCash: null };
    this.shifts.unshift(r); return r;
  }
  async closeShift(tenantId: string, id: string, closingCash: number, note: string) {
    const s = this.shifts.find((x) => x.id === id && x.tenantId === tenantId); if (!s) throw new Error("shift");
    s.closedAt = now(); s.closingCash = closingCash; s.note = note; return s;
  }
  async listShifts(tenantId: string) { return this.shifts.filter((s) => s.tenantId === tenantId); }

  async markAttendance(a: Omit<AttendanceRow, "id">) {
    const cur = this.att.find((x) => x.tenantId === a.tenantId && x.employeeId === a.employeeId && x.date === a.date);
    if (cur) { cur.status = a.status; return cur; }
    const r = { ...a, id: uid("a") }; this.att.unshift(r); return r;
  }
  async listAttendance(tenantId: string, date?: string) {
    return this.att.filter((a) => a.tenantId === tenantId && (!date || a.date === date));
  }

  async listCustomers(tenantId: string) { return this.customers.filter((c) => c.tenantId === tenantId); }
  async createCustomer(c: Omit<CustomerRow, "id" | "balance"> & { balance?: number }) {
    const r: CustomerRow = { ...c, balance: c.balance ?? 0, id: uid("c") };
    this.customers.push(r); return r;
  }
  async findOrCreateCustomer(tenantId: string, name: string, phone: string) {
    const cur = this.customers.find((c) => c.tenantId === tenantId && c.phone === phone);
    if (cur) return cur;
    return this.createCustomer({ tenantId, name, phone, address: null });
  }
  async addCustomerDebt(tenantId: string, customerId: string, delta: number) {
    const c = this.customers.find((x) => x.id === customerId && x.tenantId === tenantId);
    if (!c) throw new Error("customer");
    c.balance = Math.round((c.balance + delta) * 100) / 100;
    return c;
  }
  async recordCustomerPayment(tenantId: string, customerId: string, amount: number, method = "cash", ref?: string) {
    const c = this.customers.find((x) => x.id === customerId && x.tenantId === tenantId);
    if (!c) throw new Error("customer");
    if (!(amount > 0) || c.balance - amount < -1e-9) throw Object.assign(new Error("overpay"), { status: 400 });
    c.balance = Math.round((c.balance - amount) * 100) / 100;
    const payment: CustomerPaymentRow = { id: uid("cpay"), tenantId, customerId, amount, method, ref: ref ?? null, date: now() };
    this.customerPayments.push(payment);
    return { customer: c, payment };
  }
  async listCustomerPayments(tenantId: string, customerId?: string) {
    return this.customerPayments.filter((p) => p.tenantId === tenantId && (!customerId || p.customerId === customerId)).slice(0, 200);
  }
  async listGoals(tenantId: string) { return this.goals.filter((g) => g.tenantId === tenantId); }
  async createGoal(g: Omit<GoalRow, "id">) { const r = { ...g, id: uid("g") }; this.goals.unshift(r); return r; }
  async updateGoal(tenantId: string, id: string, patch: Partial<GoalRow>) {
    const g = this.goals.find((x) => x.id === id && x.tenantId === tenantId); if (!g) throw new Error("goal");
    Object.assign(g, patch); return g;
  }
  async deleteGoal(tenantId: string, id: string) { this.goals = this.goals.filter((g) => !(g.id === id && g.tenantId === tenantId)); }
  async listBranches(tenantId: string) { return this.branches.filter((b) => b.tenantId === tenantId); }
  async createBranch(b: Omit<BranchRow, "id">) { const r = { ...b, id: uid("b") }; this.branches.push(r); return r; }
  async getSubscription(tenantId: string) {
    return this.subscriptions.find((s) => s.tenantId === tenantId) ?? null;
  }
  async saveSubscription(s: Omit<SubscriptionRow, "id"> & { id?: string }) {
    const cur = this.subscriptions.find((x) => x.tenantId === s.tenantId);
    if (cur) { Object.assign(cur, s); return cur; }
    const r = { ...s, id: uid("sub") };
    this.subscriptions.push(r); return r;
  }

  async listRecipes(tenantId: string, dishId?: string) {
    return this.recipes.filter((r) => r.tenantId === tenantId && (!dishId || r.dishId === dishId));
  }
  async setDishRecipe(tenantId: string, dishId: string, lines: { ingredientId: string; qty: number }[]) {
    const dish = (await this.listProducts(tenantId)).find((p) => p.id === dishId);
    if (!dish) throw new Error("product");
    for (const l of lines) {
      if (l.ingredientId === dishId) throw Object.assign(new Error("self_ingredient"), { status: 400 });
      if (!(l.qty > 0)) throw Object.assign(new Error("bad_qty"), { status: 400 });
      if (!(await this.listProducts(tenantId)).some((p) => p.id === l.ingredientId)) throw new Error("product");
    }
    this.recipes = this.recipes.filter((r) => !(r.tenantId === tenantId && r.dishId === dishId));
    const rows = lines.map((l) => ({ ...l, id: uid("r"), tenantId, dishId }));
    this.recipes.push(...rows);
    return rows;
  }
  async deleteRecipeLine(tenantId: string, id: string) {
    this.recipes = this.recipes.filter((r) => !(r.id === id && r.tenantId === tenantId));
  }

  async listSuppliers(tenantId: string) { return this.suppliers.filter((s) => s.tenantId === tenantId); }
  async createSupplier(s: Omit<SupplierRow, "id">) {
    if (this.suppliers.some((x) => x.tenantId === s.tenantId && x.phone === s.phone)) {
      throw Object.assign(new Error("supplier_exists"), { status: 409 });
    }
    const r = { ...s, openingDebt: s.openingDebt ?? 0, id: uid("sup") }; this.suppliers.push(r); return r;
  }
  async updateSupplier(tenantId: string, id: string, patch: Partial<SupplierRow>) {
    const s = this.suppliers.find((x) => x.id === id && x.tenantId === tenantId);
    if (!s) throw new Error("supplier");
    Object.assign(s, patch); return s;
  }
  async nextPurchaseNum(tenantId: string) {
    return this.purchases.filter((p) => p.tenantId === tenantId).length + 1;
  }
  async createPurchase(p: Omit<PurchaseRow, "id" | "num" | "status">) {
    const num = await this.nextPurchaseNum(p.tenantId);
    const r = { ...p, id: uid("pur"), num, status: purchaseStatus(p.total, p.paid) };
    this.purchases.unshift(r); return r;
  }
  async listPurchases(tenantId: string, supplierId?: string) {
    return this.purchases.filter((p) => p.tenantId === tenantId && (!supplierId || p.supplierId === supplierId));
  }
  async getPurchase(tenantId: string, id: string) {
    return this.purchases.find((p) => p.id === id && p.tenantId === tenantId) ?? null;
  }
  async payPurchase(tenantId: string, id: string, amount: number, method = "cash", ref?: string) {
    const p = await this.getPurchase(tenantId, id); if (!p) throw new Error("purchase");
    if (amount <= 0 || p.paid + amount > p.total + 1e-9) throw Object.assign(new Error("overpay"), { status: 400 });
    p.paid = Math.round((p.paid + amount) * 100) / 100;
    p.status = purchaseStatus(p.total, p.paid);
    // الاقتناء الشخصي بلا سجل مورّد — المبلغ مدفوع نقداً وانتهى
    if (p.supplierId) {
      this.payments.unshift({
        id: uid("pay"), tenantId, supplierId: p.supplierId, purchaseId: p.id,
        amount, method, ref: ref ?? null, date: now(),
      });
    }
    return p;
  }

  async createAlert(a: Omit<AlertRow, "id" | "createdAt">) {
    const r = { ...a, id: uid("al"), createdAt: now() };
    this.alerts.unshift(r); return r;
  }
  async listAlerts(tenantId: string, unreadOnly?: boolean) {
    return this.alerts.filter((a) => a.tenantId === tenantId && (!unreadOnly || !a.read)).slice(0, 200);
  }
  async markAlertRead(tenantId: string, id: string) {
    const a = this.alerts.find((x) => x.id === id && x.tenantId === tenantId);
    if (a) a.read = true;
  }

  supportTickets: SupportTicketRow[] = [];
  async createSupportTicket(t: Omit<SupportTicketRow, "id" | "createdAt" | "status">) {
    const r = { ...t, id: uid("st"), status: "open", createdAt: now() };
    this.supportTickets.unshift(r); return r;
  }
  async listSupportTickets(status?: string) {
    return this.supportTickets.filter((t) => !status || t.status === status);
  }
  async resolveSupportTicket(id: string) {
    const t = this.supportTickets.find((x) => x.id === id);
    if (t) t.status = "resolved";
  }

  overheads: OverheadRow[] = [];
  async listOverheads(tenantId: string) { return this.overheads.filter((o) => o.tenantId === tenantId); }
  async createOverhead(o: Omit<OverheadRow, "id">) {
    const r = { ...o, id: uid("oh") }; this.overheads.push(r); return r;
  }
  async updateOverhead(tenantId: string, id: string, patch: Partial<OverheadRow>) {
    const o = this.overheads.find((x) => x.id === id && x.tenantId === tenantId);
    if (!o) throw new Error("overhead");
    Object.assign(o, patch); return o;
  }
  async deleteOverhead(tenantId: string, id: string) {
    this.overheads = this.overheads.filter((o) => !(o.id === id && o.tenantId === tenantId));
  }

  async listDrivers(tenantId: string) { return this.drivers.filter((d) => d.tenantId === tenantId); }
  async createDriver(d: Omit<DriverRow, "id">) {
    if (this.drivers.some((x) => x.tenantId === d.tenantId && x.phone === d.phone)) {
      throw Object.assign(new Error("driver_exists"), { status: 409 });
    }
    const r = { ...d, id: uid("drv") }; this.drivers.push(r); return r;
  }
  async updateDriver(tenantId: string, id: string, patch: Partial<DriverRow>) {
    const d = this.drivers.find((x) => x.id === id && x.tenantId === tenantId);
    if (!d) throw new Error("driver");
    Object.assign(d, patch); return d;
  }
  async assignDriver(tenantId: string, orderId: string, driverId: string | null) {
    const o = await this.getOrder(tenantId, orderId); if (!o) throw new Error("order");
    if (driverId) {
      const d = this.drivers.find((x) => x.id === driverId && x.tenantId === tenantId && x.active);
      if (!d) throw Object.assign(new Error("bad_driver"), { status: 400 });
    }
    o.driverId = driverId; return o;
  }

  billing: PaymentRow[] = [];
  async createBillingPayment(p: Omit<PaymentRow, "id" | "createdAt" | "confirmedAt">) {
    const r: PaymentRow = { ...p, id: uid("pay"), createdAt: now(), confirmedAt: null };
    this.billing.unshift(r); return r;
  }
  async getBillingPayment(tenantId: string, id: string) {
    return this.billing.find((x) => x.id === id && x.tenantId === tenantId) ?? null;
  }
  async getBillingPaymentById(id: string) {
    return this.billing.find((x) => x.id === id) ?? null;
  }
  async getBillingPaymentByRef(tenantId: string, ref: string) {
    return this.billing.find((x) => x.ref === ref && x.tenantId === tenantId) ?? null;
  }
  async setBillingPayment(tenantId: string, id: string, patch: Partial<Pick<PaymentRow, "status" | "sofizTransactionId" | "cibTransactionId" | "confirmedAt">>) {
    const r = await this.getBillingPayment(tenantId, id); if (!r) throw new Error("payment");
    Object.assign(r, patch); return r;
  }
  async listBillingPayments(tenantId: string) {
    return this.billing.filter((x) => x.tenantId === tenantId).slice(0, 200);
  }
  async listAllBillingPayments(status?: string, limit = 200) {
    return this.billing.filter((x) => !status || x.status === status).slice(0, limit);
  }
}

// ─── Postgres عبر Prisma — يُفعَّل عند وجود DATABASE_URL ───
// الكتابة بواجهة هيكلية (لا تحتاج توليد العميل للترجمة). عند التشغيل:
//   npx prisma generate && npx prisma migrate deploy
type PrismaModel = {
  findFirst(a?: unknown): Promise<unknown>; findMany(a?: unknown): Promise<unknown[]>;
  create(a: unknown): Promise<unknown>; update(a: unknown): Promise<unknown>;
  delete(a: unknown): Promise<unknown>; deleteMany(a?: unknown): Promise<unknown>; count(a?: unknown): Promise<number>;
};
type PrismaClientLike = Record<string, PrismaModel> & { $disconnect(): Promise<void> };

const J = {
  lines: {
    toDb: (l: OrderLineRow[]) => l as unknown,
    fromDb: (v: unknown) => v as OrderLineRow[],
  },
};

export class PrismaAdapter implements DbPort {
  kind = "postgres" as const;
  constructor(private prisma: PrismaClientLike) {}
  private m(name: string): PrismaModel { return this.prisma[name]; }
  private static row<T>(v: unknown): T { return v as T; }

  async getTenantBySlug(slug: string) {
    return PrismaAdapter.row<TenantRow | null>(await this.m("tenant").findFirst({ where: { slug } }));
  }
  async getTenant(id: string) {
    return PrismaAdapter.row<TenantRow | null>(await this.m("tenant").findFirst({ where: { id } }));
  }
  async listTenants() {
    return PrismaAdapter.row<TenantRow[]>(await this.m("tenant").findMany({ orderBy: { createdAt: "desc" }, take: 500 }));
  }
  async createTenant(t: Omit<TenantRow, "id">) {
    return PrismaAdapter.row<TenantRow>(await this.m("tenant").create({ data: t }));
  }
  async updateTenant(id: string, patch: Partial<TenantRow>) {
    return PrismaAdapter.row<TenantRow>(await this.m("tenant").update({ where: { id }, data: patch }));
  }
  async findUserByPhone(tenantId: string, phone: string) {
    return PrismaAdapter.row<UserRow | null>(
      await this.m("user").findFirst({ where: { tenantId, phone, active: true } }));
  }
  async setUserPassword(tenantId: string, userId: string, passwordHash: string) {
    const cur = await this.m("user").findFirst({ where: { id: userId, tenantId } });
    if (!cur) throw new Error("user");
    await this.m("user").update({ where: { id: userId }, data: { passwordHash } });
  }
  async setUserPin(tenantId: string, userId: string, pinHash: string | null) {
    const cur = await this.m("user").findFirst({ where: { id: userId, tenantId } });
    if (!cur) throw new Error("user");
    await this.m("user").update({ where: { id: userId }, data: { pinHash } });
  }
  async setUserPages(tenantId: string, userId: string, pages: string[] | null) {
    const cur = await this.m("user").findFirst({ where: { id: userId, tenantId } });
    if (!cur) throw new Error("user");
    return PrismaAdapter.row<UserRow>(await this.m("user").update({ where: { id: userId }, data: { pages: pages as unknown } }));
  }
  async listUsers(tenantId: string) {
    return PrismaAdapter.row<UserRow[]>(await this.m("user").findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }));
  }
  async findUserById(tenantId: string, userId: string) {
    return PrismaAdapter.row<UserRow | null>(
      await this.m("user").findFirst({ where: { id: userId, tenantId, active: true } }));
  }
  async listCustomers(tenantId: string) {
    return PrismaAdapter.row<CustomerRow[]>(await this.m("customer").findMany({ where: { tenantId } }));
  }
  async createCustomer(c: Omit<CustomerRow, "id" | "balance"> & { balance?: number }) {
    return PrismaAdapter.row<CustomerRow>(await this.m("customer").create({
      data: { ...c, balance: c.balance ?? 0 },
    }));
  }
  async findOrCreateCustomer(tenantId: string, name: string, phone: string) {
    const cur = await this.m("customer").findFirst({ where: { tenantId, phone } });
    if (cur) return PrismaAdapter.row<CustomerRow>(cur);
    return this.createCustomer({ tenantId, name, phone, address: null });
  }
  async addCustomerDebt(tenantId: string, customerId: string, delta: number) {
    const cur = await this.m("customer").findFirst({ where: { id: customerId, tenantId } });
    if (!cur) throw new Error("customer");
    const row = PrismaAdapter.row<CustomerRow>(cur);
    const balance = Math.round((row.balance + delta) * 100) / 100;
    return PrismaAdapter.row<CustomerRow>(await this.m("customer").update({ where: { id: customerId }, data: { balance } }));
  }
  async recordCustomerPayment(tenantId: string, customerId: string, amount: number, method = "cash", ref?: string) {
    const cur = await this.m("customer").findFirst({ where: { id: customerId, tenantId } });
    if (!cur) throw new Error("customer");
    const row = PrismaAdapter.row<CustomerRow>(cur);
    if (!(amount > 0) || row.balance - amount < -1e-9) throw Object.assign(new Error("overpay"), { status: 400 });
    const balance = Math.round((row.balance - amount) * 100) / 100;
    await this.m("customer").update({ where: { id: customerId }, data: { balance } });
    const payment = PrismaAdapter.row<CustomerPaymentRow>(await this.m("customerPayment").create({
      data: { tenantId, customerId, amount, method, ref: ref ?? null },
    }));
    return { customer: { ...row, balance }, payment };
  }
  async listCustomerPayments(tenantId: string, customerId?: string) {
    return PrismaAdapter.row<CustomerPaymentRow[]>(await this.m("customerPayment").findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      orderBy: { date: "desc" }, take: 200,
    }));
  }
  async listEmployees(tenantId: string) {
    return PrismaAdapter.row<EmployeeRow[]>(await this.m("employee").findMany({ where: { tenantId } }));
  }
  async createEmployee(e: Omit<EmployeeRow, "id">) {
    // Postgres صارم: حوّل إلى ISO كامل (الذاكرة تقبل أي نص)
    return PrismaAdapter.row<EmployeeRow>(await this.m("employee").create({
      data: { ...e, hiredAt: new Date(e.hiredAt) },
    }));
  }
  async updateEmployee(tenantId: string, id: string, patch: Partial<EmployeeRow>) {
    const cur = await this.m("employee").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("employee");
    return PrismaAdapter.row<EmployeeRow>(await this.m("employee").update({ where: { id }, data: { ...patch } }));
  }
  async listAdvances(tenantId: string, employeeId?: string) {
    return PrismaAdapter.row<SalaryAdvanceRow[]>(await this.m("salaryAdvance").findMany({
      where: { tenantId, ...(employeeId ? { employeeId } : {}) }, orderBy: { date: "desc" }, take: 500,
    }));
  }
  async createAdvance(a: Omit<SalaryAdvanceRow, "id">) {
    return PrismaAdapter.row<SalaryAdvanceRow>(await this.m("salaryAdvance").create({ data: { ...a } }));
  }
  async deleteAdvance(tenantId: string, id: string) {
    await this.m("salaryAdvance").deleteMany({ where: { id, tenantId } });
  }
  async createUser(u: Omit<UserRow, "id">) {
    return PrismaAdapter.row<UserRow>(await this.m("user").create({ data: u }));
  }
  async listAllUsers() {
    const rows = await this.m("user").findMany({ orderBy: { createdAt: "desc" }, take: 1000 });
    return (rows as unknown as Record<string, unknown>[]).map(({ passwordHash: _d, pinHash: _p, ...u }) => u as unknown as Omit<UserRow, "passwordHash">);
  }

  async listProducts(tenantId: string, branchId?: string) {
    return PrismaAdapter.row<ProductRow[]>(await this.m("product").findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) }, orderBy: { name: "asc" },
    }));
  }
  private static productDates<T extends { expiryDate?: string | null }>(p: T) {
    if (p.expiryDate === undefined) return p;
    const { expiryDate, ...rest } = p;
    return { ...rest, expiryDate: expiryDate ? new Date(expiryDate) : null };
  }
  async createProduct(p: Omit<ProductRow, "id">) {
    return PrismaAdapter.row<ProductRow>(
      await this.m("product").create({ data: PrismaAdapter.productDates(p) }));
  }
  async updateProduct(tenantId: string, id: string, patch: Partial<ProductRow>) {
    const cur = await this.m("product").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("product");
    return PrismaAdapter.row<ProductRow>(
      await this.m("product").update({ where: { id }, data: PrismaAdapter.productDates(patch) }));
  }
  async adjustStock(tenantId: string, id: string, delta: number, reason: string) {
    const cur = PrismaAdapter.row<ProductRow | null>(
      await this.m("product").findFirst({ where: { id, tenantId } }));
    if (!cur) throw new Error("product");
    const qty = Math.max(0, cur.qty + delta);
    await this.m("stockMove").create({ data: { tenantId, productId: id, delta, reason } });
    return PrismaAdapter.row<ProductRow>(await this.m("product").update({ where: { id }, data: { qty } }));
  }
  async listMoves(tenantId: string, productId?: string) {
    return PrismaAdapter.row<StockMoveRow[]>(await this.m("stockMove").findMany({
      where: { tenantId, ...(productId ? { productId } : {}) },
      orderBy: { createdAt: "desc" }, take: 200,
    }));
  }

  async nextOrderNum(tenantId: string) {
    return (await this.m("order").count({ where: { tenantId } })) + 101;
  }
  async createOrder(o: Omit<OrderRow, "id" | "createdAt">) {
    const { lines, ...rest } = o;
    const created = await this.m("order").create({ data: { ...rest, lines: J.lines.toDb(lines) } });
    const r = PrismaAdapter.row<OrderRow>(created);
    return { ...r, lines: J.lines.fromDb((created as { lines: unknown }).lines) };
  }
  private static withLines(v: unknown): OrderRow {
    const r = v as OrderRow & { lines: unknown; consumed?: unknown };
    return { ...r, lines: J.lines.fromDb(r.lines), consumed: (r.consumed as ConsumedRow[] | null) ?? null };
  }
  async listOrders(tenantId: string, f?: { status?: string; branchId?: string; since?: string }) {
    const rows = await this.m("order").findMany({
      where: {
        tenantId, ...(f?.status ? { status: f.status } : {}),
        ...(f?.branchId ? { branchId: f.branchId } : {}),
        ...(f?.since ? { createdAt: { gte: new Date(f.since) } } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 500,
    });
    return (rows as unknown[]).map(PrismaAdapter.withLines);
  }
  async getOrder(tenantId: string, id: string) {
    const r = await this.m("order").findFirst({ where: { id, tenantId } });
    return r ? PrismaAdapter.withLines(r) : null;
  }
  async setOrderStatus(tenantId: string, id: string, status: string) {
    const cur = await this.getOrder(tenantId, id); if (!cur) throw new Error("order");
    await this.m("order").update({ where: { id }, data: { status } });
    return { ...cur, status };
  }
  async setOrderConsumed(tenantId: string, id: string, consumed: ConsumedRow[]) {
    const cur = await this.getOrder(tenantId, id); if (!cur) throw new Error("order");
    await this.m("order").update({ where: { id }, data: { consumed: consumed as unknown } });
  }
  async rateOrder(tenantId: string, id: string, rating: number) {
    const cur = await this.getOrder(tenantId, id); if (!cur) throw new Error("order");
    await this.m("order").update({ where: { id }, data: { rating } });
  }

  async getOpenShift(tenantId: string, branchId?: string) {
    return PrismaAdapter.row<ShiftRow | null>(await this.m("shift").findFirst({
      where: { tenantId, closedAt: null, ...(branchId ? { branchId } : {}) },
      orderBy: { openedAt: "desc" },
    }));
  }
  async openShift(s: Omit<ShiftRow, "id" | "closedAt" | "closingCash">) {
    return PrismaAdapter.row<ShiftRow>(await this.m("shift").create({ data: s }));
  }
  async closeShift(tenantId: string, id: string, closingCash: number, note: string) {
    const cur = await this.m("shift").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("shift");
    return PrismaAdapter.row<ShiftRow>(await this.m("shift").update({
      where: { id }, data: { closedAt: new Date(), closingCash, note },
    }));
  }
  async listShifts(tenantId: string) {
    return PrismaAdapter.row<ShiftRow[]>(await this.m("shift").findMany({
      where: { tenantId }, orderBy: { openedAt: "desc" }, take: 200,
    }));
  }

  async markAttendance(a: Omit<AttendanceRow, "id">) {
    const cur = await this.m("attendance").findFirst({
      where: { tenantId: a.tenantId, employeeId: a.employeeId, date: a.date },
    });
    if (cur) {
      return PrismaAdapter.row<AttendanceRow>(await this.m("attendance").update({
        where: { id: (cur as { id: string }).id }, data: { status: a.status },
      }));
    }
    return PrismaAdapter.row<AttendanceRow>(await this.m("attendance").create({ data: { ...a } }));
  }
  async listAttendance(tenantId: string, date?: string) {
    return PrismaAdapter.row<AttendanceRow[]>(await this.m("attendance").findMany({
      where: { tenantId, ...(date ? { date } : {}) }, orderBy: { date: "desc" }, take: 500,
    }));
  }

  async listGoals(tenantId: string) {
    return PrismaAdapter.row<GoalRow[]>(await this.m("goal").findMany({ where: { tenantId } }));
  }
  async createGoal(g: Omit<GoalRow, "id">) {
    return PrismaAdapter.row<GoalRow>(await this.m("goal").create({ data: g }));
  }
  async updateGoal(tenantId: string, id: string, patch: Partial<GoalRow>) {
    const cur = await this.m("goal").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("goal");
    return PrismaAdapter.row<GoalRow>(await this.m("goal").update({ where: { id }, data: patch }));
  }
  async deleteGoal(tenantId: string, id: string) {
    await this.m("goal").delete({ where: { id } }).catch(() => null);
  }
  async listBranches(tenantId: string) {
    return PrismaAdapter.row<BranchRow[]>(await this.m("branch").findMany({ where: { tenantId } }));
  }
  async createBranch(b: Omit<BranchRow, "id">) {
    return PrismaAdapter.row<BranchRow>(await this.m("branch").create({ data: b }));
  }

  async listRecipes(tenantId: string, dishId?: string) {
    return PrismaAdapter.row<RecipeItemRow[]>(await this.m("recipeItem").findMany({
      where: { tenantId, ...(dishId ? { dishId } : {}) },
    }));
  }
  async setDishRecipe(tenantId: string, dishId: string, lines: { ingredientId: string; qty: number }[]) {
    const dish = await this.m("product").findFirst({ where: { id: dishId, tenantId } });
    if (!dish) throw new Error("product");
    for (const l of lines) {
      if (l.ingredientId === dishId) throw Object.assign(new Error("self_ingredient"), { status: 400 });
      if (!(l.qty > 0)) throw Object.assign(new Error("bad_qty"), { status: 400 });
      const ing = await this.m("product").findFirst({ where: { id: l.ingredientId, tenantId } });
      if (!ing) throw new Error("product");
    }
    // استبدال كامل لوصفة الطبق
    const existing = await this.m("recipeItem").findMany({ where: { tenantId, dishId } });
    for (const e of existing as { id: string }[]) {
      await this.m("recipeItem").delete({ where: { id: e.id } });
    }
    const rows: RecipeItemRow[] = [];
    for (const l of lines) {
      rows.push(PrismaAdapter.row<RecipeItemRow>(await this.m("recipeItem").create({
        data: { tenantId, dishId, ingredientId: l.ingredientId, qty: l.qty },
      })));
    }
    return rows;
  }
  async deleteRecipeLine(tenantId: string, id: string) {
    const cur = await this.m("recipeItem").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("recipe");
    await this.m("recipeItem").delete({ where: { id } });
  }

  async listSuppliers(tenantId: string) {
    return PrismaAdapter.row<SupplierRow[]>(await this.m("supplier").findMany({
      where: { tenantId }, orderBy: { name: "asc" },
    }));
  }
  async createSupplier(s: Omit<SupplierRow, "id">) {
    try {
      return PrismaAdapter.row<SupplierRow>(await this.m("supplier").create({
        data: { ...s, openingDebt: s.openingDebt ?? 0 },
      }));
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw Object.assign(new Error("supplier_exists"), { status: 409 });
      throw e;
    }
  }
  async updateSupplier(tenantId: string, id: string, patch: Partial<SupplierRow>) {
    const cur = await this.m("supplier").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("supplier");
    return PrismaAdapter.row<SupplierRow>(await this.m("supplier").update({ where: { id }, data: patch }));
  }
  async nextPurchaseNum(tenantId: string) {
    return (await this.m("purchase").count({ where: { tenantId } })) + 1;
  }
  private static purchaseIn(v: unknown): PurchaseRow {
    const r = v as PurchaseRow & { lines: unknown };
    return { ...r, lines: r.lines as PurchaseLineRow[] };
  }
  async createPurchase(p: Omit<PurchaseRow, "id" | "num" | "status">) {
    const num = await this.nextPurchaseNum(p.tenantId);
    const created = await this.m("purchase").create({
      data: {
        ...p, num, status: purchaseStatus(p.total, p.paid),
        date: new Date(p.date), lines: p.lines as unknown,
      },
    });
    return PrismaAdapter.purchaseIn(created);
  }
  async listPurchases(tenantId: string, supplierId?: string) {
    const rows = await this.m("purchase").findMany({
      where: { tenantId, ...(supplierId ? { supplierId } : {}) },
      orderBy: { date: "desc" }, take: 200,
    });
    return (rows as unknown[]).map(PrismaAdapter.purchaseIn);
  }
  async getPurchase(tenantId: string, id: string) {
    const r = await this.m("purchase").findFirst({ where: { id, tenantId } });
    return r ? PrismaAdapter.purchaseIn(r) : null;
  }
  async payPurchase(tenantId: string, id: string, amount: number, method = "cash", ref?: string) {
    const cur = await this.getPurchase(tenantId, id);
    if (!cur) throw new Error("purchase");
    if (!(amount > 0) || cur.paid + amount > cur.total + 1e-9) {
      throw Object.assign(new Error("overpay"), { status: 400 });
    }
    const paid = Math.round((cur.paid + amount) * 100) / 100;
    if (cur.supplierId) {
      await this.m("supplierPayment").create({
        data: { tenantId, supplierId: cur.supplierId, purchaseId: cur.id, amount, method, ref: ref ?? null },
      });
    }
    await this.m("purchase").update({ where: { id }, data: { paid, status: purchaseStatus(cur.total, paid) } });
    return { ...cur, paid, status: purchaseStatus(cur.total, paid) };
  }

  async createAlert(a: Omit<AlertRow, "id" | "createdAt">) {
    return PrismaAdapter.row<AlertRow>(await this.m("alert").create({ data: a }));
  }
  async listAlerts(tenantId: string, unreadOnly?: boolean) {
    return PrismaAdapter.row<AlertRow[]>(await this.m("alert").findMany({
      where: { tenantId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" }, take: 200,
    }));
  }
  async markAlertRead(tenantId: string, id: string) {
    const cur = await this.m("alert").findFirst({ where: { id, tenantId } });
    if (cur) await this.m("alert").update({ where: { id }, data: { read: true } });
  }

  async createSupportTicket(t: Omit<SupportTicketRow, "id" | "createdAt" | "status">) {
    return PrismaAdapter.row<SupportTicketRow>(await this.m("supportTicket").create({ data: t }));
  }
  async listSupportTickets(status?: string) {
    return PrismaAdapter.row<SupportTicketRow[]>(await this.m("supportTicket").findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" }, take: 200,
    }));
  }
  async resolveSupportTicket(id: string) {
    await this.m("supportTicket").update({ where: { id }, data: { status: "resolved" } });
  }

  async listOverheads(tenantId: string) {
    return PrismaAdapter.row<OverheadRow[]>(await this.m("overhead").findMany({
      where: { tenantId }, orderBy: { monthly: "desc" },
    }));
  }
  async createOverhead(o: Omit<OverheadRow, "id">) {
    return PrismaAdapter.row<OverheadRow>(await this.m("overhead").create({ data: o }));
  }
  async updateOverhead(tenantId: string, id: string, patch: Partial<OverheadRow>) {
    const cur = await this.m("overhead").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("overhead");
    return PrismaAdapter.row<OverheadRow>(await this.m("overhead").update({ where: { id }, data: patch }));
  }
  async deleteOverhead(tenantId: string, id: string) {
    const cur = await this.m("overhead").findFirst({ where: { id, tenantId } });
    if (cur) await this.m("overhead").delete({ where: { id } });
  }

  async listDrivers(tenantId: string) {
    return PrismaAdapter.row<DriverRow[]>(await this.m("driver").findMany({
      where: { tenantId }, orderBy: { name: "asc" },
    }));
  }
  async createDriver(d: Omit<DriverRow, "id">) {
    try {
      return PrismaAdapter.row<DriverRow>(await this.m("driver").create({ data: d }));
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw Object.assign(new Error("driver_exists"), { status: 409 });
      throw e;
    }
  }
  async updateDriver(tenantId: string, id: string, patch: Partial<DriverRow>) {
    const cur = await this.m("driver").findFirst({ where: { id, tenantId } });
    if (!cur) throw new Error("driver");
    return PrismaAdapter.row<DriverRow>(await this.m("driver").update({ where: { id }, data: patch }));
  }
  async assignDriver(tenantId: string, orderId: string, driverId: string | null) {
    const cur = await this.getOrder(tenantId, orderId); if (!cur) throw new Error("order");
    if (driverId) {
      const d = await this.m("driver").findFirst({ where: { id: driverId, tenantId, active: true } });
      if (!d) throw Object.assign(new Error("bad_driver"), { status: 400 });
    }
    await this.m("order").update({ where: { id: orderId }, data: { driverId } });
    return { ...cur, driverId };
  }

  private static paymentRow(v: unknown): PaymentRow { return v as PaymentRow; }
  async createBillingPayment(p: Omit<PaymentRow, "id" | "createdAt" | "confirmedAt">) {
    return PrismaAdapter.paymentRow(await this.m("payment").create({ data: p }));
  }
  async getBillingPayment(tenantId: string, id: string) {
    return PrismaAdapter.paymentRow(await this.m("payment").findFirst({ where: { id, tenantId } }) as PaymentRow | null);
  }
  async getBillingPaymentById(id: string) {
    return PrismaAdapter.paymentRow(await this.m("payment").findFirst({ where: { id } }) as PaymentRow | null);
  }
  async getBillingPaymentByRef(tenantId: string, ref: string) {
    return PrismaAdapter.paymentRow(await this.m("payment").findFirst({ where: { tenantId, ref } }) as PaymentRow | null);
  }
  async setBillingPayment(tenantId: string, id: string, patch: Partial<Pick<PaymentRow, "status" | "sofizTransactionId" | "cibTransactionId" | "confirmedAt">>) {
    const cur = await this.getBillingPayment(tenantId, id); if (!cur) throw new Error("payment");
    const data = { ...patch, confirmedAt: patch.confirmedAt ? new Date(patch.confirmedAt) : undefined };
    return PrismaAdapter.paymentRow(await this.m("payment").update({ where: { id }, data }));
  }
  async listBillingPayments(tenantId: string) {
    return PrismaAdapter.row<PaymentRow[]>(await this.m("payment").findMany({
      where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200,
    }));
  }
  async listAllBillingPayments(status?: string, limit = 200) {
    return PrismaAdapter.row<PaymentRow[]>(await this.m("payment").findMany({
      where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: Math.min(500, Math.max(1, limit)),
    }));
  }
  async getSubscription(tenantId: string) {
    return PrismaAdapter.row<SubscriptionRow | null>(
      await this.m("subscription").findFirst({ where: { tenantId } }));
  }
  async saveSubscription(s: Omit<SubscriptionRow, "id"> & { id?: string }) {
    const cur = await this.m("subscription").findFirst({ where: { tenantId: s.tenantId } });
    const data = {
      ...s,
      startedAt: new Date(s.startedAt), expiresAt: new Date(s.expiresAt),
      confirmedAt: s.confirmedAt ? new Date(s.confirmedAt) : null,
    };
    if (cur) {
      const { id: _drop, ...rest } = data;
      return PrismaAdapter.row<SubscriptionRow>(
        await this.m("subscription").update({ where: { id: (cur as { id: string }).id }, data: rest }));
    }
    return PrismaAdapter.row<SubscriptionRow>(await this.m("subscription").create({ data }));
  }
}

// ─── المصنع: Postgres عند توفر قاعدة حقيقية، وإلا ذاكرة ───
export async function createDb(): Promise<DbPort> {
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("@prisma/client");
      const prisma = new (mod as unknown as { PrismaClient: new () => PrismaClientLike }).PrismaClient();
      console.log("[db] postgres via Prisma");
      return new PrismaAdapter(prisma);
    } catch (e) {
      console.warn("[db] Prisma unavailable, falling back to memory:", (e as Error).message);
    }
  }
  return new MemoryAdapter();
}
