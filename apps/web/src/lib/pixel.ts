import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// بكسل Meta للإعلانات — يُحمَّل برمجياً لأن CSP تمنع السكربتات الداخلية.
// المعرف ثابت (بكسل تسويقي واحد للمنصة). كل الاستدعاءات صامتة الفشل
// (مانع إعلانات / توقيت) حتى لا تكسر التطبيق أبداً.
export const META_PIXEL_ID = "1399868645661992";

type FbqFn = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  callMethod?: (...args: unknown[]) => void;
};

const w = () =>
  (typeof window === "undefined" ? {} : window) as unknown as { fbq?: FbqFn };

let inited = false;
export function initPixel() {
  if (inited || typeof document === "undefined") return;
  inited = true;
  try {
    const win = w();
    if (typeof win.fbq === "function") {
      win.fbq("init", META_PIXEL_ID);
      return;
    }
    const fbq = ((...args: unknown[]) => {
      if (typeof fbq.callMethod === "function") fbq.callMethod(...args);
      else (fbq.queue ??= []).push(args);
    }) as FbqFn;
    fbq.queue = [];
    win.fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    fbq("init", META_PIXEL_ID);
  } catch { /* تجاهل — البكسل تحسين تسويقي فقط */ }
}

export function track(name: string, params?: Record<string, unknown>) {
  try {
    const f = w().fbq;
    if (typeof f !== "function") return;
    if (params) f("track", name, params);
    else f("track", name);
  } catch { /* تجاهل */ }
}

// يُركَّب داخل <BrowserRouter>: مشاهدة مع كل تغيير مسار (SPA لا تُعيد التحميل).
export function PixelPageView() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    track("PageView");
  }, [pathname, search]);
  return null;
}
