"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Meteors } from "@/components/ui/meteors";
import { ShineBorder } from "@/components/ui/shine-border";
import { client } from "@/lib/client";
import { useRouter } from "next/navigation";

export default function Home() {
  const [username, setUsername] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
     createRoom();
  };

  const {mutate: createRoom} = useMutation({
    mutationFn: async () => {
      const res = await client.room.create.post();
      
      if (res.status === 200) {
        router.push(`/room/${res.data?.roomId}`);
      }
    }
  });

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 bg-black overflow-hidden">
      <Meteors minDelay={2} maxDelay={3} number={20} />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold bg-linear-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent tracking-tight">
            Private Messenger
          </h1>
          <p className="text-zinc-500 text-sm">
            A private self-destructing chat room.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md">
          <ShineBorder shineColor={["#ffdf00", "#dfe6d5"]} />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-zinc-500">Alias</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="set temporary alias"
                className="w-full bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full bg-zinc-100 text-black p-3 text-sm font-bold mt-2 cursor-pointer disabled:opacity-50 transition-all duration-200 ease-out hover:bg-zinc-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
            >
              Create Secure Room
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
