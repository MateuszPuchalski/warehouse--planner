import { useEffect } from 'react'
import { useStockStore } from '../store/useStockStore'

/**
 * Headless auto-poll: while auto-refresh is enabled and a bridge URL is set,
 * periodically pull live stock. Pauses while the tab is hidden.
 */
export function BridgeSync() {
  const autoRefreshSec = useStockStore((s) => s.autoRefreshSec)
  const bridgeUrl = useStockStore((s) => s.bridgeUrl)

  useEffect(() => {
    if (autoRefreshSec <= 0 || !bridgeUrl.trim()) return
    const tick = () => {
      if (!document.hidden) void useStockStore.getState().refreshFromBridge()
    }
    const id = window.setInterval(tick, autoRefreshSec * 1000)
    return () => window.clearInterval(id)
  }, [autoRefreshSec, bridgeUrl])

  return null
}
