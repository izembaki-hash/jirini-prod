// تكامل SofizPay (CIB/EDAHABIA) — دوال خالصة قابلة للاختبار دون شبكة.
// المرجع: docs.sofizpay.com — الإنشاء GET والتقصي GET، والتحقق دائماً من الخادم.

export const SOFIZ_PROD = "https://sofizpay.com";
export const SOFIZ_SANDBOX = "https://sofizpay.com/sandbox";

export interface SofizCreateParams {
  base: string;
  account: string;
  amount: number;
  fullName: string;
  phone: string;
  email: string;
  returnUrl: string;
  memo?: string;
}

export function buildCreateUrl(p: SofizCreateParams): string {
  const q = new URLSearchParams({
    account: p.account,
    amount: String(p.amount),
    full_name: p.fullName,
    phone: p.phone,
    email: p.email,
    return_url: p.returnUrl,
    redirect: "no",
    keep_return_url: "True",
  });
  if (p.memo) q.set("memo", p.memo);
  return `${p.base.replace(/\/$/, "")}/make-cib-transaction/?${q.toString()}`;
}

export interface SofizCreateResult {
  ok: boolean;
  transactionId?: string;
  cibTransactionId?: string;
  paymentUrl?: string;
  raw?: unknown;
  error?: string;
}

export function parseCreateResponse(json: unknown): SofizCreateResult {
  const r = json as Record<string, unknown>;
  if (r && r.success === true && typeof r.payment_url === "string") {
    return {
      ok: true,
      transactionId: typeof r.transaction_id === "string" ? r.transaction_id : undefined,
      cibTransactionId: typeof r.cib_transaction_id === "string" ? r.cib_transaction_id : undefined,
      paymentUrl: r.payment_url as string,
      raw: json,
    };
  }
  const msg = r && typeof r.message === "string" ? r.message : "provider_rejected";
  return { ok: false, error: msg, raw: json };
}

export interface SofizCheckResult {
  ok: boolean;
  paid: boolean;
  orderNumber?: string;
  respCode?: string;
  destination?: string;
  raw?: unknown;
}

export function parseCheckResponse(json: unknown): SofizCheckResult {
  const r = json as Record<string, unknown>;
  const orderNumber = typeof r?.order_number === "string" ? (r.order_number as string) : undefined;
  if (orderNumber === undefined) return { ok: false, paid: false, raw: json };
  const paid =
    (r as Record<string, unknown>).orderStatus === 2 &&
    (r as Record<string, unknown>).errorCode === 0 &&
    (r as Record<string, unknown>).respCode === "00";
  const destination =
    typeof (r as Record<string, unknown>).destination_account === "string"
      ? ((r as Record<string, unknown>).destination_account as string)
      : undefined;
  return {
    ok: true, paid,
    orderNumber,
    respCode: typeof r.respCode === "string" ? (r.respCode as string) : undefined,
    destination, raw: json,
  };
}

// الدفع مقبول فقط إذا نجح الفحص AND وصل لحسابنا (حماية من تحويل الاستجابة).
export function isPaid(check: SofizCheckResult, account: string): boolean {
  if (!check.ok || !check.paid) return false;
  if (check.destination && check.destination !== account) return false;
  return true;
}

export type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function createTransaction(fetchFn: FetchFn, params: SofizCreateParams): Promise<SofizCreateResult> {
  const res = await fetchFn(buildCreateUrl(params));
  return parseCreateResponse(await res.json().catch(() => ({})));
}

export async function checkTransaction(fetchFn: FetchFn, base: string, orderNumber: string): Promise<SofizCheckResult> {
  const url = `${base.replace(/\/$/, "")}/cib-transaction-check/?order_number=${encodeURIComponent(orderNumber)}`;
  const res = await fetchFn(url);
  if (!res.ok) return { ok: false, paid: false };
  return parseCheckResponse(await res.json().catch(() => ({})));
}
