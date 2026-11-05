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
import "dotenv/config";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { seedInbounds, normalizeInboundProxyState } from "./inbounds.js";
import { seedDefaultClient } from "./users.js";
import { seedDefaultRouting } from "./routing.js";
import { api } from "./routes.js";
import { sub, setSubStaticRoot } from "./sub.js";
import { attachTunnel, tryTunnelHttp } from "./tunnel.js";
import { startCore, collectTraffic, collectClientIps, enforceIpLimits, restartCore } from "./core.js";
import { applyTrafficReset } from "./users.js";
import { enforceAdminExpiry } from "./auth.js";
import { rateLimit } from "./ratelimit.js";
import { sendDailyBackup } from "./bot.js";
import { refreshIpInfo } from "./ipinfo.js";
import { SIDERAIL_SIGNATURE, watermark } from "./brand.js";

console.log(SIDERAIL_SIGNATURE);

migrate();
seedInbounds();
normalizeInboundProxyState();
seedDefaultClient();
seedDefaultRouting();
enforceAdminExpiry();

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Powered-By", "SideRail by icubaby");
  res.setHeader("X-SideRail-Author", "icubaby");
  res.setHeader("X-SideRail-Repo", "https://github.com/icubaby/SideRail");
  next();
});
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

app.set("trust proxy", true);
app.get("/healthz", (_req, res) => res.json({ ok: true, ...watermark() }));

app.use("/api", rateLimit, api);
app.use("/sub", sub);

const staticCandidates = [
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "apps", "web", "dist"),
];
const staticDir = staticCandidates.find((p) => fs.existsSync(p)) || staticCandidates[0];

if (fs.existsSync(staticDir)) {
  setSubStaticRoot(staticDir);
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/sub")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const server = http.createServer((req, res) => {
  // XHTTP inbound paths live under /api/... as plain HTTP requests, so the
  // tunnel must get first look before /api is handed to the Express app.
  if (tryTunnelHttp(req, res)) return;
  if ((req.url || "").startsWith("/api") || (req.url || "").startsWith("/sub")) {
    app(req, res);
    return;
  }
  app(req, res);
});

attachTunnel(server);

server.listen(config.port, config.host, async () => {
  console.log(`SideRail listening on http://${config.host}:${config.port}`);
  await startCore();
  void refreshIpInfo();
});

setInterval(() => {
  try {
    collectTraffic();
  } catch {
    /* noop */
  }
}, 10_000);

setInterval(() => {
  try {
    collectClientIps();
  } catch {
    /* noop */
  }
}, 5_000);

setInterval(() => {
  try {
    enforceIpLimits();
  } catch {
    /* noop */
  }
}, 20_000);

setInterval(() => {
  try {
    applyTrafficReset();
  } catch {
    /* noop */
  }
}, 3_600_000);

setInterval(() => {
  try {
    if (enforceAdminExpiry()) restartCore();
  } catch {
    /* noop */
  }
}, 60_000);

let lastBackupDay = new Date().getDate();
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getDate() !== lastBackupDay) {
    lastBackupDay = now.getDate();
    void sendDailyBackup();
  }
}, 60_000);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
