import https from "node:https";

interface IpInfo {
  ip: string;
  location: string;
  country: string;
  isp: string;
}

let cached: IpInfo | null = null;
let cachedAt = 0;

function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "SideRail" }, timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function refreshIpInfo(): Promise<void> {
  const data = await fetchJson("https://ipinfo.io/json");
  if (!data) return;
  const ip = typeof data.ip === "string" ? data.ip : "";
  const city = typeof data.city === "string" ? data.city : "";
  const country = typeof data.country === "string" ? data.country : "";
  const location = [city, country].filter(Boolean).join(", ");
  // ipinfo.io returns the ISP/ASN in the "org" field, e.g. "AS24940 Hetzner Online GmbH"
  let isp = typeof data.org === "string" ? data.org : "";
  isp = isp.replace(/^AS\d+\s+/, "").trim();
  if (ip) {
    cached = {
      ip,
      location: location || "Unknown",
      country: (country || "").toUpperCase(),
      isp: isp || "Unknown",
    };
    cachedAt = Date.now();
  }
}

export function getIpInfo(): IpInfo {
  if (cached && Date.now() - cachedAt < 6 * 3_600_000) return cached;
  void refreshIpInfo();
  return cached || { ip: "", location: "", country: "", isp: "" };
}

/** ISO alpha-2 country code of the server itself (auto-detected via geo lookup). */
export function getServerCountryCode(): string {
  if (cached && Date.now() - cachedAt < 6 * 3_600_000) return cached.country;
  void refreshIpInfo();
  return cached?.country || "";
}
