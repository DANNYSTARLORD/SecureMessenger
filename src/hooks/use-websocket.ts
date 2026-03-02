"use client"

import { useEffect, useRef, useState, useCallback } from "react"

export type WSEvent = {
  event: string
  data?: unknown
}

type UseWebSocketOptions = {
  /** Full WebSocket URL including query params */
  url: string | null
  /** Called whenever a JSON message arrives */
  onMessage?: (event: WSEvent) => void
  /** Called when connection opens */
  onOpen?: () => void
  /** Called when connection closes */
  onClose?: () => void
  /** Called on error */
  onError?: (error: Event) => void
  /** Enable/disable the connection (default true) */
  enabled?: boolean
  /** Reconnect delay in ms (default 2000) */
  reconnectDelay?: number
  /** Max reconnect attempts (default 10, 0 = infinite) */
  maxReconnectAttempts?: number
  /** Ping interval in ms to keep connection alive (default 25000) */
  pingInterval?: number
}

/**
 * A React 19 compiler-compliant WebSocket hook with reconnection,
 * ping/pong keepalive, and Redis pub/sub-backed event handling.
 *
 * All ref updates happen inside effects (never during render).
 * State updates only happen in event-driven callbacks (ws.onopen,
 * ws.onclose, setInterval callbacks), never synchronously inside
 * an effect body.
 */
export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  enabled = true,
  reconnectDelay = 2000,
  maxReconnectAttempts = 10,
  pingInterval = 25000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unmountedRef = useRef(false)
  const connectFnRef = useRef<(() => void) | null>(null)

  // Callback refs — updated via effects so we never write .current during render
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const onErrorRef = useRef(onError)

  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Config refs — same pattern
  const urlRef = useRef(url)
  const reconnectDelayRef = useRef(reconnectDelay)
  const maxReconnectAttemptsRef = useRef(maxReconnectAttempts)
  const pingIntervalRef = useRef(pingInterval)

  useEffect(() => { urlRef.current = url }, [url])
  useEffect(() => { reconnectDelayRef.current = reconnectDelay }, [reconnectDelay])
  useEffect(() => { maxReconnectAttemptsRef.current = maxReconnectAttempts }, [maxReconnectAttempts])
  useEffect(() => { pingIntervalRef.current = pingInterval }, [pingInterval])

  const [isConnected, setIsConnected] = useState(false)

  /**
   * Tear down timers only (no state updates).
   * Safe to call anywhere including synchronously in effect bodies.
   */
  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
  }, [])

  /**
   * Tear down the WebSocket and all timers WITHOUT calling setState.
   * This is safe to call synchronously in an effect body or cleanup.
   */
  const teardown = useCallback(() => {
    clearTimers()
    const ws = wsRef.current
    if (ws) {
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      wsRef.current = null
    }
  }, [clearTimers])

  // Register the connect function inside an effect.
  // It captures refs (not state) so it never goes stale.
  // It self-references via connectFnRef for reconnection.
  useEffect(() => {
    const doConnect = () => {
      const currentUrl = urlRef.current
      if (!currentUrl || unmountedRef.current) return

      // Clean up any prior connection (state-free)
      teardown()

      const ws = new WebSocket(currentUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) return
        reconnectAttemptsRef.current = 0
        // setState in an event callback is fine
        setIsConnected(true)
        onOpenRef.current?.()

        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping")
          }
        }, pingIntervalRef.current)
      }

      ws.onmessage = (event) => {
        if (unmountedRef.current) return
        if (event.data === "pong") return

        try {
          const parsed = JSON.parse(event.data) as WSEvent
          onMessageRef.current?.(parsed)
        } catch {
          // Non-JSON message, ignore
        }
      }

      ws.onerror = (event) => {
        if (unmountedRef.current) return
        onErrorRef.current?.(event)
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        clearTimers()
        // setState in an event callback is fine
        setIsConnected(false)
        onCloseRef.current?.()

        const maxAttempts = maxReconnectAttemptsRef.current
        const shouldReconnect =
          maxAttempts === 0 || reconnectAttemptsRef.current < maxAttempts

        if (shouldReconnect && !unmountedRef.current) {
          reconnectAttemptsRef.current += 1
          const delay = Math.min(
            reconnectDelayRef.current *
              Math.pow(1.5, reconnectAttemptsRef.current - 1),
            30000
          )
          reconnectTimerRef.current = setTimeout(() => {
            if (!unmountedRef.current) {
              connectFnRef.current?.()
            }
          }, delay)
        }
      }
    }

    connectFnRef.current = doConnect
  }, [teardown, clearTimers])

  // Main lifecycle effect — connect or teardown based on enabled + url.
  // We never call setState synchronously here; state transitions happen
  // only inside WebSocket event handlers (onopen, onclose).
  useEffect(() => {
    unmountedRef.current = false

    if (enabled && url) {
      // Use queueMicrotask so connectFnRef is guaranteed to be populated
      // by the effect above (effects run in order).
      queueMicrotask(() => {
        if (!unmountedRef.current) {
          connectFnRef.current?.()
        }
      })
    } else {
      // Only tear down (no setState). isConnected will be set to false
      // by the ws.onclose handler if a connection was open.
      teardown()
    }

    return () => {
      unmountedRef.current = true
      teardown()
    }
  }, [enabled, url, teardown])

  const send = useCallback((data: string | object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data))
    }
  }, [])

  return { isConnected, send }
}