// روابط canonical ديناميكية — index.html واحد يخدم كل المسارات،
// والزاحف يرى نفس الـHTML في كل URL لولا هذا التصحيح.
const ORIGIN = "https://jiriny.com";

export function setCanonical(path: string) {
  const href = `${ORIGIN}${path}`;
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// بيانات منظمة للصفحة الرئيسية — نتائج غنية (منظمة + تطبيق).
// تُحقن عند دخول الصفحة وتُزال عند مغادرتها حتى لا تلتصق بصفحات أخرى.
export function setHomeJsonLd(): () => void {
  const ID = "jirini-home-jsonld";
  let el = document.getElementById(ID) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = ID;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${ORIGIN}/#org`,
          name: "جيريني",
          alternateName: "Jirini",
          url: `${ORIGIN}/`,
          logo: `${ORIGIN}/img/og.jpg`,
        },
        {
          "@type": "SoftwareApplication",
          name: "جيريني — منصة إدارة المطاعم والمحلات",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: `${ORIGIN}/`,
          inLanguage: ["ar", "fr"],
          offers: { "@type": "Offer", price: "2500", priceCurrency: "DZD" },
        },
      ],
    });
    document.head.appendChild(el);
  }
  return () => { document.getElementById(ID)?.remove(); };
}
