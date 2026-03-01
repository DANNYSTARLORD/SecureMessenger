"use client";
import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useRealtime } from "@/lib/realtime-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const Page = () => {
  const params = useParams();
  const roomId = params.roomId as string;

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [copyStatus, setCopyStatus] = useState("Copy");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  
  
  

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);

    setCopyStatus("Copied!");

    setTimeout(() => {
      setCopyStatus("Copy");
    }, 2000);
    
    
  };

  return (
    <main className="bg-black flex flex-col h-screen max-h-screen overflow-hidden">
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
        </div>

        <button
          className="text-xs bg-zinc-800 px-3 py-1.5 rounded
          text-zinc-100 font-bold transition-all flex items-center gap-2 disabled:opacity-50 shadow-[0_0_10px_rgba(255,0,0,0.6),0_0_20px_rgba(0,255,150,0.4),0_0_30px_rgba(0,150,255,0.4)] animate-pulse hover:bg-red-600"
        >
          DESTROY NOW
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 srollbar-thin"></div>

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
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  // send message
                  setInput("");
                  inputRef.current?.focus();
                }
              }}
              onChange={(e) => setInput(e.target.value)}
              ref={inputRef}
              placeholder="Type message..."
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
            />
          </div>

          <button className="bg-zinc-800 text-zinc-400 px-6 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            SEND
          </button>
        </div>
      </div>
    </main>
  );
};
export default Page;
