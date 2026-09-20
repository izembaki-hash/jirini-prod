process.env.JWT_SECRET ??= "verify-secret-local-only-0123456789abcdef";
process.env.OPERATOR_KEY ??= "verify-operator-key";
process.env.SOFIZPAY_ACCOUNT ??= "GTEST";
import { buildApp } from "../src/app.js";
import { MemoryAdapter } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

const PORT = 4997;
const BASE = `http://localhost:${PORT}`;
const db = new MemoryAdapter();
const tenant = await db.createTenant({
  slug: "t", name: "t", type: "shop", lang: "ar", plan: "pro",
  phone: "0550000000", address: "", logoUrl: null, crmEnabled: true, overtimeEnabled: false, tablesCount: 1,
});
const branch = await db.createBranch({ tenantId: tenant.id, name: "b", address: "" });
const emp = await db.createEmployee({
  tenantId: tenant.id, branchId: branch.id, name: "o", role: "owner", title: null,
  hiredAt: "2024-01-01", hourlyRate: 0, halfWage: 0,
});
await db.createUser({
  tenantId: tenant.id, employeeId: emp.id, name: "o", phone: "0550000000",
  passwordHash: await hashPassword("demo1234"), role: "owner", branchId: null, active: true,
});
const app = await buildApp(db);
const srv = app.listen(PORT);
const login = await (await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "t", phone: "0550000000", password: "demo1234" }) })).json() as { token: string };
for (const body of [{ months: 99, email: "k@x.dz" }, { months: 1, email: "not-an-email" }]) {
  const r = await fetch(`${BASE}/billing/sofizpay/initiate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` }, body: JSON.stringify(body) });
  console.log(JSON.stringify(body), "->", r.status, await r.text());
}
srv.close();
