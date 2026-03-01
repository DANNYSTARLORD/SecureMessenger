import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { redis } from "@/lib/redis";

const ROOM_TTL = 60 * 60; // 1 hour

const room = new Elysia({ prefix: "/room" }).post("/create", async () => {
  const roomId = nanoid();

  await redis.hset(`room:${roomId}`, {
    connected: JSON.stringify([]), // must be string
    createdAt: Date.now().toString(), // must be string
  });

  await redis.expire(`room:${roomId}`, ROOM_TTL); // this adds expiry

  return { roomId };
});

const app = new Elysia({ prefix: "/api" }).use(room);

export const GET = app.fetch;
export const POST = app.fetch;

export type App = typeof app;
