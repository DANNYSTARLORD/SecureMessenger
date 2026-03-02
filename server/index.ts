import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { nanoid } from "nanoid";
import Redis from "ioredis";

// ---------------------------------------------------------------------------
// Redis clients
// ---------------------------------------------------------------------------
const redisOptions = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

/** General-purpose commands (GET, SET, HSET, …) */
const redis = new Redis(redisOptions);
/** Dedicated client for PUBLISH */
const pub = new Redis(redisOptions);
/** Dedicated client for SUBSCRIBE (once subscribed it can't do normal cmds) */
const sub = new Redis(redisOptions);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ROOM_TTL = 60 * 60; // 1 hour
const MESSAGE_TTL = 60 * 60; // 1 hour – messages expire with the room
const WS_PORT = Number(process.env.PORT ?? 3001);

// ---------------------------------------------------------------------------
// In-memory WebSocket registry: roomId -> Set<ws>
// ---------------------------------------------------------------------------
type WS = {
  send: (data: string) => void;
  id: string;
  data: { roomId: string; token: string };
};

const roomSockets = new Map<string, Set<WS>>();

function addSocket(roomId: string, ws: WS) {
  let set = roomSockets.get(roomId);
  if (!set) {
    set = new Set();
    roomSockets.set(roomId, set);
  }
  set.add(ws);
}

function removeSocket(roomId: string, ws: WS) {
  const set = roomSockets.get(roomId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) roomSockets.delete(roomId);
}

function broadcastToRoom(roomId: string, payload: string) {
  const set = roomSockets.get(roomId);
  if (!set) return;
  for (const ws of set) {
    try {
      ws.send(payload);
    } catch {
      // socket dead – will be cleaned up on close
    }
  }
}

// ---------------------------------------------------------------------------
// Redis pub/sub fanout – so multiple server instances stay in sync
// ---------------------------------------------------------------------------
const CHANNEL = "chat:fanout";

sub.subscribe(CHANNEL);

sub.on("message", (_channel: string, raw: string) => {
  try {
    const msg = JSON.parse(raw) as {
      roomId: string;
      event: string;
      data?: unknown;
    };
    const payload = JSON.stringify({ event: msg.event, data: msg.data });
    broadcastToRoom(msg.roomId, payload);
  } catch {
    // ignore malformed messages
  }
});

/**
 * Publish an event so every server instance (including this one) fans it out
 * to connected WebSocket clients.
 */
async function publishEvent(roomId: string, event: string, data?: unknown) {
  const payload = JSON.stringify({ event, data });
  // Fan out immediately to local connections
  broadcastToRoom(roomId, payload);
  // Fan out to other instances via Redis pub/sub
  await pub.publish(CHANNEL, JSON.stringify({ roomId, event, data }));
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function verifyAuth(
  roomId: string | undefined,
  token: string | undefined,
): Promise<
  { ok: true; roomId: string; token: string } | { ok: false; error: string }
> {
  if (!roomId || !token) return { ok: false, error: "Missing roomId or token" };

  const connectedRaw = await redis.hget(`room:${roomId}`, "connected");
  if (!connectedRaw) return { ok: false, error: "Room not found" };

  const connected: string[] = JSON.parse(connectedRaw);
  if (!connected.includes(token)) return { ok: false, error: "Invalid token" };

  return { ok: true, roomId, token };
}

// ---------------------------------------------------------------------------
// Elysia app
// ---------------------------------------------------------------------------
const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
    })
  )

  // -----------------------------------------------------------------------
  // Room: create
  // -----------------------------------------------------------------------
  .post("/api/room/create", async () => {
    const roomId = nanoid(10);

    await redis.hset(`room:${roomId}`, {
      connected: JSON.stringify([]),
      createdAt: Date.now().toString(),
    });
    await redis.expire(`room:${roomId}`, ROOM_TTL);

    return { roomId };
  })

  // -----------------------------------------------------------------------
  // Room: join – returns a token cookie
  // -----------------------------------------------------------------------
  .post(
    "/api/room/join",
    async ({ query, cookie }) => {
      const { roomId } = query;

      const meta = await redis.hgetall(`room:${roomId}`);
      if (!meta || !meta.createdAt) {
        return { error: "Room not found" };
      }

      // Check if already has a valid token
      const existingToken = cookie["x-auth-token"]?.value as string | undefined;
      const connected: string[] = meta.connected
        ? JSON.parse(meta.connected)
        : [];

      if (existingToken && connected.includes(existingToken)) {
        return { token: existingToken, alreadyJoined: true };
      }

      const token = nanoid();
      const updated = [...connected, token];

      await redis.hset(`room:${roomId}`, {
        connected: JSON.stringify(updated),
      });

      cookie["x-auth-token"].set({
        value: token,
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      return { token, alreadyJoined: false };
    },
    {
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // Room: TTL
  // -----------------------------------------------------------------------
  .get(
    "/api/room/ttl",
    async ({ query }) => {
      const ttl = await redis.ttl(`room:${query.roomId}`);
      return { ttl: ttl > 0 ? ttl : 0 };
    },
    {
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // Room: destroy
  // -----------------------------------------------------------------------
  .delete(
    "/api/room",
    async ({ query, cookie }) => {
      const { roomId } = query;
      const token = cookie["x-auth-token"]?.value as string | undefined;

      const auth = await verifyAuth(roomId, token);
      if (!auth.ok) return { error: auth.error };

      // Delete room hash + message list
      await redis.del(`room:${roomId}`, `messages:${roomId}`);

      // Broadcast destroy event via pub/sub
      await publishEvent(roomId, "chat.destroy", { roomId });

      return { destroyed: true };
    },
    {
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // Room: info (exists check)
  // -----------------------------------------------------------------------
  .get(
    "/api/room/info",
    async ({ query }) => {
      const meta = await redis.hgetall(`room:${query.roomId}`);
      if (!meta || !meta.createdAt) {
        return { exists: false };
      }
      const connected: string[] = meta.connected
        ? JSON.parse(meta.connected)
        : [];
      return {
        exists: true,
        userCount: connected.length,
        createdAt: Number(meta.createdAt),
      };
    },
    {
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // Messages: list
  // -----------------------------------------------------------------------
  .get(
    "/api/messages",
    async ({ query, cookie }) => {
      const { roomId } = query;
      const token = cookie["x-auth-token"]?.value as string | undefined;

      const auth = await verifyAuth(roomId, token);
      if (!auth.ok) return [];

      const raw = await redis.lrange(`messages:${roomId}`, 0, -1);
      const messages = raw.map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return messages;
    },
    {
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // Messages: send
  // -----------------------------------------------------------------------
  .post(
    "/api/messages",
    async ({ body, query, cookie }) => {
      const { roomId } = query;
      const token = cookie["x-auth-token"]?.value as string | undefined;

      const auth = await verifyAuth(roomId, token);
      if (!auth.ok) return { error: auth.error };

      const message = {
        id: nanoid(),
        sender: body.sender,
        text: body.text,
        timestamp: Date.now(),
        roomId,
      };

      const key = `messages:${roomId}`;
      await redis.rpush(key, JSON.stringify(message));

      // Align message list TTL with the room TTL
      const roomTTL = await redis.ttl(`room:${roomId}`);
      if (roomTTL > 0) {
        await redis.expire(key, roomTTL);
      } else {
        await redis.expire(key, MESSAGE_TTL);
      }

      // Fan out via Redis pub/sub so all server instances notify clients
      await publishEvent(roomId, "chat.message", message);

      return message;
    },
    {
      body: t.Object({
        sender: t.String(),
        text: t.String(),
      }),
      query: t.Object({ roomId: t.String() }),
    },
  )

  // -----------------------------------------------------------------------
  // WebSocket: /ws?roomId=xxx&token=xxx
  // -----------------------------------------------------------------------
  .ws("/ws", {
    query: t.Object({
      roomId: t.String(),
      token: t.String(),
    }),
    async open(ws) {
      const { roomId, token } = ws.data.query;

      // Verify token belongs to this room
      const auth = await verifyAuth(roomId, token);
      if (!auth.ok) {
        ws.send(
          JSON.stringify({ event: "error", data: { message: auth.error } }),
        );
        ws.close();
        return;
      }

      // Tag ws for routing
      const socket = ws as unknown as WS;
      socket.id = nanoid();
      socket.data = { roomId, token };

      addSocket(roomId, socket);

      ws.send(JSON.stringify({ event: "connected", data: { roomId } }));
    },
    message(ws, message) {
      // Clients don't send messages over WS – they use the REST endpoint.
      // But we handle ping/pong keepalive here if needed.
      if (message === "ping") {
        ws.send("pong");
      }
    },
    close(ws) {
      const socket = ws as unknown as WS;
      const roomId = socket.data?.roomId;
      if (roomId) {
        removeSocket(roomId, socket);
      }
    },
  })

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------
  .get("/health", () => ({ status: "ok", uptime: process.uptime() }))

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------
  .listen({
    port: WS_PORT,
    hostname: "0.0.0.0",
  });

console.log(`[server] Elysia running at http://0.0.0.0:${WS_PORT}`);
console.log(`[server] WebSocket endpoint: ws://0.0.0.0:${WS_PORT}/ws`);
console.log(`[server] Redis: ${redisOptions.host}:${redisOptions.port}`);

export type App = typeof app;
export { app };
