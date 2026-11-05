import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Decode a base64-encoded UI label at runtime. */
export function d(encoded: string): string {
  try {
    const bin = atob(encoded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return encoded;
  }
}

/** ISO 3166-1 alpha-2 code -> regional-indicator flag emoji ("" when not a valid code). */
export function flagEmoji(code: string): string {
  const c = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 0x41));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const day = 86_400_000;
  const hour = 3_600_000;
  const min = 60_000;
  const suffix = diff >= 0 ? "left" : "ago";
  if (abs >= day) return `${Math.round(abs / day)}d ${suffix}`;
  if (abs >= hour) return `${Math.round(abs / hour)}h ${suffix}`;
  if (abs >= min) return `${Math.round(abs / min)}m ${suffix}`;
  return `${Math.round(abs / 1000)}s ${suffix}`;
}

export function durationSince(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const day = 86_400_000;
  const hour = 3_600_000;
  const min = 60_000;
  if (diff >= day) return `${Math.floor(diff / day)}d`;
  if (diff >= hour) return `${Math.floor(diff / hour)}h`;
  if (diff >= min) return `${Math.floor(diff / min)}m`;
  return `${Math.floor(diff / 1000)}s`;
}

export function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
