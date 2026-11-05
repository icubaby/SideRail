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
import { Router } from "express";
import { z } from "zod";
import {
  isSetupDone,
  completeSetup,
  verifyCredentials,
  signToken,
  authGuard,
  changeCredentials,
  requirePermission,
  requireOwner,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  listAdminsWithStats,
  isAdminExpired,
  ALL_PERMISSIONS,
  type Permission,
  type AuthedRequest,
} from "./auth.js";
import { db, getSetting, setSetting } from "./db.js";
import { getSystemStats } from "./system.js";
import { listInbounds, updateInbound, getInbound } from "./inbounds.js";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserEnabled,
  resetUserTraffic,
  rotateSubToken,
  getUser,
  summarize,
} from "./users.js";
import { getClientIps, restartCore, getServerTraffic, getInboundTraffic } from "./core.js";
import { listActivity, logActivity, clearActivity } from "./activity.js";
import { exportData, importData } from "./backup.js";
import { loginRateLimit } from "./ratelimit.js";
import {
  listRoutingRules,
  addRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from "./routing.js";
import { DOMAIN_PRESETS, COUNTRY_IP_PRESETS } from "./routing-presets.js";
import { getBotConfig, saveBotConfig, testBot } from "./bot.js";
import { PROXY_SOURCES, scanProxies, testProxy, geocodeProxy } from "./feeds.js";
import type { ProxyItem } from "./types.js";

export const api = Router();

const trafficReset = z.enum(["never", "daily", "weekly", "monthly"]);
const permissionEnum = z.enum([
  "dashboard",
  "users",
  "inbounds",
  "routing",
  "activity",
  "bot",
  "settings",
]);

const userSchema = z.object({
  email: z.string().min(1),
  uuid: z.string().optional(),
  password: z.string().optional(),
  fingerprint: z.string().optional(),
  alpn: z.string().optional(),
  fragment: z.string().optional(),
  echConfig: z.string().optional(),
  dataLimit: z.number().min(0).optional(),
  ipLimit: z.number().min(0).optional(),
  expireDays: z.number().min(0).optional(),
  subExpireDays: z.number().min(0).optional(),
  trafficReset: trafficReset.optional(),
  telegramId: z.string().optional(),
  comment: z.string().optional(),
  inboundIds: z.array(z.number()).optional(),
});

const updateSchema = userSchema.partial().extend({ enabled: z.boolean().optional() });

function setAuthCookie(res: import("express").Response, token: string): void {
  res.cookie("sr_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 86_400_000,
  });
}

api.get("/status", (_req, res) => {
  res.json({ setup: isSetupDone(), name: "SideRail" });
});

api.post("/setup", (req, res) => {
  if (isSetupDone()) {
    res.status(400).json({ error: "already set up" });
    return;
  }
  const body = z
    .object({ username: z.string().min(3), password: z.string().min(6) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  completeSetup(body.data.username, body.data.password);
  logActivity(body.data.username, "setup", "panel initialized");
  const admin = verifyCredentials(body.data.username, body.data.password)!;
  const token = signToken(admin);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});

api.post("/login", loginRateLimit, (req, res) => {
  const body = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const admin = verifyCredentials(body.data.username, body.data.password);
  if (!admin) {
    logActivity(body.data.username, "login_failed", "");
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  if (isAdminExpired(admin)) {
    logActivity(admin.username, "login_failed", "expired");
    res.status(403).json({ error: "account expired" });
    return;
  }
  const token = signToken(admin);
  setAuthCookie(res, token);
  logActivity(admin.username, "login", "");
  res.json({ ok: true, token });
});

api.post("/logout", (_req, res) => {
  res.clearCookie("sr_token");
  res.json({ ok: true });
});

api.use(authGuard);

api.get("/me", (req: AuthedRequest, res) => {
  res.json({ admin: req.admin });
});

api.get("/system", requirePermission("dashboard"), (_req, res) => {
  res.json(getSystemStats());
});

api.post("/system/restart-xray", requirePermission("dashboard"), (req: AuthedRequest, res) => {
  restartCore();
  logActivity(req.admin!.username, "core_restart", "");
  res.json({ ok: true });
});

api.get("/inbounds", (_req, res) => {
  res.json(listInbounds());
});

api.patch("/inbounds/:id", requirePermission("inbounds"), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const proxyItem = z.object({
    ip: z.string().min(1).max(45),
    port: z.number().int().min(1).max(65535),
    type: z.enum(["socks4", "socks5", "http"]),
    country: z.string().max(10).optional(),
    ms: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  });
  const body = z
    .object({
      enabled: z.boolean().optional(),
      address: z.string().max(255).optional(),
      host: z.string().max(255).optional(),
      sni: z.string().max(255).optional(),
      proxies: z.array(proxyItem).optional(),
    })
    .refine(
      (b) =>
        b.enabled !== undefined ||
        b.address !== undefined ||
        b.host !== undefined ||
        b.sni !== undefined ||
        b.proxies !== undefined,
      { message: "nothing to update" },
    )
    .safeParse(req.body);
  if (!body.success || !getInbound(id)) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  const data = body.data;
  const edited = data.address !== undefined || data.host !== undefined || data.sni !== undefined || data.proxies !== undefined;
  updateInbound(id, data);
  if (edited) {
    const detail = [
      data.address !== undefined ? `address=${data.address.trim() || "(auto)"}` : "",
      data.host !== undefined ? `host=${data.host.trim() || "(auto)"}` : "",
      data.sni !== undefined ? `sni=${data.sni.trim() || "(auto)"}` : "",
      data.proxies !== undefined ? `proxies=${(data.proxies as ProxyItem[]).length}` : "",
      data.enabled !== undefined ? `enabled=${data.enabled}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    logActivity(req.admin!.username, edited ? "inbound_edit" : "inbound_toggle", `#${id} ${detail}`);
  }
  restartCore();
  res.json({ ok: true });
});

api.get("/proxies/sources", requirePermission("inbounds"), (_req, res) => {
  res.json({ sources: PROXY_SOURCES.map((s) => ({ id: s.id, label: s.label })) });
});

api.post("/proxies/scan", requirePermission("inbounds"), async (req: AuthedRequest, res) => {
  const body = z.object({ source: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  if (!PROXY_SOURCES.some((s) => s.id === body.data.source)) {
    res.status(400).json({ error: "unknown source" });
    return;
  }
  try {
    const proxies = await scanProxies(body.data.source);
    logActivity(req.admin!.username, "proxy_scan", `${body.data.source} (${proxies.length})`);
    res.json({ proxies });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

api.post("/proxies/test", requirePermission("inbounds"), async (req: AuthedRequest, res) => {
  const body = z
    .object({
      ip: z.string().min(1).max(45),
      port: z.number().int().min(1).max(65535),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = await testProxy(body.data.ip, body.data.port);
  res.json(result);
});

api.post("/proxies/check", requirePermission("inbounds"), async (req: AuthedRequest, res) => {
  const body = z
    .object({
      ip: z.string().min(1).max(45),
      port: z.number().int().min(1).max(65535),
      type: z.enum(["socks4", "socks5", "http"]),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  try {
    const item = await geocodeProxy(body.data);
    res.json({ ok: true, item });
  } catch {
    // Geolocation is best-effort; still accept the manual proxy without a country.
    res.json({ ok: true, item: body.data });
  }
});

function scopeFor(req: AuthedRequest): number | undefined {
  return req.admin!.role === "owner" ? undefined : req.admin!.id;
}

function canAccessUser(req: AuthedRequest, userId: number): boolean {
  if (req.admin!.role === "owner") return true;
  const user = getUser(userId);
  return !!user && user.created_by === req.admin!.id;
}

function quotaExceeded(req: AuthedRequest): boolean {
  if (req.admin!.role === "owner" || req.admin!.dataLimit <= 0) return false;
  const users = listUsers(req.admin!.id);
  const used = users.reduce((sum, u) => sum + u.total, 0);
  return used >= req.admin!.dataLimit;
}

api.get("/users", requirePermission("users"), (req: AuthedRequest, res) => {
  const users = listUsers(scopeFor(req));
  res.json({ users, summary: summarize(users) });
});

api.get("/users/summary", requirePermission("users"), (req: AuthedRequest, res) => {
  res.json(summarize(listUsers(scopeFor(req))));
});

api.get("/users/:id/ips", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json(getClientIps(Number(req.params.id)));
});

api.get("/users/:id", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const user = getUser(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(user);
});

api.post("/users", requirePermission("users"), async (req: AuthedRequest, res) => {
  const body = userSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input", detail: body.error.flatten() });
    return;
  }
  if (quotaExceeded(req)) {
    res.status(403).json({ error: "data quota exceeded" });
    return;
  }
  try {
    const user = createUser({ ...body.data, createdBy: req.admin!.id });
    logActivity(req.admin!.username, "user_create", user.email);
    restartCore();
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.put("/users/:id", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const body = updateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const user = updateUser(Number(req.params.id), body.data);
  if (!user) {
    res.status(404).json({ error: "not found" });
    return;
  }
  logActivity(req.admin!.username, "user_update", user.email);
  restartCore();
  res.json(user);
});

api.delete("/users/:id", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const user = getUser(Number(req.params.id));
  deleteUser(Number(req.params.id));
  logActivity(req.admin!.username, "user_delete", user?.email || String(req.params.id));
  restartCore();
  res.json({ ok: true });
});

api.post("/users/:id/toggle", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  setUserEnabled(Number(req.params.id), body.data.enabled);
  logActivity(req.admin!.username, "user_toggle", `#${req.params.id} -> ${body.data.enabled}`);
  restartCore();
  res.json({ ok: true });
});

api.post("/users/:id/reset-traffic", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  resetUserTraffic(Number(req.params.id));
  logActivity(req.admin!.username, "user_reset_traffic", `#${req.params.id}`);
  res.json({ ok: true });
});

api.post("/users/:id/rotate-token", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  rotateSubToken(Number(req.params.id));
  logActivity(req.admin!.username, "user_rotate_token", `#${req.params.id}`);
  res.json(getUser(Number(req.params.id)));
});

api.get("/activity", requirePermission("activity"), (_req, res) => {
  res.json(listActivity(300));
});

api.delete("/activity", requirePermission("activity"), (req: AuthedRequest, res) => {
  clearActivity();
  logActivity(req.admin!.username, "activity_clear", "");
  res.json({ ok: true });
});

api.get("/settings", requirePermission("settings"), (_req, res) => {
  res.json({
    xrayVersion: getSetting("xray_version") || "",
    subTitle: getSetting("sub_title") || "SideRail",
    location: getSetting("location") || "NL",
  });
});

api.put("/settings", requirePermission("settings"), (req: AuthedRequest, res) => {
  const body = z
    .object({
      subTitle: z.string().optional(),
      location: z.string().regex(/^[A-Za-z]{2}$/, "invalid country code").optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  if (body.data.subTitle !== undefined) setSetting("sub_title", body.data.subTitle);
  if (body.data.location !== undefined) setSetting("location", body.data.location.toUpperCase());
  logActivity(req.admin!.username, "settings_update", "");
  res.json({ ok: true });
});

api.post("/settings/credentials", requirePermission("settings"), (req: AuthedRequest, res) => {
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newUsername: z.string().min(3).optional(),
      newPassword: z.string().min(6).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = changeCredentials(
    req.admin!.id,
    body.data.currentPassword,
    body.data.newUsername,
    body.data.newPassword,
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  // The change bumped this admin's token_version, invalidating every session
  // (including other people logged in as the same user). Re-issue a fresh
  // cookie for the admin who made the change so they stay signed in.
  setAuthCookie(res, signToken({ id: req.admin!.id }));
  logActivity(req.admin!.username, "credentials_change", "");
  res.json({ ok: true });
});

api.get("/admins", requireOwner, (_req, res) => {
  res.json({ admins: listAdminsWithStats(), permissions: ALL_PERMISSIONS });
});

api.post("/admins", requireOwner, (req: AuthedRequest, res) => {
  const body = z
    .object({
      username: z.string().min(3),
      password: z.string().min(6),
      permissions: z.array(permissionEnum),
      dataLimit: z.number().min(0).default(0),
      expireDays: z.number().min(0).default(0),
      comment: z.string().max(200).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = createAdmin(
    body.data.username,
    body.data.password,
    body.data.permissions as Permission[],
    body.data.dataLimit,
    body.data.expireDays,
    body.data.comment ?? "",
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_create", body.data.username);
  res.json({ ok: true });
});

api.put("/admins/:id", requireOwner, (req: AuthedRequest, res) => {
  const body = z
    .object({
      permissions: z.array(permissionEnum).optional(),
      dataLimit: z.number().min(0).optional(),
      password: z.string().min(6).optional(),
      expireDays: z.number().min(0).optional(),
      comment: z.string().max(200).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = updateAdmin(Number(req.params.id), {
    permissions: body.data.permissions as Permission[] | undefined,
    dataLimit: body.data.dataLimit,
    password: body.data.password,
    expireDays: body.data.expireDays,
    comment: body.data.comment,
  });
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_update", `#${req.params.id}`);
  res.json({ ok: true });
});

api.delete("/admins/:id", requireOwner, (req: AuthedRequest, res) => {
  const result = deleteAdmin(Number(req.params.id));
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_delete", `#${req.params.id}`);
  res.json({ ok: true });
});

api.get("/backup/export", requirePermission("dashboard"), (req: AuthedRequest, res) => {
  logActivity(req.admin!.username, "backup_export", "");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="siderail-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(exportData(), null, 2));
});

api.post("/backup/import", requirePermission("dashboard"), async (req: AuthedRequest, res) => {
  try {
    const result = importData(req.body);
    logActivity(
      req.admin!.username,
      "backup_import",
      `${result.users} users, ${result.inbounds} inbounds`,
    );
    restartCore();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.get("/stats/traffic", requirePermission("dashboard"), (_req, res) => {
  res.json({ server: getServerTraffic(), inbounds: getInboundTraffic() });
});

api.get("/routing", requirePermission("routing"), (_req, res) => {
  res.json(listRoutingRules());
});

api.get("/routing/presets", requirePermission("routing"), (_req, res) => {
  res.json({ domains: DOMAIN_PRESETS, ips: COUNTRY_IP_PRESETS });
});

api.post("/routing", requirePermission("routing"), async (req: AuthedRequest, res) => {
  const body = z
    .object({
      domain: z.string().min(1),
      inboundIds: z.array(z.number()).default([]),
      kind: z.enum(["domain", "ip"]).default("domain"),
      label: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const rule = addRoutingRule(
    body.data.domain,
    body.data.inboundIds,
    body.data.kind,
    body.data.label || "",
  );
  logActivity(req.admin!.username, "routing_add", body.data.label || body.data.domain);
  restartCore();
  res.json(rule);
});

api.put("/routing/:id", requirePermission("routing"), async (req: AuthedRequest, res) => {
  const body = z.object({ inboundIds: z.array(z.number()) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  updateRoutingRule(Number(req.params.id), body.data.inboundIds);
  logActivity(req.admin!.username, "routing_update", `#${req.params.id}`);
  restartCore();
  res.json({ ok: true });
});

api.delete("/routing/:id", requirePermission("routing"), async (req: AuthedRequest, res) => {
  deleteRoutingRule(Number(req.params.id));
  logActivity(req.admin!.username, "routing_delete", `#${req.params.id}`);
  restartCore();
  res.json({ ok: true });
});

api.get("/bot", requirePermission("bot"), (_req, res) => {
  const cfg = getBotConfig();
  res.json({ enabled: cfg.enabled, token: cfg.token, chatIds: cfg.chatIds, dailyBackup: cfg.dailyBackup });
});

api.put("/bot", requirePermission("bot"), (req: AuthedRequest, res) => {
  const body = z
    .object({
      enabled: z.boolean().optional(),
      token: z.string().optional(),
      chatIds: z.array(z.string()).optional(),
      dailyBackup: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  saveBotConfig(body.data);
  logActivity(req.admin!.username, "bot_update", "");
  res.json({ ok: true });
});

api.post("/bot/test", requirePermission("bot"), async (req: AuthedRequest, res) => {
  const body = z
    .object({ token: z.string().min(1), chatIds: z.array(z.string()).min(1) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "token and at least one chat id are required" });
    return;
  }
  const result = await testBot(body.data.token, body.data.chatIds);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "bot_test", "");
  res.json({ ok: true });
});

void db;
