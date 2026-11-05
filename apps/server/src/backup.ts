import { db } from "./db.js";
import type { Inbound, UserRecord } from "./types.js";

interface AdminBackup {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  permissions: string;
  data_limit: number;
  created_at: number;
}

interface BackupPayload {
  version: number;
  exported_at: number;
  users: UserRecord[];
  user_inbounds: { user_id: number; inbound_id: number }[];
  inbounds: Inbound[];
  admins?: AdminBackup[];
  settings?: { key: string; value: string }[];
}

export function exportData(): BackupPayload {
  const users = db.prepare("SELECT * FROM users").all() as unknown as UserRecord[];
  const inbounds = db.prepare("SELECT * FROM inbounds").all() as unknown as Inbound[];
  const links = db.prepare("SELECT user_id, inbound_id FROM user_inbounds").all() as unknown as {
    user_id: number;
    inbound_id: number;
  }[];
  const admins = db.prepare("SELECT * FROM admins").all() as unknown as AdminBackup[];
  const settings = db.prepare("SELECT key, value FROM settings").all() as unknown as {
    key: string;
    value: string;
  }[];
  return {
    version: 2,
    exported_at: Date.now(),
    users,
    inbounds,
    user_inbounds: links,
    admins,
    settings,
  };
}

export function importData(payload: BackupPayload): { users: number; inbounds: number } {
  if (!payload || (payload.version !== 1 && payload.version !== 2))
    throw new Error("invalid backup version");
  const tx = () => {
    db.exec("DELETE FROM user_inbounds; DELETE FROM users; DELETE FROM inbounds;");

    const insInbound = db.prepare(
      `INSERT INTO inbounds (id, tag, protocol, transport, port, path, host, sni, address, proxies, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ib of payload.inbounds) {
      const proxiesRaw = Array.isArray(ib.proxies)
        ? JSON.stringify(ib.proxies)
        : typeof ib.proxies === "string" && ib.proxies
          ? (ib.proxies as string)
          : "[]";
      insInbound.run(
        ib.id,
        ib.tag,
        ib.protocol,
        ib.transport,
        ib.port,
        ib.path,
        ib.host,
        ib.sni ?? "",
        ib.address ?? "",
        proxiesRaw,
        ib.enabled,
        ib.created_at,
      );
    }

    const insUser = db.prepare(
      `INSERT INTO users
        (id, email, uuid, password, sub_token, fingerprint, alpn, fragment, ech_config, data_limit,
         ip_limit, expire_at, sub_expire_days, sub_first_seen, traffic_reset, telegram_id,
         comment, enabled, up, down, last_reset, online_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const u of payload.users) {
      insUser.run(
        u.id,
        u.email,
        u.uuid,
        u.password,
        u.sub_token,
        u.fingerprint,
        u.alpn,
        u.fragment ?? "",
        u.ech_config ?? "",
        u.data_limit,
        u.ip_limit,
        u.expire_at,
        u.sub_expire_days,
        u.sub_first_seen,
        u.traffic_reset,
        u.telegram_id,
        u.comment,
        u.enabled,
        u.up,
        u.down,
        u.last_reset,
        u.online_at,
        u.created_by ?? null,
        u.created_at,
      );
    }

    const insLink = db.prepare(
      "INSERT OR IGNORE INTO user_inbounds (user_id, inbound_id) VALUES (?, ?)",
    );
    for (const l of payload.user_inbounds) insLink.run(l.user_id, l.inbound_id);

    if (payload.admins && payload.admins.length > 0) {
      db.exec("DELETE FROM admins");
      const insAdmin = db.prepare(
        `INSERT INTO admins (id, username, password_hash, role, permissions, data_limit, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const a of payload.admins) {
        insAdmin.run(
          a.id,
          a.username,
          a.password_hash,
          a.role || "admin",
          a.permissions || "[]",
          a.data_limit || 0,
          a.created_at,
        );
      }
    }

    if (payload.settings) {
      const insSetting = db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      for (const s of payload.settings) insSetting.run(s.key, s.value);
    }
  };
  db.exec("BEGIN");
  try {
    tx();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { users: payload.users.length, inbounds: payload.inbounds.length };
}
