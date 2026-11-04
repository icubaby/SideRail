export interface ApiError {
  error: string;
}

/** Fires when any authenticated request comes back 401 so the app can log out. */
export const AUTH_EXPIRED_EVENT = "sr:auth-expired";

let notifiedExpired = false;

function signalAuthExpired(): void {
  if (notifiedExpired) return;
  notifiedExpired = true;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  // allow future signals once the app has had a chance to react
  setTimeout(() => {
    notifiedExpired = false;
  }, 3000);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 401 && !url.includes("/api/login") && !url.includes("/api/status")) {
      signalAuthExpired();
    }
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiError;
      message = body.error || message;
    } catch {
      /* noop */
    }
    throw new Error(message);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  status: () => request<{ setup: boolean; name: string }>("/api/status"),
  setup: (username: string, password: string) =>
    request<{ ok: boolean }>("/api/setup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ ok: boolean }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  me: () => request<{ admin: import("./types").AdminInfo }>("/api/me"),
  system: () => request<import("./types").SystemStats>("/api/system"),
  inbounds: () => request<import("./types").Inbound[]>("/api/inbounds"),
  toggleInbound: (id: number, enabled: boolean) =>
    request(`/api/inbounds/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  updateInbound: (
    id: number,
    patch: {
      enabled?: boolean;
      address?: string;
      host?: string;
      sni?: string;
      proxies?: import("./types").ProxyItem[];
    },
  ) =>
    request(`/api/inbounds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  proxySources: () =>
    request<{ sources: { id: string; label: string }[] }>("/api/proxies/sources"),
  proxyScan: (source: string) =>
    request<{ proxies: import("./types").ProxyItem[] }>("/api/proxies/scan", {
      method: "POST",
      body: JSON.stringify({ source }),
    }),
  proxyTest: (ip: string, port: number) =>
    request<{ ok: boolean; ms: number }>("/api/proxies/test", {
      method: "POST",
      body: JSON.stringify({ ip, port }),
    }),
  proxyCheck: (ip: string, port: number, type: import("./types").ProxyType) =>
    request<{ ok: boolean; item: import("./types").ProxyItem }>("/api/proxies/check", {
      method: "POST",
      body: JSON.stringify({ ip, port, type }),
    }),
  users: () =>
    request<{ users: import("./types").User[]; summary: import("./types").UserSummary }>(
      "/api/users",
    ),
  createUser: (payload: import("./types").UserFormValues) =>
    request<import("./types").User>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (id: number, payload: Partial<import("./types").UserFormValues>) =>
    request<import("./types").User>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: number) => request(`/api/users/${id}`, { method: "DELETE" }),
  toggleUser: (id: number, enabled: boolean) =>
    request(`/api/users/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  resetTraffic: (id: number) =>
    request(`/api/users/${id}/reset-traffic`, { method: "POST" }),
  rotateToken: (id: number) =>
    request<import("./types").User>(`/api/users/${id}/rotate-token`, { method: "POST" }),
  clientIps: (id: number) =>
    request<{ ip: string; last_seen: number }[]>(`/api/users/${id}/ips`),
  activity: () => request<import("./types").ActivityEntry[]>("/api/activity"),
  clearActivity: () => request("/api/activity", { method: "DELETE" }),
  settings: () => request<{ subTitle: string }>("/api/settings"),
  updateSettings: (payload: { subTitle?: string }) =>
    request("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
  changeCredentials: (payload: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }) =>
    request("/api/settings/credentials", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  importBackup: (data: unknown) =>
    request("/api/backup/import", { method: "POST", body: JSON.stringify(data) }),
  restartXray: () => request("/api/system/restart-xray", { method: "POST" }),
  admins: () =>
    request<{ admins: import("./types").AdminInfo[]; permissions: string[] }>("/api/admins"),
  createAdmin: (payload: {
    username: string;
    password: string;
    permissions: string[];
    dataLimit: number;
    expireDays?: number;
    comment?: string;
  }) => request("/api/admins", { method: "POST", body: JSON.stringify(payload) }),
  updateAdmin: (
    id: number,
    payload: {
      permissions?: string[];
      dataLimit?: number;
      password?: string;
      expireDays?: number;
      comment?: string;
    },
  ) => request(`/api/admins/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAdmin: (id: number) => request(`/api/admins/${id}`, { method: "DELETE" }),
  trafficStats: () =>
    request<{
      server: { ts: number; up: number; down: number }[];
      inbounds: { inbound_tag: string; up: number; down: number }[];
    }>("/api/stats/traffic"),
  routing: () => request<import("./types").RoutingRule[]>("/api/routing"),
  routingPresets: () =>
    request<{
      domains: import("./types").RoutingPreset[];
      ips: import("./types").RoutingPreset[];
    }>("/api/routing/presets"),
  addRouting: (
    domain: string,
    inboundIds: number[],
    kind: "domain" | "ip" = "domain",
    label?: string,
  ) =>
    request<import("./types").RoutingRule>("/api/routing", {
      method: "POST",
      body: JSON.stringify({ domain, inboundIds, kind, label }),
    }),
  updateRouting: (id: number, inboundIds: number[]) =>
    request(`/api/routing/${id}`, { method: "PUT", body: JSON.stringify({ inboundIds }) }),
  deleteRouting: (id: number) => request(`/api/routing/${id}`, { method: "DELETE" }),
  getBot: () => request<import("./types").BotConfig>("/api/bot"),
  saveBot: (payload: Partial<import("./types").BotConfig>) =>
    request("/api/bot", { method: "PUT", body: JSON.stringify(payload) }),
  testBot: (token: string, chatIds: string[]) =>
    request("/api/bot/test", { method: "POST", body: JSON.stringify({ token, chatIds }) }),
};

export function exportBackupUrl(): string {
  return "/api/backup/export";
}
