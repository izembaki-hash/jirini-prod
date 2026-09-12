// جناح التحقق الدائم: دورة إنتاج كاملة عبر HTTP على محوّل الذاكرة.
// التشغيل: npm run verify  (يضبط JWT_SECRET وOPERATOR_KEY تلقائياً إن غابا)
process.env.JWT_SECRET ??= "verify-secret-local-only-0123456789abcdef";
process.env.OPERATOR_KEY ??= "verify-operator-key";
process.env.SOFIZPAY_ACCOUNT ??= "GTEST";
import { buildApp } from "../src/app.js";
import { MemoryAdapter } from "../src/db.js";
import { hashPassword } from "../src/auth.js";
const PORT = 4999;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const ok = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
    if (!cond)
        failures++;
};
async function main() {
    const db = new MemoryAdapter();
    const tenant = await db.createTenant({
        slug: "demo-resto", name: "مطعم الدار", type: "restaurant", lang: "ar", plan: "pro",
        phone: "0550000000", address: "الجزائر", logoUrl: null, crmEnabled: true, overtimeEnabled: false,
        tablesCount: 6,
    });
    const branch = await db.createBranch({ tenantId: tenant.id, name: "الرئيسي", address: "" });
    const emp = await db.createEmployee({
        tenantId: tenant.id, branchId: branch.id, name: "المالك", role: "owner",
        hiredAt: "2024-01-01", hourlyRate: 0,
    });
    await db.createUser({
        tenantId: tenant.id, employeeId: emp.id, name: "المالك", phone: "0550000000",
        passwordHash: await hashPassword("demo1234"), role: "owner", branchId: null, active: true,
    });
    const p1 = await db.createProduct({
        tenantId: tenant.id, branchId: branch.id, name: "كسكس", nameFr: "Couscous",
        buyPrice: 180, sellPrice: 350, qty: 40, minQty: 5, barcode: null, imageUrl: null,
        category: "أطباق", shelf: null, expiryDate: null, wholesalePrice: null, active: true,
    });
    const app = await buildApp(db);
    const server = app.listen(PORT);
    await new Promise((r) => setTimeout(r, 400));
    const call = async (method, path, body, token, headers) => {
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, json: json };
    };
    let r = await call("GET", "/health");
    ok("health", r.status === 200 && r.json.db === "memory");
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "wrong" });
    ok("login bad → 401", r.status === 401);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550 000 000", password: "demo1234" });
    ok("login ok (phone normalized)", r.status === 200 && typeof r.json.token === "string");
    const ownerTok = r.json.token;
    r = await call("POST", "/auth/users", { name: "أمين", phone: "0550111111", password: "cashier1", role: "cashier", hourlyRate: 300, branchId: branch.id }, ownerTok);
    ok("create cashier", r.status === 201);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550111111", password: "cashier1" });
    const cashTok = r.json.token;
    r = await call("POST", "/products", { name: "x", branchId: branch.id, buyPrice: 1, sellPrice: 2, qty: 1 }, cashTok);
    ok("cashier cannot create product → 403", r.status === 403);
    // كلمة السر
    r = await call("POST", "/auth/change-password", { current: "nope", next: "newpass123" }, ownerTok);
    ok("change-password wrong current → 401", r.status === 401);
    r = await call("POST", "/auth/change-password", { current: "demo1234", next: "newpass123" }, ownerTok);
    ok("change-password ok", r.status === 200);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "demo1234" });
    ok("old password rejected", r.status === 401);
    r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550000000", password: "newpass123" });
    ok("new password works", r.status === 200);
    const ownerTok2 = r.json.token;
    // وردية + بيع + خصم مخزون
    r = await call("POST", "/shifts/open", { branchId: branch.id, openingCash: 10000, cashierId: "c1" }, cashTok);
    ok("open shift", r.status === 201);
    const shiftId = r.json.id;
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 2 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    ok("create order total=700", r.status === 201 && r.json.total === 700);
    const orderId = r.json.id;
    r = await call("GET", "/products", undefined, ownerTok2);
    const prodAfter = r.json.find((p) => p.id === p1.id);
    ok("stock deducted 40→38", prodAfter?.qty === 38);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 100 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    ok("insufficient stock → 409", r.status === 409);
    // انتقالات + إلغاء يعيد المخزون
    r = await call("PATCH", `/orders/${orderId}`, { status: "ready" }, cashTok);
    ok("preparing→ready", r.status === 200);
    r = await call("PATCH", `/orders/${orderId}`, { status: "delivered" }, cashTok);
    ok("ready→delivered", r.status === 200);
    r = await call("PATCH", `/orders/${orderId}`, { status: "preparing" }, ownerTok2);
    ok("bad transition → 400", r.status === 400);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "takeaway", lines: [{ productId: p1.id, qty: 1 }],
        discount: 0, tax: 0, payMethod: "card",
    }, cashTok);
    const order2 = r.json.id;
    r = await call("PATCH", `/orders/${order2}`, { status: "cancelled" }, cashTok);
    ok("cashier cancel → 403", r.status === 403);
    r = await call("PATCH", `/orders/${order2}`, { status: "cancelled" }, ownerTok2);
    ok("owner cancel ok", r.status === 200);
    r = await call("GET", "/products", undefined, ownerTok2);
    const prodRestored = r.json.find((p) => p.id === p1.id);
    ok("cancel restores stock 37→38", prodRestored?.qty === 38);
    // إغلاق وردية: متوقع = 10000 + 700 = 10700
    r = await call("POST", `/shifts/${shiftId}/close`, { closingCash: 10700, note: "" }, cashTok);
    ok("close shift diff=0", r.status === 200 && r.json.diff === 0);
    // التقارير
    r = await call("GET", "/reports/summary?days=7", undefined, ownerTok2);
    const sum = r.json;
    ok("summary profit=340", r.status === 200 && sum.profit === 340 && sum.todayProfit === 340);
    r = await call("GET", "/reports/summary", undefined, cashTok);
    ok("cashier reports → 403", r.status === 403);
    // ─── الشريحة 1: وصفات + مورّدون + مشتريات + هدر + تنبيهات ───
    r = await call("POST", "/products", { name: "سميد", branchId: branch.id, buyPrice: 90, sellPrice: 0, qty: 10, saleable: false }, ownerTok2);
    ok("create ingredient", r.status === 201);
    const ingId = r.json.id;
    r = await call("PUT", `/recipes/dish/${p1.id}`, { lines: [{ ingredientId: p1.id, qty: 1 }] }, ownerTok2);
    ok("self ingredient → 400", r.status === 400);
    r = await call("PUT", `/recipes/dish/${p1.id}`, { lines: [{ ingredientId: ingId, qty: 0.5 }] }, ownerTok2);
    ok("set recipe", r.status === 200 && Array.isArray(r.json) && r.json.length === 1);
    r = await call("GET", `/recipes?dish=${p1.id}`, undefined, ownerTok2);
    ok("get recipe", r.status === 200 && r.json.length === 1);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 2 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    const rBody = r.json;
    ok("sale consumes recipe (no warnings)", r.status === 201 && Array.isArray(rBody.warnings) && rBody.warnings.length === 0);
    const rOrderId = rBody.id;
    const getQty = async (id) => (await call("GET", "/products", undefined, ownerTok2)).json.find((p) => p.id === id)?.qty;
    ok("ingredient deducted 10→9", (await getQty(ingId)) === 9);
    // نفاد المكوّن: البيع يستمر مع تحذير + تنبيه
    await call("POST", `/products/${ingId}/stock`, { delta: -9, reason: "test" }, ownerTok2);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 4 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    const wBody = r.json;
    ok("short recipe warns (not blocks)", r.status === 201 && wBody.warnings.length === 1 && wBody.warnings[0].missing === 2);
    r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
    ok("recipe_short alert created", r.status === 200 && r.json.some((a) => a.kind === "recipe_short"));
    // الإلغاء يعيد المكونات: الأمر الأخير استهلك 0 (نافد) — نلغي الأول (استهلك 1)
    r = await call("PATCH", `/orders/${rOrderId}`, { status: "cancelled" }, ownerTok2);
    ok("cancel restores ingredient 0→1", r.status === 200 && (await getQty(ingId)) === 1);
    const alId = ((await call("GET", "/alerts?unread=1", undefined, ownerTok2)).json)[0]?.id;
    if (alId) {
        await call("POST", `/alerts/${alId}/read`, undefined, ownerTok2);
        r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
        ok("alert mark read", !r.json.some((a) => a.id === alId));
    }
    else
        ok("alert mark read", false);
    // مورّدون + مشتريات + ديون
    r = await call("POST", "/suppliers", { name: "مطحنة", phone: "0550999000" }, ownerTok2);
    ok("create supplier", r.status === 201);
    const supId = r.json.id;
    r = await call("POST", "/suppliers", { name: "مكرر", phone: "0550999000" }, ownerTok2);
    ok("duplicate supplier phone → 409", r.status === 409);
    r = await call("POST", "/purchases", {
        supplierId: supId, lines: [{ productId: p1.id, qty: 10, unitCost: 200 }], paid: 1000, method: "cash",
    }, ownerTok2);
    const pur = r.json;
    ok("purchase partial + stock in", r.status === 201 && pur.total === 2000 && pur.status === "partial" && (await getQty(p1.id)) === 44);
    r = await call("GET", "/suppliers", undefined, ownerTok2);
    const supRow = r.json.find((s) => s.id === supId);
    ok("supplier balance 1000", supRow?.balance === 1000);
    r = await call("POST", `/purchases/${pur.id}/pay`, { amount: 5000 }, ownerTok2);
    ok("overpay → 400", r.status === 400);
    r = await call("POST", `/purchases/${pur.id}/pay`, { amount: 1000, ref: "CCP-1" }, ownerTok2);
    ok("pay rest → paid", r.status === 200 && r.json.status === "paid");
    // الهدر
    r = await call("POST", "/wastage", { productId: p1.id, qty: 3, reason: "تالف" }, ownerTok2);
    ok("wastage deducts", r.status === 201 && r.json.qty === 41);
    r = await call("GET", "/alerts?unread=1", undefined, ownerTok2);
    ok("wastage alert", r.json.some((a) => a.kind === "wastage"));
    // ─── الشريحة 2: السائقون ───
    r = await call("POST", "/drivers", { name: "كريم", phone: "0550111222", vehicle: "دراجة", kind: "internal" }, ownerTok2);
    ok("create driver", r.status === 201);
    const drvId = r.json.id;
    r = await call("POST", "/drivers", { name: "مكرر", phone: "0550111222" }, ownerTok2);
    ok("duplicate driver → 409", r.status === 409);
    r = await call("POST", "/drivers", { name: "خارجي", phone: "0550333444", kind: "external" }, ownerTok2);
    ok("external driver", r.status === 201);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "delivery", lines: [{ productId: p1.id, qty: 1 }],
        discount: 0, tax: 0, payMethod: "cash", address: "Alger", phone: "0550999000",
    }, cashTok);
    const delId = r.json.id;
    ok("delivery order", r.status === 201);
    r = await call("PATCH", `/orders/${delId}/driver`, { driverId: drvId }, cashTok);
    ok("cashier assign → 403", r.status === 403);
    r = await call("PATCH", `/orders/${delId}/driver`, { driverId: "nope" }, ownerTok2);
    ok("bad driver → 400", r.status === 400);
    r = await call("PATCH", `/orders/${delId}/driver`, { driverId: drvId }, ownerTok2);
    ok("assign driver", r.status === 200 && (r.json.driver?.name === "كريم"));
    r = await call("GET", "/orders", undefined, ownerTok2);
    ok("orders embed driver", r.json.some((o) => o.id === delId && o.driver?.name === "كريم"));
    r = await call("PATCH", `/orders/${delId}/driver`, { driverId: null }, ownerTok2);
    ok("unassign driver", r.status === 200 && r.json.driverId === null);
    // البوابة العامة
    r = await call("GET", "/public/demo-resto/menu");
    const menu = r.json;
    ok("public menu hides buyPrice", r.status === 200 && menu.products.length === 1 && menu.products[0].buyPrice === undefined);
    r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222" });
    ok("delivery without address → 400", r.status === 400);
    r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], address: "Alger" });
    ok("delivery without phone → 400", r.status === 400);
    r = await call("POST", "/public/demo-resto/orders", { kind: "delivery", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222", address: "Alger" });
    ok("delivery with phone+address → 201", r.status === 201);
    r = await call("POST", "/public/demo-resto/orders", { kind: "table", tableNo: "3", lines: [{ productId: p1.id, qty: 1 }] });
    ok("table order without phone → 201", r.status === 201);
    const pubNum = r.json.num;
    r = await call("GET", `/public/demo-resto/orders/${pubNum}`);
    ok("track order pending", r.status === 200 && r.json.status === "pending");
    r = await call("POST", `/public/demo-resto/orders/${pubNum}/rate`, { rating: 5 });
    ok("rate before delivered → 404", r.status === 404);
    // التسجيل الذاتي + الفوترة
    r = await call("GET", "/public/plans");
    ok("public plans", r.status === 200 && Array.isArray(r.json) && r.json.length === 3);
    r = await call("POST", "/public/signup", {
        name: "Superette Essalam", type: "shop", phone: "0550999888", plan: "starter",
        ownerName: "Karim", password: "secret12",
    });
    ok("self signup → 201 + trial", r.status === 201 && typeof r.json.slug === "string");
    const slug2 = r.json.slug;
    r = await call("POST", "/auth/login", { slug: slug2, phone: "0550999888", password: "secret12" });
    ok("new tenant login", r.status === 200);
    const owner2 = r.json.token;
    r = await call("GET", "/billing/status", undefined, owner2);
    ok("billing trialing", r.status === 200 && r.json.status === "trialing");
    r = await call("POST", "/billing/submit-payment", { ref: "CCP-12345", months: 2 }, owner2);
    ok("submit payment → pending", r.status === 200 && r.json.status === "pending");
    r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": "wrong" });
    ok("operator wrong key → 401", r.status === 401);
    r = await call("POST", "/billing/admin/confirm", { tenantSlug: slug2, months: 2 }, undefined, { "x-operator-key": process.env.OPERATOR_KEY ?? "" });
    ok("operator confirm → active", r.status === 200 && typeof r.json.expiresAt === "string");
    r = await call("POST", "/billing/satim/notify", { order_id: "x" });
    ok("satim stub removed → 404", r.status === 404);
    // إنفاذ الانتهاء: نُنهي الاشتراك مباشرة ثم نحاول البيع (يفشل قبل فحص المنتج)
    await db.saveSubscription({
        tenantId: (await db.getTenantBySlug(slug2)).id, plan: "starter", status: "past_due",
        startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(),
        amountDzd: 2500, lastRef: "CCP-12345", confirmedBy: null, confirmedAt: null,
    });
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: "nope", qty: 1 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, owner2);
    ok("expired subscription → 402", r.status === 402);
    r = await call("POST", "/public/demo-resto/orders", { kind: "pickup", lines: [{ productId: p1.id, qty: 1 }], phone: "0550222222" });
    ok("unrelated tenant still ok", r.status === 201);
    // الأهداف والفروع والعملاء
    r = await call("POST", "/goals", { title: "فرع جديد", target: 1000000, monthly: 100000 }, ownerTok2);
    ok("create goal", r.status === 201);
    const goalId = r.json.id;
    r = await call("PATCH", `/goals/${goalId}`, { saved: 100000 }, ownerTok2);
    ok("deposit goal", r.status === 200 && r.json.saved === 100000);
    r = await call("DELETE", `/goals/${goalId}`, undefined, ownerTok2);
    ok("delete goal", r.status === 200);
    r = await call("GET", "/goals", undefined, ownerTok2);
    ok("goals empty", r.status === 200 && Array.isArray(r.json) && r.json.length === 0);
    r = await call("POST", "/goals", { title: "x", target: 1, monthly: 1 }, cashTok);
    ok("cashier goal → 403", r.status === 403);
    r = await call("POST", "/branches", { name: "فرع 2" }, ownerTok2);
    ok("2nd branch ok", r.status === 201);
    r = await call("POST", "/branches", { name: "فرع 3" }, ownerTok2);
    ok("3rd branch → 403 limit", r.status === 403 && r.json.limit === 2);
    r = await call("POST", "/customers", { name: "زبون", phone: "0550333333" }, cashTok);
    ok("create customer", r.status === 201);
    r = await call("PATCH", "/tenant", { crmEnabled: false }, ownerTok2);
    ok("disable crm", r.status === 200);
    r = await call("POST", "/customers", { name: "ز2", phone: "0550444444" }, cashTok);
    ok("crm disabled → 403", r.status === 403);
    // SSE
    const sseGot = await new Promise((resolve) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => { ctrl.abort(); resolve(false); }, 8000);
        fetch(`${BASE}/stream/kitchen?token=${ownerTok2}`, { signal: ctrl.signal }).then(async (res) => {
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            for (;;) {
                const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
                if (done)
                    break;
                buf += dec.decode(value);
                if (buf.includes("order.created")) {
                    clearTimeout(timer);
                    ctrl.abort();
                    resolve(true);
                    break;
                }
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
    // رفع صورة
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "t.png");
    const upRes = await fetch(`${BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${ownerTok2}` }, body: fd });
    const upJson = await upRes.json();
    ok("upload image", upRes.status === 201 && !!upJson.url?.startsWith("/uploads/"));
    // حضور ورواتب
    r = await call("POST", "/attendance/in", { employeeId: emp.id }, cashTok);
    ok("check-in", r.status === 201);
    const attId = r.json.id;
    await new Promise((x) => setTimeout(x, 1100));
    r = await call("POST", `/attendance/${attId}/out`, undefined, cashTok);
    ok("check-out", r.status === 200);
    r = await call("GET", "/salaries", undefined, ownerTok2);
    ok("salaries computed", r.status === 200 && Array.isArray(r.json));
    // ─── عزل الفروع: مدير/كاشير فرع لا يكتب خارج فرعه ───
    // (فرع 2 أُنشئ في اختبار سابق — نعيد استخدامه)
    r = await call("GET", "/tenant", undefined, ownerTok2);
    const branch2 = (r.json.branches.find((b) => b.id !== branch.id))?.id ?? null;
    if (branch2) {
        r = await call("POST", "/products", { name: "خاص2", branchId: branch2, buyPrice: 10, sellPrice: 20, qty: 5 }, ownerTok2);
        const p2 = r.json.id;
        r = await call("POST", "/auth/users", { name: "مدير1", phone: "0550222333", password: "manager1", role: "manager", hourlyRate: 0, branchId: branch.id }, ownerTok2);
        ok("create branch manager", r.status === 201);
        r = await call("POST", "/auth/login", { slug: "demo-resto", phone: "0550222333", password: "manager1" });
        const mgrTok = r.json.token;
        r = await call("PATCH", `/products/${p2}`, { sellPrice: 25 }, mgrTok);
        ok("manager patch other branch → 404", r.status === 404);
        r = await call("POST", `/products/${p2}/stock`, { delta: 1, reason: "x" }, mgrTok);
        ok("manager stock other branch → 404", r.status === 404);
        r = await call("PATCH", `/products/${p1.id}`, { sellPrice: 351 }, mgrTok);
        ok("manager patch own branch ok", r.status === 200);
        r = await call("POST", "/orders", {
            branchId: branch.id, kind: "dinein", lines: [{ productId: p2, qty: 1 }],
            discount: 0, tax: 0, payMethod: "cash",
        }, cashTok);
        ok("order with other-branch product → 409", r.status === 409);
        r = await call("POST", "/products", { name: "كاشير-فرع", branchId: branch.id, buyPrice: 1, sellPrice: 2, qty: 1 }, cashTok);
        ok("cashier create product → 403 (role)", r.status === 403);
    }
    else
        ok("2nd branch for isolation test", false);
    // ─── لوحة المشغّل ───
    const opH = { "x-operator-key": process.env.OPERATOR_KEY ?? "" };
    r = await call("GET", "/ops/overview");
    ok("ops without key → 401", r.status === 401);
    r = await call("GET", "/ops/overview", undefined, undefined, { "x-operator-key": "wrong" });
    ok("ops wrong key → 401", r.status === 401);
    r = await call("GET", "/ops/overview", undefined, undefined, opH);
    const ov = r.json;
    ok("ops overview", r.status === 200 && ov.tenants >= 2 && ov.users >= 3 && typeof ov.subs === "object");
    r = await call("GET", "/ops/tenants", undefined, undefined, opH);
    const tenants = r.json;
    const demoT = tenants.find((x) => x.slug === "demo-resto");
    ok("ops tenants list", r.status === 200 && !!demoT && demoT.users >= 2);
    r = await call("GET", `/ops/tenants/${demoT.id}`, undefined, undefined, opH);
    const det = r.json;
    ok("ops tenant detail hides hashes", r.status === 200 && det.users.every((u) => !("passwordHash" in u)));
    r = await call("PATCH", `/ops/tenants/${demoT.id}`, { plan: "mega" }, undefined, opH);
    ok("ops set plan", r.status === 200 && r.json.plan === "mega");
    await call("PATCH", `/ops/tenants/${demoT.id}`, { plan: "pro" }, undefined, opH);
    r = await call("GET", "/ops/payments?status=paid", undefined, undefined, opH);
    ok("ops payments filter", r.status === 200 && Array.isArray(r.json));
    r = await call("GET", "/ops/health", undefined, undefined, opH);
    const health = r.json;
    const leaked = JSON.stringify(health).includes("verify-operator-key") || JSON.stringify(health).includes("GTEST");
    ok("ops health (no secret leak)", r.status === 200 && !leaked && health.env.sofizpay === true);
    r = await call("POST", `/ops/tenants/${demoT.id}/suspend`, undefined, undefined, opH);
    ok("ops suspend", r.status === 200);
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    ok("suspended tenant → 402", r.status === 402);
    r = await call("POST", `/ops/tenants/${demoT.id}/unsuspend`, undefined, undefined, opH);
    ok("ops unsuspend → past_due", r.status === 200 && r.json.status === "past_due");
    r = await call("POST", `/ops/tenants/${demoT.id}/extend`, { months: 1 }, undefined, opH);
    ok("ops extend → active", r.status === 200 && typeof r.json.expiresAt === "string");
    r = await call("POST", "/orders", {
        branchId: branch.id, kind: "dinein", lines: [{ productId: p1.id, qty: 1 }],
        discount: 0, tax: 0, payMethod: "cash",
    }, cashTok);
    ok("extended tenant orders ok", r.status === 201);
    // ─── الشريحة P1: المصاريف الثابتة + صافي الربح ───
    r = await call("POST", "/overheads", { name: "كراء", kind: "rent", monthly: 30000 }, ownerTok2);
    ok("create overhead", r.status === 201);
    const ohId = r.json.id;
    r = await call("POST", "/overheads", { name: "كهرباء", kind: "electricity", monthly: 3000 }, cashTok);
    ok("cashier overhead → 403", r.status === 403);
    r = await call("GET", "/overheads", undefined, ownerTok2);
    ok("list overheads", r.status === 200 && r.json.some((o) => o.name === "كراء"));
    r = await call("PATCH", `/overheads/${ohId}`, { active: false }, ownerTok2);
    ok("disable overhead", r.status === 200 && r.json.active === false);
    r = await call("GET", "/reports/summary?days=7", undefined, ownerTok2);
    const s2 = r.json;
    ok("summary breakdown (disabled oh → 0)", r.status === 200 && s2.breakdown.overheadsTotal === 0 && typeof s2.todayNet === "number" && typeof s2.breakdown.labor === "number");
    await call("PATCH", `/overheads/${ohId}`, { active: true }, ownerTok2);
    r = await call("GET", "/reports/summary?days=1", undefined, ownerTok2);
    const s3 = r.json;
    ok("summary net = gross − oh − labor", r.status === 200 && s3.breakdown.overheadsTotal === 1000 && s3.breakdown.net <= s3.breakdown.gross - 1000);
    r = await call("DELETE", `/overheads/${ohId}`, undefined, ownerTok2);
    ok("delete overhead", r.status === 200);
    // ─── SofizPay: دوال خالصة (دون شبكة) + مسارات ───
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
    ok("initiate unconfigured → 501", r.status === 501);
    process.env.SOFIZPAY_ACCOUNT = "GTEST";
    process.env.SOFIZPAY_BASE = "https://sofizpay.com/sandbox";
    r = await call("POST", "/billing/sofizpay/initiate", { months: 1, email: "k@x.dz" });
    ok("initiate unauthenticated → 401", r.status === 401);
    r = await call("POST", "/billing/sofizpay/initiate", { months: 99, email: "k@x.dz" }, ownerTok2);
    ok("initiate bad months → 400", r.status === 400);
    r = await call("GET", "/billing/sofizpay/status/nope", undefined, ownerTok2);
    ok("return-status unknown → 404", r.status === 404);
    r = await call("POST", "/billing/sofizpay/initiate", { months: 1, email: "not-an-email" }, ownerTok2);
    ok("initiate bad email → 400", r.status === 400);
    server.close();
    console.log(failures === 0 ? "ALL GREEN" : `${failures} FAILURES`);
    process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("VERIFY CRASH", e); process.exit(1); });
