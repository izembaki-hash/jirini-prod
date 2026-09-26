import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash } from "@phosphor-icons/react";
import { fmtDzd, useStore } from "../store";
import { api } from "../api";
import { connected } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input } from "../ui";
import type { ApiCustomerPayment } from "../api";
import { errToast } from "../lib/err";

// 6. Ø³Ø¬Ù„ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ â€” Ø§Ø®ØªÙŠØ§Ø±ÙŠ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ (ØªÙØ¹ÙŠÙ„/ØªØ¹Ø·ÙŠÙ„ Ù…Ù† Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª).
export default function Customers() {
  const { s, update } = useStore();
  const L = s.lang;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ledgerId, setHistId] = useState<string | null>(null);
  const [payHist, setPayHist] = useState<ApiCustomerPayment[]>([]);

  useEffect(() => {
    if (!connected()) return;
    api.customersList().then((list) => update((p) => ({
      ...p,
      customers: list.map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address ?? undefined, balance: c.balance })),
    }))).catch(() => null);
  }, [update]);

  const pay = async (id: string) => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    try {
      const r = await api.customersPay(id, { amount: amt });
      update((p) => ({ ...p, customers: p.customers.map((c) => c.id === id ? { ...c, balance: r.customer.balance } : c) }));
      toast.success(t(L, "paidOk"));
      setPayingId(null); setAmount("");
    } catch (ex) { errToast(L, ex, t(L, "errSaving")); }
  };

  const showHist = async (id: string) => {
    if (ledgerId === id) { setHistId(null); return; }
    try {
      setPayHist(await api.customerPayments(id));
      setHistId(id);
    } catch (ex) { errToast(L, ex, t(L, "errSaving")); }
  };

  const delCust = async (id: string) => {
    if (!window.confirm(t(L, "custDelConfirm"))) return;
    if (connected()) {
      try { await api.customersDelete(id); } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
    }
    update((p) => ({ ...p, customers: p.customers.filter((c) => c.id !== id) }));
    if (ledgerId === id) setHistId(null);
    if (payingId === id) setPayingId(null);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (connected()) {
      try {
        const c = await api.customersCreate({ name: name.trim(), phone: phone.trim() });
        update((p) => ({ ...p, customers: [...p.customers, { id: c.id, name: c.name, phone: c.phone, address: c.address ?? undefined, balance: c.balance }] }));
      } catch (ex) { errToast(L, ex, t(L, "errSaving")); return; }
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
              const debt = Math.round((c.balance ?? 0) * 100) / 100;
              return (
                <li key={c.id} className="flex flex-col gap-2 border-t border-line py-2.5 text-sm first:border-0 first:pt-0">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas font-bold">{c.name.slice(0, 1)}</span>
                    <span className="flex-1"><b className="block">{c.name}</b><span className="tnum text-xs text-muted" dir="ltr">{c.phone}</span></span>
                    {connected() && debt > 0
                      ? <Badge tone="bad">{t(L, "debtLb")}: <span className="tnum">{fmtDzd(debt)}</span></Badge>
                      : <span className="tnum text-xs text-muted">{hist.length} {t(L, "ordersU")} Â· {fmtDzd(hist.reduce((x, o) => x + o.total, 0))}</span>}
                    {connected() && debt > 0 && (
                      <Button size="sm" variant="outline" onClick={() => { setPayingId(payingId === c.id ? null : c.id); setAmount(String(debt)); }}>{t(L, "payDebt")}</Button>
                    )}
                    {connected() && (
                      <Button size="sm" variant="ghost" onClick={() => showHist(c.id)}>{t(L, "payHistory")}</Button>
                    )}
                    <button onClick={() => delCust(c.id)} aria-label={`${t(L, "del")} ${c.name}`}
                      className="btn-press grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ember">
                      <Trash size={16} aria-hidden />
                    </button>
                  </div>
                  {payingId === c.id && (
                    <form className="flex items-end gap-2 ps-13" onSubmit={(e) => { e.preventDefault(); pay(c.id); }}>
                      <Field label={t(L, "payAmtLb")} id={`pa-${c.id}`}>
                        <Input id={`pa-${c.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" />
                      </Field>
                      <Button size="sm" type="submit">{t(L, "save")}</Button>
                    </form>
                  )}
                  {ledgerId === c.id && (
                    <ul className="flex flex-col gap-1 ps-13 text-xs text-muted">
                      {payHist.map((h) => (
                        <li key={h.id} className="tnum" dir="ltr">{h.date.slice(0, 10)} Â· {fmtDzd(h.amount)} Â· {h.method}{h.ref ? ` Â· ${h.ref}` : ""}</li>
                      ))}
                      {payHist.length === 0 && <li>â€”</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

