import React from "react";

// shadcn spirit: تركيب دلالي، gap لا space-y، size-* للمربع، cn() للشروط.
export const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

type BtnVariant = "primary" | "outline" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg" | "icon";

export function Button({
  variant = "primary", size = "md", loading = false, className, children, disabled, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-growth text-white hover:bg-growth-deep",
    outline: "border border-line bg-surface text-ink hover:bg-canvas",
    ghost: "text-ink hover:bg-canvas",
    danger: "bg-ember text-white hover:opacity-90",
  };
  const z: Record<BtnSize, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-5 text-[15px]",
    lg: "h-12 px-7 text-base",
    icon: "size-11",
  };
  return (
    <button
      className={cn(
        "btn-press inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[transform,background-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50",
        v[variant], z[size], className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />}
      {children}
    </button>
  );
}

// تحكم مجزّأ: بديل موحد لكل أزرار الاختيار الثنائية/الثلاثية (الدفع، النوع، الفترة).
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-[10px] border border-line bg-canvas p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors duration-150",
            value === o.value ? "bg-surface text-growth-deep shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// بطاقة رقم: تُستخدم في التقارير والملخصات (رقم tabular + تسمية + فرعي).
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted">{label}</span>
        <b className="tnum text-xl">{value}</b>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </div>
    </Card>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-[0_1px_2px_oklch(0.3_0.02_250/0.06)]", className)} {...p} />;
}
export function CardHeader(p: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", p.className)} {...p} />;
}
export function CardTitle(p: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-bold", p.className)} {...p} />;
}
export function CardDesc(p: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", p.className)} {...p} />;
}
export function CardContent(p: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", p.className)} {...p} />;
}

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-base text-ink",
        "placeholder:text-muted focus-visible:outline-none",
        className,
      )}
      {...p}
    />
  );
}

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold", className)} {...p} />;
}

export function Field({ label, hint, error, id, children }: {
  label: string; hint?: string; error?: string; id: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-ember">{error}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "bad" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-canvas text-ink border-line",
    ok: "bg-growth/10 text-growth-deep border-growth/25",
    warn: "bg-hold/15 text-[#7A5B00] border-hold/30",
    bad: "bg-ember/10 text-ember border-ember/25",
    info: "bg-canvas text-ink border-line",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone], className)} {...p} />
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px bg-line", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-line/70", className)} />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-line/70", className)}>
      <div className="h-full rounded-full bg-growth transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-bold">{title}</p>
      <p className="max-w-[45ch] text-sm text-muted">{hint}</p>
      {action}
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-hold", preparing: "bg-hold", ready: "bg-growth", onway: "bg-growth",
    delivered: "bg-muted", cancelled: "bg-ember",
  };
  return <span aria-hidden className={cn("size-2 rounded-full", map[status] ?? "bg-muted")} />;
}
