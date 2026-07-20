# Warehouse Planner — Subiekt GT bridge

A tiny, **read-only** LAN service that exposes current Subiekt GT stock as JSON so
the Warehouse Planner can act as a **live digital twin** instead of a static
snapshot. The planner polls `GET /api/stock`; this service projects the ERP tables
into the record shape the client expects.

This is a **reference implementation** — self-contained, dependency-light, and meant
to be adapted to your Subiekt schema and network. It does not modify any data.

## Contract

`GET /api/stock` → `BridgeRecord[]`:

```jsonc
[
  {
    "symbol": "NOZ-001",          // required — product symbol (SKU)
    "name": "Nóż szefa 20cm",     // optional
    "quantity": 42,               // optional — number or numeric string
    "unit": "szt",                // optional
    "locationRaw": "H01-01-01",   // optional — raw address, parsed by the client
    "ean": "5901234123457",       // optional
    "unitVolumeM3": 0.0008,        // optional — per-unit volume in m³
    "unitWeightKg": 0.25           // optional — per-unit weight in kg
  }
]
```

Location parsing (`A01-02-03` = aisle A, rack 01, column 02, level 03) lives **only
in the client**, so the bridge stays a thin projection and there is a single source
of truth for addressing.

## Quick start (mock, no database)

```bash
cd bridge
npm install          # only needed for the real DB mode; mock works without it
npm run mock         # serves sample data on http://localhost:8710/api/stock
```

Then in the planner open **Subiekt GT → Live connection**, set the bridge URL to
`http://localhost:8710/api/stock`, and click **Refresh now**. The mock is what the
app's automated end-to-end tests run against.

## Real Subiekt GT

```bash
cd bridge
npm install
cp .env.example .env      # edit DB_* / LOCATION_FIELD / MAGAZYN_ID / CORS_ORIGIN
node --env-file=.env server.js
```

Configuration (all via environment variables):

| Var | Meaning |
| --- | --- |
| `PORT` | HTTP port (default `8710`) |
| `CORS_ORIGIN` | Browser origin allowed to call the bridge; set to the planner's exact origin in production |
| `DB_SERVER` | SQL Server host / instance |
| `DB_USER` / `DB_PASSWORD` | **Read-only** SQL login |
| `DB_DATABASE` | Subiekt company database |
| `LOCATION_FIELD` | Column with the address: `tw_Pole1`..`tw_Pole8` or `tw_Uwagi` |
| `MAGAZYN_ID` | Warehouse id whose stock levels to report |

The query joins `tw__Towar` (symbol, name, EAN, the chosen location column) with
`tw_Stan` (per-warehouse quantity). Adjust the SQL in `server.js` to match your
Subiekt version if column names differ.

## Security notes

- **Read-only login.** Grant the SQL account `SELECT` on `tw__Towar` / `tw_Stan`
  only. The service never writes.
- **LAN only.** Do not expose the bridge to the public internet. Keep it on the
  same network as the planner.
- **CORS.** The browser calls the bridge directly, so `CORS_ORIGIN` must include the
  planner's origin. `*` is fine for local testing, but pin it in production.
- **Mixed content.** If you serve the planner over **HTTPS**, browsers block plain
  `http://` bridge calls. Either serve the planner over HTTP on the LAN, or put the
  bridge behind HTTPS (reverse proxy / self-signed cert trusted on the client).
