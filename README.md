<div align="center">

<img src=".github/banner.svg" width="100%" alt="SideRail" />

<br/>
<br/>

<a href="https://railway.com/new">
  <img src=".github/deploy-button.svg" alt="Deploy on Railway" height="56" />
</a>

<br/>
<br/>

<p>
  <a href="LICENSE"><img src=".github/badges/license.svg" alt="License" height="38" /></a>
  &nbsp;
  <a href="https://github.com/XTLS/Xray-core"><img src=".github/badges/xray.svg" alt="Xray-core" height="38" /></a>
  &nbsp;
  <a href="https://www.typescriptlang.org"><img src=".github/badges/typescript.svg" alt="TypeScript" height="38" /></a>
  &nbsp;
  <a href="https://react.dev"><img src=".github/badges/react.svg" alt="React + Vite" height="38" /></a>
</p>
<p>
  <img src=".github/badges/protocols.svg" alt="Protocols" height="38" />
  &nbsp;
  <img src=".github/badges/transports.svg" alt="Transports" height="38" />
</p>

<br/>
<br/>

**A bold, neobrutalist control panel — shipped to&nbsp;<a href="https://railway.app"><img src=".github/badges/link-railway.svg" alt="Railway" height="22" valign="middle" /></a>&nbsp;in one click.**

*Clean dashboards. Live stats. Gorgeous pages. No setup, no fuss.*

</div>

<br/>

<img src=".github/sections/why.svg" width="380" alt="Why SideRail" />

<table>
<tr>
<td width="50%" valign="top">

**One job, done right**

No feature bloat. SideRail masters **HTTP-based transports behind a TLS edge** — every connection is clean, standard, and always `security=tls` on port `443`.

</td>
<td width="50%" valign="top">

**Impossible to ignore**

A loud **neobrutalist** UI — thick borders, hard shadows, animated icons — that looks razor-sharp on phone and desktop alike.

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Deploy and forget**

The core engine pulls itself on first boot, the session secret is generated for you, the DB just works, and a crashed core restarts itself. **Zero environment variables required.**

</td>
<td width="50%" valign="top">

**Team-friendly**

The Owner adds Admins with scoped page access and personal data quotas — and every Admin only ever sees the users they created.

</td>
</tr>
</table>

<br/>

<img src=".github/sections/features.svg" width="380" alt="Features" />

<table>
<tr>
<td valign="top"><b>Dashboard</b></td>
<td>Live CPU, RAM, Swap and Storage metrics, plus one-click Backup &amp; Restore of users, inbounds, admins and settings.</td>
</tr>
<tr>
<td valign="top"><b>Users</b></td>
<td>Rich create form, summary cards, a fully responsive table, live <b>Connected IPs</b>, per-user actions, and per-user <b>Fragment &amp; ECH</b> settings with an aggressive preset and ready DNS presets.</td>
</tr>
<tr>
<td valign="top"><b>Inbounds</b></td>
<td>Five HTTP inbounds auto-seeded on first boot, each with a unique port and a random <code>/api/...</code> path. Enable or disable, and override the address with one click — random Railway IPs or a Cloudflare clean-IP pool of 37k+ entries.</td>
</tr>
<tr>
<td valign="top"><b>Activity Log</b></td>
<td>A live timeline of every administrative event.</td>
</tr>
<tr>
<td valign="top"><b>Settings &amp; Admins</b></td>
<td>Owner and Admin roles, scoped permissions, and per-admin data quotas.</td>
</tr>
<tr>
<td valign="top"><b>Subscription</b></td>
<td>A gorgeous per-user page with a live usage chart, QR codes and a base64 export for clients — with importable profiles for popular clients such as Clash and sing-box.</td>
</tr>
<tr>
<td valign="top"><b>Security</b></td>
<td>JWT sessions, built-in rate limiting, and sniffing fully disabled for stability.</td>
</tr>
</table>

<br/>

<img src=".github/sections/deploy.svg" width="380" alt="Deploy on Railway" />

**No code required. Just follow these steps:**

**1. Fork this repository** — click **Fork** at the top-right to copy it to your GitHub account.

**2. Create a Railway project** — head to&nbsp;<a href="https://railway.app"><img src=".github/badges/link-railwayapp.svg" alt="railway.app" height="22" valign="middle" /></a>, then **New Project → Deploy from GitHub repo**, and pick your fork.

**3. Deploy** — Railway reads the `Dockerfile` and `railway.json` and builds automatically.

**4. Expose port `8080`** — open **Settings → Networking → Generate Domain**, and set the port to **`8080`**.

> [!IMPORTANT]
> SideRail listens on port **`8080`** — this is the **only** port you expose. The ports `10085` and `20000–20004` are the core engine's internal ports bound to `127.0.0.1`; they are private and must **not** be exposed.

**5. Add a volume (optional)** — attach a **Volume** at **`/data`** so users, admins and settings survive redeploys.

**6. Open your panel** — visit the generated `*.up.railway.app` domain, land on the **Setup** page, and create your **Owner** account.

<br/>

<img src=".github/sections/env.svg" width="380" alt="Environment variables" />

**All optional.**

| Variable | Default | Description |
|:--|:--|:--|
| `PORT` | `8080` | HTTP port. **Expose this one on Railway.** |
| `JWT_SECRET` | *auto* | Signs admin session cookies. Auto-generated and persisted if unset. |
| `CORE_VERSION` | `v26.9.9` | Core engine release fetched on first boot. |
| `SIDERAIL_DATA_DIR` | `/data` | Persistent data directory (mount a volume here). |
| `PUBLIC_DOMAIN` | *auto* | Override for a custom domain. Falls back to `RAILWAY_PUBLIC_DOMAIN`. |
| `CORE_API_PORT` | `10085` | Internal core stats API port. |
| `CORE_INBOUND_BASE_PORT` | `20000` | Base port for internal inbound listeners. |

<br/>

<img src=".github/sections/architecture.svg" width="380" alt="Architecture" />

```
apps/
└── web/           React + Vite + Tailwind (neobrutalism) frontend
    └── src/
        ├── components/ui/   Reusable neobrutalist primitives
        ├── pages/           Dashboard · Users · Inbounds · Activity · Settings · Setup · Login · Subscription
        └── lib/             API client, auth context, helpers
└── server/        Express + Node (node:sqlite) backend
    └── src/
        ├── core.ts          Binary fetch, process manager, traffic stats, client IPs
        ├── core-settings.ts   Runtime settings builder (sniffing disabled)
        ├── tunnel.ts        WS/HTTPUpgrade via net.Socket, XHTTP via an HTTP relay
        ├── links.ts         Connection link generation
        ├── inbounds.ts      Default inbound seeding + enable/disable
        ├── users.ts         User model, traffic reset, sub-token logic
        ├── auth.ts          Owner/Admin roles, permissions, sessions
        ├── ratelimit.ts     Rate limiting / brute-force protection
        └── routes.ts        Authenticated REST API
```

**How traffic flows** — TLS is terminated at the Railway edge; all connections use `security=tls` on port `443`. The Node process routes **WebSocket/HTTPUpgrade** to the core engine via raw `net.Socket`, and **XHTTP** via an HTTP relay. Only HTTP-based transports are supported — anything that can't survive the edge is intentionally left out.

<br/>

<img src=".github/sections/dev.svg" width="380" alt="Local development" />

**Requires Node.js ≥ 22.5 (Node 24 recommended).**

```bash
npm install     # install all workspaces
npm run dev     # web on :5173, server on :8080 (proxied)

npm run build   # production build (web + server)
npm start       # serve API + built frontend on :8080
```

<br/>

<img src=".github/sections/stars.svg" width="380" alt="Star history" />

<a href="https://www.star-history.com/#icubaby/SideRail&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=icubaby/SideRail&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=icubaby/SideRail&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=icubaby/SideRail&type=Date" width="80%" />
  </picture>
</a>

<br/>
<br/>

<img src=".github/sections/support.svg" width="380" alt="Support the project" />

**Countless late nights and a lot of coffee went into this.** If SideRail powers your setup, a small crypto tip goes straight back into keeping it fast, secure and free for everyone.

<table>
  <tr>
    <td align="center" width="180"><img src=".github/badges/coin-btc.svg" alt="Bitcoin" height="34" /></td>
    <td><code>bc1qx48j9lj989y5c9z8ewpgul2ed69mr50j97a0sk</code></td>
  </tr>
  <tr>
    <td align="center"><img src=".github/badges/coin-eth.svg" alt="Ethereum" height="34" /></td>
    <td><code>0xF2ba522fD846F83D84131D433f56F885740cFc47</code></td>
  </tr>
  <tr>
    <td align="center"><img src=".github/badges/coin-ltc.svg" alt="Litecoin" height="34" /></td>
    <td><code>ltc1qh6y8ld27fdleuy3r7gykxxg38rkawl7adzc0dw</code></td>
  </tr>
  <tr>
    <td align="center"><img src=".github/badges/coin-ton.svg" alt="TON" height="34" /></td>
    <td><code>UQBGN4jXPW44cWQ20EGWqX7sU6K4RlYbnolc3IHoT3UWtmvW</code></td>
  </tr>
</table>

<br/>

<img src=".github/sections/license.svg" width="380" alt="License & Copyright" />

**SideRail is proprietary software. © 2025 icubaby — all rights reserved.**

It is published for transparency and personal self-hosting only. You are welcome to fork and run your own instance, but the following are **strictly prohibited** without prior written permission:

- Selling, reselling, or offering SideRail (or any derivative) as a paid product or service.
- White-labeling or re-branding it under another name.
- Removing or altering the **icubaby / SideRail** attribution, branding, logos, repository links, or the embedded authorship watermarks.
- Claiming authorship of the project.

The source code carries embedded authorship identifiers and watermarks used to prove origin.

<a href="LICENSE"><img src=".github/badges/license-terms.svg" alt="Full license terms" height="38" /></a>

<br/>

<div align="center">

<a href="LICENSE"><img src=".github/badges/license.svg" alt="License" height="40" /></a>

</div>
