"use client";

import { useCountdown } from "@/hooks/use-countdown";
import { useUsername } from "@/hooks/use-username";
import { useWebSocket, type WSEvent } from "@/hooks/use-websocket";
import { client } from "@/lib/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type Message = {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  roomId: string;
};

const WS_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`
    : "ws://localhost:3001";

const Page = () => {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { username } = useUsername();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [copyStatus, setCopyStatus] = useState("COPY");
  const [token, setToken] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Step 1: Join the room and get a token
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const joinRoom = async () => {
      try {
        const res = await client.room.join.post(undefined as never, {
          query: { roomId },
        });

        if (cancelled) return;

        const data = res.data as { token?: string; error?: string } | null;
        if (data && "token" in data && data.token) {
          setToken(data.token);
        } else {
          setJoinError(data?.error ?? "Failed to join room");
          router.push("/?error=room-not-found");
        }
      } catch {
        if (!cancelled) {
          setJoinError("Failed to join room");
          router.push("/?error=room-not-found");
        }
      }
    };

    joinRoom();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  // -----------------------------------------------------------------------
  // Step 2: Get room TTL and derive a local countdown
  // -----------------------------------------------------------------------
  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } });
      return res.data as { ttl: number } | null;
    },
    enabled: !!token,
    refetchInterval: token ? 500 : false,
  });

  const timeRemaining = useCountdown(ttlData?.ttl ?? null);

  // Navigate away when the room expires
  useEffect(() => {
    if (timeRemaining === 0) {
      router.push("/?destroyed=true");
    }
  }, [timeRemaining, router]);

  // -----------------------------------------------------------------------
  // Step 3: Fetch messages
  // -----------------------------------------------------------------------
  const { data: messages } = useQuery<Message[]>({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      return (res.data as Message[] | null) ?? [];
    },
    enabled: !!token,
    // Poll periodically as a safety net when WS delivery is delayed
    refetchInterval: token ? 200 : false,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -----------------------------------------------------------------------
  // Step 4: WebSocket for realtime events
  // -----------------------------------------------------------------------
  const wsUrl =
    token && roomId
      ? `${WS_BASE}/ws?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`
      : null;

  const handleWsMessage = useCallback(
    (evt: WSEvent) => {
      console.debug("[ws] event", evt);

      if (evt.event === "chat.message") {
        const message = evt.data as Message | undefined;
        if (message?.id) {
          queryClient.setQueryData<Message[]>(["messages", roomId], (prev) => {
            const list = prev ?? [];
            if (list.some((m) => m.id === message.id)) return list;
            return [...list, message];
          });
        }
        // Always invalidate so any missed messages are refetched
        queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
      }

      if (evt.event === "chat.destroy") {
        router.push("/?destroyed=true");
      }
    },
    [queryClient, roomId, router],
  );

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    enabled: !!token && !!roomId,
  });

  // -----------------------------------------------------------------------
  // Step 5: Send message mutation
  // -----------------------------------------------------------------------
  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      await client.messages.post(
        { sender: username, text },
        { query: { roomId } },
      );
    },
    onSuccess: () => {
      setInput("");
      inputRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
    },
  });

  // -----------------------------------------------------------------------
  // Step 6: Destroy room mutation
  // -----------------------------------------------------------------------
  const { mutate: destroyRoom, isPending: isDestroying } = useMutation({
    mutationFn: async () => {
      await client.room.delete(undefined as never, { query: { roomId } });
    },
    onSuccess: () => {
      router.push("/?destroyed=true");
    },
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopyStatus("COPIED!");
    setTimeout(() => setCopyStatus("COPY"), 2000);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || isPending) return;
    sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // -----------------------------------------------------------------------
  // Loading / error states
  // -----------------------------------------------------------------------
  if (joinError) {
    return (
      <main className="bg-black flex items-center justify-center h-screen">
        <p className="text-red-500 font-mono">{joinError}</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="bg-black flex items-center justify-center h-screen">
        <p className="text-zinc-500 font-mono animate-pulse">Joining room...</p>
      </main>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <main className=" bg-black animate-zoom transform-gpu will-change-transform flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Room ID</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-purple-500">{roomId}</span>
              <button
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-300 hover:text-zinc-100 transition-colors duration-200 ease-out"
                onClick={copyLink}
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              Self-Destruct
            </span>
            <span
              className={`text-sm font-bold flex items-center gap-2 ${
                timeRemaining !== null && timeRemaining < 60
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            >
              {timeRemaining !== null
                ? formatTimeRemaining(timeRemaining)
                : "--:--"}
            </span>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Status</span>
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className={`inline-block size-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className={isConnected ? "text-green-400" : "text-red-400"}>
                {isConnected ? "LIVE" : "RECONNECTING"}
              </span>
            </span>
          </div>
        </div>

        <button
          onClick={() => destroyRoom()}
          disabled={isDestroying}
          className="text-xs bg-zinc-800 px-3 py-1.5 rounded text-zinc-100 font-bold transition-all flex items-center gap-2 disabled:opacity-50 shadow-[0_0_10px_rgba(255,0,0,0.6),0_0_20px_rgba(0,255,150,0.4),0_0_30px_rgba(0,150,255,0.4)] animate-pulse hover:bg-red-600 cursor-pointer"
        >
          DESTROY NOW
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {(!messages || messages.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-700 text-sm font-mono">
              No messages yet. Start the conversation.
            </p>
          </div>
        )}

        {messages?.map((msg) => {
          const isOwn = msg.sender === username;
          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-0.5 ${
                isOwn ? "items-end" : "items-start"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono">
                  {msg.sender}
                </span>
                <span className="text-[10px] text-zinc-700">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <div
                className={`max-w-[75%] px-3 py-2 text-sm font-mono break-words ${
                  isOwn
                    ? "bg-purple-600/20 border border-purple-500/30 text-purple-200"
                    : "bg-zinc-800/60 border border-zinc-700/50 text-zinc-300"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex gap-4">
          <div className="flex-1 relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse">
              {">"}
            </span>
            <input
              autoFocus
              type="text"
              value={input}
              onKeyDown={handleKeyDown}
              onChange={(e) => setInput(e.target.value)}
              ref={inputRef}
              placeholder="Type message..."
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isPending}
            className="bg-zinc-800 text-zinc-400 px-6 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? "..." : "SEND"}
          </button>
        </div>
      </div>
    </main>
  );
};

export default Page;
