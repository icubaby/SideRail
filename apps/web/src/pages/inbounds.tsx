import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Router, Waypoints, Lock, Server, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { InboundEditDialog } from "@/components/inbounds/inbound-edit-dialog";
import { cn, formatBytes } from "@/lib/utils";
import type { Inbound, ProxyItem } from "@/lib/types";

const protocolAccent: Record<string, string> = {
  vless: "#a3e635",
  vmess: "#7dd3fc",
  trojan: "#fbbf24",
};

export default function InboundsPage() {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [editing, setEditing] = React.useState<Inbound | null>(null);

  const { data: inbounds = [] } = useQuery<Inbound[]>({
    queryKey: ["inbounds"],
    queryFn: api.inbounds,
    refetchInterval: 10000,
  });

  const { data: traffic } = useQuery({
    queryKey: ["traffic"],
    queryFn: api.trafficStats,
    refetchInterval: 10000,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: {
        enabled?: boolean;
        address?: string;
        host?: string;
        sni?: string;
        proxies?: ProxyItem[];
      };
    }) => api.updateInbound(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbounds"] });
      toast.push("success", t("inboundUpdated"));
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const enabledCount = inbounds.filter((i) => i.enabled).length;
  const trafficByTag = new Map(
    (traffic?.inbounds ?? []).map((r) => [r.inbound_tag, r.up + r.down] as const),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Waypoints}
        accent="#fbbf24"
        title={t("inbounds")}
        description={t("inboundsDesc")}
        actions={
          <Badge variant="info" className="h-9 gap-1.5 px-3">
            <Waypoints className="h-4 w-4 shrink-0" />
            {enabledCount} / {inbounds.length} {t("enabledCount")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {inbounds.map((ib, i) => {
          const used = trafficByTag.get(ib.tag) ?? 0;
          const accent = protocolAccent[ib.protocol] || "#a3e635";
          const n = inbounds.length;
          const remLg = n % 3;
          const isLast = i === n - 1;
          const isLastTwo = i >= n - 2;
          const span = cn(
            "lg:col-span-2",
            remLg === 1 && isLast && "lg:col-span-6",
            remLg === 2 && isLastTwo && "lg:col-span-3",
          );
          const proxyCount = Array.isArray(ib.proxies) ? ib.proxies.length : 0;
          return (
            <Card
              key={ib.id}
              className={cn(
                "card-lift animate-rise flex flex-col overflow-hidden",
                span,
                !ib.enabled && "opacity-60 saturate-[0.4]",
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-1.5 w-full shrink-0" style={{ background: accent }} />
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-base border-2 border-border font-heading text-sm uppercase text-black"
                      style={{ background: accent }}
                    >
                      {ib.protocol.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-heading text-base">{ib.tag}</div>
                      <div className="text-[10px] uppercase tracking-widest text-text/50">
                        {ib.protocol} · {ib.transport}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={!!ib.enabled}
                    onCheckedChange={(v) => update.mutate({ id: ib.id, patch: { enabled: v } })}
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-base border-2 border-border bg-bg/40 px-1 py-2 text-center">
                    <div className="truncate font-heading text-sm">{ib.port}</div>
                    <div className="text-[9px] uppercase tracking-widest text-text/50">
                      {t("port")}
                    </div>
                  </div>
                  <div className="rounded-base border-2 border-border bg-sky-300/15 px-1 py-2 text-center">
                    <div className="truncate font-heading text-sm">{formatBytes(used)}</div>
                    <div className="text-[9px] uppercase tracking-widest text-text/50">
                      {t("used")}
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-base border-2 border-border bg-lime-300/15 px-1 py-2 text-center">
                    <Lock className="h-3.5 w-3.5 text-lime-500" />
                    <div className="text-[9px] uppercase tracking-widest text-lime-600 dark:text-lime-400">
                      TLS 443
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2 rounded-base border-2 border-border bg-bg/40 px-2.5 py-2 text-[11px]">
                  <Router className="h-3.5 w-3.5 shrink-0 text-text/50" />
                  <span className="min-w-0 flex-1 truncate font-mono text-text/80">{ib.path}</span>
                </div>

                <div className="mt-2.5 flex items-center gap-2 rounded-base border-2 border-border bg-bg/40 px-2.5 py-2 text-[11px]">
                  <Server className="h-3.5 w-3.5 shrink-0 text-text/50" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono",
                      ib.address ? "text-text/80" : "text-text/40",
                    )}
                    title={ib.address || t("auto")}
                  >
                    {ib.address || t("auto")}
                  </span>
                  {proxyCount > 0 && (
                    <Badge
                      variant="info"
                      className="hidden shrink-0 gap-1 px-1.5 py-0 text-[9px] sm:inline-flex"
                    >
                      {proxyCount}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setEditing(ib)}
                    className="h-8 shrink-0 gap-1.5 border-border px-2.5 text-xs text-black shadow-none hover:opacity-85 active:translate-x-boxShadowX active:translate-y-boxShadowY active:shadow-none [&_svg]:size-3.5"
                    style={{ background: accent }}
                  >
                    <Pencil />
                    {t("edit")}
                  </Button>
                </div>

                {!ib.enabled && (
                  <div className="mt-auto flex justify-center pt-3">
                    <Badge variant="danger" className="text-[10px] uppercase">
                      {t("disabled")}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing && (
        <InboundEditDialog
          inbound={editing}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSave={(patch) => update.mutateAsync({ id: editing.id, patch })}
        />
      )}
    </div>
  );
}
