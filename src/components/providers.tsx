"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

type UsernameContextValue = {
  username: string
  setUsername: (value: string) => void
}

const UsernameContext = createContext<UsernameContextValue | undefined>(
  undefined,
)

const ANIMALS = ["wolf", "hawk", "bear", "shark"]

const generateUsername = () => {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `anonymous-${word}-${Math.random().toString(36).slice(2, 7)}`
}

const UsernameProvider = ({ children }: { children: ReactNode }) => {
  // session-stable username (per page load) with user-editable setter
  const usernameRef = useRef<string>("")
  const [usernameState, setUsernameState] = useState("")

  if (!usernameRef.current) {
    usernameRef.current = generateUsername()
  }

  const value = useMemo<UsernameContextValue>(() => {
    const setUsername = (value: string) => {
      usernameRef.current = value
      setUsernameState(value)
    }

    return {
      username: usernameState || usernameRef.current,
      setUsername,
    }
  }, [usernameState])

  return (
    <UsernameContext.Provider value={value}>{children}</UsernameContext.Provider>
  )
}

export const useUsernameContext = () => {
  const ctx = useContext(UsernameContext)
  if (!ctx) throw new Error("useUsernameContext must be used within provider")
  return ctx
}

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <UsernameProvider>{children}</UsernameProvider>
    </QueryClientProvider>
  )
}