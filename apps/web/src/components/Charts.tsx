// رسوم SVG خفيفة بدون مكتبات (أداء + وضع داكن تلقائي).
export function Bars({ data, height = 120 }: { data: number[]; height?: number }) {
  const max = Math.max(1, ...data);
  const w = 320;
  const bw = w / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="sales chart">
      {data.map((v, i) => {
        const h = Math.max(4, (v / max) * (height - 16));
        return (
          <rect key={i} x={i * bw + 4} y={height - h} width={bw - 8} rx={4}
            fill={i === data.length - 1 ? "var(--color-growth)" : "var(--color-line)"} height={h} />
        );
      })}
    </svg>
  );
}

export function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-28" role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
