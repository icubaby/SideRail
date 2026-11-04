import { useQuery } from "@tanstack/react-query";
import { Globe, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Live "Connected IPs" panel.
 * Fetches only IPs seen within the last 5 minutes (server prunes older
 * entries), so disconnected addresses auto-disappear shortly after drop-off.
 */
export function ConnectedIps({
  userId,
  className,
}: {
  userId: number;
  className?: string;
}) {
  const { t } = useI18n();
  const { data: ips = [] } = useQuery({
    queryKey: ["client-ips", userId],
    queryFn: () => api.clientIps(userId),
    refetchInterval: 5000,
  });

  const count = ips.length;

  return (
    <div
      className={cn(
        "animate-rise overflow-hidden rounded-base border-2 border-border bg-bg/30",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-bg/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-mtext">
            <Globe className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-heading text-sm">{t("connectedIps")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="relative flex h-2 w-2" title="live">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-heading text-sm leading-none">{count}</span>
          <span className="text-[10px] uppercase tracking-widest text-text/40">
            {t("activeCount")}
          </span>
        </div>
      </div>

      {/* Body */}
      {count === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-5 text-center">
          <span className="grid h-8 w-8 place-items-center rounded-base bg-bg/60">
            <WifiOff className="h-4 w-4 text-text/30" />
          </span>
          <span className="text-xs text-text/50">{t("noConnections")}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 p-2.5 sm:grid-cols-3">
          {ips.map((entry) => (
            <div
              key={entry.ip}
              title={entry.ip}
              className="flex h-8 min-w-0 items-center gap-1.5 rounded-base border-2 border-border bg-bw px-2"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text/80">
                {entry.ip}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
