// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | usePolling()              |
// | * polls fn on interval    |
// +---------------------------+
//     |
//     |----> useEffect()
//     |        * syncs fn ref
//     |
//     |----> useEffect()
//     |        * calls tick() immediately
//     |
//     |----> tick()
//     |        * awaits fn, reschedules
//     |
//     v
// +---------------------------+
// | useManualRefresh()        |
// | * returns refresh trigger |
// +---------------------------+
//     |
//     |----> useCallback() -> refresh()
//     |        * cancels timer, calls tick
//     |
//     |----> useEffect()
//     |        * calls refresh() on mount
//     |
//     v
// [ END ]
//
// ================================================================

import { useEffect, useRef, useCallback } from 'react'

/**
 * Runs `fn` immediately and then every `interval` ms.
 * Stops when the component unmounts.
 */
export function usePolling(fn, interval = 5000, deps = []) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn })

  useEffect(() => {
    let id
    async function tick() {
      await saved.current()
      id = setTimeout(tick, interval)
    }
    tick()
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ...deps])
}

/**
 * Returns a `refresh` function that cancels any pending timer
 * and immediately re-runs the polled function.
 */
export function useManualRefresh(fn, interval = 10000) {
  const timerRef = useRef(null)
  const fnRef    = useRef(fn)
  useEffect(() => { fnRef.current = fn })

  const refresh = useCallback(() => {
    clearTimeout(timerRef.current)
    async function tick() {
      await fnRef.current()
      timerRef.current = setTimeout(tick, interval)
    }
    tick()
  }, [interval])

  useEffect(() => {
    refresh()
    return () => clearTimeout(timerRef.current)
  }, [refresh])

  return refresh
}
