// Read-only LAN bridge for the Warehouse Planner digital twin.
//
// Serves current Subiekt GT stock as `GET /api/stock` → BridgeRecord[]:
//   { symbol, name?, quantity?, unit?, locationRaw?, ean?, unitVolumeM3?, unitWeightKg? }
// The browser client parses `locationRaw` ("A01-02-03") itself, so this service
// stays a thin, read-only projection of the ERP — no address logic lives here.
//
// Usage:
//   node server.js          real Subiekt GT SQL Server (config via env, see .env.example)
//   node server.js --mock   sample data, no database — for local/CI end-to-end tests
//
// Security: point this at a READ-ONLY SQL login, expose it on the LAN only, and
// set CORS_ORIGIN to the planner's origin. See README.md.

import http from 'node:http'

const MOCK = process.argv.includes('--mock')

const config = {
  port: Number(process.env.PORT || 8710),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    server: process.env.DB_SERVER || 'localhost',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    // Which Subiekt column carries the warehouse address (tw_Pole1..8 or tw_Uwagi).
    locationField: process.env.LOCATION_FIELD || 'tw_Pole1',
    // Warehouse (magazyn) id whose stock levels to report.
    magazynId: Number(process.env.MAGAZYN_ID || 1),
  },
}

const MOCK_STOCK = [
  { symbol: 'NOZ-001', name: 'Nóż szefa kuchni 20cm', quantity: 42, unit: 'szt', locationRaw: 'H01-01-01', ean: '5901234123457', unitVolumeM3: 0.0008, unitWeightKg: 0.25 },
  { symbol: 'NOZ-002', name: 'Nóż do warzyw 12cm', quantity: 18, unit: 'szt', locationRaw: 'H01-01-02', ean: '5901234123464', unitVolumeM3: 0.0005, unitWeightKg: 0.15 },
  { symbol: 'PAL-100', name: 'Karton zbiorczy A', quantity: 6, unit: 'pal', locationRaw: 'C02-03-01', unitVolumeM3: 1.2, unitWeightKg: 320 },
  { symbol: 'PAL-101', name: 'Karton zbiorczy B', quantity: 4, unit: 'pal', locationRaw: 'D01-01-02', unitVolumeM3: 1.2, unitWeightKg: 280 },
  { symbol: 'KUW-050', name: 'Kuwetka narzędziowa', quantity: 120, unit: 'szt', locationRaw: 'F03-02-01', unitVolumeM3: 0.002, unitWeightKg: 0.4 },
  { symbol: 'SHELF-7', name: 'Element półkowy płytki', quantity: 9, unit: 'szt', locationRaw: 'A01-02-03', unitVolumeM3: 0.03, unitWeightKg: 2.1 },
]

/** Read live stock from Subiekt GT. Lazily imports mssql so --mock needs no driver. */
async function fetchFromSubiekt() {
  const { default: sql } = await import('mssql')
  const { server, user, password, database, locationField, magazynId } = config.db
  // Allow only a known column name for the location field (defence-in-depth against injection).
  const allowed = new Set(['tw_Uwagi', ...Array.from({ length: 8 }, (_, i) => `tw_Pole${i + 1}`)])
  const locCol = allowed.has(locationField) ? locationField : 'tw_Pole1'

  const pool = await sql.connect({
    server,
    user,
    password,
    database,
    options: { encrypt: false, trustServerCertificate: true },
  })
  try {
    const result = await pool
      .request()
      .input('mag', sql.Int, magazynId)
      .query(`
        SELECT t.tw_Symbol AS symbol,
               t.tw_Nazwa AS name,
               t.tw_PodstKodKresk AS ean,
               t.${locCol} AS locationRaw,
               t.tw_JmZ AS unit,
               s.st_Stan AS quantity
        FROM tw__Towar t
        LEFT JOIN tw_Stan s ON s.st_TowId = t.tw_Id AND s.st_MagId = @mag
        WHERE t.tw_Symbol IS NOT NULL
      `)
    return result.recordset.map((r) => ({
      symbol: String(r.symbol ?? '').trim(),
      name: r.name ? String(r.name).trim() : undefined,
      quantity: r.quantity ?? 0,
      unit: r.unit ? String(r.unit).trim() : undefined,
      locationRaw: r.locationRaw ? String(r.locationRaw).trim() : undefined,
      ean: r.ean ? String(r.ean).trim() : undefined,
    }))
  } finally {
    await pool.close()
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  if (req.method !== 'GET' || url.pathname !== '/api/stock') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. Try GET /api/stock' }))
    return
  }

  try {
    const stock = MOCK ? MOCK_STOCK : await fetchFromSubiekt()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(stock))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Stock query failed:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
})

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Warehouse bridge listening on http://0.0.0.0:${config.port}/api/stock ` +
      (MOCK ? '(mock data)' : `(Subiekt DB "${config.db.database}", magazyn ${config.db.magazynId})`),
  )
})
