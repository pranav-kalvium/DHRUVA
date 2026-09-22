import { cn } from "@/lib/utils";

/**
 * DHRUVA mark: the pole star (Dhruva) as a fixed four-point star over a
 * shallow route arc, expressing guidance continuity. Stroke-based, no emoji,
 * works at favicon size.
 */
export function DhruvaLogo({
  className,
  title = "DHRUVA logo",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("h-8 w-8", className)}
    >
      <title>{title}</title>
      {/* route arc */}
      <path
        d="M4 26 C 10 26, 13 22, 16 17"
        fill="none"
        stroke="#FF6B35"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* pole star */}
      <path
        d="M20 3 L21.8 11.2 L30 13 L21.8 14.8 L20 23 L18.2 14.8 L10 13 L18.2 11.2 Z"
        fill="#FF6B35"
      />
      <circle cx="20" cy="13" r="2.4" fill="#0A2540" />
    </svg>
  );
}
