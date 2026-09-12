// تحقق محوّل Postgres على قاعدة حقيقية (دورة DbPort كاملة بدون HTTP).
// التشغيل: $env:DATABASE_URL="postgresql://dz:dzpass@localhost:5432/dzsaas" ; npm run verify:pg
import { createDb } from "../src/db.js";

let failures = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

async function main() {
  const db = await createDb();
  ok("adapter is postgres", db.kind === "postgres", db.kind);
  const slug = `vpg${Date.now().toString(36)}`;

  const tenant = await db.createTenant({
    slug, name: "تحقق", type: "shop", lang: "ar", plan: "starter",
    phone: "0550000001", address: "", logoUrl: null, crmEnabled: true, overtimeEnabled: true,
    tablesCount: 4,
  });
  ok("create tenant", !!tenant.id);
  ok("getTenantBySlug", (await db.getTenantBySlug(slug))?.id === tenant.id);
  await db.updateTenant(tenant.id, { crmEnabled: false });
  ok("update tenant", (await db.getTenant(tenant.id))?.crmEnabled === false);

  const branch = await db.createBranch({ tenantId: tenant.id, name: "B1", address: "" });
  ok("create branch", !!branch.id && (await db.listBranches(tenant.id)).length === 1);

  const emp = await db.createEmployee({
    tenantId: tenant.id, branchId: branch.id, name: "E", role: "cashier",
    hiredAt: "2024-01-01", hourlyRate: 200,
  });
  await db.createUser({
    tenantId: tenant.id, employeeId: emp.id, name: "E", phone: "0550000001",
    passwordHash: "h", role: "cashier", branchId: branch.id, active: true,
  });
  ok("findUserByPhone", (await db.findUserByPhone(tenant.id, "0550000001"))?.role === "cashier");
  ok("findUserById", (await db.findUserById(tenant.id, emp.id)) === null); // employee ≠ user
  const u = await db.findUserByPhone(tenant.id, "0550000001");
  await db.setUserPassword(tenant.id, u!.id, "h2");
  ok("setUserPassword", true);
  ok("listEmployees", (await db.listEmployees(tenant.id)).length === 1);

  const prod = await db.createProduct({
    tenantId: tenant.id, branchId: branch.id, name: "سكر", nameFr: "Sucre",
    buyPrice: 85, sellPrice: 100, qty: 60, minQty: 5, barcode: "6112002",
    imageUrl: null, category: "غذائية", shelf: "A2", expiryDate: null,
    wholesalePrice: 80, active: true,
  });
  ok("create product", !!prod.id && prod.wholesalePrice === 80);
  await db.adjustStock(tenant.id, prod.id, -10, "sale #1");
  const after = (await db.listProducts(tenant.id)).find((p) => p.id === prod.id);
  ok("adjustStock 60→50", after?.qty === 50);
  ok("listMoves", (await db.listMoves(tenant.id, prod.id)).length === 1);
  await db.updateProduct(tenant.id, prod.id, { sellPrice: 110 });
  ok("update product", true);

  // الشريحة 1 على Postgres
  const r1 = await db.setDishRecipe(tenant.id, prod.id, [{ ingredientId: prod.id, qty: 1 }]).then(() => null).catch((e: unknown) => e);
  ok("self ingredient → 400", (r1 as { status?: number })?.status === 400);
  const lines = await db.setDishRecipe(tenant.id, prod.id, []);
  ok("clear recipe", Array.isArray(lines));
  const sup = await db.createSupplier({ tenantId: tenant.id, name: "S", phone: "05502", address: null, notes: null, active: true });
  const dup = await db.createSupplier({ tenantId: tenant.id, name: "S2", phone: "05502", address: null, notes: null, active: true }).then(() => null).catch((e: unknown) => e);
  ok("duplicate supplier → 409", (dup as { status?: number })?.status === 409);
  const pur = await db.createPurchase({
    tenantId: tenant.id, supplierId: sup.id,
    lines: [{ productId: prod.id, name: "سكر", qty: 5, unitCost: 90 }],
    total: 450, paid: 0, date: new Date().toISOString(), notes: null,
  });
  ok("purchase unpaid", pur.status === "unpaid" && pur.num === 1);
  const paid1 = await db.payPurchase(tenant.id, pur.id, 200, "cash", "r1");
  ok("purchase partial", paid1.status === "partial" && paid1.paid === 200);
  const over = await db.payPurchase(tenant.id, pur.id, 10000).then(() => null).catch((e: unknown) => e);
  ok("overpay → 400", (over as { status?: number })?.status === 400);
  const paid2 = await db.payPurchase(tenant.id, pur.id, 250);
  ok("purchase paid", paid2.status === "paid");
  const al = await db.createAlert({ tenantId: tenant.id, kind: "wastage", refId: prod.id, message: "t", read: false });
  ok("alert unread", (await db.listAlerts(tenant.id, true)).length === 1);
  await db.markAlertRead(tenant.id, al.id);
  ok("alert read", (await db.listAlerts(tenant.id, true)).length === 0);

  // P1 على Postgres
  const oh = await db.createOverhead({ tenantId: tenant.id, name: "كراء", kind: "rent", monthly: 30000, active: true, notes: null });
  ok("create overhead", !!oh.id && (await db.listOverheads(tenant.id)).length === 1);
  await db.updateOverhead(tenant.id, oh.id, { monthly: 31000 });
  ok("update overhead", true);
  await db.deleteOverhead(tenant.id, oh.id);
  ok("delete overhead", (await db.listOverheads(tenant.id)).length === 0);

  // المشغّل على Postgres
  ok("listTenants", (await db.listTenants()).some((x) => x.id === tenant.id));
  const allUsers = await db.listAllUsers();
  ok("listAllUsers (no hashes)", allUsers.length >= 1 && allUsers.every((u) => !("passwordHash" in u)));
  await db.createBillingPayment({
    tenantId: tenant.id, ref: "T1", plan: "starter", months: 1, amountDzd: 2500,
    email: null, status: "initiated", sofizTransactionId: null, cibTransactionId: null,
  });
  ok("listAllBillingPayments", (await db.listAllBillingPayments("initiated")).length >= 1);

  const num = await db.nextOrderNum(tenant.id);
  const order = await db.createOrder({
    num, tenantId: tenant.id, branchId: branch.id, shiftId: null, kind: "takeaway",
    tableNo: null, status: "preparing",
    lines: [{ productId: prod.id, name: "سكر", qty: 2, price: 110 }],
    discount: 0, tax: 0, total: 220, payMethod: "cash",
    customer: null, phone: null, address: null, rating: null,
  });
  ok("create order + json lines", order.lines.length === 1 && order.lines[0].price === 110);
  ok("listOrders", (await db.listOrders(tenant.id)).length === 1);
  await db.setOrderStatus(tenant.id, order.id, "delivered");
  ok("setOrderStatus", (await db.getOrder(tenant.id, order.id))?.status === "delivered");
  await db.rateOrder(tenant.id, order.id, 5);
  ok("rateOrder", (await db.getOrder(tenant.id, order.id))?.rating === 5);

  // الشريحة 2 على Postgres
  const drv = await db.createDriver({ tenantId: tenant.id, name: "D", phone: "05503", vehicle: null, kind: "external", active: true });
  ok("create driver", !!drv.id && (await db.listDrivers(tenant.id)).length === 1);
  const ddup = await db.createDriver({ tenantId: tenant.id, name: "D2", phone: "05503", vehicle: null, kind: "internal", active: true }).then(() => null).catch((e: unknown) => e);
  ok("duplicate driver → 409", (ddup as { status?: number })?.status === 409);
  await db.updateDriver(tenant.id, drv.id, { active: false });
  const badAssign = await db.assignDriver(tenant.id, order.id, drv.id).then(() => null).catch((e: unknown) => e);
  ok("inactive driver → 400", (badAssign as { status?: number })?.status === 400);
  await db.updateDriver(tenant.id, drv.id, { active: true });
  const assigned = await db.assignDriver(tenant.id, order.id, drv.id);
  ok("assign driver", assigned.driverId === drv.id);
  ok("order carries driverId", (await db.getOrder(tenant.id, order.id))?.driverId === drv.id);

  const shift = await db.openShift({
    tenantId: tenant.id, branchId: branch.id, cashierId: emp.id,
    openedAt: new Date().toISOString(), openingCash: 5000, note: "",
  });
  ok("openShift", (await db.getOpenShift(tenant.id, branch.id))?.id === shift.id);
  await db.closeShift(tenant.id, shift.id, 5200, "ok");
  ok("closeShift", (await db.listShifts(tenant.id))[0]?.closingCash === 5200);

  const att = await db.checkIn({
    tenantId: tenant.id, employeeId: emp.id, date: "2026-09-08",
    inAt: new Date().toISOString(), overtimeMin: 0,
  });
  await db.checkOut(tenant.id, att.id);
  ok("attendance", (await db.listAttendance(tenant.id, "2026-09-08")).length === 1);

  await db.createCustomer({ tenantId: tenant.id, name: "C", phone: "0551", address: null });
  ok("customer", (await db.listCustomers(tenant.id)).length === 1);
  const goal = await db.createGoal({ tenantId: tenant.id, title: "G", target: 100, saved: 0, monthly: 10 });
  await db.updateGoal(tenant.id, goal.id, { saved: 50 });
  ok("goal", (await db.listGoals(tenant.id))[0]?.saved === 50);
  await db.deleteGoal(tenant.id, goal.id);
  ok("delete goal", (await db.listGoals(tenant.id)).length === 0);

  await db.saveSubscription({
    tenantId: tenant.id, plan: "starter", status: "trialing",
    startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
    amountDzd: 2500, lastRef: null, confirmedBy: null, confirmedAt: null,
  });
  ok("subscription", (await db.getSubscription(tenant.id))?.status === "trialing");

  console.log(failures === 0 ? "PG ALL GREEN" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("PG VERIFY CRASH", e); process.exit(1); });
