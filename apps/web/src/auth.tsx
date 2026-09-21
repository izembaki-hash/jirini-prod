import React, { createContext, useContext, useState } from "react";
import { API_BASE, api, setToken as saveToken, getToken } from "./api";

export interface Session {
  name: string;
  role: string;
  pages: string[] | null;
  tenant: { id: string; slug: string; name: string; type: string; plan: string; lang: string };
}

// الوضع المتصل يتفعّل فقط عند وجود عنوان API + جلسة دخول. غير ذلك: تجريبي محلي.
export const isApiConfigured = API_BASE.length > 0;

// هل تسمح الجلسة بصفحة؟ المالك = الكل، pages=null (أو جلسة قديمة) = الكل، لوحة التحكم دائماً مسموحة.
export function canSee(session: Session | null, page: string): boolean {
  if (!session) return false;
  if (page === "dashboard") return true;
  if (session.role === "owner") return true;
  if (session.pages == null) return true;
  return session.pages.includes(page);
}

interface AuthCtx {
  session: Session | null;
  login(slug: string, phone: string, password: string): Promise<void>;
  loginPin(slug: string, pin: string): Promise<void>;
  logout(): void;
}

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem("dz-session");
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch { return null; }
  });

  const save = (r: { token: string; user: { name: string; role: string; pages: string[] | null }; tenant: Session["tenant"] }) => {
    saveToken(r.token);
    const s = { name: r.user.name, role: r.user.role, pages: r.user.pages, tenant: r.tenant };
    try { localStorage.setItem("dz-session", JSON.stringify(s)); } catch { /* تجاهل */ }
    setSession(s);
  };

  const login = async (slug: string, phone: string, password: string) => {
    save(await api.login(slug, phone, password));
  };
  const loginPin = async (slug: string, pin: string) => {
    save(await api.loginPin(slug, pin));
  };
  const logout = () => {
    saveToken(null);
    try { localStorage.removeItem("dz-session"); } catch { /* تجاهل */ }
    setSession(null);
  };
  return <Ctx.Provider value={{ session, login, loginPin, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const connected = () => isApiConfigured && !!getToken();
