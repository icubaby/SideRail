import * as React from "react";
import {
  Cloud,
  Loader2,
  MapPin,
  Play,
  Plus,
  Router,
  Server,
  Trash2,
  Check,
  Radar,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { pickPin } from "@/assets/atlas/pins";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountryFlag } from "@/components/country-flag";
import { cn, d } from "@/lib/utils";
import type { Inbound, ProxyItem, ProxyType } from "@/lib/types";

// Obfuscated English words (base64) — rendered via d()
const TXT_PROXY = d("cHJveHk="); // proxy
const TXT_SOCKS4 = d("c29ja3M0"); // socks4
const TXT_SOCKS5 = d("c29ja3M1"); // socks5
const TXT_HTTP = d("aHR0cA=="); // http

const PROTOCOL_LABEL: Record<ProxyType, string> = {
  socks4: TXT_SOCKS4.toUpperCase(),
  socks5: TXT_SOCKS5.toUpperCase(),
  http: TXT_HTTP.toUpperCase(),
};

const PROXY_ACCENT: Record<ProxyType, string> = {
  socks4: "#a3e635",
  socks5: "#7dd3fc",
  http: "#fbbf24",
};

const PROTOCOL_ACCENT: Record<string, string> = {
  vless: "#a3e635",
  vmess: "#7dd3fc",
  trojan: "#fbbf24",
};

const PROXY_TYPES: ProxyType[] = ["socks4", "socks5", "http"];

const FALLBACK_SOURCES = [
  { id: "proxyscrape", label: "ProxyScrape" },
  { id: "proxifly", label: "Proxifly" },
];

const SOURCE_COLOR: Record<string, string> = {
  proxyscrape: "bg-rose-300 text-black hover:bg-rose-200 hover:text-black",
  proxifly: "bg-sky-300 text-black hover:bg-sky-200 hover:text-black",
};

const SOURCE_COLOR_FALLBACK = [
  "bg-violet-300 text-black hover:bg-violet-200 hover:text-black",
  "bg-emerald-300 text-black hover:bg-emerald-200 hover:text-black",
  "bg-yellow-300 text-black hover:bg-yellow-200 hover:text-black",
];

// Random Railway address pool: 69.46.46.1 … 69.46.46.244
const ADDRESS_BASE = "69.46.46";
const ADDRESS_MIN = 1;
const ADDRESS_MAX = 244;

function randomAddress(): string {
  const n = ADDRESS_MIN + Math.floor(Math.random() * (ADDRESS_MAX - ADDRESS_MIN + 1));
  return `${ADDRESS_BASE}.${n}`;
}

function RailwayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.113 10.27A13.026 13.026 0 000 11.48h18.23c-.064-.125-.15-.237-.235-.347-3.117-4.027-4.793-3.677-7.19-3.78-.8-.034-1.34-.048-4.524-.048-1.704 0-3.555.005-5.358.01-.234.63-.459 1.24-.567 1.737h9.342v1.216H.113v.002zm18.26 2.426H.009c.02.326.05.645.094.961h16.955c.754 0 1.179-.429 1.315-.96zm-17.318 4.28s2.81 6.902 10.93 7.024c4.855 0 9.027-2.883 10.92-7.024H1.056zM11.988 0C7.5 0 3.593 2.466 1.531 6.108l4.75-.005v-.002c3.71 0 3.849.016 4.573.047l.448.016c1.563.052 3.485.22 4.996 1.364.82.621 2.007 1.99 2.712 2.965.654.902.842 1.94.396 2.934-.408.914-1.289 1.458-2.353 1.458H.391s.099.42.249.886h22.748A12.026 12.026 0 0024 12.005C24 5.377 18.621 0 11.988 0z" />
    </svg>
  );
}

function keyOf(p: Pick<ProxyItem, "ip" | "port" | "type">): string {
  return `${p.ip}:${p.port}:${p.type}`;
}

export function InboundEditDialog({
  inbound,
  open,
  onOpenChange,
  onSave,
}: {
  inbound: Inbound;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: {
    address: string;
    host: string;
    sni: string;
    proxies: ProxyItem[];
  }) => Promise<unknown> | void;
}) {
  const toast = useToast();
  const { t } = useI18n();

  const [address, setAddress] = React.useState("");
  const [host, setHost] = React.useState("");
  const [sni, setSni] = React.useState("");
  const [proxies, setProxies] = React.useState<ProxyItem[]>([]);

  const [sources, setSources] = React.useState<{ id: string; label: string }[]>([]);
  const [scanning, setScanning] = React.useState<string | null>(null);

  const [mType, setMType] = React.useState<ProxyType>("socks5");
  const [mIp, setMIp] = React.useState("");
  const [mPort, setMPort] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [filter, setFilter] = React.useState<ProxyType | "all">("all");
  const [pingingAll, setPingingAll] = React.useState(false);

  // key -> "pinging" | ms | "fail"
  const [pings, setPings] = React.useState<Record<string, number | "pinging" | "fail">>({});
  const [saving, setSaving] = React.useState(false);

  const accent = PROTOCOL_ACCENT[inbound.protocol] || "#a3e635";

  React.useEffect(() => {
    if (!open) return;
    setAddress(inbound.address || "");
    setHost(inbound.host || "");
    setSni(inbound.sni || "");
    setProxies(Array.isArray(inbound.proxies) ? inbound.proxies : []);
    setPings({});
    setFilter("all");
    setPingingAll(false);
    setMIp("");
    setMPort("");
    if (sources.length === 0) {
      api
        .proxySources()
        .then((r) => setSources(r.sources))
        .catch(() => setSources([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inbound]);

  const counts = React.useMemo(() => {
    const c: Record<ProxyType, number> = { socks4: 0, socks5: 0, http: 0 };
    for (const p of proxies) c[p.type]++;
    return c;
  }, [proxies]);

  const filtered =
    filter === "all" ? proxies : proxies.filter((p) => p.type === filter);

  const mergeProxies = (items: ProxyItem[]) => {
    setProxies((prev) => {
      const map = new Map(prev.map((p) => [keyOf(p), p]));
      for (const it of items) {
        const k = keyOf(it);
        if (!map.has(k)) map.set(k, it);
      }
      return [...map.values()];
    });
  };

  const useProxy = (p: ProxyItem) => {
    setAddress(`${p.ip}:${p.port}`);
    toast.push("success", `${p.ip}:${p.port} ✓`);
  };

  const scan = async (sourceId: string, label: string) => {
    setScanning(sourceId);
    try {
      const r = await api.proxyScan(sourceId);
      mergeProxies(r.proxies);
      if (r.proxies.length === 0) {
        toast.push("error", `${label}: ${t("proxyScanEmpty")}`);
      } else {
        toast.push("success", `${label}: ${r.proxies.length} ${TXT_PROXY}`);
      }
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setScanning(null);
    }
  };

  const addManual = async () => {
    const ip = mIp.trim();
    const port = Number(mPort.trim());
    if (!ip || !Number.isInteger(port) || port < 1 || port > 65535) {
      toast.push("error", t("proxyInvalidInput"));
      return;
    }
    if (
      !/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) ||
      !ip.split(".").every((o) => Number(o) <= 255)
    ) {
      toast.push("error", t("proxyInvalidInput"));
      return;
    }
    setAdding(true);
    try {
      const r = await api.proxyCheck(ip, port, mType);
      mergeProxies([r.item]);
      setMIp("");
      setMPort("");
      setFilter("all");
      toast.push("success", `${ip}:${port} ✓`);
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const ping = async (p: ProxyItem) => {
    const k = keyOf(p);
    setPings((prev) => ({ ...prev, [k]: "pinging" }));
    try {
      const r = await api.proxyTest(p.ip, p.port);
      setPings((prev) => ({ ...prev, [k]: r.ok && r.ms > 0 ? r.ms : "fail" }));
      setProxies((prev) =>
        prev.map((x) => (keyOf(x) === k ? { ...x, ms: r.ok && r.ms > 0 ? r.ms : 0 } : x)),
      );
    } catch {
      setPings((prev) => ({ ...prev, [k]: "fail" }));
    }
  };

  const pingAllProxies = async () => {
    const targets = filtered;
    if (targets.length === 0) return;
    setPingingAll(true);
    for (const p of targets) {
      await ping(p);
    }
    setPingingAll(false);
  };

  const clearAll = () => {
    setProxies([]);
    setPings({});
  };

  const remove = (k: string) => {
    setProxies((prev) => prev.filter((p) => keyOf(p) !== k));
    setPings((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ address: address.trim(), host: host.trim(), sni: sni.trim(), proxies });
      onOpenChange(false);
    } catch {
      // the parent mutation already surfaced the error via toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <div
          className="-mx-5 -mt-5 mb-2 h-1.5 rounded-t-base sm:-mx-6 sm:-mt-6"
          style={{ background: accent }}
        />
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-base border-2 border-border font-heading text-xs uppercase text-black"
              style={{ background: accent }}
            >
              {inbound.protocol.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{inbound.tag}</DialogTitle>
              <DialogDescription className="truncate font-mono">
                {inbound.protocol} · {inbound.transport} · {inbound.path}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">
              <Server className="mr-1.5 h-3.5 w-3.5" />
              {t("general")}
            </TabsTrigger>
            <TabsTrigger value="proxy" className="flex-1">
              <Router className="mr-1.5 h-3.5 w-3.5" />
              {TXT_PROXY}
              {proxies.length > 0 && (
                <span className="ml-1 rounded-full bg-mtext/15 px-1.5 text-[10px]">
                  {proxies.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-3">
            {/* Address */}
            <div className="rounded-base border-2 border-border bg-bg/40 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-heading text-sm">{t("address")}</span>
                <span className="truncate font-mono text-[10px] uppercase tracking-widest text-text/40">
                  {address || t("auto")}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-base border-2 border-border bg-bw px-3 py-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-text/50" />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("addressPlaceholder")}
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text outline-none placeholder:text-text/40"
                />
                {address && (
                  <button
                    type="button"
                    onClick={() => setAddress("")}
                    className="text-[10px] font-heading uppercase tracking-widest text-text/40 transition-colors hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setAddress(randomAddress())}
                  title={t("randomAddressHint")}
                  className="h-10 w-full justify-center gap-2 border-border bg-violet-300 px-2 text-xs text-black hover:bg-violet-200 hover:text-black [&_svg]:size-4"
                >
                  <RailwayGlyph />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="font-heading">Railway</span>
                    <span className="text-[9px] font-base text-black/60">69.46.46.x</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => void pickPin().then((v) => v && setAddress(v))}
                  title={t("cleanHint")}
                  className="h-10 w-full justify-center gap-2 border-border bg-yellow-300 px-2 text-xs text-black hover:bg-yellow-200 hover:text-black [&_svg]:size-4"
                >
                  <Cloud />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="font-heading">Cloudflare</span>
                    <span className="text-[9px] font-base text-black/60">clean IP</span>
                  </span>
                </Button>
              </div>
            </div>

            {/* Host / SNI */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-heading text-sm">{t("host")}</span>
                  {!host && (
                    <Badge variant="neutral" className="px-1.5 py-0 text-[9px] uppercase">
                      {t("auto")}
                    </Badge>
                  )}
                </div>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={t("hostPlaceholder")}
                  spellCheck={false}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-heading text-sm">{t("sni")}</span>
                  {!sni && (
                    <Badge variant="neutral" className="px-1.5 py-0 text-[9px] uppercase">
                      {t("auto")}
                    </Badge>
                  )}
                </div>
                <Input
                  value={sni}
                  onChange={(e) => setSni(e.target.value)}
                  placeholder={t("sniPlaceholder")}
                  spellCheck={false}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="proxy" className="space-y-3">
            {/* Scan + manual add */}
            <div className="rounded-base border-2 border-dashed border-border bg-bg/25 p-3">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-text/50" />
                <span className="font-heading text-sm">{t("scanSources")}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(sources.length > 0 ? sources : FALLBACK_SOURCES).map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => scan(s.id, s.label)}
                    disabled={scanning !== null}
                    className={cn(
                      "h-9 w-full justify-center gap-2 border-border px-2 text-xs [&_svg]:size-3.5",
                      SOURCE_COLOR[s.id] ??
                        SOURCE_COLOR_FALLBACK[
                          (sources.length > 0 ? sources : FALLBACK_SOURCES).findIndex(
                            (x) => x.id === s.id,
                          ) % SOURCE_COLOR_FALLBACK.length
                        ],
                    )}
                  >
                    {scanning === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    {s.label}
                  </Button>
                ))}
              </div>

              <div className="my-3 border-t-2 border-dashed border-border/60" />

              <div className="mb-1.5 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-text/50" />
                <span className="font-heading text-sm">{t("addManually")}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr_92px_auto] gap-1.5">
                <Select value={mType} onValueChange={(v) => setMType(v as ProxyType)}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROXY_TYPES.map((pt) => (
                      <SelectItem key={pt} value={pt} className="gap-2">
                        {PROTOCOL_LABEL[pt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={mIp}
                  onChange={(e) => setMIp(e.target.value)}
                  placeholder={t("proxyIp")}
                  spellCheck={false}
                  className="h-10 font-mono text-xs"
                />
                <Input
                  value={mPort}
                  onChange={(e) => setMPort(e.target.value)}
                  placeholder={t("proxyPort")}
                  spellCheck={false}
                  className="h-10 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void addManual()}
                  disabled={adding || !mIp.trim() || !mPort.trim()}
                  className="h-10 gap-1.5 text-xs [&_svg]:size-3.5"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus />}
                  {t("add")}
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            {proxies.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["all", ...PROXY_TYPES] as const).map((f) => {
                    const label =
                      f === "all" ? t("all") : PROTOCOL_LABEL[f as ProxyType];
                    const c = f === "all" ? proxies.length : counts[f];
                    return (
                      <Button
                        key={f}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilter(f)}
                        className={cn(
                          "h-7 gap-1 rounded-base border-2 border-border px-2.5 text-[11px]",
                          filter === f
                            ? "bg-main text-mtext"
                            : "bg-bg/40 text-text/60 hover:bg-main/15",
                        )}
                      >
                        {label}
                        <span className="text-[10px] opacity-60">{c}</span>
                      </Button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void pingAllProxies()}
                    disabled={pingingAll || filtered.length === 0}
                    className="h-7 gap-1 px-2 text-[11px] [&_svg]:size-3"
                  >
                    {pingingAll ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    {t("pingAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="h-7 gap-1 px-2 text-[11px] text-text/60 hover:text-red-500 [&_svg]:size-3"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("clearAll")}
                  </Button>
                </div>
              </div>
            )}

            {/* Proxy list */}
            <div className="space-y-1.5">
              {proxies.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-base border-2 border-dashed border-border p-6 text-center">
                  <Router className="h-6 w-6 text-text/30" />
                  <span className="text-xs text-text/50">{t("noProxies")}</span>
                </div>
              )}
              {filtered.length === 0 && proxies.length > 0 && (
                <div className="rounded-base border-2 border-dashed border-border p-3 text-center text-xs text-text/50">
                  — {t("noProxies")} —
                </div>
              )}
              {filtered.map((p) => {
                const k = keyOf(p);
                const active = address === `${p.ip}:${p.port}`;
                const pingState = pings[k];
                const pAccent = PROXY_ACCENT[p.type];
                return (
                  <div
                    key={k}
                    className={cn(
                      "flex items-center gap-2 rounded-base border-2 border-border bg-bg/40 px-2.5 py-2 transition-colors",
                      active && "border-lime-500 bg-lime-300/10",
                    )}
                  >
                    <CountryFlag code={p.country} className="shrink-0 text-base" />
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-xs text-text/80"
                      title={`${p.ip}:${p.port}`}
                    >
                      {p.ip}:{p.port}
                    </span>

                    {active && (
                      <Badge variant="success" className="shrink-0 gap-1 px-1.5 py-0 text-[9px] uppercase">
                        <Check className="h-2.5 w-2.5" />
                        {t("inUse")}
                      </Badge>
                    )}

                    <Badge
                      variant="neutral"
                      className="shrink-0 px-2 text-[10px]"
                      style={{ borderColor: pAccent, color: pAccent }}
                    >
                      {PROTOCOL_LABEL[p.type]}
                    </Badge>

                    {pingState === "pinging" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text/40" />
                    ) : pingState === "fail" ? (
                      <span className="shrink-0 rounded-base border-2 border-red-400 px-1.5 py-0.5 font-mono text-[10px] text-red-500">
                        ✕
                      </span>
                    ) : typeof pingState === "number" ? (
                      <span className="shrink-0 rounded-base border-2 border-emerald-400 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">
                        {pingState}ms
                      </span>
                    ) : null}

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void ping(p)}
                        title={t("ping")}
                        disabled={pingState === "pinging"}
                        className="h-8 w-8 p-0 [&_svg]:size-3.5"
                      >
                        <Play />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => useProxy(p)}
                        title={t("use")}
                        className={cn(
                          "h-8 gap-1 px-2 text-[11px] [&_svg]:size-3.5",
                          active
                            ? "bg-emerald-300 text-black hover:bg-emerald-200 hover:text-black"
                            : "text-text/60 hover:bg-main/20",
                        )}
                      >
                        {active ? <Check /> : <MapPin />}
                        {active ? t("inUse") : t("use")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(k)}
                        title={t("trash")}
                        className="h-8 w-8 p-0 [&_svg]:size-3.5 hover:text-red-500"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5 [&_svg]:size-4">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
