/**
 * SideRail - proxy scanning, geolocation + latency tests for inbound edits.
 * Two free public proxy-list sources are built in; entries are parsed,
 * de-duplicated, geo-located (ISO country code) and ping-tested on demand.
 *
 * SideRail - Xray-core VPN management panel
 * Copyright (c) 2025 icubaby. All rights reserved.
 * Official repository: https://github.com/icubaby/SideRail
 *
 * Licensed under the SideRail Proprietary License (see LICENSE).
 * Unauthorized selling, white-labeling, or removal of attribution,
 * branding, or the embedded authorship identifiers is prohibited.
 * Watermark: sr-icubaby-2025-9f4c1a7e
 */
import https from "node:https";
import http from "node:http";
import net from "node:net";
import type { ProxyItem, ProxyType } from "./types.js";

export interface ProxySource {
  id: string;
  label: string;
  url: string;
}

export const PROXY_SOURCES: ProxySource[] = [
  {
    id: "proxyscrape",
    label: "ProxyScrape",
    url: "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text",
  },
  {
    id: "proxifly",
    label: "Proxifly",
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt",
  },
];

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(
      url,
      { headers: { "User-Agent": "SideRail/1.0" }, timeout: 20000 },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status !== 200) {
          req.destroy();
          reject(new Error(`source returned HTTP ${status}`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", (e) => reject(new Error(`source request failed: ${e.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("source request timed out"));
    });
  });
}

/**
 * Parse a single source line into a proxy entry.
 * Accepts `socks4://ip:port`, `socks5://ip:port`, `http://ip:port`,
 * `socks4:ip:port`, or a bare `ip:port` (assumed HTTP).
 */
export function parseProxyLine(line: string): Omit<ProxyItem, "country" | "ms"> | null {
  const s = (line || "").trim();
  if (!s) return null;
  const m = s.match(
    /^(?:([a-z0-9]+):\/\/|([a-z0-9]+):)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{2,5})$/i,
  );
  if (!m) return null;
  const ip = `${m[3]}.${m[4]}.${m[5]}.${m[6]}`;
  const port = Number(m[7]);
  if (port < 1 || port > 65535) return null;
  if (!ip.split(".").every((o) => Number(o) <= 255)) return null;
  let type = (m[1] || m[2] || "http").toLowerCase();
  if (type === "socks") type = "socks5";
  if (!["socks4", "socks5", "http"].includes(type)) type = "http";
  return { ip, port, type: type as ProxyType };
}

/** Parse the whole body of a list source, de-duplicated, capped at `max`. */
export function parseProxyList(body: string, max = 200): ProxyItem[] {
  const seen = new Set<string>();
  const items: ProxyItem[] = [];
  for (const line of body.split(/\r?\n/)) {
    const p = parseProxyLine(line);
    if (!p) continue;
    const key = `${p.ip}:${p.port}:${p.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ ...p });
    if (items.length >= max) break;
  }
  return items;
}

const geoCache = new Map<string, string>();
let geoInflight: Promise<void> | null = null;

/**
 * Resolve ISO country codes for IPs using ip-api.com batch endpoint
 * (100 IPs per request, free tier). Results are cached in-memory.
 */
export async function resolveCountries(ips: string[], batchSize = 100): Promise<Map<string, string>> {
  const unique = [...new Set(ips.filter((ip) => !geoCache.has(ip)))];
  if (unique.length === 0) return new Map(geoCache);

  const resolve = async (): Promise<void> => {
    for (let i = 0; i < unique.length; i += batchSize) {
      const chunk = unique.slice(i, i + batchSize);
      try {
        const codes = await new Promise<Record<string, string>>((resolveChunk) => {
          const body = JSON.stringify(chunk);
          const req = http.request(
            {
              hostname: "ip-api.com",
              path: "/batch",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              },
              timeout: 15000,
            },
            (res) => {
              let data = "";
              res.on("data", (c) => (data += c));
              res.on("end", () => {
                try {
                  const arr = JSON.parse(data) as {
                    status?: string;
                    query?: string;
                    countryCode?: string;
                  }[];
                  const map: Record<string, string> = {};
                  if (Array.isArray(arr)) {
                    for (const r of arr) {
                      if (r?.status === "success" && r.query && r.countryCode) {
                        map[r.query] = r.countryCode;
                      }
                    }
                  }
                  resolveChunk(map);
                } catch {
                  resolveChunk({});
                }
              });
            },
          );
          req.on("error", () => resolveChunk({}));
          req.on("timeout", () => {
            req.destroy();
            resolveChunk({});
          });
          req.write(body);
          req.end();
        });
        for (const [ip, cc] of Object.entries(codes)) geoCache.set(ip, cc);
      } catch {
        /* keep going with the next chunk */
      }
    }
  };

  if (geoInflight) await geoInflight;
  geoInflight = resolve();
  try {
    await geoInflight;
  } finally {
    geoInflight = null;
  }
  return new Map(geoCache);
}

/** Scan a built-in source and return geo-located proxy entries. */
export async function scanProxies(sourceId: string, max = 200): Promise<ProxyItem[]> {
  const src = PROXY_SOURCES.find((s) => s.id === sourceId);
  if (!src) return [];
  const body = await fetchText(src.url);
  const items = parseProxyList(body, max);
  const codes = await resolveCountries(items.map((i) => i.ip));
  for (const it of items) {
    const cc = codes.get(it.ip);
    if (cc) it.country = cc;
  }
  return items;
}

/** Geo-locate a single manual proxy entry. */
export async function geocodeProxy(item: ProxyItem): Promise<ProxyItem> {
  const codes = await resolveCountries([item.ip]);
  const cc = codes.get(item.ip);
  return { ...item, country: cc || "" };
}

/** Latency test: raw TCP connect to ip:port, resolves with elapsed ms. */
export function testProxy(ip: string, port: number, timeout = 4000): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = net.connect({ host: ip, port });
    sock.setTimeout(timeout);
    sock.once("connect", () => {
      sock.destroy();
      resolve({ ok: true, ms: Date.now() - start });
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve({ ok: false, ms: 0 });
    });
    sock.once("error", () => {
      sock.destroy();
      resolve({ ok: false, ms: 0 });
    });
  });
}
