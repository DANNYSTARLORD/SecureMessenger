"use client";

import dynamic from "next/dynamic";
import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { Meteors } from "@/components/ui/meteors";
import { ShineBorder } from "@/components/ui/shine-border";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const Lattice = dynamic(() => import("@/components/ui/lattice"), {
  ssr: false,
});

const Page = () => {
  return (
    <Suspense>
      <Lobby />
    </Suspense>
  );
};

export default Page;

function Lobby() {
  const { username: generatedUsername, setUsername } = useUsername();
  const [alias, setAlias] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  const searchParams = useSearchParams();
  const wasDestroyed = searchParams.get("destroyed") === "true";
  const error = searchParams.get("error");

  const displayName = alias || generatedUsername;

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { mutate: createRoom, isPending } = useMutation({
    mutationFn: async () => {
      const res = await client.room.create.post();

      if (res.status !== 200) {
        throw new Error(`Create failed (${res.status})`);
      }

      const data = res.data as { roomId: string } | null;
      if (!data?.roomId) {
        throw new Error("Create failed: missing room id");
      }

      router.push(`/room/${data.roomId}`);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Failed to create room";
      setCreateError(message);
    },
    onSuccess: () => {
      setCreateError(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setCreateError(null);
    setUsername(displayName.trim());

    createRoom();
  };

  return (
    <main className="relative min-h-screen bg-black overflow-hidden flex items-center justify-center p-4">
      {/* Background Lattice – covers entire screen */}
      <div className="absolute inset-0 pointer-events-none">
        <Lattice />
      </div>

      {/* Foreground form container */}
      <div className="relative z-10 w-full max-w-md">
        <div className="space-y-2 mb-6 text-center">
          <h1 className="text-4xl font-extrabold bg-linear-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent tracking-tight">
            Private Messenger
          </h1>
          <p className="text-zinc-500 text-sm">
            A private self-destructing chat room.
          </p>
        </div>

        {wasDestroyed && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center mb-4">
            <p className="text-red-400 text-sm font-mono">
              Room has been destroyed. All messages are gone.
            </p>
          </div>
        )}

        {error === "room-not-found" && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center mb-4">
            <p className="text-amber-400 text-sm font-mono">
              Room not found or has expired.
            </p>
          </div>
        )}

        {createError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center mb-4">
            <p className="text-red-400 text-sm font-mono">{createError}</p>
          </div>
        )}

        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md">
          <ShineBorder shineColor={["#ffdf00", "#dfe6d5"]} />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-zinc-500 text-sm">Alias</label>

              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={
                  isClient && generatedUsername
                    ? generatedUsername
                    : "set temporary alias"
                }
                className="w-full bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono outline-none focus:border-zinc-600 transition-colors"
              />

              {!alias && isClient && generatedUsername && (
                <p className="text-zinc-600 text-xs font-mono">
                  Will use: {generatedUsername}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!displayName.trim() || isPending}
              className="w-full bg-zinc-100 text-black p-3 text-sm font-bold mt-2 cursor-pointer disabled:opacity-50 transition-all duration-200 ease-out hover:bg-zinc-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
            >
              {isPending ? "Creating..." : "Create Secure Room"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
