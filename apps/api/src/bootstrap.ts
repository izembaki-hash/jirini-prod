import { createDb, type DbPort } from "./db.js";
import { hashPassword } from "./auth.js";

// بذرة أول إقلاع: مستأجر + فرع + مالك + منتجات. آمنة التكرار (تتخطى عند الوجود).
// مرّر نسخة القاعدة نفسها التي يستخدمها التطبيق — وإلا ضاعت البذرة.
export async function maybeSeed(external?: DbPort) {
  const db = external ?? (await createDb());
  if (await db.getTenantBySlug("demo-resto")) {
    console.log("[seed] demo-resto exists, skipping");
    return;
  }
  const tenant = await db.createTenant({
    slug: "demo-resto", name: "مطعم الدار", type: "restaurant", lang: "ar", plan: "pro",
    phone: "0550000000", address: "الجزائر العاصمة", logoUrl: null, crmEnabled: true, overtimeEnabled: false,
    tablesCount: 6,
  });
  const branch = await db.createBranch({ tenantId: tenant.id, name: "الفرع الرئيسي", address: "الجزائر العاصمة" });
  const emp = await db.createEmployee({
    tenantId: tenant.id, branchId: branch.id, name: "المالك", role: "owner", title: null,
    hiredAt: new Date().toISOString().slice(0, 10), hourlyRate: 0, halfWage: 0,
  });
  await db.createUser({
    tenantId: tenant.id, employeeId: emp.id, name: "المالك", phone: "0550000000",
    passwordHash: await hashPassword("demo1234"), pinHash: null, pages: null,
    role: "owner", branchId: null, active: true,
  });
  await db.saveSubscription({
    tenantId: tenant.id, plan: "pro", status: "active",
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    amountDzd: 0, lastRef: "demo", confirmedBy: "seed", confirmedAt: new Date().toISOString(),
  });
  const seedProducts = [
    { name: "كسكس بالخضرة", buy: 180, sell: 350, qty: 40 },
    { name: "بيتزا 4 أجبان", buy: 300, sell: 600, qty: 25 },
    { name: "مشروب غازي", buy: 60, sell: 120, qty: 120 },
  ];
  for (const p of seedProducts) {
    await db.createProduct({
      tenantId: tenant.id, branchId: branch.id, name: p.name, nameFr: p.name,
      buyPrice: p.buy, sellPrice: p.sell, qty: p.qty, minQty: 5,
      barcode: null, imageUrl: null, category: "أطباق", shelf: null,
      expiryDate: null, wholesalePrice: null, active: true,
    });
  }
  // مكونات + وصفة + مورّد (لإحياء الوحدات الجديدة في العرض)
  const semolina = await db.createProduct({
    tenantId: tenant.id, branchId: branch.id, name: "سميد", nameFr: "Semoule",
    buyPrice: 90, sellPrice: 0, qty: 50, minQty: 10,
    barcode: null, imageUrl: null, category: "مكونات", shelf: null,
    expiryDate: null, wholesalePrice: null, active: true, saleable: false,
  });
  const veg = await db.createProduct({
    tenantId: tenant.id, branchId: branch.id, name: "خضار مشكلة", nameFr: "Légumes",
    buyPrice: 70, sellPrice: 0, qty: 30, minQty: 8,
    barcode: null, imageUrl: null, category: "مكونات", shelf: null,
    expiryDate: null, wholesalePrice: null, active: true, saleable: false,
  });
  const couscous = (await db.listProducts(tenant.id)).find((p) => p.name === "كسكس بالخضرة");
  if (couscous) {
    await db.setDishRecipe(tenant.id, couscous.id, [
      { ingredientId: semolina.id, qty: 0.4 },
      { ingredientId: veg.id, qty: 0.3 },
    ]);
  }
  const sup =   await db.createSupplier({
    tenantId: tenant.id, name: "مطحنة الشرق", phone: "0550777888",
    address: "السوق", notes: null, active: true, openingDebt: 0,
  });
  if (couscous) {
    const pur = await db.createPurchase({
      tenantId: tenant.id, supplierId: sup.id,
      lines: [{ productId: couscous.id, name: couscous.name, qty: 20, unitCost: 180 }],
      total: 3600, paid: 0, date: new Date().toISOString(), notes: null,
    });
    await db.payPurchase(tenant.id, pur.id, 3600, "cash", "seed");
  }
  await db.createDriver({ tenantId: tenant.id, name: "سائق داخلي", phone: "0550111222", vehicle: "دراجة", kind: "internal", active: true });
  await db.createDriver({ tenantId: tenant.id, name: "توصيل سريع (خارجي)", phone: "0550333444", vehicle: "سيارة", kind: "external", active: true });
  console.log("[seed] demo ready — slug=demo-resto phone=0550000000 password=demo1234 (CHANGE IT)");
}
