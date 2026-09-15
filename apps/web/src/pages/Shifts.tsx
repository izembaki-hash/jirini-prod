import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtDzd, useStore, type Shift } from "../store";
import { api, currentBranch, type ApiShift } from "../api";
import { connected, useAuth } from "../auth";
import { t } from "../i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "../ui";

// 4ب. الورديات وإغلاق الصندوق: فتح → تتبع لحظي → إغلاق بعدّ فعلي + فرق.
const toLocal = (s: ApiShift): Shift => ({
  id: s.id, by: s.cashierId, openedAt: s.openedAt, closedAt: s.closedAt,
  opening: s.openingCash, closing: s.closingCash, note: s.note,
});

export default function Shifts() {
  const { s, update } = useStore();
  const L = s.lang;
  const { session } = useAuth();
  const canReview = !connected() || !session || ["owner", "manager"].includes(session.role);
  const [opening, setOpening] = useState("10000");
  const [closing, setClosing] = useState("");
  const [note, setNote] = useState("");
  const [by, setBy] = useState("أمين (كاشير)");
  const [closedRemote, setClosedRemote] = useState<Shift[] | null>(null);
  const [lastDiff, setLastDiff] = useState<{ expected: number; diff: number } | null>(null);

  useEffect(() => {
    if (!connected()) return;
    api.shiftOpenInfo().then((o) => {
      if (o) update((p) => ({ ...p, shift: toLocal(o) }));
      else update((p) => ({ ...p, shift: null }));
    }).catch(() => null);
    if (canReview) api.shiftsList().then((l) => setClosedRemote(l.map(toLocal))).catch(() => null);
  }, [update, canReview]);

  const open = s.shift && !s.shift.closedAt ? s.shift : null;
  const shiftOrders = open ? s.orders.filter((o) => o.at >= open.openedAt && o.status !== "cancelled") : [];
  const cashSales = shiftOrders.filter((o) => o.pay === "cash").reduce((x, o) => x + o.total, 0);
  const cardSales = shiftOrders.filter((o) => o.pay === "card").reduce((x, o) => x + o.total, 0);
  const creditSales = shiftOrders.filter((o) => o.pay === "credit").reduce((x, o) => x + o.total, 0);
  const expected = open ? open.opening + cashSales : 0;
  const diff = closing !== "" && open ? Number(closing) - expected : null;
  const needNote = diff !== null && Math.abs(diff) >= 1000;
  const closedList = connected() ? (closedRemote ?? []) : s.shifts;

  const doOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connected()) {
      const br = currentBranch();
      if (!br) { toast.error(t(L, "errSaving")); return; }
      try {
        const created = await api.shiftOpen(br, Number(opening) || 0, by.trim() || "cashier");
        update((p) => ({ ...p, shift: toLocal(created) }));
        toast.success(t(L, "openShiftB"));
      } catch { toast.error(t(L, "errSaving")); }
      return;
    }
    update((p) => ({ ...p, shift: { id: `sh${Date.now()}`, by, openedAt: new Date().toISOString(), closedAt: null, opening: Number(opening) || 0, closing: null, note: "" } }));
  };

  const doClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open || closing === "" || (needNote && !note.trim())) return;
    if (connected()) {
      try {
        const r = await api.shiftClose(open.id, Number(closing), note);
        setLastDiff({ expected: r.expected, diff: r.diff });
        update((p) => ({ ...p, shifts: [toLocal(r.shift), ...p.shifts], shift: null }));
        if (canReview) api.shiftsList().then((l) => setClosedRemote(l.map(toLocal))).catch(() => null);
      } catch (ex) {
        toast.error(t(L, "errSaving"));
        return;
      }
    } else {
      update((p) => ({
        ...p,
        shifts: [...p.shifts, { ...open, closedAt: new Date().toISOString(), closing: Number(closing), note }],
        shift: null,
      }));
    }
    setClosing(""); setNote("");
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t(L, "shifts")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!open ? (
            <form className="flex flex-col gap-4" onSubmit={doOpen}>
              <Field label={t(L, "cashierName")} id="by"><Input id="by" value={by} onChange={(e) => setBy(e.target.value)} /></Field>
              <Field label={t(L, "openingCash")} id="op" hint={t(L, "openingHint")}>
                <Input id="op" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} />
              </Field>
              <Button type="submit">{t(L, "openShift")}</Button>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="warn">{t(L, "openB")} · {open.by}</Badge>
                <Badge>{t(L, "cash")}: <span className="tnum">{fmtDzd(cashSales)}</span></Badge>
                <Badge>{t(L, "card")}: <span className="tnum">{fmtDzd(cardSales)}</span></Badge>
                {creditSales > 0 && <Badge tone="warn">{t(L, "credit")}: <span className="tnum">{fmtDzd(creditSales)}</span></Badge>}
                <Badge tone="ok">{t(L, "expected")}: <span className="tnum">{fmtDzd(lastDiff?.expected ?? expected)}</span></Badge>
                <Badge>{shiftOrders.length} {t(L, "invoicesU")}</Badge>
              </div>
              <form className="flex flex-col gap-4" onSubmit={doClose}>
                <Field label={t(L, "actual")} id="cl"><Input id="cl" inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
                {diff !== null && (
                  <p className={`tnum text-lg font-bold ${diff === 0 ? "text-growth-deep" : "text-ember"}`}>
                    {t(L, "diff")}: {diff > 0 ? "+" : ""}{fmtDzd(diff)} {diff === 0 ? t(L, "match") : diff > 0 ? t(L, "over") : t(L, "short")}
                  </p>
                )}
                {needNote && (
                  <Field label={t(L, "diffReason")} id="nt">
                    <Input id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(L, "diffReasonPh")} />
                  </Field>
                )}
                <Button type="submit" disabled={closing === "" || (needNote && !note.trim())}>{t(L, "closeShift")}</Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {canReview && (
        <Card>
          <CardHeader><CardTitle>{t(L, "mgrReview")}</CardTitle></CardHeader>
          <CardContent>
            {closedList.length === 0 ? <p className="text-sm text-muted">{t(L, "noClosed")}</p> : (
              <ul className="flex flex-col gap-2">
                {closedList.slice().reverse().map((sh) => {
                  const d = (sh.closing ?? 0) - sh.opening;
                  return (
                    <li key={sh.id} className="flex items-center justify-between gap-2 border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                      <span>{new Date(sh.closedAt ?? sh.openedAt).toLocaleString("fr-DZ")} · {sh.by}</span>
                      <Badge tone={Math.abs(d) >= 1000 ? "bad" : "ok"}><span className="tnum">{d >= 0 ? "+" : ""}{fmtDzd(d)}</span></Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
