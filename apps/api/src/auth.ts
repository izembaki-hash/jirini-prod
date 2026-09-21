// مصادقة JWT + أدوار. التوكن يحمل tenant_id — كل طلب لاحق معزول تلقائياً.
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export interface AuthToken {
  uid: string;
  tenant_id: string;
  role: string;
  branch_id: string | null;
  name: string;
  pages: string[] | null;
}

// الصفحات القابلة للتخصيص (لوحة التحكم /app متاحة دائماً لأي داخل).
export const APP_PAGES = [
  "pos", "shifts", "inventory", "kitchen", "orders", "customers",
  "staff", "reports", "branches", "growth", "settings",
] as const;
export type AppPage = (typeof APP_PAGES)[number];

// الافتراضي حسب الدور عند غياب التخصيص (سلوك اليوم).
export const ROLE_DEFAULT_PAGES: Record<string, string[]> = {
  cashier: ["pos", "shifts", "kitchen", "orders", "customers"],
  cook: ["kitchen"],
};

// حسم الصفحات الفعلية: المالك والمدير = الكل دائماً.
export function effectivePages(role: string, pages: unknown): string[] | null {
  if (role === "owner" || role === "manager") return null;
  if (Array.isArray(pages)) return (pages as unknown[]).filter((p): p is string => typeof p === "string" && (APP_PAGES as readonly string[]).includes(p));
  return ROLE_DEFAULT_PAGES[role] ?? [];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: AuthToken }
  }
}

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing — انسخه من .env.example");
  return s;
};

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signToken(t: AuthToken): string {
  return jwt.sign(t, SECRET(), { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthToken {
  return jwt.verify(token, SECRET()) as AuthToken;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  const q = typeof req.query.token === "string" ? req.query.token : "";
  const raw = h.startsWith("Bearer ") ? h.slice(7) : q;
  if (!raw) { res.status(401).json({ error: "unauthorized" }); return; }
  try {
    req.auth = verifyToken(raw);
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

// فحص صفحة: المالك يتجاوز دائماً. pages=null في التوكن = كل الصفحات.
export function requirePage(...pages: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    if (req.auth.role === "owner") { next(); return; }
    const allowed = req.auth.pages;
    if (allowed === null || pages.some((p) => allowed.includes(p))) { next(); return; }
    res.status(403).json({ error: "page_forbidden" });
  };
}
