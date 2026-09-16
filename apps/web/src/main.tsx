import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { API_BASE } from "./api";
import "./index.css";
import "./print.css";

// إعلان الأصل للوحدات الباكرة (StoreProvider) قبل تركيب شجرة React.
(window as unknown as { __API_BASE: string }).__API_BASE = API_BASE;

try {
  const raw = localStorage.getItem("dz-saas-v1");
  const lang = raw && JSON.parse(raw).lang === "fr" ? "fr" : "ar";
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
} catch { /* افتراضي عربي RTL */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
