import * as React from "react";
import { Dice5, KeyRound, ChevronDown, Settings2, Eye, EyeOff, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ConnectedIps } from "@/components/users/connected-ips";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  Inbound,
  TrafficReset,
  User,
  UserFormValues,
} from "@/lib/types";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inbounds: Inbound[];
  editing: User | null;
  onSubmit: (values: UserFormValues) => Promise<void>;
}

const fingerprints = ["chrome", "firefox", "safari", "ios", "android", "edge", "random", "unsafe"];
const alpnOptions = ["h2,http/1.1", "h2", "http/1.1"];
const resets: TrafficReset[] = ["never", "daily", "weekly", "monthly"];

/** One anti-DPI fragment entry (FinalMask tcp fragment). */
interface FragmentEntry {
  packets: string;
  lengths: string;
  delays: string;
  maxSplit: string;
}

/** The single built-in preset suggested to users: "Aggressive" (two fragments). */
const AGGRESSIVE_FRAGMENTS: FragmentEntry[] = [
  { packets: "tlshello", lengths: "0,104,1", delays: "0", maxSplit: "0" },
  { packets: "1-1", lengths: "114,1", delays: "1", maxSplit: "11" },
];

/** Parse a stored FinalMask JSON string into fragment entries for the form. */
function parseFinalMaskFragment(raw: string): FragmentEntry[] {
  if (!raw || raw === "" || raw === "[]") return [];
  try {
    const obj = JSON.parse(raw) as {
      tcp?: {
        type?: string;
        settings?: {
          packets?: string;
          lengths?: string[];
          delays?: string[];
          maxSplit?: string;
        };
      }[];
    };
    if (!Array.isArray(obj.tcp)) return [];
    return obj.tcp
      .filter((f) => f && f.type === "fragment" && f.settings && typeof f.settings.packets === "string")
      .map((f) => ({
        packets: f.settings!.packets!,
        lengths: (f.settings!.lengths || []).join(","),
        delays: (f.settings!.delays || []).join(","),
        maxSplit: f.settings!.maxSplit || "",
      }));
  } catch {
    return [];
  }
}

/** Build the FinalMask JSON string from the form's fragment entries. */
function buildFinalMaskFragment(fragments: FragmentEntry[]): string {
  if (fragments.length === 0) return "";
  const tcp = fragments.map((f) => ({
    type: "fragment",
    settings: {
      packets: f.packets,
      lengths: f.lengths.split(",").filter(Boolean),
      delays: f.delays.split(",").filter(Boolean),
      maxSplit: f.maxSplit,
    },
  }));
  return JSON.stringify({ tcp });
}

/** ECH config list presets (echConfigList): <name>+<dns scheme> used to fetch ECH config. */
const echPresets: { id: string; nameKey: TKey; value: string }[] = [
  { id: "cloudflare-dns", nameKey: "echCloudflareDns", value: "cloudflare-ech.com+udp://1.1.1.1" },
  { id: "google-dns", nameKey: "echGoogleDns", value: "cloudflare-ech.com+udp://8.8.8.8" },
  { id: "quad9-dns", nameKey: "echQuad9Dns", value: "cloudflare-ech.com+udp://9.9.9.9" },
  { id: "google-doh", nameKey: "echGoogleDoh", value: "cloudflare-ech.com+https://dns.google/dns-query" },
  { id: "cloudflare-doh", nameKey: "echCloudflareDoh", value: "cloudflare-ech.com+https://cloudflare-dns.com/dns-query" },
  { id: "alidns-doh", nameKey: "echAliDoh", value: "cloudflare-ech.com+https://dns.alidns.com/dns-query" },
];

function randomToken(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(len));
  for (let i = 0; i < len; i++) out += chars[rnd[i] % chars.length];
  return out;
}

export function UserFormDialog({
  open,
  onOpenChange,
  inbounds,
  editing,
  onSubmit,
}: UserFormDialogProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [email, setEmail] = React.useState("");
  const [uuid, setUuid] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fingerprint, setFingerprint] = React.useState("chrome");
  const [alpn, setAlpn] = React.useState("h2,http/1.1");
  const [dataLimit, setDataLimit] = React.useState(0);
  const [expireDays, setExpireDays] = React.useState(30);
  const [ipLimit, setIpLimit] = React.useState(0);
  const [trafficReset, setTrafficReset] = React.useState<TrafficReset>("never");
  const [comment, setComment] = React.useState("");
  const [fragments, setFragments] = React.useState<FragmentEntry[]>([]);
  const [echConfig, setEchConfig] = React.useState("");
  const [inboundIds, setInboundIds] = React.useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showIps, setShowIps] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setShowAdvanced(false);
    setShowIps(false);
    if (editing) {
      setEmail(editing.email);
      setUuid(editing.uuid);
      setPassword(editing.password);
      setFingerprint(editing.fingerprint);
      setAlpn(editing.alpn);
      setDataLimit(Math.round((editing.data_limit / 1024 ** 3) * 100) / 100);
      setIpLimit(editing.ip_limit);
      setExpireDays(
        editing.expire_at
          ? Math.max(0, Math.round((editing.expire_at - Date.now()) / 86_400_000))
          : 0,
      );
      setTrafficReset(editing.traffic_reset);
      setComment(editing.comment);
      setFragments(parseFinalMaskFragment(editing.fragment || ""));
      setEchConfig(editing.ech_config || "");
      setInboundIds(editing.inbound_ids);
    } else {
      setEmail("");
      setUuid(crypto.randomUUID());
      setPassword(randomToken(16));
      setFingerprint("chrome");
      setAlpn("h2,http/1.1");
      setDataLimit(0);
      setIpLimit(0);
      setExpireDays(30);
      setTrafficReset("never");
      setComment("");
      setFragments([]);
      setEchConfig("");
      setInboundIds(inbounds.filter((i) => i.enabled).map((i) => i.id));
    }
  }, [open, editing, inbounds]);

  const toggleInbound = (id: number) => {
    setInboundIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected = inboundIds.length === inbounds.length && inbounds.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.push("error", t("enterName"));
      return;
    }
    if (inboundIds.length === 0) {
      toast.push("error", t("attachInbound"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        email,
        uuid,
        password,
        fingerprint,
        alpn,
        fragment: buildFinalMaskFragment(fragments),
        echConfig,
        dataLimit,
        ipLimit,
        expireDays,
        trafficReset,
        comment,
        inboundIds,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("editUser") : t("newUser")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t("nameEmail")}</Label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 32))}
              maxLength={32}
              placeholder="Default"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("dataLimit")}</Label>
              <NumberInput value={dataLimit} onChange={setDataLimit} step={1} suffix="GB" />
              <p className="text-[11px] text-text/50">{t("unlimitedHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("expireIn")}</Label>
              <NumberInput value={expireDays} onChange={setExpireDays} step={1} suffix={t("days")} />
              <p className="text-[11px] text-text/50">{t("neverHint")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("attachedInbounds")}</Label>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setInboundIds(inbounds.map((i) => i.id))}
                >
                  {t("selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setInboundIds([])}
                  disabled={inboundIds.length === 0}
                >
                  {t("clearAll")}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {inbounds.map((ib) => {
                const active = inboundIds.includes(ib.id);
                return (
                  <button
                    key={ib.id}
                    type="button"
                    onClick={() => toggleInbound(ib.id)}
                    className={cn(
                      "flex min-w-[calc(50%-0.375rem)] flex-1 flex-col gap-0.5 rounded-base border-2 border-border px-2.5 py-1.5 text-left transition-all sm:min-w-[calc(33.333%-0.5rem)]",
                      active
                        ? "bg-main text-mtext neo-shadow"
                        : "bg-bw text-text hover:bg-main/10",
                      !ib.enabled && "opacity-50",
                    )}
                  >
                    <span className="truncate font-heading text-xs">{ib.tag}</span>
                    <span className="text-[9px] uppercase tracking-wide opacity-70">
                      {ib.protocol}/{ib.transport}
                    </span>
                  </button>
                );
              })}
            </div>
            {allSelected && (
              <p className="text-[11px] text-text/50">{t("allInboundsAttached")}</p>
            )}
          </div>

          {editing && <ConnectedIps userId={editing.id} />}

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              "flex w-full items-center justify-between rounded-base border-2 border-border px-4 py-3 font-heading text-sm transition-all",
              showAdvanced ? "bg-main text-mtext neo-shadow" : "bg-bw hover:bg-main/10",
            )}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />{t("advancedOptions")}</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")}
            />
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-base border-2 border-border/40 bg-bg/30 p-4 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="uuid">UUID</Label>
                <div className="flex gap-2">
                  <Input id="uuid" value={uuid} onChange={(e) => setUuid(e.target.value)} />
                  <Button
                    type="button"
                    variant="neutral"
                    size="icon"
                    onClick={() => setUuid(crypto.randomUUID())}
                    title="Generate UUID"
                  >
                    <Dice5 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordTrojan")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="neutral"
                    size="icon"
                    onClick={() => setPassword(randomToken(16))}
                    title="Generate password"
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("fingerprint")}</Label>
                  <Select value={fingerprint} onValueChange={setFingerprint}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fingerprints.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("alpn")}</Label>
                  <Select value={alpn} onValueChange={setAlpn}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {alpnOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("ipLimit")}</Label>
                  <div className="flex gap-1.5">
                    <NumberInput
                      value={ipLimit}
                      onChange={setIpLimit}
                      step={1}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant={showIps ? "default" : "neutral"}
                      size="icon"
                      onClick={() => setShowIps((v) => !v)}
                      title={t("viewIps")}
                      className="h-10 w-10 shrink-0"
                    >
                      {showIps ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-text/50">{t("ipLimitHint")}</p>
                  {showIps && editing && <ConnectedIps userId={editing.id} />}
                </div>
                <div className="space-y-2">
                  <Label>Traffic reset</Label>
                  <Select
                    value={trafficReset}
                    onValueChange={(v) => setTrafficReset(v as TrafficReset)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {resets.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="comment">{t("comment")}</Label>
                  <Input id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("fragment")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="neutral"
                      size="sm"
                      className="h-8 whitespace-nowrap px-3 text-xs"
                      onClick={() => setFragments([...AGGRESSIVE_FRAGMENTS])}
                    >
                      {t("aggressive")}
                    </Button>
                    <Button
                      type="button"
                      variant="neutral"
                      size="sm"
                      className="h-8 whitespace-nowrap px-3 text-xs"
                      onClick={() =>
                        setFragments((p) => [
                          ...p,
                          { packets: "tlshello", lengths: "", delays: "", maxSplit: "" },
                        ])
                      }
                      disabled={fragments.length >= 2}
                    >
                      <Plus className="h-3.5 w-3.5" /> {t("addFragment")}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-text/50">{t("fragmentHint")}</p>

                {fragments.length === 0 ? (
                  <p className="rounded-base border-2 border-dashed border-border/40 px-3 py-2.5 text-[11px] text-text/50">
                    {t("noFragment")}
                  </p>
                ) : (
                  fragments.map((f, i) => (
                    <div
                      key={i}
                      className="space-y-4 rounded-base border-2 border-border/50 bg-bg/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-heading text-sm text-text">
                          {t("fragment")} #{i + 1}
                        </span>
                        <Button
                          type="button"
                          variant="neutral"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setFragments((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          title={t("removeFragment")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("packets")}</Label>
                          <Input
                            value={f.packets}
                            onChange={(e) =>
                              setFragments((prev) =>
                                prev.map((ff, idx) =>
                                  idx === i ? { ...ff, packets: e.target.value } : ff,
                                ),
                              )
                            }
                            placeholder="tlshello"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("lengths")}</Label>
                          <Input
                            value={f.lengths}
                            onChange={(e) =>
                              setFragments((prev) =>
                                prev.map((ff, idx) =>
                                  idx === i ? { ...ff, lengths: e.target.value } : ff,
                                ),
                              )
                            }
                            placeholder="0,104,1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("delays")}</Label>
                          <Input
                            value={f.delays}
                            onChange={(e) =>
                              setFragments((prev) =>
                                prev.map((ff, idx) =>
                                  idx === i ? { ...ff, delays: e.target.value } : ff,
                                ),
                              )
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("maxSplit")}</Label>
                          <Input
                            value={f.maxSplit}
                            onChange={(e) =>
                              setFragments((prev) =>
                                prev.map((ff, idx) =>
                                  idx === i ? { ...ff, maxSplit: e.target.value } : ff,
                                ),
                              )
                            }
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <Label>{t("echConfigList")}</Label>
                <p className="text-[11px] text-text/50">{t("echHint")}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("preset")}</Label>
                    <Select
                      value={
                        echPresets.some((p) => p.value === echConfig)
                          ? echPresets.find((p) => p.value === echConfig)!.id
                          : echConfig
                            ? "custom"
                            : "off"
                      }
                      onValueChange={(v) => {
                        if (v === "off") setEchConfig("");
                        else if (v === "custom") return;
                        else {
                          const preset = echPresets.find((p) => p.id === v);
                          if (preset) setEchConfig(preset.value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t("off")}</SelectItem>
                        {echPresets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {t(p.nameKey)}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">{t("custom")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("value")}</Label>
                    <Input
                      value={echConfig}
                      onChange={(e) => setEchConfig(e.target.value)}
                      placeholder={t("echValuePlaceholder")}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="neutral"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? t("saving") : editing ? t("saveChanges") : t("createUser")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
