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
