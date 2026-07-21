import type { StockItem } from '../types'
import { objectsToStockItems, type BridgeRecord } from './stockFile'

const DEFAULT_TIMEOUT_MS = 10000

/**
 * Fetch current stock from the LAN bridge (`GET {url}` → BridgeRecord[]) and map
 * it to StockItem[]. Throws an Error with a readable message on network, HTTP,
 * shape, or timeout failure.
 */
export async function fetchBridgeStock(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<StockItem[]> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('No bridge URL configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(trimmed, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('Bridge request timed out')
    throw new Error(`Cannot reach bridge: ${err instanceof Error ? err.message : String(err)}`)
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Bridge returned ${res.status} ${res.statusText}`)
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new Error('Bridge response is not valid JSON')
  }
  if (!Array.isArray(payload)) throw new Error('Bridge response is not a JSON array')
  return objectsToStockItems(payload as BridgeRecord[])
}
