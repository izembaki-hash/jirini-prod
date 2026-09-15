import { buildApp } from "./app.js";
import { createDb } from "./db.js";
import { maybeSeed } from "./bootstrap.js";

const port = Number(process.env.PORT ?? 4000);
// نسخة واحدة تُزرع ثم تُستخدم — لا نسختين.
const db = await createDb();
const seedRequested = process.env.SEED_DEMO === "true";
if (seedRequested) await maybeSeed(db);
const tenants = await db.listTenants();
const app = await buildApp(db);
app.listen(port, () => {
  console.log(`[api] listening on :${port} — currency DZD, tz Africa/Algiers` +
    (seedRequested ? " (SEED_DEMO=true — demo tenant active)" : ` (production: ${tenants.length} tenant${tenants.length === 1 ? "" : "s"})`));
});
