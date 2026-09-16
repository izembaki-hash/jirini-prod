import React from "react";

// shadcn spirit: تركيب دلالي، gap لا space-y، size-* للمربع، cn() للشروط.
export const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

type BtnVariant = "primary" | "outline" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg" | "icon";

export const Button = React.forwardRef<HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading = false, className, children, disabled, ...props }, ref) {
    const v: Record<BtnVariant, string> = {
      primary: "bg-growth text-white hover:bg-growth-deep",
      outline: "border border-line bg-surface text-ink hover:bg-canvas",
      ghost: "text-ink hover:bg-canvas",
      danger: "bg-ember text-white hover:opacity-90",
    };
    const z: Record<BtnSize, string> = {
      sm: "min-h-10 px-3.5 text-sm",
      md: "min-h-11 px-5 text-[15px]",
      lg: "min-h-12 px-7 text-base",
      icon: "size-11",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "btn-press inline-flex cursor-pointer touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[transform,background-color,opacity,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50",
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
  },
);

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
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "btn-press min-h-10 flex-1 touch-manipulation whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors duration-150",
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

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...p }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-base text-ink",
          "placeholder:text-muted/80 focus-visible:outline-none aria-invalid:border-ember aria-invalid:ring-1 aria-invalid:ring-ember/40",
          className,
        )}
        {...p}
      />
    );
  },
);

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold", className)} {...p} />;
}

export function Field({ label, hint, error, id, children }: {
  label: string; hint?: string; error?: string; id: string; children: React.ReactNode;
}) {
  // يربط الخطأ بالحقل لقارئ الشاشة (better-accessibility §7) دون تغيير واجهة الاستدعاء.
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const wired = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...(error ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })
    : children;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {wired}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="pop-in rounded-[10px] bg-ember/10 px-3 py-2.5 text-xs font-bold text-ember">{error}</p>}
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
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone], className)} {...p} />
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px bg-line", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-lg", className)} />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-line/70", className)}>
      <div className="h-full rounded-full bg-growth transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ title, hint, action, icon }: { title: string; hint: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon && <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-growth/10 text-xl text-growth-deep">{icon}</span>}
      <p className="font-bold">{title}</p>
      <p className="max-w-[45ch] text-sm leading-relaxed text-muted">{hint}</p>
      {action && <span className="mt-2">{action}</span>}
    </div>
  );
}

// مؤشر خطوات مسار التحويل (معلومات ← دفع ← كلمة السر): نص + نقاط، بلا أرقام مخترعة.
export function Steps({ current, steps }: { current: number; steps: [string, string, string] }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="steps">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-1.5 last:flex-none" aria-current={now ? "step" : undefined}>
            <span className={cn(
              "tnum grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
              done ? "bg-growth text-white" : now ? "bg-growth/15 text-growth-deep ring-1 ring-growth" : "bg-canvas text-muted ring-1 ring-line",
            )}>
              {done ? "✓" : i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-xs font-bold", now || done ? "text-ink" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span aria-hidden className={cn("h-px flex-1", i < current ? "bg-growth" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-hold", preparing: "bg-hold", ready: "bg-growth", onway: "bg-growth",
    delivered: "bg-muted", cancelled: "bg-ember",
  };
  return <span aria-hidden className={cn("size-2 rounded-full", map[status] ?? "bg-muted")} />;
}
