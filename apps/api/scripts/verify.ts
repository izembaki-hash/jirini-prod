// Ø¬Ù†Ø§Ø­ Ø§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ø¯Ø§Ø¦Ù…: Ø¯ÙˆØ±Ø© Ø¥Ù†ØªØ§Ø¬ ÙƒØ§Ù…Ù„Ø© Ø¹Ø¨Ø± HTTP Ø¹Ù„Ù‰ Ù…Ø­ÙˆÙ‘Ù„ Ø§Ù„Ø°Ø§ÙƒØ±Ø©.
// Ø§Ù„ØªØ´ØºÙŠÙ„: npm run verify  (ÙŠØ¶Ø¨Ø· JWT_SECRET ÙˆOPERATOR_KEY ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¥Ù† ØºØ§Ø¨Ø§)
process.env.JWT_SECRET ??= "verify-secret-local-only-0123456789abcdef";
process.env.OPERATOR_KEY ??= "verify-operator-key";
process.env.SOFIZPAY_ACCOUNT ??= "GTEST";
process.env.RATE_LIMIT_SENSITIVE ??= "1000";
import { buildApp } from "../src/app.js";
import { MemoryAdapter, createDb } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

const PORT = 4999;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
let total = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  total++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

async function main() {
  const db = new MemoryAdapter();
  const tenant = await db.createTenant({
    slug: "demo-resto", name: "Ù…Ø·Ø¹Ù… Ø§Ù„Ø¯Ø§Ø±", type: "restaurant", lang: "ar", plan: "pro",
    phone: "0550000000", address: "Ø§Ù„Ø¬Ø²Ø§Ø¦Ø±", logoUrl: null, crmEnabled: true, overtimeEnabled: false,
    tablesCount: 6,
  });
  const branch = await db.createBranch({ tenantId: tenant.id, name: "Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ", address: "" });
  const emp = await db.createEmployee({
    tenantId: tenant.id, branchId: branch.id, name: "Ø§Ù„Ù…Ø§Ù„Ùƒ", role: "owner", title: null,
    hiredAt: "2024-01-01", hourlyRate: 0, halfWage: 0,
  });
  await db.createUser({
    tenantId: tenant.id, employeeId: emp.id, name: "Ø§Ù„Ù…Ø§Ù„Ùƒ", phone: "0550000000",
    passwordHash: await hashPassword("demo1234"), pinHash: null, pages: null,
    role: "owner", branchId: null, active: true,
  });
  const p1 = await db.createProduct({
    tenantId: tenant.id, branchId: branch.id, name: "ÙƒØ³ÙƒØ³", nameFr: "Couscous",
    buyPrice: 180, sellPrice: 350, qty: 40, minQty: 5, barcode: null, imageUrl: null,
    category: "Ø£Ø·Ø¨Ø§Ù‚", shelf: null, expiryDate: null, wholesalePrice: null, active: true,
  });

  const app = await buildApp(db);
  const server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 400));

  const call = async (method: string, path: string, body?: unknown, token?: string, headers?: Record<string, string>) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json: json as Record<string, unknown> };
  };

  let r = await call("GET", "/health");
  ok("health", r.status === 200 && (r.json as { db: string }).db === "memory");
  r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "wrong" });
  ok("login bad â†’ 401", r.status === 401);
  r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550 000 000", password: "demo1234" });
  ok("login ok (phone normalized)", r.status === 200 && typeof r.json.token === "string");
  const ownerTok = r.json.token as string;

  r = await call("POST", "/auth/users", { name: "Ø£Ù…ÙŠÙ†", phone: "0550111111", password: "cashier1", role: "cashier", title: "ÙƒØ§Ø´ÙŠØ±", halfWage: 1200, branchId: branch.id }, ownerTok);
  ok("create cashier", r.status === 201);
  r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550111111", password: "cashier1" });
  const cashTok = r.json.token as string;
  r = await call("POST", "/products", { name: "x", branchId: branch.id, buyPrice: 1, sellPrice: 2, qty: 1 }, cashTok);
  ok("cashier cannot create product â†’ 403", r.status === 403);

  // Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ø³Ø±ÙŠ + ØµÙ„Ø§Ø­ÙŠØ§Øª Ø§Ù„ØµÙØ­Ø§Øª
  r = await call("GET", "/auth/users", undefined, cashTok);
  ok("cashier cannot list users â†’ 403", r.status === 403);
  r = await call("GET", "/auth/users", undefined, ownerTok);
  const cashUser = ((r.json as unknown[]) as { id: string; role: string; hasPin: boolean; pages: null }[]).find((u) => u.role === "cashier");
  ok("users listed", !!cashUser && cashUser.hasPin === false);
  r = await call("POST", `/auth/users/${cashUser!.id}/pin`, undefined, ownerTok);
  const pin = (r.json as { pin: string }).pin;
  ok("pin generated", r.status === 201 && /^\d{6}$/.test(pin));
  r = await call("POST", "/auth/login", { slug: "demo-resto", pin: "000000" });
  ok("wrong pin â†’ 401", r.status === 401);
  r = await call("POST", "/auth/login", { slug: "demo-resto", pin });
  const pinTok = (r.json as { token: string }).token;
  const pinPages = (r.json as { user: { pages: string[] } }).user.pages;
  ok("pin login + default pages", r.status === 200 && Array.isArray(pinPages) && pinPages.includes("pos"));
  r = await call("GET", "/attendance", undefined, pinTok);
  ok("pin token blocked from staff page â†’ 403", r.status === 403);
  r = await call("GET", "/products", undefined, pinTok);
  ok("pin token reads products (pos page)", r.status === 200);
  r = await call("PATCH", `/auth/users/${cashUser!.id}/pages`, { pages: ["pos"] }, ownerTok);
  ok("owner sets pages", r.status === 200);
  r = await call("POST", "/auth/login", { slug: "demo-resto", pin });
  ok("pages updated on login", r.status === 200 && JSON.stringify((r.json as { user: { pages: string[] } }).user.pages) === JSON.stringify(["pos"]));
  r = await call("PATCH", `/auth/users/${cashUser!.id}/pages`, { pages: ["nope"] }, ownerTok);
  ok("bad page rejected â†’ 400", r.status === 400);

  // ÙƒÙ„Ù…Ø© Ø§Ù„Ø³Ø±
  r = await call("POST", "/auth/change-password", { current: "nope", next: "newpass123" }, ownerTok);
  ok("change-password wrong current â†’ 401", r.status === 401);
  r = await call("POST", "/auth/change-password", { current: "demo1234", next: "newpass123" }, ownerTok);
  ok("change-password ok", r.status === 200);
  r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "demo1234" });
  ok("old password rejected", r.status === 401);
  r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "newpass123" });
  ok("new password works", r.status === 200);
  const ownerTok2 = r.json.token as string;

  // ÙˆØ±Ø¯ÙŠØ© + Ø¨ÙŠØ¹ + Ø®ØµÙ… Ù…Ø®Ø²ÙˆÙ†
  r = await call("POST", "/shifts/open", { branchId: branch.id, openingCash: 10000, cashierId: "c1" }, cashTok);
  ok("open shift", r.status === 201);
  const shiftId = (r.json as { id: string }).id;
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 2 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  ok("create order total=700", r.status === 201 && (r.json as { total: number }).total === 700);
  const orderId = (r.json as { id: string }).id;
  r = await call("GET", "/products", undefined, ownerTok2);
  const prodAfter = ((r.json as unknown[]) as { id: string; qty: number }[]).find((p) => p.id === p1.id);
  ok("stock deducted 40â†’38", prodAfter?.qty === 38);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 100 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  ok("insufficient stock â†’ 409", r.status === 409);

  // Ø§Ù†ØªÙ‚Ø§Ù„Ø§Øª + Ø¥Ù„ØºØ§Ø¡ ÙŠØ¹ÙŠØ¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†
  r = await call("PATCH", `/orders/${orderId}`, { status: "ready" }, cashTok);
  ok("preparingâ†’ready", r.status === 200);
  r = await call("PATCH", `/orders/${orderId}`, { status: "delivered" }, cashTok);
  ok("readyâ†’delivered", r.status === 200);
  r = await call("PATCH", `/orders/${orderId}`, { status: "preparing" }, ownerTok2);
  ok("bad transition â†’ 400", r.status === 400);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "takeaway", lines: [{ productId: p1.id, qty: 1 }],
    discount: 0, tax: 0, payMethod: "card",
  }, cashTok);
  const order2 = (r.json as { id: string }).id;
  r = await call("PATCH", `/orders/${order2}`, { status: "cancelled" }, cashTok);
  ok("cashier cancel â†’ 403", r.status === 403);
  r = await call("PATCH", `/orders/${order2}`, { status: "cancelled" }, ownerTok2);
  ok("owner cancel ok", r.status === 200);
  r = await call("GET", "/products", undefined, ownerTok2);
  const prodRestored = ((r.json as unknown[]) as { id: string; qty: number }[]).find((p) => p.id === p1.id);
  ok("cancel restores stock 37â†’38", prodRestored?.qty === 38);

  // Ø¥ØºÙ„Ø§Ù‚ ÙˆØ±Ø¯ÙŠØ©: Ù…ØªÙˆÙ‚Ø¹ = 10000 + 700 = 10700
  r = await call("POST", `/shifts/${shiftId}/close`, { closingCash: 10700, note: "" }, cashTok);
  ok("close shift diff=0", r.status === 200 && (r.json as { diff: number }).diff === 0);

  // Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±
  r = await call("GET", "/reports/summary?days=7", undefined, ownerTok2);
  const sum = r.json as { sales: number; profit: number; todaySales: number; todayProfit: number };
  ok("summary profit=340", r.status === 200 && sum.profit === 340 && sum.todayProfit === 340);
  r = await call("GET", "/reports/summary", undefined, cashTok);
  ok("cashier reports â†’ 403", r.status === 403);

  // â”€â”€â”€ Ø§Ù„Ø´Ø±ÙŠØ­Ø© 1: ÙˆØµÙØ§Øª + Ù…ÙˆØ±Ù‘Ø¯ÙˆÙ† + Ù…Ø´ØªØ±ÙŠØ§Øª + Ù‡Ø¯Ø± + ØªÙ†Ø¨ÙŠÙ‡Ø§Øª â”€â”€â”€
  r = await call("POST", "/products", { name: "Ø³Ù…ÙŠØ¯", branchId: branch.id, buyPrice: 90, sellPrice: 0, qty: 10, saleable: false }, ownerTok2);
  ok("create ingredient", r.status === 201);
  const ingId = (r.json as { id: string }).id;
  r = await call("PUT", `/recipes/dish/${p1.id}`, { lines: [{ ingredientId: p1.id, qty: 1 }] }, ownerTok2);
  ok("self ingredient â†’ 400", r.status === 400);
  r = await call("PUT", `/recipes/dish/${p1.id}`, { lines: [{ ingredientId: ingId, qty: 0.5 }] }, ownerTok2);
  ok("set recipe", r.status === 200 && Array.isArray(r.json) && (r.json as unknown[]).length === 1);
  r = await call("GET", `/recipes?dish=${p1.id}`, undefined, ownerTok2);
  ok("get recipe", r.status === 200 && (r.json as unknown[]).length === 1);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 2 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  const rBody = r.json as { id: string; warnings: unknown[] };
  ok("sale consumes recipe (no warnings)", r.status === 201 && Array.isArray(rBody.warnings) && rBody.warnings.length === 0);
  const rOrderId = rBody.id;
  const getQty = async (id: string) => (((await call("GET", "/products", undefined, ownerTok2)).json as unknown[]) as { id: string; qty: number }[]).find((p) => p.id === id)?.qty;
  ok("ingredient deducted 10â†’9", (await getQty(ingId)) === 9);
  // Ù†ÙØ§Ø¯ Ø§Ù„Ù…ÙƒÙˆÙ‘Ù†: Ø§Ù„Ø¨ÙŠØ¹ ÙŠØ³ØªÙ…Ø± Ù…Ø¹ ØªØ­Ø°ÙŠØ± + ØªÙ†Ø¨ÙŠÙ‡
  await call("POST", `/products/${ingId}/stock`, { delta: -9, reason: "test" }, ownerTok2);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 4 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  const wBody = r.json as { id: string; warnings: { name: string; missing: number }[] };
  ok("short recipe warns (not blocks)", r.status === 201 && wBody.warnings.length === 1 && wBody.warnings[0].missing === 2);
  r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
  ok("recipe_short alert created", r.status === 200 && ((r.json as unknown[]) as { kind: string }[]).some((a) => a.kind === "recipe_short"));
  // Ø§Ù„Ø¥Ù„ØºØ§Ø¡ ÙŠØ¹ÙŠØ¯ Ø§Ù„Ù…ÙƒÙˆÙ†Ø§Øª: Ø§Ù„Ø£Ù…Ø± Ø§Ù„Ø£Ø®ÙŠØ± Ø§Ø³ØªÙ‡Ù„Ùƒ 0 (Ù†Ø§ÙØ¯) â€” Ù†Ù„ØºÙŠ Ø§Ù„Ø£ÙˆÙ„ (Ø§Ø³ØªÙ‡Ù„Ùƒ 1)
  r = await call("PATCH", `/orders/${rOrderId}`, { status: "cancelled" }, ownerTok2);
  ok("cancel restores ingredient 0â†’1", r.status === 200 && (await getQty(ingId)) === 1);
  const alId = (((await call("GET", "/alerts?unread=1", undefined, ownerTok2)).json) as { id: string }[])[0]?.id;
  if (alId) {
    await call("POST", `/alerts/${alId}/read`, undefined, ownerTok2);
    r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
    ok("alert mark read", !(r.json as { id: string }[]).some((a) => a.id === alId));
  } else ok("alert mark read", false);

  // Ù…ÙˆØ±Ù‘Ø¯ÙˆÙ† + Ù…Ø´ØªØ±ÙŠØ§Øª + Ø¯ÙŠÙˆÙ†
  r = await call("POST", "/suppliers", { name: "Ù…Ø·Ø­Ù†Ø©", phone: "0550999000" }, ownerTok2);
  ok("create supplier", r.status === 201);
  const supId = (r.json as { id: string }).id;
  r = await call("POST", "/suppliers", { name: "Ù…ÙƒØ±Ø±", phone: "0550999000" }, ownerTok2);
  ok("duplicate supplier phone â†’ 409", r.status === 409);
  r = await call("POST", "/purchases", {
    supplierId: supId, lines: [{ productId: p1.id, qty: 10, unitCost: 200 }], paid: 1000, method: "cash",
  }, ownerTok2);
  const pur = r.json as { id: string; total: number; paid: number; status: string };
  ok("purchase partial + stock in", r.status === 201 && pur.total === 2000 && pur.status === "partial" && (await getQty(p1.id)) === 44);
  r = await call("GET", "/suppliers", undefined, ownerTok2);
  const supRow = ((r.json as unknown[]) as { id: string; balance: number }[]).find((s) => s.id === supId);
  ok("supplier balance 1000", supRow?.balance === 1000);
  r = await call("POST", `/purchases/${pur.id}/pay`, { amount: 5000 }, ownerTok2);
  ok("overpay â†’ 400", r.status === 400);
  r = await call("POST", `/purchases/${pur.id}/pay`, { amount: 1000, ref: "CCP-1" }, ownerTok2);
  ok("pay rest â†’ paid", r.status === 200 && (r.json as { status: string }).status === "paid");
  // Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ù„Ù„Ù…ÙˆØ±Ù‘Ø¯ ÙŠÙØ¶Ø§Ù Ù„Ù„Ø¯ÙŠÙ†
  r = await call("POST", "/suppliers", { name: "Ù‚Ø¯ÙŠÙ…", phone: "0550888111", openingDebt: 500 }, ownerTok2);
  ok("supplier openingDebt", r.status === 201 && (r.json as { openingDebt: number }).openingDebt === 500);
  r = await call("GET", "/suppliers", undefined, ownerTok2);
  const oldSup = ((r.json as unknown[]) as { id: string; balance: number }[]).find((s) => (s as { phone: string }).phone === "0550888111");
  ok("supplier balance includes opening", oldSup?.balance === 500);
  // Ø§Ù„Ù‡Ø¯Ø±
  r = await call("POST", "/wastage", { productId: p1.id, qty: 3, reason: "ØªØ§Ù„Ù" }, ownerTok2);
  ok("wastage deducts", r.status === 201 && (r.json as { qty: number }).qty === 41);
  r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
  ok("wastage alert", ((r.json as unknown[]) as { kind: string }[]).some((a) => a.kind === "wastage"));

  // â”€â”€â”€ Ø§Ù„Ø´Ø±ÙŠØ­Ø© 2: Ø§Ù„Ø³Ø§Ø¦Ù‚ÙˆÙ† â”€â”€â”€
  r = await call("POST", "/drivers", { name: "ÙƒØ±ÙŠÙ…", phone: "0550111222", vehicle: "Ø¯Ø±Ø§Ø¬Ø©", kind: "internal" }, ownerTok2);
  ok("create driver", r.status === 201);
  const drvId = (r.json as { id: string }).id;
  r = await call("POST", "/drivers", { name: "Ù…ÙƒØ±Ø±", phone: "0550111222" }, ownerTok2);
  ok("duplicate driver â†’ 409", r.status === 409);
  r = await call("POST", "/drivers", { name: "Ø®Ø§Ø±Ø¬ÙŠ", phone: "0550333444", kind: "external" }, ownerTok2);
  ok("external driver", r.status === 201);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "delivery", lines: [{ productId: p1.id, qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash", address: "Alger", phone: "0550999000",
  }, cashTok);
  const delId = (r.json as { id: string }).id;
  ok("delivery order", r.status === 201);
  r = await call("PATCH", `/orders/${delId}/driver`, { driverId: drvId }, cashTok);
  ok("cashier assign â†’ 403", r.status === 403);
  r = await call("PATCH", `/orders/${delId}/driver`, { driverId: "nope" }, ownerTok2);
  ok("bad driver â†’ 400", r.status === 400);
  r = await call("PATCH", `/orders/${delId}/driver`, { driverId: drvId }, ownerTok2);
  ok("assign driver", r.status === 200 && ((r.json as { driver: { name: string } | null }).driver?.name === "ÙƒØ±ÙŠÙ…"));
  r = await call("GET", "/orders", undefined, ownerTok2);
  ok("orders embed driver", ((r.json as unknown[]) as { id: string; driver: { name: string } | null }[]).some((o) => o.id === delId && o.driver?.name === "ÙƒØ±ÙŠÙ…"));
  r = await call("PATCH", `/orders/${delId}/driver`, { driverId: null }, ownerTok2);
  ok("unassign driver", r.status === 200 && (r.json as { driverId: string | null }).driverId === null);

  // Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¹Ø§Ù…Ø©
  r = await call("GET", "/public/demo-resto/menu");
  const menu = r.json as { products: { buyPrice?: number }[] };
  ok("public menu hides buyPrice", r.status === 200 && menu.products.length === 1 && menu.products[0].buyPrice === undefined);
  r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222" });
  ok("delivery without address â†’ 400", r.status === 400);
  r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], address: "Alger" });
  ok("delivery without phone â†’ 400", r.status === 400);
  r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222", address: "Alger" });
  ok("delivery with phone+address â†’ 201", r.status === 201);
  r = await call("POST", "/public/demo-resto/orders", { kind: "table", tableNo: "3", lines: [{ productId: p1.id, qty: 1 }] });
  ok("table order without phone â†’ 201", r.status === 201);
  const pubNum = (r.json as { num: number }).num;
  r = await call("GET", `/public/demo-resto/orders/${pubNum}`);
  ok("track order pending", r.status === 200 && (r.json as { status: string }).status === "pending");
  r = await call("POST", `/public/demo-resto/orders/${pubNum}/rate`, { rating: 5 });
  ok("rate before delivered â†’ 404", r.status === 404);

  // التسجيل الذاتي + الفوترة (الدفع إلزامي: لا كلمة سر قبل الدفع)
  r = await call("GET", "/public/plans");
  ok("public plans", r.status === 200 && Array.isArray(r.json) && (r.json as unknown[]).length === 3);
  r = await call("POST", "/public/signup", {
    name: "Superette Essalam", type: "shop", phone: "0550999888", plan: "starter",
    ownerName: "Karim",
  });
  ok("self signup → 201", r.status === 201 && typeof (r.json as { slug: string }).slug === "string");
  const slug2 = (r.json as { slug: string }).slug;
  const tenant2 = (await db.getTenantBySlug(slug2))!;
  // قبل الدفع: لا كلمة سر → الدخول مرفوض (لا حساب تجريبي)
  r = await call("POST", "/auth/login", { slug: slug2, phone: "0550999888", password: "secret12" });
  ok("login before payment → 401", r.status === 401);
  const owner2User = (await db.listUsers(tenant2.id)).find((u) => u.role === "owner")!;
  await db.setUserPassword(tenant2.id, owner2User.id, await hashPassword("secret12"));
  r = await call("POST", "/auth/login", { slug: slug2, phone: "0550999888", password: "secret12" });
  ok("new tenant login after password set", r.status === 200);
  const owner2 = r.json.token as string;
  r = await call("GET", "/billing/status", undefined, owner2);
  ok("billing no sub → none", r.status === 200 && (r.json as { status: string }).status === "none");
  r = await call("POST", "/billing/submit-payment", { ref: "CCP-12345", months: 2 }, owner2);
  ok("submit payment → pending", r.status === 200 && (r.json as { status: string }).status === "pending");
  r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": "wrong" });
  ok("operator wrong key → 401", r.status === 401);
  r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  ok("operator confirm → active", r.status === 200 && typeof (r.json as { expiresAt: string }).expiresAt === "string");
  r = await call("POST", "/billing/satim/notify", { order_id: "x" });
  ok("satim stub removed → 404", r.status === 404);

  // إنفاذ الانهيار: نُنهي الاشتراك ثم نحظر الشراء
  await db.saveSubscription({
    tenantId: tenant2.id, plan: "starter", status: "past_due",
    startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(),
    amountDzd: 2500, lastRef: "CCP-12345", confirmedBy: null, confirmedAt: null,
  });
  const expBranch = (await db.listBranches(tenant2.id))[0]!;
  r = await call("POST", "/orders", {
    branchId: expBranch.id, kind: "dinein", lines: [{ productId: "nope", qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, owner2);
  ok("expired subscription → 402", r.status === 402);
  r = await call("POST", "/public/demo-resto/orders", { kind: "pickup", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222" });
  ok("unrelated tenant still ok", r.status === 201);

  // Ø§Ù„Ø£Ù‡Ø¯Ø§Ù ÙˆØ§Ù„ÙØ±ÙˆØ¹ ÙˆØ§Ù„Ø¹Ù…Ù„Ø§Ø¡
  r = await call("POST", "/goals", { title: "ÙØ±Ø¹ Ø¬Ø¯ÙŠØ¯", target: 1000000, monthly: 100000 }, ownerTok2);
  ok("create goal", r.status === 201);
  const goalId = (r.json as { id: string }).id;
  r = await call("PATCH", `/goals/${goalId}`, { saved: 100000 }, ownerTok2);
  ok("deposit goal", r.status === 200 && (r.json as { saved: number }).saved === 100000);
  r = await call("DELETE", `/goals/${goalId}`, undefined, ownerTok2);
  ok("delete goal", r.status === 200);
  r = await call("GET", "/goals", undefined, ownerTok2);
  ok("goals empty", r.status === 200 && Array.isArray(r.json) && (r.json as unknown[]).length === 0);
  r = await call("POST", "/goals", { title: "x", target: 1, monthly: 1 }, cashTok);
  ok("cashier goal â†’ 403", r.status === 403);
  r = await call("POST", "/branches", { name: "ÙØ±Ø¹ 2" }, ownerTok2);
  ok("2nd branch ok", r.status === 201);
  r = await call("POST", "/branches", { name: "ÙØ±Ø¹ 3" }, ownerTok2);
  ok("3rd branch â†’ 403 limit", r.status === 403 && (r.json as { limit: number }).limit === 2);
  r = await call("POST", "/customers", { name: "Ø²Ø¨ÙˆÙ†", phone: "0550333333" }, cashTok);
  ok("create customer", r.status === 201);
  const custId = (r.json as { id: string }).id;
  // Ø¨ÙŠØ¹ Ø¢Ø¬Ù„ Ø¨Ù„Ø§ Ù‡Ø§ØªÙ â†’ 400
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "takeaway", lines: [{ productId: p1.id, qty: 1 }], payMethod: "credit",
  }, cashTok);
  ok("credit w/o phone â†’ 400", r.status === 400);
  // Ø¨ÙŠØ¹ Ø¢Ø¬Ù„ ÙŠØ±ÙØ¹ Ø§Ù„Ø¯ÙŠÙ†
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "takeaway", lines: [{ productId: p1.id, qty: 2 }],
    payMethod: "credit", phone: "0550333333", customer: "Ø²Ø¨ÙˆÙ†",
  }, cashTok);
  const creditOrder = r.json as { id: string; total: number };
  ok("credit order", r.status === 201);
  r = await call("GET", "/customers", undefined, cashTok);
  ok("customer debt raised", ((r.json as unknown[]) as { id: string; balance: number }[]).find((c) => c.id === custId)?.balance === creditOrder.total);
  // Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø¢Ø¬Ù„ ÙŠÙØ³Ù‚Ø· Ø§Ù„Ø¯ÙŠÙ†
  r = await call("PATCH", `/orders/${creditOrder.id}`, { status: "cancelled" }, ownerTok2);
  r = await call("GET", "/customers", undefined, cashTok);
  ok("cancel credit clears debt", ((r.json as unknown[]) as { id: string; balance: number }[]).find((c) => c.id === custId)?.balance === 0);
  // Ø¢Ø¬Ù„ Ø¬Ø¯ÙŠØ¯ + ØªØ³Ø¯ÙŠØ¯ Ø¬Ø²Ø¦ÙŠ + Ù…Ù†Ø¹ Ø§Ù„ØªØ¬Ø§ÙˆØ²
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "takeaway", lines: [{ productId: p1.id, qty: 1 }],
    payMethod: "credit", phone: "0550333333",
  }, cashTok);
  const c2 = r.json as { id: string; total: number };
  r = await call("POST", `/customers/${custId}/pay`, { amount: c2.total + 1 }, cashTok);
  ok("customer overpay â†’ 400", r.status === 400);
  r = await call("POST", `/customers/${custId}/pay`, { amount: c2.total, method: "cash" }, cashTok);
  ok("customer pay settles", r.status === 200 && (r.json as { customer: { balance: number } }).customer.balance === 0);
  r = await call("GET", `/customers/${custId}/payments`, undefined, ownerTok2);
  ok("payment ledger", Array.isArray(r.json) && (r.json as unknown[]).length >= 1);
  r = await call("PATCH", "/tenant", { crmEnabled: false }, ownerTok2);
  ok("disable crm", r.status === 200);
  r = await call("POST", "/customers", { name: "Ø²2", phone: "0550444444" }, cashTok);
  ok("crm disabled â†’ 403", r.status === 403);

  // SSE
  const sseGot = await new Promise<boolean>((resolve) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { ctrl.abort(); resolve(false); }, 8000);
    fetch(`${BASE}/stream/kitchen?token=${ownerTok2}`, { signal: ctrl.signal }).then(async (res) => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) break;
        buf += dec.decode(value);
        if (buf.includes("order.created")) { clearTimeout(timer); ctrl.abort(); resolve(true); break; }
      }
    }).catch(() => resolve(false));
    setTimeout(() => {
      call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
        discount: 0, tax: 0, payMethod: "cash",
      }, cashTok);
    }, 500);
  });
  ok("SSE order.created received", sseGot);

  // Ø±ÙØ¹ ØµÙˆØ±Ø©
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "t.png");
  const upRes = await fetch(`${BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${ownerTok2}` }, body: fd });
  const upJson = await upRes.json() as { url?: string };
  ok("upload image", upRes.status === 201 && !!upJson.url?.startsWith("/uploads/"));

  // Ø­Ø¶ÙˆØ± ÙˆØ±ÙˆØ§ØªØ¨
  r = await call("POST", "/attendance/mark", { employeeId: emp.id, status: "full" }, ownerTok2);
  ok("mark full", r.status === 201);
  r = await call("POST", "/attendance/mark", { employeeId: emp.id, status: "half" }, ownerTok2);
  ok("mark half upsert", r.status === 201 && (r.json as { status: string }).status === "half");
  r = await call("GET", "/salaries", undefined, ownerTok2);
  ok("salaries computed", r.status === 200 && Array.isArray(r.json));
  // تعديل موظف (مسمى + أجر الجزئي) — بلا تحديد معدل
  r = await call("PATCH", `/employees/${emp.id}`, { title: "Ù…Ø´Ø±Ù", halfWage: 1500 }, ownerTok2);
  ok("employee patch", r.status === 200 && (r.json as { halfWage: number }).halfWage === 1500);

  // â”€â”€â”€ Ø¹Ø²Ù„ Ø§Ù„ÙØ±ÙˆØ¹: Ù…Ø¯ÙŠØ±/ÙƒØ§Ø´ÙŠØ± ÙØ±Ø¹ Ù„Ø§ ÙŠÙƒØªØ¨ Ø®Ø§Ø±Ø¬ ÙØ±Ø¹Ù‡ â”€â”€â”€
  // (ÙØ±Ø¹ 2 Ø£ÙÙ†Ø´Ø¦ ÙÙŠ Ø§Ø®ØªØ¨Ø§Ø± Ø³Ø§Ø¨Ù‚ â€” Ù†Ø¹ÙŠØ¯ Ø§Ø³ØªØ®Ø¯Ø§Ù…Ù‡)
  r = await call("GET", "/tenant", undefined, ownerTok2);
  const branch2 = ((r.json as { branches: { id: string; name: string }[] }).branches.find((b) => b.id !== branch.id))?.id ?? null;
  if (branch2) {
    r = await call("POST", "/products", { name: "Ø®Ø§Øµ2", branchId: branch2, buyPrice: 10, sellPrice: 20, qty: 5 }, ownerTok2);
    const p2 = (r.json as { id: string }).id;
    r = await call("POST", "/auth/users", { name: "Ù…Ø¯ÙŠØ±1", phone: "0550222333", password: "manager1", role: "manager", hourlyRate: 0, branchId: branch.id }, ownerTok2);
    ok("create branch manager", r.status === 201);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "manager1" });
    const mgrTok = r.json.token as string;
    r = await call("PATCH", `/products/${p2}`, { sellPrice: 25 }, mgrTok);
    ok("manager patch other branch â†’ 404", r.status === 404);
    r = await call("POST", `/products/${p2}/stock`, { delta: 1, reason: "x" }, mgrTok);
    ok("manager stock other branch â†’ 404", r.status === 404);
    r = await call("PATCH", `/products/${p1.id}`, { sellPrice: 351 }, mgrTok);
    ok("manager patch own branch ok", r.status === 200);
    r = await call("POST", "/orders", {
      branchId: branch.id, kind: "dinein", lines: [{ productId: p2, qty: 1 }],
      discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    ok("order with other-branch product â†’ 409", r.status === 409);
    r = await call("POST", "/products", { name: "ÙƒØ§Ø´ÙŠØ±-ÙØ±Ø¹", branchId: branch.id, buyPrice: 1, sellPrice: 2, qty: 1 }, cashTok);
    ok("cashier create product â†’ 403 (role)", r.status === 403);
    // real cross-branch stock transfer (branches page)
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch.id, qty: 1 }, ownerTok2);
    ok("transfer same branch -> 400", r.status === 400 && (r.json as { error: string }).error === "same_branch");
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: "no-such-branch", qty: 1 }, ownerTok2);
    ok("transfer unknown branch -> 404", r.status === 404 && (r.json as { error: string }).error === "not_found");
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 99999 }, ownerTok2);
    ok("transfer over stock -> 409 insufficient", r.status === 409 && String((r.json as { error: string }).error).startsWith("insufficient_stock:"));
    const srcBefore = (await db.listProducts(tenant.id, branch.id)).find((x) => x.id === p1.id)?.qty ?? -1;
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 3 }, ownerTok2);
    const tr1 = r.json as { from: { qty: number }; to: { qty: number; branchId: string } };
    ok("transfer moves stock", r.status === 200 && tr1.from.qty === srcBefore - 3 && tr1.to.qty === 3 && tr1.to.branchId === branch2);
    ok("transfer recorded as stock move", (await db.listMoves(tenant.id, p1.id)).some((m) => m.delta === -3));
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 2 }, ownerTok2);
    const tr2 = r.json as { from: { qty: number }; to: { id: string; qty: number } };
    ok("2nd transfer merges by name", r.status === 200 && tr2.from.qty === tr1.from.qty - 2 && tr2.to.qty === 5);
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 1 }, cashTok);
    ok("cashier transfer -> 403", r.status === 403);
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 1 }, owner2);
    ok("cross-tenant transfer -> 404", r.status === 404);
    // branch switcher: real per-branch scoping
    r = await call("GET", `/products?branch=${branch2}`, undefined, ownerTok2);
    ok("products scoped by ?branch", r.status === 200 && Array.isArray(r.json) && (r.json as { branchId: string }[]).every((p) => p.branchId === branch2) && (r.json as unknown[]).length >= 2);
    r = await call("GET", `/orders?branch=${branch2}`, undefined, ownerTok2);
    ok("orders scoped by ?branch", r.status === 200 && Array.isArray(r.json) && (r.json as unknown[]).length === 0);
    r = await call("GET", `/orders?branch=${branch.id}`, undefined, ownerTok2);
    ok("orders carry branchId", r.status === 200 && Array.isArray(r.json) && (r.json as { branchId?: string | null }[]).some((o) => o.branchId === branch.id));
    // مدير مربوط: ?branch= لا يفتح فرعاً آخر (عزل حقيقي)
    r = await call("GET", `/products?branch=${branch2}`, undefined, mgrTok);
    ok("manager ?branch other products → 403", r.status === 403 && (r.json as { error: string }).error === "branch_forbidden");
    r = await call("GET", `/orders?branch=${branch2}`, undefined, mgrTok);
    ok("manager ?branch other orders → 403", r.status === 403 && (r.json as { error: string }).error === "branch_forbidden");
    r = await call("GET", `/orders?branch=${branch.id}`, undefined, mgrTok);
    ok("manager ?branch own orders → 200", r.status === 200 && Array.isArray(r.json));

    // ─── حسابات دخول الفروع: عزل المدير المربوط + ضوابط المالك ───
    // قائمة الحسابات تشملك الهاتف والفرع
    r = await call("GET", "/auth/users", undefined, ownerTok2);
    const uList = (r.json as unknown[]) as { id: string; phone: string; role: string; branchId: string | null; employeeId: string | null; active: boolean }[];
    const mgrUser = uList.find((u) => u.phone === "0550222333");
    const cashU = uList.find((u) => u.phone === "0550111111");
    const ownerU = uList.find((u) => u.role === "owner");
    ok("users carry phone+branchId", !!mgrUser && !!cashU && mgrUser.branchId === branch.id && mgrUser.employeeId !== null && !!ownerU);
    r = await call("GET", "/auth/users", undefined, mgrTok);
    ok("manager cannot list users → 403", r.status === 403);
    r = await call("POST", `/auth/users/${cashU!.id}/password`, { password: "x" }, cashTok);
    ok("cashier cannot reset password → 403", r.status === 403);
    // هاتف مكرر مرفوض (حتى لو الحساب معطّل)
    r = await call("POST", "/auth/users", { name: "مكرر", phone: "0550 222 333", password: "dup1234", role: "cashier" }, ownerTok2);
    ok("duplicate phone → 409", r.status === 409 && (r.json as { error: string }).error === "duplicate_phone");
    // المدير لا يُنشئ مالكاً
    r = await call("POST", "/auth/users", { name: "مزيّف", phone: "0550777777", password: "ownerx1", role: "owner" }, mgrTok);
    ok("manager create owner-role → 403", r.status === 403);
    // موظف في فرع 2 (لاختبار العزل)
    r = await call("POST", "/auth/users", { name: "طبّاخ الفرع2", phone: "0550999888", password: "cook2222", role: "cook", branchId: branch2 }, ownerTok2);
    ok("owner creates employee in branch2", r.status === 201);
    const cook2EmpId = (r.json as { employeeId: string }).employeeId;
    // إنشاء المدير حساباً جديداً: فرعه يُفرض بغض النظر عن branchId المرسل
    r = await call("POST", "/auth/users", { name: "مزوّد", phone: "0550555556", password: "supp1234", role: "cook", branchId: branch2 }, mgrTok);
    ok("manager create → forced own branch", r.status === 201);
    r = await call("GET", "/auth/users", undefined, ownerTok2);
    const suppU = ((r.json as unknown[]) as { phone: string; branchId: string | null }[]).find((u) => u.phone === "0550555556");
    ok("forced branchId sticks", !!suppU && suppU.branchId === branch.id);
    // قائمة الفروع: المدير يرى فرعه فقط، المالك كله
    r = await call("GET", "/branches", undefined, mgrTok);
    const mgrBranches = r.json as { id: string }[];
    ok("manager branches → own only", r.status === 200 && mgrBranches.length === 1 && mgrBranches[0].id === branch.id);
    r = await call("GET", "/branches", undefined, ownerTok2);
    ok("owner branches → all", r.status === 200 && (r.json as unknown[]).length >= 2);
    // الموظفون: المدير يرى فرعه فقط ولا يمسّ موظف فرع 2
    r = await call("GET", "/employees", undefined, mgrTok);
    const mgrEmps = r.json as { id: string; branchId: string }[];
    ok("manager employees → own branch only", mgrEmps.length > 0 && mgrEmps.every((e) => e.branchId === branch.id));
    r = await call("PATCH", `/employees/${cook2EmpId}`, { title: "مسخّب" }, mgrTok);
    ok("manager patch other-branch employee → 404", r.status === 404);
    r = await call("DELETE", `/employees/${cook2EmpId}`, undefined, mgrTok);
    ok("manager delete other-branch employee → 404", r.status === 404);
    r = await call("PATCH", `/employees/${cook2EmpId}`, { title: "أجنبي" }, owner2);
    ok("foreign-tenant employee patch → 404", r.status === 404);
    r = await call("PATCH", `/employees/${mgrEmps[0].id}`, { halfWage: 1400 }, mgrTok);
    ok("manager patch own employee ok", r.status === 200);
    // الحضور والرواتب والسلف مفلترة بفرع المدير
    r = await call("POST", "/attendance/mark", { employeeId: cook2EmpId, status: "full" }, ownerTok2);
    ok("owner marks branch2 attendance", r.status === 201);
    r = await call("POST", "/attendance/mark", { employeeId: cook2EmpId, status: "full" }, mgrTok);
    ok("manager mark branch2 attendance → 404", r.status === 404);
    r = await call("GET", "/attendance", undefined, mgrTok);
    ok("manager attendance filtered", r.status === 200 && (r.json as { employeeId: string }[]).every((a) => a.employeeId !== cook2EmpId));
    r = await call("GET", "/attendance", undefined, ownerTok2);
    ok("owner sees branch2 attendance", r.status === 200 && (r.json as { employeeId: string }[]).some((a) => a.employeeId === cook2EmpId));
    r = await call("GET", "/salaries", undefined, mgrTok);
    ok("manager salaries filtered", r.status === 200 && (r.json as { employee: { id: string } }[]).every((s) => s.employee.id !== cook2EmpId));
    r = await call("POST", "/salary-advances", { employeeId: cook2EmpId, amount: 500 }, mgrTok);
    ok("manager advance branch2 → 404", r.status === 404);
    r = await call("POST", "/salary-advances", { employeeId: cook2EmpId, amount: 500 }, ownerTok2);
    const advId = (r.json as { id: string }).id;
    ok("owner advance branch2 → 201", r.status === 201);
    r = await call("GET", "/salary-advances", undefined, mgrTok);
    ok("manager advances filtered", r.status === 200 && (r.json as { employeeId: string }[]).every((a) => a.employeeId !== cook2EmpId));
    r = await call("DELETE", `/salary-advances/${advId}`, undefined, mgrTok);
    ok("manager delete branch2 advance → 404", r.status === 404);
    r = await call("DELETE", `/salary-advances/${advId}`, undefined, ownerTok2);
    ok("owner delete own advance → 200", r.status === 200);
    // الورديات: المدير يرى ورديات فرعه فقط
    r = await call("POST", "/shifts/open", { branchId: branch2, openingCash: 0, cashierId: cashU!.employeeId! }, ownerTok2);
    const sh2 = (r.json as { id: string }).id;
    ok("owner opens branch2 shift", r.status === 201);
    r = await call("GET", "/shifts", undefined, mgrTok);
    ok("manager shifts filtered", r.status === 200 && (r.json as { branchId: string }[]).every((s) => s.branchId !== branch2));
    r = await call("GET", "/shifts", undefined, ownerTok2);
    ok("owner sees branch2 shift", r.status === 200 && (r.json as { id: string }[]).some((s) => s.id === sh2));
    r = await call("POST", `/shifts/${sh2}/close`, { closingCash: 0 }, ownerTok2);
    ok("close branch2 shift", r.status === 200);
    // النقل بين الفروع: من فرع المدير فقط
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch2, toBranchId: branch.id, qty: 1 }, mgrTok);
    ok("manager transfer from foreign → 403", r.status === 403 && (r.json as { error: string }).error === "branch_forbidden");
    r = await call("POST", "/branches/transfer", { productId: p1.id, fromBranchId: branch.id, toBranchId: branch2, qty: 1 }, mgrTok);
    const trOwn = (r.json as { to?: { id: string } });
    ok("manager transfer own → 200", r.status === 200 && !!trOwn.to?.id);
    r = await call("POST", "/branches/transfer", { productId: trOwn.to?.id ?? "", fromBranchId: branch2, toBranchId: branch.id, qty: 1 }, ownerTok2);
    ok("owner restores transfer → 200", r.status === 200);
    // التقارير: نطاق المالك ?branch= وقيود المدير
    r = await call("GET", "/reports/summary?days=7", undefined, ownerTok2);
    const sumAll = r.json as { sales: number };
    r = await call("GET", `/reports/summary?days=7&branch=${branch2}`, undefined, ownerTok2);
    ok("owner report branch2 sales=0", r.status === 200 && (r.json as { sales: number }).sales === 0 && sumAll.sales > 0);
    r = await call("GET", "/reports/summary?days=7&branch=fake-branch", undefined, ownerTok2);
    ok("owner report fake branch → 404", r.status === 404);
    r = await call("GET", `/reports/summary?days=7&branch=${branch2}`, undefined, mgrTok);
    ok("manager report other branch → 403", r.status === 403);
    r = await call("GET", `/reports/summary?days=7&branch=${branch.id}`, undefined, mgrTok);
    ok("manager report own branch → 200", r.status === 200);
    // إعادة تعيين كلمة السر: تمنع الدخول القديم وتسمح بالجديد
    r = await call("POST", `/auth/users/${mgrUser!.id}/password`, { password: "reset1234" }, ownerTok2);
    ok("owner resets manager password → 200", r.status === 200);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "manager1" });
    ok("old manager password rejected", r.status === 401);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "reset1234" });
    const mgrTok2 = r.json.token as string;
    ok("reset manager password works", r.status === 200 && typeof mgrTok2 === "string");
    r = await call("POST", `/auth/users/${ownerU!.id}/password`, { password: "ownerOwn1" }, ownerTok2);
    ok("reset owner account → 404", r.status === 404);
    // التعطيل يمنع الدخول والتفعيل يعيده
    r = await call("PATCH", `/auth/users/${mgrUser!.id}`, { active: false }, ownerTok2);
    ok("deactivate manager → 200", r.status === 200);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "reset1234" });
    ok("deactivated login blocked → 401", r.status === 401);
    r = await call("POST", "/auth/users", { name: "مكرر2", phone: "0550222333", password: "dup1234", role: "cashier" }, ownerTok2);
    ok("duplicate phone while inactive → 409", r.status === 409);
    r = await call("PATCH", `/auth/users/${mgrUser!.id}`, { active: true }, ownerTok2);
    ok("reactivate manager → 200", r.status === 200);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "reset1234" });
    ok("reactivated login ok", r.status === 200);
    r = await call("PATCH", `/auth/users/${cashU!.id}`, { active: false }, mgrTok2);
    ok("manager deactivate → 403", r.status === 403);
    r = await call("PATCH", "/auth/users/whatever", { active: true }, cashTok);
    ok("cashier deactivate → 403", r.status === 403);
  } else ok("2nd branch for isolation test", false);

  // â”€â”€â”€ Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø´ØºÙ‘Ù„ â”€â”€â”€
  const opH = { "x-operator-key": process.env.OPERATOR_KEY ?? "" };
  r = await call("GET", "/ops/overview");
  ok("ops without key â†’ 401", r.status === 401);
  r = await call("GET", "/ops/overview", undefined, undefined, { "x-operator-key": "wrong" });
  ok("ops wrong key â†’ 401", r.status === 401);
  r = await call("GET", "/ops/overview", undefined, undefined, opH);
  const ov = r.json as { tenants: number; users: number; subs: Record<string, number>; recentPayments: unknown[] };
  ok("ops overview", r.status === 200 && ov.tenants >= 2 && ov.users >= 3 && typeof ov.subs === "object");
  r = await call("GET", "/ops/tenants", undefined, undefined, opH);
  const tenants = r.json as { id: string; slug: string; users: number }[];
  const demoT = tenants.find((x) => x.slug === "demo-resto");
  ok("ops tenants list", r.status === 200 && !!demoT && (demoT.users as number) >= 2);
  r = await call("GET", `/ops/tenants/${demoT!.id}`, undefined, undefined, opH);
  const det = r.json as { users: Record<string, unknown>[]; subscription: unknown; payments: unknown[] };
  ok("ops tenant detail hides hashes", r.status === 200 && det.users.every((u) => !("passwordHash" in u)));
  r = await call("PATCH", `/ops/tenants/${demoT!.id}`, { plan: "mega" }, undefined, opH);
  ok("ops set plan", r.status === 200 && (r.json as { plan: string }).plan === "mega");
  await call("PATCH", `/ops/tenants/${demoT!.id}`, { plan: "pro" }, undefined, opH);
  r = await call("GET", "/ops/payments?status=paid", undefined, undefined, opH);
  ok("ops payments filter", r.status === 200 && Array.isArray(r.json));
  r = await call("GET", "/ops/health", undefined, undefined, opH);
  const health = r.json as { env: Record<string, unknown> };
  const leaked = JSON.stringify(health).includes("verify-operator-key") || JSON.stringify(health).includes("GTEST");
  ok("ops health (no secret leak)", r.status === 200 && !leaked && (health.env as Record<string, unknown>).sofizpay === true);
  r = await call("POST", `/ops/tenants/${demoT!.id}/suspend`, undefined, undefined, opH);
  ok("ops suspend", r.status === 200);
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  ok("suspended tenant â†’ 402", r.status === 402);
  r = await call("POST", `/ops/tenants/${demoT!.id}/unsuspend`, undefined, undefined, opH);
  ok("ops unsuspend â†’ past_due", r.status === 200 && (r.json as { status: string }).status === "past_due");
  r = await call("POST", `/ops/tenants/${demoT!.id}/extend`, { months: 1 }, undefined, opH);
  ok("ops extend â†’ active", r.status === 200 && typeof (r.json as { expiresAt: string }).expiresAt === "string");
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, cashTok);
  ok("extended tenant orders ok", r.status === 201);

  // â”€â”€â”€ Ø§Ù„Ø´Ø±ÙŠØ­Ø© P1: Ø§Ù„Ù…ØµØ§Ø±ÙŠÙ Ø§Ù„Ø«Ø§Ø¨ØªØ© + ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ â”€â”€â”€
  r = await call("POST", "/overheads", { name: "ÙƒØ±Ø§Ø¡", kind: "rent", monthly: 30000 }, ownerTok2);
  ok("create overhead", r.status === 201);
  const ohId = (r.json as { id: string }).id;
  r = await call("POST", "/overheads", { name: "ÙƒÙ‡Ø±Ø¨Ø§Ø¡", kind: "electricity", monthly: 3000 }, cashTok);
  ok("cashier overhead â†’ 403", r.status === 403);
  r = await call("GET", "/overheads", undefined, ownerTok2);
  ok("list overheads", r.status === 200 && ((r.json as unknown[]) as { name: string }[]).some((o) => o.name === "ÙƒØ±Ø§Ø¡"));
  r = await call("PATCH", `/overheads/${ohId}`, { active: false }, ownerTok2);
  ok("disable overhead", r.status === 200 && (r.json as { active: boolean }).active === false);
  r = await call("GET", "/reports/summary?days=7", undefined, ownerTok2);
  const s2 = r.json as { breakdown: { gross: number; overheadsTotal: number; labor: number; net: number; overheads: unknown[] }; todayNet: number; methodSplit: { cash: number; card: number } };
  ok("summary breakdown (disabled oh â†’ 0)", r.status === 200 && s2.breakdown.overheadsTotal === 0 && typeof s2.todayNet === "number" && typeof s2.breakdown.labor === "number");
  await call("PATCH", `/overheads/${ohId}`, { active: true }, ownerTok2);
  r = await call("GET", "/reports/summary?days=1", undefined, ownerTok2);
  const s3 = r.json as { breakdown: { overheadsTotal: number; net: number; gross: number } };
  ok("summary net = gross âˆ’ oh âˆ’ labor", r.status === 200 && s3.breakdown.overheadsTotal === 1000 && s3.breakdown.net <= s3.breakdown.gross - 1000);
  r = await call("DELETE", `/overheads/${ohId}`, undefined, ownerTok2);
  ok("delete overhead", r.status === 200);

  // â”€â”€â”€ SofizPay: Ø¯ÙˆØ§Ù„ Ø®Ø§Ù„ØµØ© (Ø¯ÙˆÙ† Ø´Ø¨ÙƒØ©) + Ù…Ø³Ø§Ø±Ø§Øª â”€â”€â”€
  const { buildCreateUrl, parseCreateResponse, parseCheckResponse, isPaid } = await import("../src/sofizpay.js");
  const curl = buildCreateUrl({
    base: "https://sofizpay.com/sandbox", account: "GTEST", amount: 3000,
    fullName: "Karim", phone: "0550", email: "k@x.dz",
    returnUrl: "https://app.example.dz/billing/return?pref=p1", memo: "SUB-x",
  });
  ok("sofiz url builder", curl.includes("make-cib-transaction") && curl.includes("amount=3000") && curl.includes("memo=SUB-x"));
  const pc = parseCreateResponse({ success: true, transaction_id: "t1", cib_transaction_id: "c9", payment_url: "https://pay/x", amount: "3000" });
  ok("sofiz parse create", pc.ok && pc.cibTransactionId === "c9" && pc.paymentUrl === "https://pay/x");
  ok("sofiz parse create reject", !parseCreateResponse({ success: false }).ok);
  const paidCheck = parseCheckResponse({ order_number: "c9", orderStatus: 2, errorCode: 0, respCode: "00", destination_account: "GTEST" });
  ok("sofiz paid verdict", paidCheck.ok && isPaid(paidCheck, "GTEST"));
  ok("sofiz wrong destination", !isPaid(paidCheck, "GOTHER"));
  ok("sofiz failed verdict", !isPaid(parseCheckResponse({ order_number: "c9", orderStatus: 4, errorCode: 1, respCode: "99" }), "GTEST"));
  ok("sofiz missing order", !parseCheckResponse({}).ok);

  delete process.env.SOFIZPAY_ACCOUNT;
  r = await call("POST", "/billing/sofizpay/initiate", { months: 1, email: "k@x.dz" }, ownerTok2);
  ok("initiate unconfigured â†’ 501", r.status === 501);
  process.env.SOFIZPAY_ACCOUNT = "GTEST";
  process.env.SOFIZPAY_BASE = "https://sofizpay.com/sandbox";
  r = await call("POST", "/billing/sofizpay/initiate", { months: 1, email: "k@x.dz" });
  ok("initiate unauthenticated â†’ 401", r.status === 401);
  r = await call("POST", "/billing/sofizpay/initiate", { months: 99, email: "k@x.dz" }, ownerTok2);
  ok("initiate bad months â†’ 400", r.status === 400);
  r = await call("GET", "/billing/sofizpay/status/nope", undefined, ownerTok2);
  ok("return-status unknown â†’ 404", r.status === 404);
  r = await call("POST", "/billing/sofizpay/initiate", { months: 1, email: "not-an-email" }, ownerTok2);
  ok("initiate bad email â†’ 400", r.status === 400);

  // اختبارات ما بعد حد المعدل (حساسة — في النهاية لتفادي 429):
  // اقتناء شخصي + صنف يدوي: دفع كامل فوراً، بلا مخزون ولا مورد
  r = await call("POST", "/purchases", {
    supplierId: null, lines: [{ productId: p1.id, qty: 2, unitCost: 200 }, { name: "Ø£ÙƒÙŠØ§Ø³", qty: 5, unitCost: 50 }], paid: 650, method: "cash",
  }, ownerTok2);
  const per = r.json as { id: string; total: number; paid: number; status: string; supplierId: null };
  ok("personal purchase paid", r.status === 201 && per.total === 650 && per.status === "paid" && per.supplierId === null);
  r = await call("POST", "/purchases", { supplierId: null, lines: [{ name: "x", qty: 1, unitCost: 10 }], paid: 0 }, ownerTok2);
  ok("personal unpaid â†’ 400", r.status === 400);
  // سلف الموظفين: إنشاء + سرد + حذف
  r = await call("POST", "/salary-advances", { employeeId: emp.id, amount: 5000, note: "Ø³Ù„ÙØ©" }, ownerTok2);
  ok("advance create", r.status === 201);
  const advId = (r.json as { id: string }).id;
  r = await call("GET", "/salary-advances", undefined, ownerTok2);
  ok("advances listed", r.status === 200 && ((r.json as unknown[]) as { id: string }[]).some((a) => a.id === advId));
  r = await call("DELETE", `/salary-advances/${advId}`, undefined, ownerTok2);
  ok("advance delete", r.status === 200);

  // حذف عامل: يسقط الحضور والسلف ويفكّ ربط حساب الدخول
  r = await call("POST", "/auth/users", { name: "Temp Emp", phone: "0550666666", password: "secret12", role: "cashier" }, ownerTok2);
  ok("temp emp created", r.status === 201);
  const tmpEmpId = (r.json as { employeeId: string }).employeeId;
  await db.markAttendance({ tenantId: tenant.id, employeeId: tmpEmpId, date: "2026-01-05", status: "full" });
  r = await call("POST", "/salary-advances", { employeeId: tmpEmpId, amount: 300 }, ownerTok2);
  ok("temp advance created", r.status === 201);
  r = await call("DELETE", `/employees/${tmpEmpId}`, undefined, cashTok);
  ok("cashier delete emp → 403", r.status === 403);
  r = await call("DELETE", `/employees/${tmpEmpId}`, undefined, ownerTok2);
  ok("employee delete", r.status === 200);
  ok("emp att cascade", (await db.listAttendance(tenant.id)).every((a) => a.employeeId !== tmpEmpId));
  ok("emp advance cascade", (await db.listAdvances(tenant.id)).every((a) => a.employeeId !== tmpEmpId));
  ok("emp user unlinked", (await db.listUsers(tenant.id)).every((u) => u.employeeId !== tmpEmpId));
  r = await call("DELETE", `/employees/${tmpEmpId}`, undefined, ownerTok2);
  ok("employee delete 404", r.status === 404);

  // حذف عميل: يسقط سجل الدفعات — مالك/مدير فقط
  r = await call("PATCH", "/tenant", { crmEnabled: true }, ownerTok2);
  ok("re-enable crm", r.status === 200);
  r = await call("POST", "/customers", { name: "Temp Cust", phone: "0550777777" }, cashTok);
  ok("temp customer created", r.status === 201);
  const tmpCustId = (r.json as { id: string }).id;
  await db.addCustomerDebt(tenant.id, tmpCustId, 500);
  await db.recordCustomerPayment(tenant.id, tmpCustId, 200, "cash");
  r = await call("DELETE", `/customers/${tmpCustId}`, undefined, cashTok);
  ok("cashier delete customer → 403", r.status === 403);
  r = await call("DELETE", `/customers/${tmpCustId}`, undefined, ownerTok2);
  ok("customer delete", r.status === 200);
  ok("customer payments cascade", (await db.listCustomerPayments(tenant.id, tmpCustId)).length === 0);
  r = await call("DELETE", `/customers/${tmpCustId}`, undefined, ownerTok2);
  ok("customer delete 404", r.status === 404);

  // تذاكر الدعم: مستخدم يرسل → المشغّل يرى ويغلق
  r = await call("POST", "/support/tickets", { message: "لا تظهر فاتورة الطاولة 3" }, ownerTok2);
  ok("support ticket created", r.status === 201 && typeof (r.json as { id: string }).id === "string");
  const tktId = (r.json as { id: string }).id;
  r = await call("POST", "/support/tickets", { message: "hi" }, ownerTok2);
  ok("short ticket → 400", r.status === 400);
  r = await call("GET", "/ops/support", undefined, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  ok("ops lists tickets", r.status === 200 && ((r.json as unknown[]) as { id: string }[]).some((t) => t.id === tktId));
  r = await call("POST", `/ops/support/${tktId}/resolve`, undefined, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  ok("ops resolve ticket", r.status === 200);
  r = await call("GET", "/ops/support?status=open", undefined, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  ok("resolved ticket gone from open", r.status === 200 && !((r.json as unknown[]) as { id: string }[]).some((t) => t.id === tktId));
  r = await call("GET", "/ops/support", undefined, undefined, { "x-operator-key": "wrong" });
  ok("ops support wrong key → 401", r.status === 401);

  // عدّاد الخطة×النوع
  r = await call("GET", "/ops/overview", undefined, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  const ovPlanType = r.json as { byPlanType?: Record<string, Record<string, number>> };
  ok("overview byPlanType restaurant+shop", r.status === 200 && !!ovPlanType.byPlanType && typeof ovPlanType.byPlanType.restaurant?.pro === "number" && typeof ovPlanType.byPlanType.shop?.starter === "number");

  // رسائل الأخطاء الدقيقة: 404 مع كيان، JSON معطوب، جسم أكبر من الحد
  r = await call("DELETE", "/customers/00000000-0000-0000-0000-000000000000", undefined, ownerTok2);
  ok("not_found carries entity", r.status === 404 && r.json.error === "not_found" && r.json.entity === "customer",
    `got ${JSON.stringify(r.json)}`);
  const badRes = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  const badJson = await badRes.json().catch(() => ({}) as unknown) as { error?: string };
  ok("bad json → bad_json", badRes.status === 400 && badJson.error === "bad_json", `got ${badRes.status} ${JSON.stringify(badJson)}`);
  const bigRes = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "x".repeat(2_100_000) }) });
  const bigJson = await bigRes.json().catch(() => ({}) as unknown) as { error?: string };
  ok("oversize body → payload_too_large", bigRes.status === 413 && bigJson.error === "payload_too_large", `got ${bigRes.status} ${JSON.stringify(bigJson)}`);

  // ═══ ما بعد مراجعة الإطلاق (P0/P1): تحقق الفروع + الصفحات القانونية + الأمان ═══

  // C: فرع وهمي أو أجنبي مرفوض بـ404 entity:branch على كل نقاط الكتابة
  r = await call("POST", "/products", { name: "وهمي", branchId: "no-such-branch", buyPrice: 1, sellPrice: 2, qty: 1 }, ownerTok2);
  ok("product fake branch → 404 branch", r.status === 404 && r.json.error === "not_found" && r.json.entity === "branch",
    `got ${r.status} ${JSON.stringify(r.json)}`);
  r = await call("POST", "/products", { name: "أجنبي", branchId: expBranch.id, buyPrice: 1, sellPrice: 2, qty: 1 }, ownerTok2);
  ok("product foreign-tenant branch → 404 branch", r.status === 404 && r.json.entity === "branch",
    `got ${r.status} ${JSON.stringify(r.json)}`);
  r = await call("POST", "/orders", {
    branchId: "no-such-branch", kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, ownerTok2);
  ok("order fake branch → 404 branch", r.status === 404 && r.json.entity === "branch",
    `got ${r.status} ${JSON.stringify(r.json)}`);
  r = await call("POST", "/shifts/open", { branchId: "no-such-branch", openingCash: 0, cashierId: "c1" }, ownerTok2);
  ok("shift open fake branch → 404 branch", r.status === 404 && r.json.entity === "branch",
    `got ${r.status} ${JSON.stringify(r.json)}`);
  r = await call("GET", "/products?branch=no-such-branch", undefined, ownerTok2);
  ok("products ?branch fake → 404 branch", r.status === 404 && r.json.entity === "branch", `got ${r.status}`);
  r = await call("GET", "/orders?branch=no-such-branch", undefined, ownerTok2);
  ok("orders ?branch fake → 404 branch", r.status === 404 && r.json.entity === "branch", `got ${r.status}`);
  r = await call("GET", `/products?branch=${expBranch.id}`, undefined, ownerTok2);
  ok("products ?branch foreign → 404 branch", r.status === 404 && r.json.entity === "branch", `got ${r.status}`);

  // E2: الصفحات القانونية — قراءة عامة + حفظ المشغّل
  r = await call("GET", "/public/legal/privacy");
  ok("legal privacy defaults", r.status === 200 && (r.json as { key: string }).key === "privacy"
    && typeof (r.json as { ar: { title: string } }).ar.title === "string"
    && typeof (r.json as { fr: { body: string } }).fr.body === "string");
  r = await call("GET", "/public/legal/terms");
  ok("legal terms defaults", r.status === 200 && typeof (r.json as { fr: { title: string } }).fr.title === "string");
  r = await call("GET", "/public/legal/nope");
  ok("legal unknown key → 404", r.status === 404);
  r = await call("PUT", "/ops/legal/privacy", { lang: "ar", title: "x", body: "y" }, undefined, { "x-operator-key": "wrong" });
  ok("legal save wrong operator → 401", r.status === 401);
  r = await call("PUT", "/ops/legal/privacy", { lang: "de", title: "x", body: "y" }, undefined, opH);
  ok("legal save bad lang → 400", r.status === 400);
  r = await call("PUT", "/ops/legal/privacy", { lang: "ar", title: "سياسة محدثة", body: "نص محدث بالكامل" }, undefined, opH);
  ok("legal save → 200", r.status === 200 && typeof (r.json as { id: string }).id === "string");
  r = await call("GET", "/public/legal/privacy");
  ok("edited legal content visible", r.status === 200 && (r.json as { ar: { title: string } }).ar.title === "سياسة محدثة");
  r = await call("PUT", "/ops/legal/unknown", { lang: "ar", title: "x", body: "y" }, undefined, opH);
  ok("legal save unknown key → 404", r.status === 404);

  // D: رفع الملفات — صور فقط
  const fdTxt = new FormData();
  fdTxt.append("file", new Blob(["#!/bin/sh"], { type: "text/plain" }), "evil.txt");
  const upTxt = await fetch(`${BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${ownerTok2}` }, body: fdTxt });
  ok("upload non-image → 400", upTxt.status === 400, `got ${upTxt.status}`);

  // D: JWT مزوّد/مزوّد عليه مرفوض
  const noneJwt = "eyJhbGciOiJub25lIn0.eyJhdXRoIjp7InRlbmFudF9pZCI6IngiLCJyb2xlIjoib3duZXIifX0.";
  r = await call("GET", "/products", undefined, noneJwt);
  ok("alg-none JWT → 401", r.status === 401, `got ${r.status}`);
  const evilRes = await fetch(`${BASE}/health`, { headers: { Origin: "https://evil.example" } });
  ok("evil origin not reflected", (evilRes.headers.get("access-control-allow-origin") ?? "") !== "https://evil.example");

  // B: مع DATABASE_URL المكسور — لا fallback ذاكرة صامت أبداً
  const savedUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "not-a-valid-postgres-url";
  const fb = await createDb().catch(() => null);
  ok("createDb never silent-memory with DATABASE_URL", fb === null || fb.kind !== "memory",
    `kind=${fb ? fb.kind : "threw"}`);
  process.env.DATABASE_URL = savedUrl;

  server.close();
  console.log(failures === 0 ? `ALL GREEN (${total} checks)` : `${failures} FAILURES of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("VERIFY CRASH", e); process.exit(1); });
