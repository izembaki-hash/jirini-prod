import React from "react";
import { Card, CardContent, Button } from "../ui";
import { t, type Lang } from "../i18n";

// شبكة أمان: أي عطل في العرض يظهر رسالة واضحة مع مخرج — لا شاشة بيضاء أبداً.
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; lang?: Lang },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(e: unknown) {
    return { error: e };
  }

  reset = () => {
    try {
      localStorage.removeItem("dz-saas-v1");
      localStorage.removeItem("dz-session");
      localStorage.removeItem("dz-branch");
      localStorage.removeItem("dz-token");
    } catch { /* تجاهل */ }
    location.reload();
  };

  render() {
    const L = this.props.lang ?? (document.documentElement.lang === "fr" ? "fr" : "ar");
    if (this.state.error) {
      return (
        <div className="mx-auto grid min-h-[100dvh] w-full max-w-[520px] place-items-center px-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-4xl" aria-hidden>⚠️</p>
              <h1 className="text-xl font-bold">{t(L, "errTitle")}</h1>
              <p className="text-sm text-muted">{t(L, "errBody")}</p>
              <div className="flex gap-2">
                <Button onClick={() => location.reload()}>{t(L, "reloadB")}</Button>
                <Button variant="outline" onClick={this.reset}>{t(L, "resetB")}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
