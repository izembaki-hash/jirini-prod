import { useRef, useState } from "react";
import { CameraPlus, Trash } from "@phosphor-icons/react";
import { api, uploadUrl } from "../api";
import { connected } from "../auth";
import { useStore } from "../store";
import { t } from "../i18n";
import { cn } from "../ui";
import { errMsg } from "../lib/err";

// زر رفع صورة منتج/شعار: معاينة + رفع للخادم عند الاتصال، DataURL محلياً في التجريبي.
export function ImagePicker({ value, onChange, label }: { value: string | null; onChange: (url: string | null) => void; label?: string }) {
  const { s } = useStore();
  const L = s.lang;
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const src = uploadUrl(value);
  const lbl = label ?? t(L, "qaPhoto");

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    if (!f.type.startsWith("image/")) { setErr(t(L, "imgOnly")); return; }
    if (f.size > 5 * 1024 * 1024) { setErr(t(L, "imgTooBig")); return; }
    setBusy(true);
    try {
      if (connected()) {
        const r = await api.upload(f);
        onChange(r.url);
      } else {
        // تجريبي: DataURL للجلسة (قد لا يبقى بعد التحديث عند امتلاء التخزين)
        const data = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error("read"));
          fr.readAsDataURL(f);
        });
        onChange(data);
      }
    } catch (e) {
      setErr(errMsg(L, e));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{lbl}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          aria-label={lbl}
          className={cn(
            "btn-press relative grid size-20 shrink-0 touch-manipulation place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong text-muted transition-colors hover:border-growth hover:text-growth-deep disabled:opacity-50",
            src && "border-solid",
          )}
        >
          {src ? (
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <CameraPlus size={26} aria-hidden />
          )}
          {busy && <span aria-hidden className="absolute inset-0 grid place-items-center bg-surface/70"><span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /></span>}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs leading-relaxed text-muted">{t(L, "qaPhotoHint")}</span>
          {src && (
            <button type="button" onClick={() => onChange(null)}
              className="btn-press flex w-fit items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-ember">
              <Trash size={15} aria-hidden />{t(L, "imgRemove")}
            </button>
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p role="alert" className="text-xs font-bold text-ember">{err}</p>}
    </div>
  );
}
