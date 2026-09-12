import React, { createContext, useContext, useState } from "react";
import { API_BASE, api, setToken as saveToken, getToken } from "./api";

export interface Session {
  name: string;
  role: string;
  tenant: { id: string; slug: string; name: string; type: string; plan: string; lang: string };
}

// الوضع المتصل يتفعّل فقط عند وجود عنوان API + جلسة دخول. غير ذلك: تجريبي محلي.
export const isApiConfigured = API_BASE.length > 0;

interface AuthCtx {
  session: Session | null;
  login(slug: string, phone: string, password: string): Promise<void>;
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

  const login = async (slug: string, phone: string, password: string) => {
    const r = await api.login(slug, phone, password);
    saveToken(r.token);
    const s = { name: r.user.name, role: r.user.role, tenant: r.tenant };
    try { localStorage.setItem("dz-session", JSON.stringify(s)); } catch { /* تجاهل */ }
    setSession(s);
  };
  const logout = () => {
    saveToken(null);
    try { localStorage.removeItem("dz-session"); } catch { /* تجاهل */ }
    setSession(null);
  };
  return <Ctx.Provider value={{ session, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const connected = () => isApiConfigured && !!getToken();
