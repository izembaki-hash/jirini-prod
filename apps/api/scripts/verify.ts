// Ø¬Ù†Ø§Ø­ Ø§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ø¯Ø§Ø¦Ù…: Ø¯ÙˆØ±Ø© Ø¥Ù†ØªØ§Ø¬ ÙƒØ§Ù…Ù„Ø© Ø¹Ø¨Ø± HTTP Ø¹Ù„Ù‰ Ù…Ø­ÙˆÙ‘Ù„ Ø§Ù„Ø°Ø§ÙƒØ±Ø©.
// Ø§Ù„ØªØ´ØºÙŠÙ„: npm run verify  (ÙŠØ¶Ø¨Ø· JWT_SECRET ÙˆOPERATOR_KEY ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¥Ù† ØºØ§Ø¨Ø§)
process.env.JWT_SECRET ??= "verify-secret-local-only-0123456789abcdef";
process.env.OPERATOR_KEY ??= "verify-operator-key";
process.env.SOFIZPAY_ACCOUNT ??= "GTEST";
process.env.RATE_LIMIT_SENSITIVE ??= "1000";
import { buildApp } from "../src/app.js";
import { MemoryAdapter } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

const PORT = 4999;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` â€” ${extra}` : ""}`);
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
    passwordHash: await hashPassword("demo1234"), role: "owner", branchId: null, active: true,
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

  // Ø§Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø°Ø§ØªÙŠ + Ø§Ù„ÙÙˆØªØ±Ø©
  r = await call("GET", "/public/plans");
  ok("public plans", r.status === 200 && Array.isArray(r.json) && (r.json as unknown[]).length === 3);
  r = await call("POST", "/public/signup", {
    name: "Superette Essalam", type: "shop", phone: "0550999888", plan: "starter",
    ownerName: "Karim", password: "secret12",
  });
  ok("self signup â†’ 201 + trial", r.status === 201 && typeof (r.json as { slug: string }).slug === "string");
  const slug2 = (r.json as { slug: string }).slug;
  r = await call("POST", "/auth/login", { slug: slug2, phone: "0550999888", password: "secret12" });
  ok("new tenant login", r.status === 200);
  const owner2 = r.json.token as string;
  r = await call("GET", "/billing/status", undefined, owner2);
  ok("billing trialing", r.status === 200 && (r.json as { status: string }).status === "trialing");
  r = await call("POST", "/billing/submit-payment", { ref: "CCP-12345", months: 2 }, owner2);
  ok("submit payment â†’ pending", r.status === 200 && (r.json as { status: string }).status === "pending");
  r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": "wrong" });
  ok("operator wrong key â†’ 401", r.status === 401);
  r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
  ok("operator confirm â†’ active", r.status === 200 && typeof (r.json as { expiresAt: string }).expiresAt === "string");
  r = await call("POST", "/billing/satim/notify", { order_id: "x" });
  ok("satim stub removed â†’ 404", r.status === 404);

  // Ø¥Ù†ÙØ§Ø° Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡: Ù†ÙÙ†Ù‡ÙŠ Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ Ù…Ø¨Ø§Ø´Ø±Ø© Ø«Ù… Ù†Ø­Ø§ÙˆÙ„ Ø§Ù„Ø¨ÙŠØ¹ (ÙŠÙØ´Ù„ Ù‚Ø¨Ù„ ÙØ­Øµ Ø§Ù„Ù…Ù†ØªØ¬)
  await db.saveSubscription({
    tenantId: (await db.getTenantBySlug(slug2))!.id, plan: "starter", status: "past_due",
    startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(),
    amountDzd: 2500, lastRef: "CCP-12345", confirmedBy: null, confirmedAt: null,
  });
  r = await call("POST", "/orders", {
    branchId: branch.id, kind: "dinein", lines: [{ productId: "nope", qty: 1 }],
    discount: 0, tax: 0, payMethod: "cash",
  }, owner2);
  ok("expired subscription â†’ 402", r.status === 402);
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
  r = await call("POST", "/attendance/mark", { employeeId: emp.id, status: "full" }, cashTok);
  ok("mark full", r.status === 201);
  r = await call("POST", "/attendance/mark", { employeeId: emp.id, status: "half" }, cashTok);
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

  server.close();
  console.log(failures === 0 ? "ALL GREEN" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("VERIFY CRASH", e); process.exit(1); });
