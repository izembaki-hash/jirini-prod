import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fmtDzd, useStore } from "../store";
import { api } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input } from "../ui";

// 6. سجل العملاء — اختياري بالكامل (تفعيل/تعطيل من الإعدادات).
export default function Customers() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!connected()) return;
    api.customersList().then((list) => update((p) => ({
      ...p,
      customers: list.map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address ?? undefined })),
    }))).catch(() => null);
  }, [update]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (connected()) {
      try {
        const c = await api.customersCreate({ name: name.trim(), phone: phone.trim() });
        update((p) => ({ ...p, customers: [...p.customers, { id: c.id, name: c.name, phone: c.phone, address: c.address ?? undefined }] }));
      } catch (ex) { toast.error(t(L, "errSaving")); return; }
    } else {
      update((p) => ({ ...p, customers: [...p.customers, { id: `c${Date.now()}`, name: name.trim(), phone: phone.trim() }] }));
    }
    setName(""); setPhone("");
  };

  if (!s.crmOn) {
    return (
      <Empty title={t(L, "crmOffT")}
        hint={t(L, "crmOffH")}
        action={<Link to="/app/settings"><Button>{t(L, "goSettings")}</Button></Link>} />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
      <Card><CardHeader><CardTitle>{t(L, "newCustomer")}</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={add}>
            <Field label={t(L, "custName")} id="cn2"><Input id="cn2" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
            <Field label={t(L, "custPhone")} id="cp2"><Input id="cp2" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" /></Field>
            <Button type="submit">{t(L, "save")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t(L, "customersN")} ({s.customers.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {s.customers.map((c) => {
              const hist = s.orders.filter((o) => o.phone === c.phone || o.customer === c.name);
              return (
                <li key={c.id} className="flex items-center gap-3 border-t border-line py-2.5 text-sm first:border-0 first:pt-0">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas font-bold">{c.name.slice(0, 1)}</span>
                  <span className="flex-1"><b className="block">{c.name}</b><span className="tnum text-xs text-muted" dir="ltr">{c.phone}</span></span>
                  <span className="tnum text-xs text-muted">{hist.length} {t(L, "ordersU")} · {fmtDzd(hist.reduce((x, o) => x + o.total, 0))}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
