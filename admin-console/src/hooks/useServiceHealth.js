// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | useServiceHealth()        |
// | * polls all service health|
// +---------------------------+
//     |
//     |----> useCallback() -> fetch()
//     |        * calls checkAllHealth()
//     |
//     |----> usePolling()
//     |        * schedules fetch() on interval
//     |
//     v
// [ END ]
//
// ================================================================

import { useState, useCallback } from 'react'
import { checkAllHealth } from '../api/client.js'
import { usePolling } from './usePolling.js'

export function useServiceHealth(interval = 6000) {
  const [services, setServices] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      const data = await checkAllHealth()
      setServices(data)
      setLastUpdated(new Date())
    } catch {
      // keep stale data
    } finally {
      setLoading(false)
    }
  }, [])

  usePolling(fetch, interval)

  const allOnline = services.length > 0 && services.every(s => s.ok)
  const onlineCount = services.filter(s => s.ok).length

  return { services, lastUpdated, loading, allOnline, onlineCount }
}
