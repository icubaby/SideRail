import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import { config } from "./config.js";

export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      permissions TEXT NOT NULL DEFAULT '[]',
      data_limit INTEGER NOT NULL DEFAULT 0,
      expire_at INTEGER,
      comment TEXT NOT NULL DEFAULT '',
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT UNIQUE NOT NULL,
      protocol TEXT NOT NULL,
      transport TEXT NOT NULL,
      port INTEGER NOT NULL,
      path TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      sni TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      proxies TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      uuid TEXT NOT NULL,
      password TEXT NOT NULL,
      sub_token TEXT UNIQUE NOT NULL,
      fingerprint TEXT NOT NULL DEFAULT 'chrome',
      alpn TEXT NOT NULL DEFAULT 'h2,http/1.1',
      fragment TEXT NOT NULL DEFAULT '',
      ech_config TEXT NOT NULL DEFAULT '',
      data_limit INTEGER NOT NULL DEFAULT 0,
      ip_limit INTEGER NOT NULL DEFAULT 0,
      expire_at INTEGER,
      sub_expire_days INTEGER NOT NULL DEFAULT 0,
      sub_first_seen INTEGER,
      traffic_reset TEXT NOT NULL DEFAULT 'never',
      telegram_id TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      up INTEGER NOT NULL DEFAULT 0,
      down INTEGER NOT NULL DEFAULT 0,
      last_reset INTEGER NOT NULL DEFAULT 0,
      online_at INTEGER,
      created_by INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_inbounds (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inbound_id INTEGER NOT NULL REFERENCES inbounds(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, inbound_id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS usage_history (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      total INTEGER NOT NULL,
      up INTEGER NOT NULL DEFAULT 0,
      down INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS client_ips (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (user_id, ip)
    );

    CREATE TABLE IF NOT EXISTS routing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      inbound_ids TEXT NOT NULL DEFAULT '[]',
      kind TEXT NOT NULL DEFAULT 'domain',
      label TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_traffic (
      ts INTEGER PRIMARY KEY,
      up INTEGER NOT NULL,
      down INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbound_traffic (
      inbound_tag TEXT PRIMARY KEY,
      up INTEGER NOT NULL DEFAULT 0,
      down INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_users_token ON users(sub_token);
    CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage_history(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_server_traffic_ts ON server_traffic(ts DESC);
  `);
  migrateColumns();
}

function migrateColumns(): void {
  const cols = db.prepare("PRAGMA table_info(admins)").all() as { name: string }[];
  const names = cols.map((c) => c.name);
  const hadRole = names.includes("role");
  if (!hadRole) db.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  if (!names.includes("permissions"))
    db.exec("ALTER TABLE admins ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'");
  if (!names.includes("data_limit"))
    db.exec("ALTER TABLE admins ADD COLUMN data_limit INTEGER NOT NULL DEFAULT 0");
  if (!names.includes("token_version"))
    db.exec("ALTER TABLE admins ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
  if (!names.includes("expire_at")) db.exec("ALTER TABLE admins ADD COLUMN expire_at INTEGER");
  if (!names.includes("comment")) db.exec("ALTER TABLE admins ADD COLUMN comment TEXT NOT NULL DEFAULT ''");

  const inbCols = db.prepare("PRAGMA table_info(inbounds)").all() as { name: string }[];
  const inbNames = inbCols.map((c) => c.name);
  if (!inbNames.includes("address")) {
    db.exec("ALTER TABLE inbounds ADD COLUMN address TEXT NOT NULL DEFAULT ''");
  }
  if (!inbNames.includes("sni")) {
    db.exec("ALTER TABLE inbounds ADD COLUMN sni TEXT NOT NULL DEFAULT ''");
  }
  if (!inbNames.includes("proxies")) {
    db.exec("ALTER TABLE inbounds ADD COLUMN proxies TEXT NOT NULL DEFAULT '[]'");
  }

  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const unames = userCols.map((c) => c.name);
  if (!unames.includes("created_by")) {
    db.exec("ALTER TABLE users ADD COLUMN created_by INTEGER");
  }
  if (!unames.includes("fragment")) {
    db.exec("ALTER TABLE users ADD COLUMN fragment TEXT NOT NULL DEFAULT ''");
  }
  if (!unames.includes("ech_config")) {
    db.exec("ALTER TABLE users ADD COLUMN ech_config TEXT NOT NULL DEFAULT ''");
  }
  db.exec("UPDATE users SET fragment = '' WHERE fragment = '[]'");

  const usageCols = db.prepare("PRAGMA table_info(usage_history)").all() as { name: string }[];
  const uhNames = usageCols.map((c) => c.name);
  if (!uhNames.includes("up"))
    db.exec("ALTER TABLE usage_history ADD COLUMN up INTEGER NOT NULL DEFAULT 0");
  if (!uhNames.includes("down"))
    db.exec("ALTER TABLE usage_history ADD COLUMN down INTEGER NOT NULL DEFAULT 0");

  const routingCols = db.prepare("PRAGMA table_info(routing_rules)").all() as { name: string }[];
  const rNames = routingCols.map((c) => c.name);
  if (!rNames.includes("kind"))
    db.exec("ALTER TABLE routing_rules ADD COLUMN kind TEXT NOT NULL DEFAULT 'domain'");
  if (!rNames.includes("label"))
    db.exec("ALTER TABLE routing_rules ADD COLUMN label TEXT NOT NULL DEFAULT ''");

  // One-time rename of the seeded demo client: sample-user -> Default
  const hasDefaultClient = (
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE email = 'Default'").get() as { c: number }
  ).c;
  if (hasDefaultClient === 0) {
    db.prepare("UPDATE users SET email = 'Default' WHERE email = 'sample-user'").run();
  }

  // Rewrite legacy default inbound paths (/SideRail/...) to fresh random /api/... paths.
  // Hand-written custom paths are left untouched.
  const allPaths = db.prepare("SELECT id, path FROM inbounds").all() as {
    id: number;
    path: string;
  }[];
  const taken = new Set(allPaths.filter((r) => !r.path.startsWith("/SideRail/")).map((r) => r.path));
  const legacy = allPaths.filter((r) => r.path.startsWith("/SideRail/"));
  if (legacy.length > 0) {
    const upd = db.prepare("UPDATE inbounds SET path = ? WHERE id = ?");
    for (const row of legacy) {
      let p = "";
      do {
        p = `/api/${nanoid(6)}`;
      } while (taken.has(p));
      taken.add(p);
      upd.run(p, row.id);
    }
  }

  const ownerCount = (
    db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'owner'").get() as { c: number }
  ).c;  const adminCount = (db.prepare("SELECT COUNT(*) AS c FROM admins").get() as { c: number }).c;
  if (ownerCount === 0 && adminCount > 0) {
    const first = db.prepare("SELECT id FROM admins ORDER BY id ASC LIMIT 1").get() as
      | { id: number }
      | undefined;
    if (first) {
      db.prepare(
        "UPDATE admins SET role = 'owner', permissions = ? WHERE id = ?",
      ).run(JSON.stringify(["dashboard", "users", "inbounds", "activity", "settings"]), first.id);
    }
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
