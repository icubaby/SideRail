/**
 * SideRail - Xray-core VPN management panel
 * Copyright (c) 2025 icubaby. All rights reserved.
 * Official repository: https://github.com/icubaby/SideRail
 *
 * Licensed under the SideRail Proprietary License (see LICENSE).
 * Unauthorized selling, white-labeling, or removal of attribution,
 * branding, or the embedded authorship identifiers is prohibited.
 * Watermark: sr-icubaby-2025-9f4c1a7e
 */
import { getSetting } from "./db.js";
import { activeProxy } from "./inbounds.js";
import type { Inbound, UserWithInbounds } from "./types.js";

interface LinkContext {
  host: string;
  address: string;
  port: number;
  hostHeader: string;
  sni: string;
  flag: string;
  user: UserWithInbounds;
  inbound: Inbound;
}

function label(user: UserWithInbounds, flag: string): string {
  return configName(user, flag);
}

/**
 * Convert ASCII letters/digits to the Unicode "mathematical bold" font
 * so config names render as: 𝗦𝗶𝗱𝗲𝗥𝗮𝗶𝗹 - <client name>
 * Non-ASCII characters (Persian, Chinese, emoji, spaces...) pass through unchanged.
 */
export function toBoldAscii(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x41 && c <= 0x5a) out += String.fromCodePoint(0x1d5d4 + (c - 0x41));
    else if (c >= 0x61 && c <= 0x7a) out += String.fromCodePoint(0x1d5ee + (c - 0x61));
    else if (c >= 0x30 && c <= 0x39) out += String.fromCodePoint(0x1d7ce + (c - 0x30));
    else out += ch;
  }
  return out;
}

/** Config / subscription name: 𝗦𝗶𝗱𝗲𝗥𝗮𝗶𝗹 <flag> - <client name> */
export function configName(user: UserWithInbounds, flag?: string): string {
  const f = (flag || "").trim();
  return f
    ? `${toBoldAscii("SideRail")} ${f} - ${toBoldAscii(user.email)}`
    : `${toBoldAscii("SideRail")} - ${toBoldAscii(user.email)}`;
}

/** ISO 3166-1 alpha-2 code -> regional-indicator flag emoji ("" when not a valid code). */
export function countryFlag(code: string): string {
  const c = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 0x41));
}

/**
 * Flag for an inbound's config names: the pinned egress relay's country when one
 * is active, otherwise the panel's default location.
 */
export function inboundFlag(inbound: Inbound): string {
  const pr = activeProxy(inbound);
  if (pr && pr.country) {
    const f = countryFlag(pr.country);
    if (f) return f;
  }
  return countryFlag(getSetting("location") || "NL");
}

/**
 * Encode a user's anti-DPI FinalMask fragment (e.g. {"tcp":[...]}) and ECH
 * config list as share-link query params. These match the params v2rayN /
 * 3x-ui emit: `fm` carries the FinalMask JSON, `ech` the echConfigList.
 */
function antiDpiQuery(user: UserWithInbounds): Record<string, string> {
  const q: Record<string, string> = {};
  const fm = (user.fragment || "").trim();
  if (fm && fm !== "[]") {
    try {
      JSON.parse(fm);
      q.fm = fm;
    } catch {
      // not valid JSON — skip so clients don't choke
    }
  }
  const ech = (user.ech_config || "").trim();
  if (ech) q.ech = ech;
  return q;
}

function commonQuery(ctx: LinkContext): Record<string, string> {
  const { inbound, user, sni, hostHeader } = ctx;
  const q: Record<string, string> = {
    security: "tls",
    sni,
    host: hostHeader,
    fp: user.fingerprint || "chrome",
  };
  q.type = inbound.transport === "xhttp" ? "xhttp" : inbound.transport;
  q.path = inbound.path;
  if (inbound.transport === "ws" || inbound.transport === "httpupgrade") {
    q.alpn = "http/1.1";
    q.headerType = "none";
  } else {
    q.alpn = user.alpn || "h2,http/1.1";
  }
  Object.assign(q, antiDpiQuery(user));
  return q;
}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

function vlessLink(ctx: LinkContext): string {
  const { user, address, port } = ctx;
  const query = qs({ ...commonQuery(ctx), encryption: "none" });
  return `vless://${user.uuid}@${address}:${port}?${query}#${encodeURIComponent(label(user, ctx.flag))}`;
}

function trojanLink(ctx: LinkContext): string {
  const { user, address, port } = ctx;
  const query = qs(commonQuery(ctx));
  return `trojan://${encodeURIComponent(user.password)}@${address}:${port}?${query}#${encodeURIComponent(
    label(user, ctx.flag),
  )}`;
}

function vmessLink(ctx: LinkContext): string {
  const { user, inbound, port, hostHeader, sni } = ctx;
  const isXhttp = inbound.transport === "xhttp";
  const obj = {
    v: "2",
    ps: label(user, ctx.flag),
    add: ctx.address,
    port: String(port),
    id: user.uuid,
    aid: "0",
    scy: "auto",
    net: isXhttp ? "xhttp" : inbound.transport,
    type: "none",
    host: hostHeader,
    path: inbound.path,
    tls: "tls",
    sni,
    alpn: isXhttp ? "h2,http/1.1" : "http/1.1",
    fp: user.fingerprint || "chrome",
    ...antiDpiQuery(user),
  };
  return "vmess://" + Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function buildLink(ctx: LinkContext): string {
  switch (ctx.inbound.protocol) {
    case "vless":
      return vlessLink(ctx);
    case "trojan":
      return trojanLink(ctx);
    case "vmess":
      return vmessLink(ctx);
  }
}

/**
 * Split an address override ("1.2.3.4", "1.2.3.4:8080", "example.com:8443")
 * into a host and port. When no ":port" is present, the port falls back to
 * 443 (the TLS edge). This lets a relay picked from the list (stored as
 * "ip:port") be emitted correctly instead of a malformed "ip:port:port".
 */
export function splitAddress(address: string): { host: string; port: number } {
  const a = (address || "").trim();
  const idx = a.lastIndexOf(":");
  if (idx > 0) {
    const p = Number(a.slice(idx + 1));
    if (Number.isInteger(p) && p > 0 && p <= 65535) {
      return { host: a.slice(0, idx), port: p };
    }
  }
  return { host: a, port: 443 };
}

/** Per-inbound custom address wins, then the global clean_address, then the request host. */
export function resolveAddress(inbound: Inbound, host: string): string {
  const custom = (inbound.address || "").trim();
  if (custom) return splitAddress(custom).host;
  const clean = (getSetting("clean_address") || "").trim();
  return clean ? splitAddress(clean).host : host;
}

/** Port for an inbound's effective server (custom override, clean_address, or 443). */
export function resolvePort(inbound: Inbound, host: string): number {
  const custom = (inbound.address || "").trim();
  if (custom) return splitAddress(custom).port;
  const clean = (getSetting("clean_address") || "").trim();
  return clean ? splitAddress(clean).port : 443;
}

/** Per-inbound TLS SNI override (falls back to the request host). */
export function sniFor(inbound: Inbound, host: string): string {
  return (inbound.sni || "").trim() || host;
}

/** Per-inbound Host header override (falls back to the request host). */
export function hostFor(inbound: Inbound, host: string): string {
  return (inbound.host || "").trim() || host;
}

export function buildUserLinks(
  host: string,
  user: UserWithInbounds,
  inbounds: Inbound[],
): { tag: string; protocol: string; transport: string; link: string }[] {
  return inbounds
    .filter((ib) => ib.enabled && user.inbound_ids.includes(ib.id))
    .map((inbound) => {
      const address = resolveAddress(inbound, host);
      const port = resolvePort(inbound, host);
      return {
        tag: inbound.tag,
        protocol: inbound.protocol,
        transport: inbound.transport,
        link: buildLink({
          host,
          address,
          port,
          hostHeader: hostFor(inbound, host),
          sni: sniFor(inbound, host),
          flag: inboundFlag(inbound),
          user,
          inbound,
        }),
      };
    });
}
