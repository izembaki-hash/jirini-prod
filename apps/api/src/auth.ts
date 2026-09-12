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
