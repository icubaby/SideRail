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
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { config } from "./config.js";
import { buildCoreConfig } from "./core-settings.js";
import { db } from "./db.js";
import { realIpForPort } from "./tunnel.js";

let proc: ChildProcess | null = null;
let running = false;

function binName(): string {
  return config.platform === "win32" ? "xray.exe" : "xray";
}

function binPath(): string {
  return path.join(config.coreDir, binName());
}

function assetName(): string {
  const arch = config.arch;
  if (config.platform === "linux") {
    if (arch === "arm64") return "Xray-linux-arm64-v8a.zip";
    return "Xray-linux-64.zip";
  }
  if (config.platform === "darwin") {
    return arch === "arm64" ? "Xray-macos-arm64-v8a.zip" : "Xray-macos-64.zip";
  }
  return "Xray-windows-64.zip";
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = https.get(url, { headers: { "User-Agent": "SideRail" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`download failed ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", reject);
  });
}

function unzip(zip: string, dir: string): void {
  if (config.platform === "win32") {
    spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`],
      { stdio: "ignore" },
    );
  } else {
    spawnSync("unzip", ["-o", zip, "-d", dir], { stdio: "ignore" });
  }
}

export async function ensureBinary(): Promise<boolean> {
  if (fs.existsSync(binPath())) return true;
  try {
    const version = config.coreVersion;
    const url = `https://github.com/XTLS/Xray-core/releases/download/${version}/${assetName()}`;
    const tmpZip = path.join(os.tmpdir(), `core-${Date.now()}.zip`);
    await download(url, tmpZip);
    unzip(tmpZip, config.coreDir);
    fs.rmSync(tmpZip, { force: true });
    if (config.platform !== "win32" && fs.existsSync(binPath())) {
      fs.chmodSync(binPath(), 0o755);
    }
    return fs.existsSync(binPath());
  } catch {
    return false;
  }
}

function writeConfig(): string {
  const cfg = buildCoreConfig();
  const file = path.join(config.coreDir, "config.json");
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}

let coreStartedAt = 0;
let restartTimer: NodeJS.Timeout | null = null;

export function coreUptime(): number {
  return running && coreStartedAt ? Math.floor((Date.now() - coreStartedAt) / 1000) : 0;
}

interface ManagedChild extends ChildProcess {
  /** Set when the process is intentionally stopped (manual stop / planned restart). */
  __stopped?: boolean;
}

/**
 * Automatically restarts the core after an unexpected crash.
 * A short cooldown prevents restarting in a tight loop while still retrying.
 */
function scheduleAutoRestart(): void {
  if (restartTimer) return; // a restart is already pending
  restartTimer = setTimeout(() => {
    restartTimer = null;
    // flush pending traffic counters before the process is replaced
    try {
      collectTraffic();
    } catch {
      /* noop */
    }
    void startCore();
  }, 3_000);
}

export async function startCore(): Promise<void> {
  const ok = await ensureBinary();
  if (!ok) {
    running = false;
    return;
  }
  const cfgFile = writeConfig();
  stopCore();
  const child = spawn(binPath(), ["run", "-config", cfgFile], {
    cwd: config.coreDir,
    stdio: "ignore",
  }) as ManagedChild;
  proc = child;
  running = true;
  coreStartedAt = Date.now();
  child.__stopped = false;
  child.on("exit", (code, signal) => {
    // A newer startCore/restartCore replaced us → this exit is intentional.
    if (proc !== child) return;
    proc = null;
    running = false;
    if (child.__stopped) return; // intentional stop (stopCore / planned restart)
    console.warn(
      `[core] xray exited unexpectedly (code=${code}, signal=${signal ?? "none"}) — auto-restarting`,
    );
    scheduleAutoRestart();
  });
}

export function stopCore(): void {
  if (proc) {
    (proc as ManagedChild).__stopped = true;
    try {
      proc.kill();
    } catch {
      /* noop */
    }
    proc = null;
  }
  running = false;
}

export function restartCore(): void {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    // flush pending traffic counters before the process is replaced
    try {
      collectTraffic();
    } catch {
      /* noop */
    }
    void startCore();
  }, 800);
}

export function isRunning(): boolean {
  return running && proc != null && proc.exitCode == null && !proc.killed;
}

export function coreVersion(): string {
  return config.coreVersion;
}

interface StatStub {
  name: string;
  // The core omits `value` from its statsquery JSON when the counter is 0.
  value?: number;
}

function queryStats(): StatStub[] {
  if (!fs.existsSync(binPath()) || !running) return [];
  const res = spawnSync(
    binPath(),
    ["api", "statsquery", `--server=127.0.0.1:${config.coreApiPort}`, "-reset"],
    { encoding: "utf8", timeout: 5000 },
  );
  if (res.status !== 0 || !res.stdout) return [];
  try {
    const parsed = JSON.parse(res.stdout) as { stat?: StatStub[] };
    return parsed.stat || [];
  } catch {
    return [];
  }
}

export function collectTraffic(): void {
  const stats = queryStats();
  const now = Date.now();
  let serverUp = 0;
  let serverDown = 0;
  try {
    if (stats.length > 0) {
      const updateUp = db.prepare("UPDATE users SET up = up + ?, online_at = ? WHERE email = ?");
      const updateDown = db.prepare("UPDATE users SET down = down + ?, online_at = ? WHERE email = ?");
      const inbUp = db.prepare(
        "INSERT INTO inbound_traffic (inbound_tag, up, down) VALUES (?, ?, 0) ON CONFLICT(inbound_tag) DO UPDATE SET up = up + excluded.up",
      );
      const inbDown = db.prepare(
        "INSERT INTO inbound_traffic (inbound_tag, up, down) VALUES (?, 0, ?) ON CONFLICT(inbound_tag) DO UPDATE SET down = down + excluded.down",
      );
      for (const s of stats) {
        // `value` may be undefined (the core drops 0 counters from its JSON) and
        // `undefined <= 0` is false in JS, so guard explicitly with `> 0`.
        const value = typeof s.value === "number" && s.value > 0 ? s.value : 0;
        if (value === 0) continue;
        const um = s.name.match(/^user>>>(.+)>>>traffic>>>(uplink|downlink)$/);
        if (um) {
          const email = um[1];
          if (um[2] === "uplink") updateUp.run(value, now, email);
          else updateDown.run(value, now, email);
          continue;
        }
        const im = s.name.match(/^inbound>>>(.+)>>>traffic>>>(uplink|downlink)$/);
        if (im) {
          const tag = im[1];
          if (tag === "api") continue;
          if (im[2] === "uplink") {
            inbUp.run(tag, value);
            serverUp += value;
          } else {
            inbDown.run(tag, value);
            serverDown += value;
          }
        }
      }
    }
  } finally {
    // Always persist the samples, even if one stat entry fails to apply.
    recordServerTraffic(now, serverUp, serverDown);
    recordUsageHistory(now);
  }
}

function recordServerTraffic(now: number, up: number, down: number): void {
  db.prepare("INSERT OR REPLACE INTO server_traffic (ts, up, down) VALUES (?, ?, ?)").run(
    now,
    up,
    down,
  );
  db.prepare("DELETE FROM server_traffic WHERE ts < ?").run(now - 3_600_000);
}

function recordUsageHistory(now: number): void {
  const users = db.prepare("SELECT id, up, down FROM users").all() as {
    id: number;
    up: number;
    down: number;
  }[];
  const insert = db.prepare(
    "INSERT INTO usage_history (user_id, ts, total, up, down) VALUES (?, ?, ?, ?, ?)",
  );
  for (const u of users) insert.run(u.id, now, u.up + u.down, u.up, u.down);
  db.prepare("DELETE FROM usage_history WHERE ts < ?").run(now - 24 * 3_600_000);
}

let logOffset = 0;

export function collectClientIps(): void {
  const logFile = config.coreAccessLog;
  if (!fs.existsSync(logFile)) return;
  let size = 0;
  try {
    size = fs.statSync(logFile).size;
  } catch {
    return;
  }
  if (size < logOffset) logOffset = 0;
  if (size === logOffset) return;
  let chunk = "";
  try {
    const fd = fs.openSync(logFile, "r");
    const buf = Buffer.alloc(size - logOffset);
    fs.readSync(fd, buf, 0, buf.length, logOffset);
    fs.closeSync(fd);
    chunk = buf.toString("utf8");
    logOffset = size;
  } catch {
    return;
  }
  const now = Date.now();
  const emailToId = new Map<string, number>();
  const rows = db.prepare("SELECT id, email FROM users").all() as { id: number; email: string }[];
  for (const r of rows) emailToId.set(r.email, r.id);
  const upsert = db.prepare(
    "INSERT INTO client_ips (user_id, ip, last_seen) VALUES (?, ?, ?) ON CONFLICT(user_id, ip) DO UPDATE SET last_seen = excluded.last_seen",
  );
  const markOnline = db.prepare("UPDATE users SET online_at = ? WHERE id = ?");
  for (const line of chunk.split("\n")) {
    const ipMatch = line.match(/from (?:tcp:|udp:)?\[?([0-9a-fA-F:.]+)\]?:(\d+)/);
    const emailMatch = line.match(/email:\s*(\S+)/);
    if (!emailMatch) continue;
    const uid = emailToId.get(emailMatch[1]);
    if (!uid) continue;
    markOnline.run(now, uid);
    if (!ipMatch) continue;
    let ip = ipMatch[1];
    if (ip === "127.0.0.1" || ip === "::1") {
      const port = Number(ipMatch[2]);
      const real = realIpForPort(port);
      if (real) ip = real;
      else continue;
    }
    upsert.run(uid, ip, now);
  }
  db.prepare("DELETE FROM client_ips WHERE last_seen < ?").run(now - 5 * 60_000);
  if (size > 5_000_000) {
    try {
      fs.writeFileSync(logFile, "");
      logOffset = 0;
    } catch {
      /* noop */
    }
  }
}

export function getClientIps(userId: number): { ip: string; last_seen: number }[] {
  return db
    .prepare(
      "SELECT ip, last_seen FROM client_ips WHERE user_id = ? AND last_seen > ? ORDER BY last_seen DESC",
    )
    .all(userId, Date.now() - 5 * 60_000) as { ip: string; last_seen: number }[];
}

export function enforceIpLimits(): void {
  const now = Date.now();
  const users = db
    .prepare("SELECT id, ip_limit FROM users WHERE ip_limit > 0 AND enabled = 1")
    .all() as { id: number; ip_limit: number }[];
  for (const u of users) {
    const ips = db
      .prepare(
        "SELECT ip, last_seen FROM client_ips WHERE user_id = ? AND last_seen > ? ORDER BY last_seen DESC",
      )
      .all(u.id, now - 120_000) as { ip: string; last_seen: number }[];
    if (ips.length > u.ip_limit) {
      const excess = ips.slice(u.ip_limit);
      const del = db.prepare("DELETE FROM client_ips WHERE user_id = ? AND ip = ?");
      for (const e of excess) del.run(u.id, e.ip);
    }
  }
}

export function getServerTraffic(): { ts: number; up: number; down: number }[] {
  return db
    .prepare("SELECT ts, up, down FROM server_traffic ORDER BY ts ASC")
    .all() as { ts: number; up: number; down: number }[];
}

export function getInboundTraffic(): { inbound_tag: string; up: number; down: number }[] {
  return db
    .prepare("SELECT inbound_tag, up, down FROM inbound_traffic ORDER BY (up + down) DESC")
    .all() as { inbound_tag: string; up: number; down: number }[];
}
