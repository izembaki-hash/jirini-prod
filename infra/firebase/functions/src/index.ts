// Cloud Functions للإطلاق على Firebase — نفس منطق الخادم (أسعار من المخزون، خصم تلقائي).
// النشر: firebase deploy --only functions,firestore,storage,hosting
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();
const scol = (tenantId: string, col: string) => db.collection(`tenants/${tenantId}/collections/${col}`);

interface Line { productId: string; name: string; qty: number; price: number }

// عند إنشاء طلب: تحقق من الأسعار والخصم من المخزون وسجّل الحركة.
export const onOrderCreate = onDocumentCreated(
  "tenants/{tenantId}/collections/orders/{orderId}",
  async (event) => {
    const tenantId = event.params.tenantId;
    const snap = event.data;
    if (!snap) return;
    const order = snap.data() as { lines: Line[]; discount?: number; num?: number };
    const batch = db.batch();
    for (const line of order.lines ?? []) {
      const pref = scol(tenantId, "products").doc(line.productId);
      const psnap = await pref.get();
      if (!psnap.exists) continue;
      const p = psnap.data() as { qty: number; sellPrice: number; minQty?: number; name?: string };
      // السعر من المخزون دائماً (لا ثقة بسعر العميل)
      line.price = p.sellPrice;
      batch.update(pref, { qty: Math.max(0, p.qty - line.qty) });
      batch.create(scol(tenantId, "moves").doc(), {
        tenant_id: tenantId, productId: line.productId, delta: -line.qty,
        reason: `sale #${order.num ?? ""}`, createdAt: FieldValue.serverTimestamp(),
      });
      if (p.qty - line.qty <= (p.minQty ?? 5)) {
        batch.create(scol(tenantId, "alerts").doc(), {
          tenant_id: tenantId, kind: "low_stock", productId: line.productId,
          name: p.name, qty: Math.max(0, p.qty - line.qty), createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    batch.update(snap.ref, { lines: order.lines });
    await batch.commit();
  },
);

// لقطة 23:59 بتوقيت الجزائر: الفائدة اليومية → تُغذي التقارير ومخطط النمو.
export const closeDayProfit = onSchedule(
  { schedule: "59 23 * * *", timeZone: "Africa/Algiers" },
  async () => {
    const day = new Date().toISOString().slice(0, 10);
    const tenants = await db.collectionGroup("orders").get();
    const byTenant = new Map<string, { gross: number; cost: number; discount: number }>();
    // ملاحظة: collectionGroup واسع — في الإنتاج يُستبدل بمهمة لكل مستأجر عبر قائمة tenants.
    for (const doc of tenants.docs) {
      const o = doc.data() as {
        tenant_id: string; status: string; createdAt?: { toDate?: () => Date };
        lines: (Line & { buy?: number })[]; discount?: number;
      };
      const at = o.createdAt?.toDate?.()?.toISOString().slice(0, 10);
      if (at !== day || o.status === "cancelled") continue;
      const acc = byTenant.get(o.tenant_id) ?? { gross: 0, cost: 0, discount: 0 };
      for (const l of o.lines ?? []) {
        acc.gross += l.qty * l.price;
        acc.cost += (l.buy ?? 0) * l.qty;
      }
      acc.discount += o.discount ?? 0;
      byTenant.set(o.tenant_id, acc);
    }
    for (const [tenantId, a] of byTenant) {
      await scol(tenantId, "daily_profit").doc(day).set({
        tenant_id: tenantId, date: day, sales: a.gross - a.discount,
        profit: a.gross - a.discount - a.cost, createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

// تعيين دور مستخدم (المالك فقط) — يزرع tenant_id وrole في custom claims.
export const setUserRole = onCall(async (req) => {
  const auth = req.auth;
  if (auth?.token.role !== "owner") throw new HttpsError("permission-denied", "owner only");
  const { uid, role, branchId } = req.data as { uid: string; role: string; branchId?: string };
  if (!["manager", "cashier", "cook"].includes(role)) throw new HttpsError("invalid-argument", "bad role");
  const { getAuth } = await import("firebase-admin/auth");
  await getAuth().setCustomUserClaims(uid, {
    tenant_id: auth.token.tenant_id, role, branch_id: branchId ?? null,
  });
  return { ok: true };
});
