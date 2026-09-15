// API الإنتاج: مصادقة JWT + عزل tenant_id + بوابة عامة + SSE + رفع صور.
// العملة دج والمنطقة Africa/Algiers ثابتتان في كل الحسابات.
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { createDb, type ConsumedRow, type DbPort, type OrderLineRow, type OrderRow } from "./db.js";
import { checkPassword, hashPassword, requireAuth, requireRole, signToken } from "./auth.js";
import { orderTotal, profitOf, salaryFor, algiersDay, profitBreakdown, dailySlice, PLAN_LIMITS } from "./math.js";
import { createTransaction as sofizCreate, checkTransaction as sofizCheck, isPaid as sofizIsPaid } from "./sofizpay.js";

const normPhone = (p: string) => p.replace(/[\s-]/g, "");
const STATUSES = ["pending", "preparing", "ready", "onway", "delivered", "cancelled"] as const;
const NEXT: Record<string, string[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["onway", "delivered", "cancelled"],
  onway: ["delivered", "cancelled"],
  delivered: [], cancelled: [],
};

// ─── مخططات التحقق ───
const zLogin = z.object({ slug: z.string().min(1), phone: z.string().min(9), password: z.string().min(4) });
const zProduct = z.object({
  name: z.string().min(1), nameFr: z.string().optional(), branchId: z.string().min(1),
  buyPrice: z.number().min(0), sellPrice: z.number().min(0), qty: z.number().min(0),
  minQty: z.number().min(0).default(5), barcode: z.string().optional(), category: z.string().optional(),
  shelf: z.string().optional(), expiryDate: z.string().optional(), wholesalePrice: z.number().optional(),
  saleable: z.boolean().default(true), imageUrl: z.string().max(500).optional(),
});
const zOrderLine = z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(999), price: z.number().positive().optional() });
const zOrder = z.object({
  branchId: z.string().min(1), kind: z.enum(["dinein", "takeaway", "delivery", "qr_table"]),
  tableNo: z.string().optional(), lines: z.array(zOrderLine).min(1).max(100),
  discount: z.number().min(0).default(0), tax: z.number().min(0).default(0),
  payMethod: z.enum(["cash", "card", "credit"]), customer: z.string().optional(),
  phone: z.string().optional(), address: z.string().optional(),
});
const zShiftOpen = z.object({ branchId: z.string().min(1), openingCash: z.number().min(0), cashierId: z.string().min(1) });
const zShiftClose = z.object({ closingCash: z.number().min(0), note: z.string().default("") });
  const zUser = z.object({
    name: z.string().min(2), phone: z.string().min(9), password: z.string().min(6),
    role: z.enum(["owner", "manager", "cashier", "cook"]),
    hourlyRate: z.number().min(0).default(0), branchId: z.string().optional(),
  });
  const zDriver = z.object({
    name: z.string().min(2), phone: z.string().min(7),
    vehicle: z.string().optional(), kind: z.enum(["internal", "external"]).default("internal"),
    active: z.boolean().default(true),
  });

  // إغناء الطلب باسم السائق (الأول فقط للعموم — خصوصية)
  async function driverOf(db: DbPort, tenantId: string, driverId?: string | null, pub = false) {
    if (!driverId) return null;
    const d = (await db.listDrivers(tenantId)).find((x) => x.id === driverId);
    if (!d) return null;
    return pub ? { name: d.name.split(" ")[0] } : { id: d.id, name: d.name };
  }
  async function rich(db: DbPort, t: string, o: OrderRow) {
    return { ...o, driver: await driverOf(db, t, o.driverId) };
  }
  async function richAll(db: DbPort, t: string, orders: OrderRow[]) {
    const drivers = await db.listDrivers(t);
    return orders.map((o) => {
      const d = o.driverId ? drivers.find((x) => x.id === o.driverId) : null;
      return { ...o, driver: d ? { id: d.id, name: d.name } : null };
    });
  }

export function branchOf(req: Request): string | undefined {
  return req.auth?.branch_id ?? undefined;
}

// صلاحية الاشتراك: تُحجب الكتابة التجارية عند الانتهاء (402). من لا اشتراك له
// (مستأجرو ما قبل الفوترة) يُعامل كقديم معفى مع تحذير في السجل.
async function subscriptionOk(dbx: DbPort, tenantId: string): Promise<{ ok: boolean; reason?: string }> {
  const sub = await dbx.getSubscription(tenantId);
  if (!sub) { console.warn(`[billing] tenant ${tenantId} has no subscription (grandfathered)`); return { ok: true }; }
  if (sub.status === "suspended") return { ok: false, reason: "suspended" };
  if (sub.status === "pending") return { ok: true }; // مدفوع بانتظار تأكيد المشغّل — فترة سماح
  if (new Date(sub.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true };
}

const slugify = (name: string) => {
  const base = name.toLowerCase().trim().replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || `t-${Date.now().toString(36)}`;
};
const PLAN_PRICES: Record<string, number> = { starter: 2500, pro: 3000, mega: 4500 };

export async function buildApp(db?: DbPort) {
  const dbx = db ?? await createDb();
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // "*" كنص تعني الكل — أما ["*"] كمصفوفة فلا تطابق أي origin (كانت تكسر المتصفح!)
  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  app.use(cors({ origin: corsOrigin.trim() === "*" ? "*" : corsOrigin.split(",").map((s) => s.trim()) }));
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
  const publicLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
  const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
  const sensitiveLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
  // شبكة أمان عامة بسقف سخي (لا تعيق POS) — الحدود الضيقة أعلاه تبقى للمسارات الحساسة
  const globalLimit = rateLimit({
    windowMs: 15 * 60 * 1000, max: 2000,
    skip: (req) => req.path === "/health" || req.path === "/stream/kitchen",
  });
  app.use(globalLimit);

  // ─── بث لحظي: مستمعو المطبخ حسب المستأجر ───
  const hub = new Map<string, Set<import("express").Response>>();
  const broadcast = (tenantId: string, event: unknown) => {
    const set = hub.get(tenantId);
    if (!set) return;
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) res.write(msg);
  };

  // ─── رفع الصور (VPS: قرص محلي — يُستبدل بـ S3/Storage عند الحاجة) ───
  const upDir = process.env.UPLOAD_DIR ?? "./uploads";
  fs.mkdirSync(upDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_r, _f, cb) => cb(null, upDir),
      filename: (_r, f, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(f.originalname)}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_r, f, cb) => cb(null, f.mimetype.startsWith("image/")),
  });
  app.use("/uploads", express.static(path.resolve(upDir)));

  app.get("/health", (_req, res) => res.json({ ok: true, db: dbx.kind, tz: "Africa/Algiers", currency: "DZD" }));

  // ═══ التسجيل الذاتي العام (تجربة 30 يوماً — ثم دفع وتأكيد) ═══
  app.get("/public/plans", (_req, res) => {
    res.json([
      { id: "starter", priceDzd: 2500, branches: 1, onlineOrdering: false, growthPlanner: false },
      { id: "pro", priceDzd: 3000, branches: 2, onlineOrdering: true, growthPlanner: true },
      { id: "mega", priceDzd: 4500, branches: 5, onlineOrdering: true, growthPlanner: true },
    ]);
  });

  app.post("/public/signup", signupLimit, async (req, res, next) => {
    try {
      const b = z.object({
        name: z.string().min(2), type: z.enum(["restaurant", "shop"]),
        phone: z.string().min(9), address: z.string().default(""),
        plan: z.enum(["starter", "pro", "mega"]).default("pro"),
        ownerName: z.string().min(2),
        email: z.string().email().optional(),
        lang: z.enum(["ar", "fr"]).default("ar"),
      }).parse(req.body);
      let slug = slugify(b.name);
      for (let i = 1; await dbx.getTenantBySlug(slug); i++) slug = `${slugify(b.name)}-${i}`;
      const tenant = await dbx.createTenant({
        slug, name: b.name, type: b.type, lang: b.lang, plan: b.plan,
        phone: normPhone(b.phone), address: b.address, logoUrl: null,
        crmEnabled: true, overtimeEnabled: false, tablesCount: 4,
      });
      const branch = await dbx.createBranch({ tenantId: tenant.id, name: "الفرع الرئيسي", address: b.address });
      const emp = await dbx.createEmployee({
        tenantId: tenant.id, branchId: branch.id, name: b.ownerName, role: "owner",
        hiredAt: algiersDay(), hourlyRate: 0,
      });
      // مستخدم المالك بدون كلمة سر بعد — تُضبط عبر /public/set-password بعد الدفع.
      await dbx.createUser({
        tenantId: tenant.id, employeeId: emp.id, name: b.ownerName, phone: normPhone(b.phone),
        passwordHash: "", role: "owner", branchId: null, active: true,
      });
      res.status(201).json({ tenantId: tenant.id, slug, ownerPhone: normPhone(b.phone), email: b.email ?? null });
    } catch (e) { next(e); }
  });

  // حساب عام: إنشاء فاتورة SofizPay لمستأجر موجود (تم إنشاؤه عبر /public/signup).
  app.post("/public/checkout", signupLimit, async (req, res, next) => {
    try {
      const cfg = sofizCfg();
      if (!cfg.account) { res.status(501).json({ error: "payments_not_configured" }); return; }
      const b = z.object({
        tenantId: z.string().min(1),
        plan: z.enum(["starter", "pro", "mega"]).optional(),
        months: z.number().int().min(1).max(12).default(1),
        cycle: z.enum(["monthly", "yearly"]).optional(),
        email: z.string().email(),
        fullName: z.string().min(2).optional(),
      }).parse(req.body);
      const tenant = await dbx.getTenant(b.tenantId);
      if (!tenant) { res.status(404).json({ error: "tenant_not_found" }); return; }
      const plan = b.plan ?? tenant.plan;
      const monthlyPrice = PLAN_PRICES[plan] ?? 2500;
      const isYearly = b.cycle === "yearly";
      const months = isYearly ? 12 : b.months;
      const amount = isYearly ? monthlyPrice * 10 : monthlyPrice * b.months;
      const ref = `NEW-${tenant.slug}-${Date.now().toString(36)}`;
      const returnUrl = `${cfg.frontend}/billing/return?pref={id}`;
      const payment = await dbx.createBillingPayment({
        tenantId: tenant.id, ref, plan, months, amountDzd: amount,
        email: b.email, status: "initiated", sofizTransactionId: null, cibTransactionId: null,
      });
      const realReturnUrl = `${cfg.frontend}/billing/return?pref=${payment.id}`;
      const created = await sofizCreate(fetch, {
        base: cfg.base, account: cfg.account, amount,
        fullName: b.fullName ?? tenant.name, phone: tenant.phone, email: b.email,
        returnUrl: realReturnUrl, memo: ref,
      });
      if (!created.ok || !created.paymentUrl || !created.cibTransactionId) {
        await dbx.setBillingPayment(tenant.id, payment.id, { status: "failed" });
        res.status(502).json({ error: "provider_error", detail: created.error ?? "rejected" });
        return;
      }
      await dbx.setBillingPayment(tenant.id, payment.id, {
        sofizTransactionId: created.transactionId ?? null, cibTransactionId: created.cibTransactionId,
      });
      // subscription مؤقتة حتى الدفع — تصبح active عند العودة الناجحة.
      await dbx.saveSubscription({
        tenantId: tenant.id, plan, status: "pending",
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        amountDzd: amount, lastRef: ref, confirmedBy: null, confirmedAt: null,
      });
      res.status(201).json({ paymentId: payment.id, paymentUrl: created.paymentUrl, slug: tenant.slug });
    } catch (e) { next(e); }
  });

  // ضبط كلمة السر بعد الدفع — عام، يتحقق من الدفع لا-من التوكن.
  app.post("/public/set-password", async (req, res, next) => {
    try {
      const b = z.object({
        paymentId: z.string().min(1),
        password: z.string().min(6),
      }).parse(req.body);
      const payment = await dbx.getBillingPaymentById(b.paymentId);
      if (!payment) { res.status(404).json({ error: "payment_not_found" }); return; }
      if (payment.status !== "paid") { res.status(402).json({ error: "payment_not_confirmed" }); return; }
      const user = await dbx.findUserByPhone(payment.tenantId, (await dbx.getTenant(payment.tenantId))!.phone);
      if (!user) { res.status(404).json({ error: "user_not_found" }); return; }
      if (user.passwordHash && user.passwordHash.length > 0) {
        // كلمة السر مضبوطة مسبقاً — حماية بسيطة (idempotent لكنها ليست reset)
        res.json({ ok: true, slug: (await dbx.getTenant(payment.tenantId))!.slug });
        return;
      }
      await dbx.setUserPassword(payment.tenantId, user.id, await hashPassword(b.password));
      const tenant = await dbx.getTenant(payment.tenantId);
      res.status(201).json({ ok: true, slug: tenant!.slug });
    } catch (e) { next(e); }
  });

  // ═══ المصادقة ═══
  app.post("/auth/login", loginLimit, async (req, res, next) => {
    try {
      const b = zLogin.parse(req.body);
      const tenant = await dbx.getTenantBySlug(b.slug.trim());
      if (!tenant) { res.status(401).json({ error: "bad_credentials" }); return; }
      const user = await dbx.findUserByPhone(tenant.id, normPhone(b.phone));
      if (!user || !(await checkPassword(b.password, user.passwordHash))) {
        res.status(401).json({ error: "bad_credentials" }); return;
      }
      const token = signToken({ uid: user.id, tenant_id: tenant.id, role: user.role, branch_id: user.branchId, name: user.name });
      res.json({ token, user: { name: user.name, role: user.role, branchId: user.branchId }, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, type: tenant.type, plan: tenant.plan, lang: tenant.lang } });
    } catch (e) { next(e); }
  });

  app.get("/auth/me", requireAuth, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenant(req.auth!.tenant_id);
      res.json({ auth: req.auth, tenant });
    } catch (e) { next(e); }
  });

  app.get("/employees", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { res.json(await dbx.listEmployees(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });

  // تغيير كلمة السر (تتطلب الحالية) — أول ما يجب فعله بعد بذرة demo1234
  app.post("/auth/change-password", requireAuth, async (req, res, next) => {
    try {
      const b = z.object({ current: z.string().min(1), next: z.string().min(6) }).parse(req.body);
      const me = await dbx.findUserById(req.auth!.tenant_id, req.auth!.uid);
      if (!me || !(await checkPassword(b.current, me.passwordHash))) {
        res.status(401).json({ error: "bad_current_password" }); return;
      }
      await dbx.setUserPassword(req.auth!.tenant_id, me.id, await hashPassword(b.next));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // إنشاء حساب موظف (مالك/مدير فرع)
  app.post("/auth/users", requireAuth, requireRole("owner", "manager"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = zUser.parse(req.body);
      const t = req.auth!.tenant_id;
      // فرع المدير يُفرض؛ المالك يختار
      const empBranch = branchOf(req) ?? b.branchId ?? req.auth!.branch_id ?? "main";
      const emp = await dbx.createEmployee({
        tenantId: t, branchId: empBranch,
        name: b.name, role: b.role, hiredAt: new Date().toISOString().slice(0, 10), hourlyRate: b.hourlyRate,
      });
      const user = await dbx.createUser({
        tenantId: t, employeeId: emp.id, name: b.name, phone: normPhone(b.phone),
        passwordHash: await hashPassword(b.password), role: b.role,
        branchId: empBranch === "main" ? null : empBranch, active: true,
      });
      res.status(201).json({ id: user.id, employeeId: emp.id });
    } catch (e) { next(e); }
  });

  // ═══ المستأجر ═══
  app.get("/tenant", requireAuth, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenant(req.auth!.tenant_id);
      if (!tenant) { res.status(404).json({ error: "tenant_gone" }); return; }
      const branches = await dbx.listBranches(req.auth!.tenant_id);
      res.json({ tenant, branches });
    } catch (e) { next(e); }
  });

  app.patch("/tenant", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      const allowed = z.object({
        name: z.string().min(2).optional(), address: z.string().optional(), phone: z.string().optional(),
        lang: z.enum(["ar", "fr"]).optional(), crmEnabled: z.boolean().optional(),
        overtimeEnabled: z.boolean().optional(), logoUrl: z.string().optional(),
        tablesCount: z.number().int().min(1).max(60).optional(),
      }).parse(req.body);
      res.json(await dbx.updateTenant(req.auth!.tenant_id, allowed));
    } catch (e) { next(e); }
  });

  // ═══ المنتجات ═══
  app.get("/products", requireAuth, async (req, res, next) => {
    try {
      res.json(await dbx.listProducts(req.auth!.tenant_id, (req.query.branch as string) || branchOf(req)));
    } catch (e) { next(e); }
  });

  app.post("/products", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = zProduct.parse(req.body);
      res.status(201).json(await dbx.createProduct({
        tenantId: req.auth!.tenant_id, name: b.name, nameFr: b.nameFr ?? b.name,
        branchId: branchOf(req) ?? b.branchId, buyPrice: b.buyPrice, sellPrice: b.sellPrice, qty: b.qty, minQty: b.minQty,
        barcode: b.barcode ?? null, imageUrl: b.imageUrl ?? null,
        category: b.category ?? null, shelf: b.shelf ?? null, expiryDate: b.expiryDate ?? null,
        wholesalePrice: b.wholesalePrice ?? null, active: true, saleable: b.saleable,
      }));
    } catch (e) { next(e); }
  });

  app.patch("/products/:id", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = z.object({
        name: z.string().min(1).optional(), sellPrice: z.number().min(0).optional(),
        buyPrice: z.number().min(0).optional(), minQty: z.number().min(0).optional(),
        barcode: z.string().nullable().optional(), category: z.string().nullable().optional(),
        shelf: z.string().nullable().optional(), expiryDate: z.string().nullable().optional(),
        active: z.boolean().optional(), imageUrl: z.string().nullable().optional(),
        saleable: z.boolean().optional(),
      }).parse(req.body);
      await mustOwnProduct(dbx, req.auth!.tenant_id, branchOf(req), req.params.id);
      res.json(await dbx.updateProduct(req.auth!.tenant_id, req.params.id, b));
    } catch (e) { next(e); }
  });

  app.post("/products/:id/stock", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = z.object({ delta: z.number().min(-100000).max(100000), reason: z.string().min(1) }).parse(req.body);
      await mustOwnProduct(dbx, req.auth!.tenant_id, branchOf(req), req.params.id);
      res.json(await dbx.adjustStock(req.auth!.tenant_id, req.params.id, b.delta, b.reason));
    } catch (e) { next(e); }
  });

  app.get("/moves", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      res.json(await dbx.listMoves(req.auth!.tenant_id, (req.query.product as string) || undefined));
    } catch (e) { next(e); }
  });

  // عزل الفروع: المدير/الكاشير/الطباخ مقيد بفرعه؛ المالك حر. تُرفض الكتابة خارج الفرع بـ404.
  async function mustOwnProduct(dbx: DbPort, t: string, scope: string | undefined, id: string) {
    const p = (await dbx.listProducts(t)).find((x) => x.id === id);
    if (!p || (scope && p.branchId !== scope)) throw new Error("product");
    return p;
  }

  // ═══ المخزون: خصم مع تنبيه عبور الحد + خصم وصفات (تحذير مع المتابعة) ═══
  // خصم كمية مع تنبيه تلقائي عند عبور الحد الأدنى نزولاً. يُستخدم في البيع والهدر.
  async function applyStockDown(tenantId: string, productId: string, qty: number, reason: string) {
    const before = (await dbx.listProducts(tenantId)).find((p) => p.id === productId);
    const after = await dbx.adjustStock(tenantId, productId, -qty, reason);
    if (before && before.qty > before.minQty && after.qty <= after.minQty) {
      await dbx.createAlert({
        tenantId, kind: "low_stock", refId: productId,
        message: `نفد تقريباً: ${after.name} (${after.qty})`, read: false,
      });
    }
    return after;
  }

  interface Shortage { productId: string; name: string; missing: number }
  // خصم مكونات وصفة طبق: يُخصم المتاح حتى الصفر، والنقص يُعاد كتحذيرات (لا يمنع البيع).
  async function consumeRecipe(
    tenantId: string, dishId: string, dishQty: number, orderNum: number,
    stock: Map<string, { qty: number; minQty: number; name: string }>,
  ): Promise<{ consumed: ConsumedRow[]; warnings: Shortage[] }> {
    const consumed: ConsumedRow[] = [];
    const warnings: Shortage[] = [];
    const recipe = await dbx.listRecipes(tenantId, dishId);
    for (const item of recipe) {
      const need = item.qty * dishQty;
      const s = stock.get(item.ingredientId);
      const avail = s?.qty ?? 0;
      const take = Math.min(avail, need);
      if (take > 0) {
        await applyStockDown(tenantId, item.ingredientId, take, `recipe #${orderNum}`);
        consumed.push({ ingredientId: item.ingredientId, qty: take });
        if (s) s.qty = Math.max(0, s.qty - take);
      }
      if (take < need) {
        const nm = s?.name ?? item.ingredientId;
        warnings.push({ productId: item.ingredientId, name: nm, missing: Math.round((need - take) * 100) / 100 });
      }
    }
    return { consumed, warnings };
  }

  // ═══ الطلبات (داخلية) ═══
  async function buildLines(tenantId: string, lines: { productId: string; qty: number; price?: number }[], branchId?: string) {
    const products = await dbx.listProducts(tenantId);
    const map = new Map(products.map((p) => [p.id, p]));
    const out: OrderLineRow[] = [];
    for (const l of lines) {
      const p = map.get(l.productId);
      if (!p || !p.active || p.saleable === false) throw Object.assign(new Error("product_unavailable"), { status: 409 });
      if (branchId && p.branchId !== branchId) throw Object.assign(new Error("product_unavailable"), { status: 409 });
      if (p.qty < l.qty) throw Object.assign(new Error(`insufficient_stock:${p.name}:${p.qty}`), { status: 409 });
      // تجاوز السعر (وضع الجملة): مضبوط بين سعر الشراء وسعر البيع لمنع العبث
      const price = l.price === undefined ? p.sellPrice : Math.min(p.sellPrice, Math.max(p.buyPrice, l.price));
      out.push({ productId: p.id, name: p.name, qty: l.qty, price });
    }
    return { out, map };
  }

  app.get("/orders", requireAuth, async (req, res, next) => {
    try {
      const list = await dbx.listOrders(req.auth!.tenant_id, {
        status: (req.query.status as string) || undefined,
        branchId: (req.query.branch as string) || branchOf(req),
        since: (req.query.since as string) || undefined,
      });
      res.json(await richAll(dbx, req.auth!.tenant_id, list));
    } catch (e) { next(e); }
  });

  app.post("/orders", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      const b = zOrder.parse(req.body);
      const t = req.auth!.tenant_id;
      const sub = await subscriptionOk(dbx, t);
      if (!sub.ok) { res.status(402).json({ error: "subscription_expired", reason: sub.reason }); return; }
      const branchId = branchOf(req) ?? b.branchId;
      if (b.payMethod === "credit" && !b.phone?.trim()) {
        res.status(400).json({ error: "phone_required" }); return;
      }
      const { out, map } = await buildLines(t, b.lines, branchId);
      const total = orderTotal(out, b.discount, b.tax);
      const num = await dbx.nextOrderNum(t);
      const shift = await dbx.getOpenShift(t, branchId);
      const created = await dbx.createOrder({
        num, tenantId: t, branchId, shiftId: shift?.id ?? null, kind: b.kind,
        tableNo: b.tableNo ?? null, status: "preparing", lines: out,
        discount: b.discount, tax: b.tax, total, payMethod: b.payMethod,
        customer: b.customer ?? null, phone: b.phone ? normPhone(b.phone) : null,
        address: b.address ?? null, rating: null, consumed: [],
      });
      const stock = new Map([...map.values()].map((p) => [p.id, { qty: p.qty, minQty: p.minQty, name: p.name }]));
      const consumed: ConsumedRow[] = [];
      const warnings: Shortage[] = [];
      for (const l of out) {
        await applyStockDown(t, l.productId, l.qty, `sale #${num}`);
        const r = await consumeRecipe(t, l.productId, l.qty, num, stock);
        consumed.push(...r.consumed);
        warnings.push(...r.warnings);
      }
      for (const w of warnings) {
        await dbx.createAlert({ tenantId: t, kind: "recipe_short", refId: w.productId, message: `نقص مكوّن للطلب #${num}: ${w.name} (عجز ${w.missing})`, read: false });
      }
      const full = { ...created, consumed, warnings, driver: null };
      // البيع الآجل: دين على العميل (يُنشأ إن كان جديداً)
      if (b.payMethod === "credit") {
        const cust = await dbx.findOrCreateCustomer(t, b.customer?.trim() || b.phone!.trim(), normPhone(b.phone!));
        await dbx.addCustomerDebt(t, cust.id, total);
      }
      // حفظ المكونات المخصومة فعلياً لعكسها عند الإلغاء
      await dbx.setOrderConsumed(t, created.id, consumed).catch(() => null);
      broadcast(t, { type: "order.created", order: full });
      res.status(201).json(full);
    } catch (e) { next(e); }
  });

  app.patch("/orders/:id", requireAuth, requireRole("owner", "manager", "cashier", "cook"), async (req, res, next) => {
    try {
      const b = z.object({ status: z.enum(STATUSES) }).parse(req.body);
      const t = req.auth!.tenant_id;
      const cur = await dbx.getOrder(t, req.params.id);
      if (!cur) { res.status(404).json({ error: "not_found" }); return; }
      if (!NEXT[cur.status].includes(b.status)) { res.status(400).json({ error: "bad_transition" }); return; }
      if (b.status === "cancelled" && !["owner", "manager"].includes(req.auth!.role)) {
        res.status(403).json({ error: "cancel_requires_manager" }); return;
      }
      // الإلغاء يعيد المخزون (كل الحالات غير الملغاة كانت قد خصمته عند الإنشاء)
      if (b.status === "cancelled" && cur.status !== "cancelled") {
        for (const l of cur.lines) {
          try { await dbx.adjustStock(t, l.productId, l.qty, `cancel #${cur.num}`); }
          catch { /* منتج محذوف — أكمل الإلغاء */ }
        }
        for (const c of cur.consumed ?? []) {
          try { await dbx.adjustStock(t, c.ingredientId, c.qty, `cancel-restore #${cur.num}`); }
          catch { /* تجاهل */ }
        }
        // إلغاء البيع الآجل يُسقط الدين
        if (cur.payMethod === "credit" && cur.phone) {
          try {
            const cust = await dbx.findOrCreateCustomer(t, cur.customer ?? cur.phone, cur.phone);
            await dbx.addCustomerDebt(t, cust.id, -cur.total);
          } catch { /* تجاهل */ }
        }
      }
      const updated = await dbx.setOrderStatus(t, req.params.id, b.status);
      const full = await rich(dbx, t, updated);
      broadcast(t, { type: "order.status", order: full });
      res.json(full);
    } catch (e) { next(e); }
  });

  // ═══ الورديات ═══
  app.get("/shifts/open", requireAuth, async (req, res, next) => {
    try { res.json(await dbx.getOpenShift(req.auth!.tenant_id, branchOf(req))); }
    catch (e) { next(e); }
  });

  app.post("/shifts/open", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      const b = zShiftOpen.parse(req.body);
      const t = req.auth!.tenant_id;
      const branchId = branchOf(req) ?? b.branchId;
      if (await dbx.getOpenShift(t, branchId)) { res.status(400).json({ error: "shift_already_open" }); return; }
      res.status(201).json(await dbx.openShift({
        tenantId: t, branchId, cashierId: b.cashierId,
        openedAt: new Date().toISOString(), openingCash: b.openingCash, note: "",
      }));
    } catch (e) { next(e); }
  });

  app.post("/shifts/:id/close", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      const b = zShiftClose.parse(req.body);
      const t = req.auth!.tenant_id;
      const shifts = await dbx.listShifts(t);
      const sh = shifts.find((s) => s.id === req.params.id && !s.closedAt);
      if (!sh) { res.status(404).json({ error: "not_found" }); return; }
      const orders = await dbx.listOrders(t, { branchId: sh.branchId, since: sh.openedAt });
      const cashSales = orders.filter((o) => o.payMethod === "cash").reduce((x, o) => x + o.total, 0);
      const expected = sh.openingCash + cashSales;
      const diff = b.closingCash - expected;
      if (Math.abs(diff) >= 1000 && !b.note.trim()) {
        res.status(400).json({ error: "note_required", expected, diff }); return;
      }
      res.json({ shift: await dbx.closeShift(t, sh.id, b.closingCash, b.note), expected, diff });
    } catch (e) { next(e); }
  });

  app.get("/shifts", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { res.json(await dbx.listShifts(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });

  // ═══ الحضور والرواتب ═══
  app.post("/attendance/in", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      const b = z.object({ employeeId: z.string().min(1) }).parse(req.body);
      const today = algiersDay();
      res.status(201).json(await dbx.checkIn({
        tenantId: req.auth!.tenant_id, employeeId: b.employeeId, date: today, inAt: new Date().toISOString(), overtimeMin: 0,
      }));
    } catch (e) { next(e); }
  });

  app.post("/attendance/:id/out", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try { res.json(await dbx.checkOut(req.auth!.tenant_id, req.params.id)); }
    catch (e) { next(e); }
  });

  app.get("/attendance", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { res.json(await dbx.listAttendance(req.auth!.tenant_id, (req.query.date as string) || undefined)); }
    catch (e) { next(e); }
  });

  app.get("/salaries", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const t = req.auth!.tenant_id;
      const tenant = await dbx.getTenant(t);
      const [emps, att] = await Promise.all([dbx.listEmployees(t), dbx.listAttendance(t)]);
      res.json(emps.map((e) => ({
        employee: e,
        total: salaryFor(att.filter((a) => a.employeeId === e.id), e.hourlyRate, 1.5, tenant?.overtimeEnabled ?? false),
      })));
    } catch (e) { next(e); }
  });

  // ═══ العملاء (تُحجب كلياً عند التعطيل) ═══
  async function needCrm(req: Request, res: Response) {
    const tenant = await dbx.getTenant(req.auth!.tenant_id);
    if (!tenant?.crmEnabled) { res.status(403).json({ error: "crm_disabled" }); return null; }
    return tenant;
  }
  app.get("/customers", requireAuth, async (req, res, next) => {
    try { if (!await needCrm(req, res)) return; res.json(await dbx.listCustomers(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });
  app.post("/customers", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      if (!await needCrm(req, res)) return;
      const b = z.object({ name: z.string().min(1), phone: z.string().min(9), address: z.string().optional() }).parse(req.body);
      res.status(201).json(await dbx.createCustomer({ tenantId: req.auth!.tenant_id, name: b.name, phone: normPhone(b.phone), address: b.address ?? null }));
    } catch (e) { next(e); }
  });
  // تسديد دين عميل (الكاشير يحصّل)
  app.post("/customers/:id/pay", requireAuth, requireRole("owner", "manager", "cashier"), async (req, res, next) => {
    try {
      if (!await needCrm(req, res)) return;
      const b = z.object({ amount: z.number().positive(), method: z.string().default("cash"), ref: z.string().optional() }).parse(req.body);
      res.json(await dbx.recordCustomerPayment(req.auth!.tenant_id, req.params.id, b.amount, b.method, b.ref));
    } catch (e) { next(e); }
  });
  app.get("/customers/:id/payments", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      if (!await needCrm(req, res)) return;
      res.json(await dbx.listCustomerPayments(req.auth!.tenant_id, req.params.id));
    } catch (e) { next(e); }
  });

  // ═══ مخطط النمو (برو/ميغا فقط — المالك) ═══
  async function needGrowth(req: Request, res: Response) {
    const tenant = await dbx.getTenant(req.auth!.tenant_id);
    if (!tenant || !PLAN_LIMITS[tenant.plan]?.growth) { res.status(403).json({ error: "upgrade_needed" }); return null; }
    return tenant;
  }
  app.get("/goals", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { if (!await needGrowth(req, res)) return; res.json(await dbx.listGoals(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });
  app.post("/goals", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      if (!await needGrowth(req, res)) return;
      const b = z.object({ title: z.string().min(1), target: z.number().min(1), monthly: z.number().min(0) }).parse(req.body);
      res.status(201).json(await dbx.createGoal({ tenantId: req.auth!.tenant_id, title: b.title, target: b.target, saved: 0, monthly: b.monthly }));
    } catch (e) { next(e); }
  });
  app.patch("/goals/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      if (!await needGrowth(req, res)) return;
      const b = z.object({ title: z.string().min(1).optional(), target: z.number().min(1).optional(), saved: z.number().min(0).optional(), monthly: z.number().min(0).optional() }).parse(req.body);
      res.json(await dbx.updateGoal(req.auth!.tenant_id, req.params.id, b));
    } catch (e) { next(e); }
  });
  app.delete("/goals/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      if (!await needGrowth(req, res)) return;
      await dbx.deleteGoal(req.auth!.tenant_id, req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ═══ المصاريف الثابتة (مالك فقط) ═══
  const zOverhead = z.object({
    name: z.string().min(2), kind: z.enum(["rent", "electricity", "gas", "water", "internet", "other"]).default("other"),
    monthly: z.number().min(0), active: z.boolean().default(true), notes: z.string().optional(),
  });
  app.get("/overheads", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { res.json(await dbx.listOverheads(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });
  app.post("/overheads", requireAuth, requireRole("owner"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = zOverhead.parse(req.body);
      res.status(201).json(await dbx.createOverhead({
        tenantId: req.auth!.tenant_id, name: b.name, kind: b.kind, monthly: b.monthly,
        active: b.active, notes: b.notes ?? null,
      }));
    } catch (e) { next(e); }
  });
  app.patch("/overheads/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      const b = zOverhead.partial().parse(req.body);
      res.json(await dbx.updateOverhead(req.auth!.tenant_id, req.params.id, b));
    } catch (e) { next(e); }
  });
  app.delete("/overheads/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
    try { await dbx.deleteOverhead(req.auth!.tenant_id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ═══ الفروع (حد الخطة يُفرض في الخادم) ═══
  app.get("/branches", requireAuth, async (req, res, next) => {
    try { res.json(await dbx.listBranches(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });
  app.post("/branches", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      const t = req.auth!.tenant_id;
      const tenant = await dbx.getTenant(t);
      const limit = PLAN_LIMITS[tenant?.plan ?? "starter"].branches;
      const cur = await dbx.listBranches(t);
      if (cur.length >= limit) { res.status(403).json({ error: "branch_limit", limit }); return; }
      const b = z.object({ name: z.string().min(1), address: z.string().default("") }).parse(req.body);
      res.status(201).json(await dbx.createBranch({ tenantId: t, name: b.name, address: b.address }));
    } catch (e) { next(e); }
  });

  // ═══ الفوترة والاشتراكات ═══
  // التدفق: trialing (30 يوماً) → SofizPay أونلاين (تفعيل تلقائي) أو CCP/تحويل + مرجع
  // → pending (سماح) → المشغّل يؤكد → active.
  async function activateSubscription(tenantId: string, plan: string, months: number, ref: string, by: string) {
    const tenant = await dbx.getTenant(tenantId);
    if (!tenant) throw new Error("tenant");
    if (plan !== tenant.plan) await dbx.updateTenant(tenantId, { plan });
    const cur = await dbx.getSubscription(tenantId);
    const from = Math.max(Date.now(), cur ? new Date(cur.expiresAt).getTime() : 0);
    const expiresAt = new Date(from + months * 30 * 86_400_000).toISOString();
    return dbx.saveSubscription({
      tenantId, plan, status: "active",
      startedAt: cur?.startedAt ?? new Date().toISOString(), expiresAt,
      amountDzd: (PLAN_PRICES[plan] ?? 2500) * months,
      lastRef: ref, confirmedBy: by, confirmedAt: new Date().toISOString(),
    });
  }
  const sofizCfg = () => ({
    account: process.env.SOFIZPAY_ACCOUNT ?? "",
    base: (process.env.SOFIZPAY_BASE ?? "https://sofizpay.com/sandbox").replace(/\/$/, ""),
    frontend: (process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN?.split(",")[0] ?? "http://localhost:5173").replace(/\/$/, ""),
  });

  app.get("/billing/status", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      const sub = await dbx.getSubscription(req.auth!.tenant_id);
      if (!sub) { res.json({ status: "none" }); return; }
      res.json({
        plan: sub.plan, status: sub.status, expiresAt: sub.expiresAt,
        amountDzd: sub.amountDzd,
        online: sofizCfg().account !== "",
        payInstructions: {
          ar: `حوّل ${sub.amountDzd} دج إلى CCP (يُعلن عنه المشغّل) ثم أرسل رقم المرجع من الأسفل.`,
          ccp: process.env.PAY_CCP ?? "يُضبط من المشغّل",
        },
      });
    } catch (e) { next(e); }
  });

  app.post("/billing/submit-payment", requireAuth, requireRole("owner"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = z.object({ ref: z.string().min(3), months: z.number().int().min(1).max(12).default(1) }).parse(req.body);
      const t = req.auth!.tenant_id;
      const tenant = await dbx.getTenant(t);
      const sub = await dbx.getSubscription(t);
      await dbx.saveSubscription({
        tenantId: t, plan: tenant?.plan ?? "starter", status: "pending",
        startedAt: sub?.startedAt ?? new Date().toISOString(),
        expiresAt: sub?.expiresAt ?? new Date().toISOString(),
        amountDzd: (PLAN_PRICES[tenant?.plan ?? "starter"] ?? 2500) * b.months,
        lastRef: b.ref, confirmedBy: null, confirmedAt: null,
      });
      res.json({ ok: true, status: "pending" });
    } catch (e) { next(e); }
  });

  // تأكيد المشغّل (OPERATOR_KEY في الخادم فقط — لا يصل للواجهة أبداً)
  app.post("/billing/admin/confirm", sensitiveLimit, async (req, res, next) => {
    try {
      if (!process.env.OPERATOR_KEY || req.headers["x-operator-key"] !== process.env.OPERATOR_KEY) {
        res.status(401).json({ error: "unauthorized" }); return;
      }
      const b = z.object({ tenantSlug: z.string().min(1), months: z.number().int().min(1).max(12), plan: z.enum(["starter", "pro", "mega"]).optional() }).parse(req.body);
      const tenant = await dbx.getTenantBySlug(b.tenantSlug);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      const sub = await activateSubscription(tenant.id, b.plan ?? tenant.plan, b.months, "operator", "operator");
      res.json({ ok: true, expiresAt: sub.expiresAt });
    } catch (e) { next(e); }
  });

  // ─── SofizPay أونلاين (CIB/EDAHABIA) ───
  // 1) المالك يبدأ الدفع → ننشئ Payment ونرجع رابط الدفع (cib id يبقى في الخادم فقط).
  app.post("/billing/sofizpay/initiate", requireAuth, requireRole("owner"), sensitiveLimit, async (req, res, next) => {
    try {
      const cfg = sofizCfg();
      if (!cfg.account) { res.status(501).json({ error: "payments_not_configured" }); return; }
      const b = z.object({
        plan: z.enum(["starter", "pro", "mega"]).optional(),
        months: z.number().int().min(1).max(12).default(1),
        cycle: z.enum(["monthly", "yearly"]).optional(),
        email: z.string().email(),
        fullName: z.string().min(2).optional(),
      }).parse(req.body);
      const t = req.auth!.tenant_id;
      const tenant = await dbx.getTenant(t);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      const plan = b.plan ?? tenant.plan;
      const monthlyPrice = PLAN_PRICES[plan] ?? 2500;
      const isYearly = b.cycle === "yearly";
      const months = isYearly ? 12 : b.months;
      const amount = isYearly ? monthlyPrice * 10 : monthlyPrice * b.months;
      const ref = `SUB-${tenant.slug}-${Date.now().toString(36)}`;
      const payment = await dbx.createBillingPayment({
        tenantId: t, ref, plan, months, amountDzd: amount,
        email: b.email, status: "initiated", sofizTransactionId: null, cibTransactionId: null,
      });
      const returnUrl = `${cfg.frontend}/billing/return?pref=${payment.id}`;
      const created = await sofizCreate(fetch, {
        base: cfg.base, account: cfg.account, amount,
        fullName: b.fullName ?? tenant.name, phone: tenant.phone, email: b.email,
        returnUrl, memo: ref,
      });
      if (!created.ok || !created.paymentUrl || !created.cibTransactionId) {
        await dbx.setBillingPayment(t, payment.id, { status: "failed" });
        res.status(502).json({ error: "provider_error", detail: created.error ?? "rejected" });
        return;
      }
      await dbx.setBillingPayment(t, payment.id, {
        sofizTransactionId: created.transactionId ?? null, cibTransactionId: created.cibTransactionId,
      });
      res.status(201).json({ paymentId: payment.id, paymentUrl: created.paymentUrl });
    } catch (e) { next(e); }
  });

  // 2) العودة من صفحة الدفع (عامة — الزبون بلا توكن أحياناً): نتحقق من الخادم ثم نحوّل للواجهة.
  app.get("/billing/sofizpay/return", async (req, res, next) => {
    try {
      const cfg = sofizCfg();
      const failUrl = `${cfg.frontend}/billing/return?ok=0`;
      const pref = typeof req.query.pref === "string" ? req.query.pref : "";
      if (!pref) { res.redirect(failUrl); return; }
      const payment = await dbx.getBillingPaymentById(pref);
      if (!payment) { res.redirect(failUrl); return; }
      if (payment.status === "paid") {
        const isNew = payment.ref.startsWith("NEW-");
        const okUrl = isNew
          ? `${cfg.frontend}/set-password?pref=${payment.id}&ok=1`
          : `${cfg.frontend}/billing/return?ok=1&pref=${payment.id}`;
        res.redirect(okUrl); return;
      }
      if (!payment.cibTransactionId || !cfg.account) {
        await dbx.setBillingPayment(payment.tenantId, payment.id, { status: "failed" });
        res.redirect(failUrl); return;
      }
      const check = await sofizCheck(fetch, cfg.base, payment.cibTransactionId);
      if (sofizIsPaid(check, cfg.account)) {
        await dbx.setBillingPayment(payment.tenantId, payment.id, { status: "paid", confirmedAt: new Date().toISOString() });
        await activateSubscription(payment.tenantId, payment.plan, payment.months, payment.ref, "sofizpay");
        // مستأجر جديد (تم إنشاؤه للتو عبر /public/signup): لم يضبط كلمة سر بعد.
        // وجّهه إلى نموذج التعيين قبل تسجيل الدخول.
        const isNew = payment.ref.startsWith("NEW-");
        const okUrl = isNew
          ? `${cfg.frontend}/set-password?pref=${payment.id}&ok=1`
          : `${cfg.frontend}/billing/return?ok=1&pref=${payment.id}`;
        res.redirect(okUrl);
      } else {
        await dbx.setBillingPayment(payment.tenantId, payment.id, { status: check.ok ? "failed" : payment.status });
        res.redirect(check.ok ? failUrl : `${cfg.frontend}/billing/return?ok=0&pref=${payment.id}&pending=1`);
      }
    } catch (e) { next(e); }
  });

  // 3) استعلام الحالة (لاستطلاع الواجهة أثناء الدفع) — تُزامَن مع المزوّد عند الحاجة.
  // لا نوسم بالفشل من الاستطلاع أبداً: الدفعة حديثة الإنشاء بانتظار الزبون بطبيعتها.
  // تُوسم منتهية بعد 45 دقيقة دون دفع، وفاشلة فقط عند العودة دون دفع.
  app.get("/billing/sofizpay/status/:paymentId", requireAuth, requireRole("owner"), async (req, res, next) => {
    try {
      const cfg = sofizCfg();
      const t = req.auth!.tenant_id;
      const payment = await dbx.getBillingPayment(t, req.params.paymentId);
      if (!payment) { res.status(404).json({ error: "not_found" }); return; }
      if (payment.status === "initiated") {
        const ageMin = (Date.now() - new Date(payment.createdAt).getTime()) / 60000;
        if (payment.cibTransactionId && cfg.account) {
          const check = await sofizCheck(fetch, cfg.base, payment.cibTransactionId);
          if (sofizIsPaid(check, cfg.account)) {
            await dbx.setBillingPayment(t, payment.id, { status: "paid", confirmedAt: new Date().toISOString() });
            const sub = await activateSubscription(t, payment.plan, payment.months, payment.ref, "sofizpay");
            res.json({ status: "paid", expiresAt: sub.expiresAt });
            return;
          }
        }
        if (ageMin > 45) await dbx.setBillingPayment(t, payment.id, { status: "expired" });
      }
      const cur = await dbx.getBillingPayment(t, payment.id);
      const sub = await dbx.getSubscription(t);
      res.json({ status: cur?.status ?? payment.status, expiresAt: sub?.expiresAt ?? null });
    } catch (e) { next(e); }
  });

  // ═══ لوحة المشغّل (منصة SaaS — بمفتاح OPERATOR_KEY فقط، لا يصل للواجهة العامة) ═══
  function requireOperator(req: Request, res: Response, next: NextFunction) {
    if (!process.env.OPERATOR_KEY || req.headers["x-operator-key"] !== process.env.OPERATOR_KEY) {
      res.status(401).json({ error: "unauthorized" }); return;
    }
    next();
  }

  app.get("/ops/overview", requireOperator, sensitiveLimit, async (_req, res, next) => {
    try {
      const [tenants, users] = await Promise.all([dbx.listTenants(), dbx.listAllUsers()]);
      const dayStart = new Date(`${algiersDay()}T00:00:00+01:00`).toISOString();
      let ordersToday = 0, revenueToday = 0;
      const subs: Record<string, number> = { active: 0, trialing: 0, pending: 0, past_due: 0, suspended: 0, none: 0 };
      for (const tn of tenants) {
        const sub = await dbx.getSubscription(tn.id);
        subs[sub?.status ?? "none"] = (subs[sub?.status ?? "none"] ?? 0) + 1;
        const orders = await dbx.listOrders(tn.id, { since: dayStart });
        const live = orders.filter((o) => o.status !== "cancelled");
        ordersToday += live.length;
        revenueToday += live.reduce((x, o) => x + o.total, 0);
      }
      const recentPayments = (await dbx.listAllBillingPayments(undefined, 20)).map((p) => {
        const tn = tenants.find((t) => t.id === p.tenantId);
        return { ...p, tenantSlug: tn?.slug ?? "?", tenantName: tn?.name ?? "?" };
      });
      res.json({
        tenants: tenants.length, users: users.length, ordersToday, revenueToday,
        subs, recentPayments, generatedAt: new Date().toISOString(),
      });
    } catch (e) { next(e); }
  });

  app.get("/ops/tenants", requireOperator, sensitiveLimit, async (_req, res, next) => {
    try {
      const tenants = await dbx.listTenants();
      const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const rows = await Promise.all(tenants.map(async (tn) => {
        const [users, branches, sub, orders] = await Promise.all([
          dbx.listAllUsers().then((u) => u.filter((x) => x.tenantId === tn.id)),
          dbx.listBranches(tn.id),
          dbx.getSubscription(tn.id),
          dbx.listOrders(tn.id, { since: since30 }),
        ]);
        const live = orders.filter((o) => o.status !== "cancelled");
        return {
          id: tn.id, slug: tn.slug, name: tn.name, type: tn.type, plan: tn.plan,
          lang: tn.lang, phone: tn.phone, users: users.length, branches: branches.length,
          subscription: sub ? { status: sub.status, expiresAt: sub.expiresAt, plan: sub.plan } : null,
          orders30d: live.length, revenue30d: live.reduce((x, o) => x + o.total, 0),
        };
      }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.get("/ops/tenants/:id", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const tn = await dbx.getTenant(req.params.id);
      if (!tn) { res.status(404).json({ error: "not_found" }); return; }
      const [sub, branches, orders, payments] = await Promise.all([
        dbx.getSubscription(tn.id),
        dbx.listBranches(tn.id),
        dbx.listOrders(tn.id),
        dbx.listBillingPayments(tn.id),
      ]);
      const users = (await dbx.listAllUsers()).filter((u) => u.tenantId === tn.id);
      res.json({ tenant: tn, subscription: sub, branches, users, payments, recentOrders: orders.slice(0, 10) });
    } catch (e) { next(e); }
  });

  app.patch("/ops/tenants/:id", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const b = z.object({
        plan: z.enum(["starter", "pro", "mega"]).optional(),
        crmEnabled: z.boolean().optional(), overtimeEnabled: z.boolean().optional(),
        name: z.string().min(2).optional(), phone: z.string().optional(),
      }).parse(req.body);
      const tn = await dbx.getTenant(req.params.id);
      if (!tn) { res.status(404).json({ error: "not_found" }); return; }
      const updated = await dbx.updateTenant(tn.id, b);
      if (b.plan) {
        const sub = await dbx.getSubscription(tn.id);
        if (sub) await dbx.saveSubscription({ ...sub, plan: b.plan });
      }
      res.json(updated);
    } catch (e) { next(e); }
  });

  app.post("/ops/tenants/:id/suspend", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const tn = await dbx.getTenant(req.params.id);
      if (!tn) { res.status(404).json({ error: "not_found" }); return; }
      const cur = await dbx.getSubscription(tn.id);
      await dbx.saveSubscription({
        tenantId: tn.id, plan: cur?.plan ?? tn.plan, status: "suspended",
        startedAt: cur?.startedAt ?? new Date().toISOString(),
        expiresAt: cur?.expiresAt ?? new Date().toISOString(),
        amountDzd: cur?.amountDzd ?? 0, lastRef: cur?.lastRef ?? null,
        confirmedBy: "operator", confirmedAt: new Date().toISOString(),
      });
      res.json({ ok: true, status: "suspended" });
    } catch (e) { next(e); }
  });

  app.post("/ops/tenants/:id/unsuspend", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const tn = await dbx.getTenant(req.params.id);
      if (!tn) { res.status(404).json({ error: "not_found" }); return; }
      const cur = await dbx.getSubscription(tn.id);
      const expired = !cur || new Date(cur.expiresAt).getTime() < Date.now();
      await dbx.saveSubscription({
        tenantId: tn.id, plan: cur?.plan ?? tn.plan, status: expired ? "past_due" : "active",
        startedAt: cur?.startedAt ?? new Date().toISOString(),
        expiresAt: cur?.expiresAt ?? new Date().toISOString(),
        amountDzd: cur?.amountDzd ?? 0, lastRef: cur?.lastRef ?? null,
        confirmedBy: "operator", confirmedAt: new Date().toISOString(),
      });
      res.json({ ok: true, status: expired ? "past_due" : "active" });
    } catch (e) { next(e); }
  });

  app.post("/ops/tenants/:id/extend", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const b = z.object({ months: z.number().int().min(1).max(24) }).parse(req.body);
      const tn = await dbx.getTenant(req.params.id);
      if (!tn) { res.status(404).json({ error: "not_found" }); return; }
      const sub = await activateSubscription(tn.id, tn.plan, b.months, "operator-extend", "operator");
      res.json({ ok: true, expiresAt: sub.expiresAt });
    } catch (e) { next(e); }
  });

  app.get("/ops/payments", requireOperator, sensitiveLimit, async (req, res, next) => {
    try {
      const list = await dbx.listAllBillingPayments((req.query.status as string) || undefined, 100);
      const tenants = await dbx.listTenants();
      res.json(list.map((p) => {
        const tn = tenants.find((t) => t.id === p.tenantId);
        return { ...p, tenantSlug: tn?.slug ?? "?", tenantName: tn?.name ?? "?" };
      }));
    } catch (e) { next(e); }
  });

  app.get("/ops/health", requireOperator, sensitiveLimit, (_req, res) => {
    res.json({
      ok: true, db: dbx.kind, uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(), tz: "Africa/Algiers", currency: "DZD",
      env: {
        sofizpay: (process.env.SOFIZPAY_ACCOUNT ?? "") !== "",
        operatorKey: (process.env.OPERATOR_KEY ?? "") !== "",
        cors: process.env.CORS_ORIGIN ?? "*",
        uploads: process.env.UPLOAD_DIR ?? "./uploads",
      },
    });
  });

  // ═══ التقارير ═══
  app.get("/reports/summary", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const t = req.auth!.tenant_id;
      const days = Math.min(90, Math.max(1, Number(req.query.days ?? 7)));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [orders, products, tenant, employees, attAll, overheads] = await Promise.all([
        dbx.listOrders(t, { branchId: branchOf(req), since }),
        dbx.listProducts(t),
        dbx.getTenant(t),
        dbx.listEmployees(t),
        dbx.listAttendance(t),
        dbx.listOverheads(t),
      ]);
      const live = orders.filter((o) => o.status !== "cancelled");
      const sales = live.reduce((x, o) => x + o.total, 0);
      const buy: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.buyPrice]));
      const profit = profitOf(live, buy);
      const activeOh = overheads.filter((o) => o.active);
      const dailyOh = activeOh.map((o) => ({ name: o.name, amount: dailySlice(o.monthly) }));
      const attIn = attAll.filter((a) => a.date >= since.slice(0, 10));
      const laborOf = (recs: typeof attIn) =>
        employees.reduce((s, e) => s + salaryFor(recs.filter((a) => a.employeeId === e.id), e.hourlyRate, 1.5, tenant?.overtimeEnabled ?? false), 0);
      const labor = laborOf(attIn);
      const bd = profitBreakdown(live, buy, dailyOh.map((o) => ({ ...o, amount: o.amount * days })), labor);
      const perDay: { date: string; sales: number; profit: number; net: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = algiersDay(new Date(Date.now() - i * 86_400_000));
        const dayOrders = live.filter((o) => algiersDay(new Date(o.createdAt)) === d);
        const daySales = dayOrders.reduce((x, o) => x + o.total, 0);
        const dayProfit = profitOf(dayOrders, buy);
        const dayLabor = laborOf(attIn.filter((a) => a.date === d));
        const dayOh = dailyOh.reduce((x, o) => x + o.amount, 0);
        perDay.push({ date: d, sales: daySales, profit: dayProfit, net: Math.round(dayProfit - dayOh - dayLabor) });
      }
      const counts: Record<string, number> = {};
      const rev: Record<string, number> = {};
      const cost: Record<string, number> = {};
      for (const o of live) for (const l of o.lines) {
        counts[l.name] = (counts[l.name] ?? 0) + l.qty;
        rev[l.name] = (rev[l.name] ?? 0) + l.qty * l.price;
        cost[l.name] = (cost[l.name] ?? 0) + (buy[l.productId] ?? 0) * l.qty;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, qty]) => ({ name, qty, revenue: rev[name] ?? 0, cost: cost[name] ?? 0, margin: (rev[name] ?? 0) - (cost[name] ?? 0) }));
      const methodSplit = {
        cash: live.filter((o) => o.payMethod === "cash").reduce((x, o) => x + o.total, 0),
        card: live.filter((o) => o.payMethod === "card").reduce((x, o) => x + o.total, 0),
      };
      const todayKey = algiersDay();
      const todayOrders = live.filter((o) => algiersDay(new Date(o.createdAt)) === todayKey);
      const todayLabor = laborOf(attIn.filter((a) => a.date === todayKey));
      const todayBd = profitBreakdown(todayOrders, buy, dailyOh, todayLabor);
      res.json({
        sales, profit, invoices: live.length,
        todaySales: todayOrders.reduce((x, o) => x + o.total, 0),
        todayProfit: profitOf(todayOrders, buy),
        todayNet: todayBd.net, todayBreakdown: todayBd,
        breakdown: bd, methodSplit,
        avgBasket: live.length ? Math.round(sales / live.length) : 0, perDay, top,
      });
    } catch (e) { next(e); }
  });

  // ═══ الرفع ═══
  app.post("/upload", requireAuth, requireRole("owner", "manager", "cashier"), sensitiveLimit, upload.single("file"), (req, res) => {
    if (!req.file) { res.status(400).json({ error: "no_file" }); return; }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });

  // ═══ البوابة العامة (بدون دخول — محدودة المعدل) ═══
  app.get("/public/:slug/menu", publicLimit, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenantBySlug(req.params.slug);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      const menuBranches = await dbx.listBranches(tenant.id);
      const menuBranch = menuBranches[0]?.id;
      const products = (await dbx.listProducts(tenant.id, menuBranch))
        .filter((p) => p.active && p.saleable !== false && p.qty > 0)
        .map((p) => ({ id: p.id, name: p.name, nameFr: p.nameFr, sellPrice: p.sellPrice, imageUrl: p.imageUrl, category: p.category }));
      res.json({ shop: tenant.name, type: tenant.type, products });
    } catch (e) { next(e); }
  });

  app.post("/public/:slug/orders", publicLimit, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenantBySlug(req.params.slug);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      if (!PLAN_LIMITS[tenant.plan]?.online) { res.status(403).json({ error: "upgrade_needed" }); return; }
      const sub = await subscriptionOk(dbx, tenant.id);
      if (!sub.ok) { res.status(402).json({ error: "subscription_expired", reason: sub.reason }); return; }
      const b = z.object({
        kind: z.enum(["delivery", "pickup", "qr_table", "table"]), tableNo: z.string().optional(),
        lines: z.array(zOrderLine).min(1).max(50),
        customer: z.string().optional(), phone: z.string().optional(), address: z.string().optional(),
      }).parse(req.body);
      const kind = b.kind === "table" ? "qr_table" : b.kind;
      if (b.kind === "delivery" && !b.address) { res.status(400).json({ error: "address_required" }); return; }
      if (b.kind === "delivery" && !b.phone) { res.status(400).json({ error: "phone_required" }); return; }
      const branches = await dbx.listBranches(tenant.id);
      const branchId = branches[0]?.id ?? "main";
      const { out, map } = await buildLines(tenant.id, b.lines, branches[0]?.id);
      const total = orderTotal(out, 0, 0);
      const num = await dbx.nextOrderNum(tenant.id);
      const created = await dbx.createOrder({
        num, tenantId: tenant.id, branchId, shiftId: null,
        kind: kind === "pickup" ? "takeaway" : kind, tableNo: b.tableNo ?? null,
        status: "pending", lines: out, discount: 0, tax: 0, total, payMethod: "cash",
        customer: b.customer ?? null, phone: b.phone ? normPhone(b.phone) : null, address: b.address ?? null, rating: null, consumed: [],
      });
      const stock = new Map([...map.values()].map((p) => [p.id, { qty: p.qty, minQty: p.minQty, name: p.name }]));
      const consumed: ConsumedRow[] = [];
      const warnings: Shortage[] = [];
      for (const l of out) {
        await applyStockDown(tenant.id, l.productId, l.qty, `online #${num}`);
        const r = await consumeRecipe(tenant.id, l.productId, l.qty, num, stock);
        consumed.push(...r.consumed);
        warnings.push(...r.warnings);
      }
      for (const w of warnings) {
        await dbx.createAlert({ tenantId: tenant.id, kind: "recipe_short", refId: w.productId, message: `نقص مكوّن للطلب #${num}: ${w.name} (عجز ${w.missing})`, read: false });
      }
      await dbx.setOrderConsumed(tenant.id, created.id, consumed).catch(() => null);
      broadcast(tenant.id, { type: "order.created", order: { ...created, consumed } });
      res.status(201).json({ id: created.id, num, total, warnings });
    } catch (e) { next(e); }
  });

  app.get("/public/:slug/orders/:num", publicLimit, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenantBySlug(req.params.slug);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      const orders = await dbx.listOrders(tenant.id);
      const o = orders.find((x) => x.num === Number(req.params.num));
      if (!o) { res.status(404).json({ error: "not_found" }); return; }
      res.json({ num: o.num, status: o.status, total: o.total, lines: o.lines, driver: await driverOf(dbx, tenant.id, o.driverId, true) });
    } catch (e) { next(e); }
  });

  app.post("/public/:slug/orders/:num/rate", publicLimit, async (req, res, next) => {
    try {
      const tenant = await dbx.getTenantBySlug(req.params.slug);
      if (!tenant) { res.status(404).json({ error: "not_found" }); return; }
      const b = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);
      const orders = await dbx.listOrders(tenant.id);
      const o = orders.find((x) => x.num === Number(req.params.num) && x.status === "delivered");
      if (!o) { res.status(404).json({ error: "not_found" }); return; }
      await dbx.rateOrder(tenant.id, o.id, b.rating);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ═══ الوصفات والمورّدون والمشتريات والهدر والتنبيهات ═══
  const zRecipeLine = z.object({ ingredientId: z.string().min(1), qty: z.number().positive().max(100000) });

  app.get("/recipes", requireAuth, async (req, res, next) => {
    try { res.json(await dbx.listRecipes(req.auth!.tenant_id, (req.query.dish as string) || undefined)); }
    catch (e) { next(e); }
  });
  app.put("/recipes/dish/:dishId", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = z.object({ lines: z.array(zRecipeLine).max(100) }).parse(req.body);
      const t = req.auth!.tenant_id;
      const scope = branchOf(req);
      const dish = await mustOwnProduct(dbx, t, scope, req.params.dishId);
      for (const l of b.lines) {
        const ing = await mustOwnProduct(dbx, t, undefined, l.ingredientId);
        if (scope && ing.branchId !== dish.branchId) throw Object.assign(new Error("cross_branch_recipe"), { status: 400 });
      }
      res.json(await dbx.setDishRecipe(t, req.params.dishId, b.lines));
    } catch (e) { next(e); }
  });
  app.delete("/recipes/:id", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { await dbx.deleteRecipeLine(req.auth!.tenant_id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  const zSupplier = z.object({
    name: z.string().min(2), phone: z.string().min(7),
    address: z.string().optional(), notes: z.string().optional(), active: z.boolean().default(true),
    openingDebt: z.number().min(0).default(0),
  });
  app.get("/suppliers", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const t = req.auth!.tenant_id;
      const [suppliers, purchases] = await Promise.all([dbx.listSuppliers(t), dbx.listPurchases(t)]);
      res.json(suppliers.map((s) => {
        const mine = purchases.filter((p) => p.supplierId === s.id);
        const owed = Math.round(((s.openingDebt ?? 0) + mine.reduce((x, p) => x + p.total, 0)) * 100) / 100;
        const paid = mine.reduce((x, p) => x + p.paid, 0);
        return { ...s, owed, paid, balance: Math.round((owed - paid) * 100) / 100 };
      }));
    } catch (e) { next(e); }
  });
  app.post("/suppliers", requireAuth, requireRole("owner", "manager"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = zSupplier.parse(req.body);
      const created = await dbx.createSupplier({
        tenantId: req.auth!.tenant_id, name: b.name, phone: normPhone(b.phone),
        address: b.address ?? null, notes: b.notes ?? null, active: b.active,
        openingDebt: b.openingDebt,
      });
      const open = Math.round((created.openingDebt ?? 0) * 100) / 100;
      res.status(201).json({ ...created, owed: open, paid: 0, balance: open });
    } catch (e) { next(e); }
  });
  app.patch("/suppliers/:id", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = zSupplier.partial().parse(req.body);
      res.json(await dbx.updateSupplier(req.auth!.tenant_id, req.params.id, b));
    } catch (e) { next(e); }
  });

  const zPurchaseLine = z.object({
    productId: z.string().min(1), qty: z.number().positive().max(100000), unitCost: z.number().min(0),
  });
  app.get("/purchases", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try { res.json(await dbx.listPurchases(req.auth!.tenant_id, (req.query.supplier as string) || undefined)); }
    catch (e) { next(e); }
  });
  app.post("/purchases", requireAuth, requireRole("owner", "manager"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = z.object({
        supplierId: z.string().min(1), lines: z.array(zPurchaseLine).min(1).max(100),
        paid: z.number().min(0).default(0), method: z.string().default("cash"),
        ref: z.string().optional(), notes: z.string().optional(), date: z.string().optional(),
      }).parse(req.body);
      const t = req.auth!.tenant_id;
      const sup = (await dbx.listSuppliers(t)).find((s) => s.id === b.supplierId);
      if (!sup) { res.status(404).json({ error: "not_found" }); return; }
      const scope = branchOf(req);
      const products = await dbx.listProducts(t);
      const pmap = new Map(products.map((p) => [p.id, p]));
      let total = 0;
      const plines = b.lines.map((l) => {
        const p = pmap.get(l.productId);
        if (!p || !p.active) throw Object.assign(new Error("product_unavailable"), { status: 409 });
        if (scope && p.branchId !== scope) throw Object.assign(new Error("product_unavailable"), { status: 409 });
        total = Math.round((total + l.qty * l.unitCost) * 100) / 100;
        return { productId: p.id, name: p.name, qty: l.qty, unitCost: l.unitCost };
      });
      if (b.paid > total + 1e-9) { res.status(400).json({ error: "overpay" }); return; }
      // تُنشأ الفاتورة غير مدفوعة ثم تُسجَّل الدفعة الأولى عبر نفس مسار الدفع (سجل واحد موحد)
      const created = await dbx.createPurchase({
        tenantId: t, supplierId: sup.id, lines: plines, total, paid: 0,
        date: b.date ?? new Date().toISOString(), notes: b.notes ?? null,
      });
      for (const l of plines) {
        await dbx.adjustStock(t, l.productId, l.qty, `purchase #${created.num}`);
        await dbx.updateProduct(t, l.productId, { buyPrice: l.unitCost });
      }
      const full = b.paid > 0
        ? await dbx.payPurchase(t, created.id, b.paid, b.method, b.ref)
        : await dbx.getPurchase(t, created.id);
      res.status(201).json(full ?? created);
    } catch (e) { next(e); }
  });
  app.post("/purchases/:id/pay", requireAuth, requireRole("owner", "manager"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = z.object({ amount: z.number().positive(), method: z.string().default("cash"), ref: z.string().optional() }).parse(req.body);
      res.json(await dbx.payPurchase(req.auth!.tenant_id, req.params.id, b.amount, b.method, b.ref));
    } catch (e) { next(e); }
  });

  // تسجيل هدر/تلف: خصم من المخزون بسبب موثّق + تنبيه عبور الحد تلقائياً
  app.post("/wastage", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = z.object({
        productId: z.string().min(1), qty: z.number().positive().max(100000), reason: z.string().default(""),
      }).parse(req.body);
      await mustOwnProduct(dbx, req.auth!.tenant_id, branchOf(req), b.productId);
      const p = await applyStockDown(req.auth!.tenant_id, b.productId, b.qty, `wastage${b.reason ? `: ${b.reason}` : ""}`);
      await dbx.createAlert({
        tenantId: req.auth!.tenant_id, kind: "wastage", refId: b.productId,
        message: `هدر مسجّل: ${p.name} (${b.qty})${b.reason ? ` — ${b.reason}` : ""}`, read: false,
      });
      res.status(201).json({ ok: true, qty: p.qty });
    } catch (e) { next(e); }
  });

  app.get("/alerts", requireAuth, async (req, res, next) => {
    try { res.json(await dbx.listAlerts(req.auth!.tenant_id, req.query.unread === "1")); }
    catch (e) { next(e); }
  });
  app.post("/alerts/:id/read", requireAuth, async (req, res, next) => {
    try { await dbx.markAlertRead(req.auth!.tenant_id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ═══ السائقون (داخليون وخارجيون — بلا دخول) ═══
  app.get("/drivers", requireAuth, async (req, res, next) => {
    try { res.json(await dbx.listDrivers(req.auth!.tenant_id)); }
    catch (e) { next(e); }
  });
  app.post("/drivers", requireAuth, requireRole("owner", "manager"), sensitiveLimit, async (req, res, next) => {
    try {
      const b = zDriver.parse(req.body);
      res.status(201).json(await dbx.createDriver({
        tenantId: req.auth!.tenant_id, name: b.name, phone: normPhone(b.phone),
        vehicle: b.vehicle ?? null, kind: b.kind, active: b.active,
      }));
    } catch (e) { next(e); }
  });
  app.patch("/drivers/:id", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = zDriver.partial().parse(req.body);
      res.json(await dbx.updateDriver(req.auth!.tenant_id, req.params.id, b));
    } catch (e) { next(e); }
  });
  // إسناد سائق لطلب توصيل (مالك/مدير) — يُبث للمطبخ لحظياً
  app.patch("/orders/:id/driver", requireAuth, requireRole("owner", "manager"), async (req, res, next) => {
    try {
      const b = z.object({ driverId: z.string().min(1).nullable() }).parse(req.body);
      const t = req.auth!.tenant_id;
      const updated = await dbx.assignDriver(t, req.params.id, b.driverId);
      const full = await rich(dbx, t, updated);
      broadcast(t, { type: "order.status", order: full });
      res.json(full);
    } catch (e) { next(e); }
  });

  // ═══ SSE للمطبخ (التوكن في الاستعلام لأن EventSource لا يرسل ترويسات) ═══
  app.get("/stream/kitchen", requireAuth, (req, res) => {
    const t = req.auth!.tenant_id;
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    if (!hub.has(t)) hub.set(t, new Set());
    hub.get(t)!.add(res);
    const beat = setInterval(() => res.write(":beat\n\n"), 25000);
    req.on("close", () => { hub.get(t)?.delete(res); clearInterval(beat); });
  });

  // ─── معالج الأخطاء ───
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) { res.status(400).json({ error: "validation", details: err.errors }); return; }
    const e = err as { status?: number; message?: string; code?: string };
    if (e.status) { res.status(e.status).json({ error: e.message }); return; }
    // سجل Prisma غير موجود (تحديث/حذف لمعرّف زائف) → 404 لا 500
    if (e.code === "P2025") { res.status(404).json({ error: "not_found" }); return; }
    if ((e.message === "product" || e.message === "order" || e.message === "shift" || e.message === "goal" || e.message === "recipe" || e.message === "supplier" || e.message === "purchase" || e.message === "driver" || e.message === "tenant" || e.message === "payment" || e.message === "overhead" || e.message === "customer") ) {
      res.status(404).json({ error: "not_found" }); return;
    }
    console.error("[api]", err);
    res.status(500).json({ error: "internal" });
  });

  return app;
}
