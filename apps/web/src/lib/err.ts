import { toast } from "sonner";
import { ApiError } from "../api";
import { t, type Lang, type TKey } from "../i18n";

// خريطة: كود الخطأ القادم من الـAPI ← مفتاح رسالة i18n محدّدة
const CODE_KEY: Record<string, TKey> = {
  bad_credentials: "eBad",
  bad_current_password: "pwBadCur",
  unauthorized: "erSession",
  invalid_token: "erSession",
  forbidden: "erForbidden",
  page_forbidden: "erPage",
  validation: "erValidation",
  internal: "erInternal",
  bad_gateway: "erGateway",
  rate_limited: "erRateLimit",
  subscription_expired: "erSubExpired",
  upgrade_needed: "upgradeNeeded",
  crm_disabled: "erCrm",
  branch_limit: "erBranchLimit",
  shift_already_open: "erShiftOpen",
  note_required: "erNoteReq",
  bad_transition: "erBadTransition",
  cancel_requires_manager: "erCancelMgr",
  overpay: "overpayErr",
  personal_unpaid: "erPersonalUnpaid",
  phone_required: "erPhoneReq",
  address_required: "erAddrReq",
  payment_not_confirmed: "erPayUnconfirmed",
  payment_not_found: "erPayNotFound",
  payments_not_configured: "billNotConf",
  provider_error: "erProvider",
  tenant_gone: "erTenantGone",
  tenant_not_found: "erTenantNotFound",
  user_not_found: "erUserNotFound",
  supplier_exists: "supExistsErr",
  driver_exists: "erDrvExists",
  product_unavailable: "erProdUnavail",
  self_ingredient: "erSelfIng",
  bad_qty: "erBadQty",
  cross_branch_recipe: "erCrossBranch",
  manual_name_required: "erManualName",
  bad_driver: "erBadDriver",
  no_file: "erNoFile",
  bad_json: "erBadJson",
  payload_too_large: "erTooLarge",
};

// كيانات رسائل 404 (تُرسل مع حقل entity من الـAPI)
const ENTITY_KEY: Record<string, TKey> = {
  product: "entProduct", order: "entOrder", shift: "entShift", goal: "entGoal",
  recipe: "entRecipe", supplier: "entSupplier", purchase: "entPurchase", driver: "entDriver",
  tenant: "entTenant", payment: "entPayment", overhead: "entOverhead", customer: "entCustomer",
  employee: "entEmployee", user: "entUser",
};

function fill(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), s);
}

/** حوّل أي خطأ (ApiError / خطأ شبكة / غير معروف) إلى رسالة دقيقة بالمستخدم الحالي. */
export function errMsg(L: Lang, e: unknown, fallback?: string): string {
  if (e instanceof ApiError) {
    // نقص مخزون: insufficient_stock:<اسم>:<الكمية>
    if (e.code.startsWith("insufficient_stock:")) {
      const parts = e.code.split(":");
      const qty = parts[parts.length - 1];
      const name = parts.slice(1, -1).join(":");
      return fill(t(L, "erStock"), { name: name || "?", qty });
    }
    if (e.code === "not_found") {
      const entity = (e.body as { entity?: string } | null | undefined)?.entity;
      const key = entity ? ENTITY_KEY[entity] : undefined;
      return key ? fill(t(L, "erGone"), { ent: t(L, key) }) : t(L, "erNotFound");
    }
    const key = CODE_KEY[e.code];
    if (key) {
      if (e.code === "branch_limit") {
        const limit = (e.body as { limit?: number } | null | undefined)?.limit;
        return fill(t(L, key), { n: limit ?? "?" });
      }
      return t(L, key);
    }
    // كود غير معروف ← حسب رمز الحالة
    if (e.status === 401) return t(L, "erSession");
    if (e.status === 403) return t(L, "erForbidden");
    if (e.status === 404) return t(L, "erNotFound");
    if (e.status === 408 || e.status === 504) return t(L, "eConn");
    if (e.status === 413) return t(L, "erTooLarge");
    if (e.status === 429) return t(L, "erRateLimit");
    if (e.status >= 500) return t(L, "erInternal");
    return fallback ?? t(L, "errSaving");
  }
  if (e instanceof TypeError) return t(L, "eConn"); // فشل الشبكة/fetch
  if (e instanceof DOMException && e.name === "AbortError") return t(L, "eConn");
  return fallback ?? t(L, "erUnknown");
}

/** رسالة الخطأ + toast.error — بديل مباشر لـ toast.error(t(L,"errSaving")). */
export function errToast(L: Lang, e: unknown, fallback?: string): void {
  toast.error(errMsg(L, e, fallback));
}
