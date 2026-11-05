import { nanoid } from "nanoid";
import { db } from "./db.js";
import { config } from "./config.js";
import type { Inbound, ProxyItem, Protocol, Transport } from "./types.js";

interface SeedDef {
  tag: string;
  protocol: Protocol;
  transport: Transport;
}

interface InboundRow extends Omit<Inbound, "proxies"> {
  proxies: string;
}

const SEED_INBOUNDS: SeedDef[] = [
  { tag: "VLESS-WS", protocol: "vless", transport: "ws" },
  { tag: "VLESS-XHTTP", protocol: "vless", transport: "xhttp" },
  { tag: "VMess-WS", protocol: "vmess", transport: "ws" },
  { tag: "Trojan-WS", protocol: "trojan", transport: "ws" },
  { tag: "VLESS-HTTPUpgrade", protocol: "vless", transport: "httpupgrade" },
];

export function seedInbounds(): void {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM inbounds").get() as { c: number }).c;
  if (count > 0) return;
  let offset = 0;
  const insert = db.prepare(
    `INSERT INTO inbounds (tag, protocol, transport, port, path, host, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const s of SEED_INBOUNDS) {
    const port = config.inboundBasePort + offset;
    const path = `/api/${nanoid(6)}`;
    insert.run(s.tag, s.protocol, s.transport, port, path, "", Date.now());
    offset += 1;
  }
}

function decodeProxies(raw: string): ProxyItem[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(parsed)) return parsed as ProxyItem[];
  } catch {
    /* fall through */
  }
  return [];
}

function decode(row: InboundRow): Inbound {
  const { proxies, ...rest } = row;
  return { ...rest, proxies: decodeProxies(proxies) };
}

export function listInbounds(): Inbound[] {
  return (db.prepare("SELECT * FROM inbounds ORDER BY id ASC").all() as unknown as InboundRow[]).map(
    decode,
  );
}

export function listEnabledInbounds(): Inbound[] {
  return (
    db
      .prepare("SELECT * FROM inbounds WHERE enabled = 1 ORDER BY id ASC")
      .all() as unknown as InboundRow[]
  ).map(decode);
}

export function getInbound(id: number): Inbound | undefined {
  const row = db.prepare("SELECT * FROM inbounds WHERE id = ?").get(id) as
    | InboundRow
    | undefined;
  return row ? decode(row) : undefined;
}

/** The relay pinned as this inbound's egress (its traffic exits through it), if any. */
export function activeProxy(inbound: Inbound): ProxyItem | null {
  if (!Array.isArray(inbound.proxies) || inbound.proxies.length === 0) return null;
  const marked = inbound.proxies.find((p) => p.active === true);
  if (marked) return marked;
  // Legacy: the old "Use" flow wrote the relay as "ip:port" into the address field.
  const a = (inbound.address || "").trim();
  if (a) {
    const legacy = inbound.proxies.find((p) => `${p.ip}:${p.port}` === a);
    if (legacy) return legacy;
  }
  return null;
}

/**
 * One-time migration for pre-4.5 relay state: when an inbound's address is exactly
 * an entry's "ip:port", move that entry to active and clear the address so links
 * keep the panel default and the core routes that inbound out through the relay.
 */
export function normalizeInboundProxyState(): void {
  for (const inbound of listInbounds()) {
    if (!Array.isArray(inbound.proxies) || inbound.proxies.length === 0) continue;
    if (inbound.proxies.some((p) => p.active === true)) continue;
    const a = (inbound.address || "").trim();
    if (!a) continue;
    const idx = inbound.proxies.findIndex((p) => `${p.ip}:${p.port}` === a);
    if (idx < 0) continue;
    const proxies = inbound.proxies.map((p, i) => ({ ...p, active: i === idx }));
    updateInbound(inbound.id, { address: "", proxies });
  }
}

export function setInboundEnabled(id: number, enabled: boolean): void {
  db.prepare("UPDATE inbounds SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function setInboundAddress(id: number, address: string): void {
  db.prepare("UPDATE inbounds SET address = ? WHERE id = ?").run(address.trim(), id);
}

export interface InboundUpdateInput {
  enabled?: boolean;
  address?: string;
  host?: string;
  sni?: string;
  proxies?: ProxyItem[];
}

export function updateInbound(id: number, input: InboundUpdateInput): void {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    vals.push(input.enabled ? 1 : 0);
  }
  if (input.address !== undefined) {
    sets.push("address = ?");
    vals.push(input.address.trim());
  }
  if (input.host !== undefined) {
    sets.push("host = ?");
    vals.push(input.host.trim());
  }
  if (input.sni !== undefined) {
    sets.push("sni = ?");
    vals.push(input.sni.trim());
  }
  if (input.proxies !== undefined) {
    sets.push("proxies = ?");
    vals.push(JSON.stringify(input.proxies));
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE inbounds SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}
