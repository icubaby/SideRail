import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a country flag as an SVG (via the `flag-icons` sprite, no emoji).
 * Falls back to a globe icon when the ISO code is missing/invalid.
 * The `.fis` square is em-sized, so pass `text-sm`/`text-base` to resize.
 */
export function CountryFlag({
  code,
  className,
}: {
  code?: string;
  className?: string;
}) {
  const c = (code || "").toLowerCase().replace(/[^a-z]/g, "");
  if (c.length !== 2) {
    return <Globe className={cn("h-4 w-4 shrink-0 text-text/40", className)} />;
  }
  return (
    <span
      className={cn("fi fis inline-block shrink-0 text-base leading-none", `fi-${c}`, className)}
      role="img"
      aria-label={c.toUpperCase()}
      title={c.toUpperCase()}
    />
  );
}
