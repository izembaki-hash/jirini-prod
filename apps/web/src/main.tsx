import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
