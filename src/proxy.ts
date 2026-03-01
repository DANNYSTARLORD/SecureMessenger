import { NextRequest, NextResponse } from "next/server";
import { redis } from "./lib/redis";
import { nanoid } from "nanoid";

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url));

  const roomId = roomMatch[1];

  const meta = await redis.hgetall(`room:${roomId}`);

  if (!meta || !meta.createdAt) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url));
  }

  const existingToken = req.cookies.get("x-auth-token")?.value;

  // Parse connected users safely
  const connected: string[] = meta.connected ? JSON.parse(meta.connected) : [];

  // If already connected, allow
  if (existingToken && connected.includes(existingToken)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const token = nanoid();

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  await redis.hset(`room:${roomId}`, {
    connected: JSON.stringify([...connected, token]),
  });

  return response;
};

export const config = {
  matcher: "/room/:path*",
};
