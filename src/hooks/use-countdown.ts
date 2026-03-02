"use client"

import { useSyncExternalStore, useEffect, useState } from "react"

type CountdownStore = {
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => number | null
  getServerSnapshot: () => number | null
  seed: (seconds: number) => void
  destroy: () => void
}

function createCountdownStore(): CountdownStore {
  let remaining: number | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()

  function notify() {
    for (const fn of listeners) fn()
  }

  function startTimer() {
    if (timer !== null) return
    timer = setInterval(() => {
      if (remaining !== null && remaining > 0) {
        remaining -= 1
        notify()
      }
      if (remaining !== null && remaining <= 0) {
        stopTimer()
      }
    }, 1000)
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      if (remaining !== null && remaining > 0) {
        startTimer()
      }
      return () => {
        listeners.delete(cb)
        if (listeners.size === 0) {
          stopTimer()
        }
      }
    },
    getSnapshot() {
      return remaining
    },
    getServerSnapshot() {
      return null
    },
    seed(seconds: number) {
      remaining = seconds
      notify()
      if (seconds > 0) {
        startTimer()
      } else {
        stopTimer()
      }
    },
    destroy() {
      stopTimer()
      listeners.clear()
      remaining = null
    },
  }
}

/**
 * A countdown hook that is fully React 19 compiler compliant.
 *
 * All mutable state lives in an external store managed via
 * `useSyncExternalStore`. No refs are read or written during render,
 * and no `setState` is called synchronously in effects.
 *
 * Returns `null` until a valid initialSeconds is provided.
 * Returns `0` once the countdown reaches zero.
 */
export function useCountdown(initialSeconds: number | null | undefined): number | null {
  const [store] = useState(() => createCountdownStore())

  useEffect(() => {
    if (initialSeconds != null && initialSeconds >= 0) {
      store.seed(initialSeconds)
    }
  }, [initialSeconds, store])

  useEffect(() => {
    return () => {
      store.destroy()
    }
  }, [store])

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )
}