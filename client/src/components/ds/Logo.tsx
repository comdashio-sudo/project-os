import React from "react";
import { useDirection, type DirectionId } from "./direction";

// Three proposed Dashio marks, one per direction. Each is a symbol and a wordmark in plain SVG; every colour is a design token (currentColor or a CSS variable), so the mark
// follows the direction and its dark mode. The Arabic form "داشيو" sits under the Latin name in the stacked version.
//   A  "Bars-D"   a rounded square carrying a D built from a stem and a bowl, with an aqua dash: the dashboard's bars and the "dash" in the name.
//   B  "Ring"     a progress ring that is almost closed, with an amber dot at its gap: a gauge, the percentage-complete idea at the heart of the product.
//   C  "Slash-D"  a hard black D cut by an orange diagonal: a drawing-sheet stamp, precise and technical.
function Symbol({ direction, size }: { direction: DirectionId; size: number }) {
  if (direction === "a") return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Dashio" focusable="false">
      <rect width="40" height="40" rx="10" fill="var(--primary)" />
      <path d="M13 11v18" stroke="var(--primary-foreground)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M13 11h5.5a9 9 0 0 1 0 18H13" fill="none" stroke="var(--primary-foreground)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="22" y="23" width="9" height="3.6" rx="1.8" fill="var(--secondary)" />
    </svg>
  );
  if (direction === "b") return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Dashio" focusable="false">
      <circle cx="20" cy="20" r="15" fill="none" stroke="var(--accent)" strokeWidth="6" />
      <path d="M20 5a15 15 0 1 1-13.2 22" fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="7.4" cy="26.4" r="3.6" fill="var(--secondary)" />
      <path d="M14.5 20.5l4 4 7.5-8.5" fill="none" stroke="var(--primary)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Dashio" focusable="false">
      <rect width="40" height="40" rx="3" fill="var(--primary)" />
      <path d="M10 8h10.5a12 12 0 0 1 0 24H10z" fill="var(--primary-foreground)" />
      <path d="M10 8h10.5a12 12 0 0 1 0 24H10z" fill="none" />
      <path d="M8 34L32 6" stroke="var(--secondary)" strokeWidth="3.4" strokeLinecap="square" />
    </svg>
  );
}

const wordmarkStyle: Record<DirectionId, React.CSSProperties> = {
  a: { fontFamily: "var(--font-lat)", fontWeight: 650, letterSpacing: "-0.02em" },
  b: { fontFamily: "var(--font-lat)", fontWeight: 600, letterSpacing: "0" },
  c: { fontFamily: "var(--font-lat)", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" },
};

/** The mark: symbol alone, symbol + name side by side ("horizontal"), or the name with its Arabic form under it ("stacked"). */
export function Logo({ variant = "horizontal", size = 32, direction, className = "" }: { variant?: "symbol" | "horizontal" | "stacked"; size?: number; direction?: DirectionId; className?: string }) {
  const current = useDirection().direction;
  const which = direction ?? current;
  const symbol = <Symbol direction={which} size={size} />;
  if (variant === "symbol") return <span className={`inline-flex ${className}`}>{symbol}</span>;
  const name = <span style={{ ...wordmarkStyle[which], fontSize: size * 0.62, lineHeight: 1 }} dir="ltr" className="text-foreground">Dashio</span>;
  if (variant === "horizontal") return <span className={`inline-flex items-center gap-2.5 ${className}`}>{symbol}{name}</span>;
  return <span className={`inline-flex items-center gap-3 ${className}`}>{symbol}<span className="flex flex-col gap-1">{name}<span dir="rtl" lang="ar" className="text-muted-foreground" style={{ fontFamily: "var(--font-ar)", fontSize: size * 0.4, lineHeight: 1 }}>داشيو</span></span></span>;
}
