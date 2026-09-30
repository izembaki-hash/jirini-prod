import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { t } from "../i18n";
import { Button } from "../ui";

// حوار مسح الباركود بالكاميرا (هواتف غالباً).
// مكتبة zxing تُحمَّل ديناميكياً عند الفتح فقط — لا تكبّر الحزمة الأولية.
// الأب يقرر مصير الرمز عبر onScan (POS: إضافة للسلة، المخزون: ملء الحقل).
export function ScanDialog({ open, onClose, onScan }: {
  open: boolean; onClose: () => void; onScan: (code: string) => void;
}) {
  const { s } = useStore();
  const L = s.lang;
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [err, setErr] = useState<"denied" | "nocam" | "failed" | null>(null);
  const [starting, setStarting] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    let controls: { stop(): void } | null = null;
    let stream: MediaStream | null = null;
    let coolUntil = 0;
    setErr(null);
    setStarting(true);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!dead) { setErr("nocam"); setStarting(false); }
          return;
        }
        const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
        if (dead) return;
        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE];
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (dead) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => null);
        if (dead) return;
        setStarting(false);
        controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (dead || !result) return;
          const now = Date.now();
          if (now < coolUntil) return;
          coolUntil = now + 1500;
          onScanRef.current(result.getText());
        });
      } catch (ex) {
        if (dead) return;
        setStarting(false);
        const name = (ex as { name?: string }).name;
        setErr(name === "NotAllowedError" || name === "SecurityError" ? "denied" : !stream ? "nocam" : "failed");
      }
    })();
    return () => {
      dead = true;
      try { controls?.stop(); } catch { /* تجاهل */ }
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* تجاهل */ }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, retry]);

  if (!open) return null;
  return (
    <div className="dialog-scrim fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={onClose} role="presentation">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
        role="dialog" aria-modal="true" aria-label={t(L, "scanTitle")} onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[3/4] max-h-[60dvh] w-full bg-black">
          <video ref={videoRef} playsInline muted disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-24 w-56 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_oklch(0_0_0/0.45)]" />
          </div>
          {starting && (
            <div className="absolute inset-0 grid place-items-center">
              <span aria-hidden className="size-8 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            </div>
          )}
          {err && (
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4 text-center">
              <p role="alert" className="text-sm font-bold text-white">
                {err === "denied" ? t(L, "scanDenied") : err === "nocam" ? t(L, "scanNoCam") : t(L, "scanFailed")}
              </p>
              <button type="button" onClick={() => setRetry((r) => r + 1)}
                className="btn-press mt-2 min-h-10 rounded-[10px] border border-white/40 px-4 text-sm font-bold text-white">
                {t(L, "scanRetry")}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{t(L, "scanTitle")}</p>
            <p className="truncate text-xs text-muted">{t(L, "scanHint")}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>{t(L, "cancel")}</Button>
        </div>
      </div>
    </div>
  );
}
