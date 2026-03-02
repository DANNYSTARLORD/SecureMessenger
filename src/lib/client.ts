import { treaty } from "@elysiajs/eden";
import type { App } from "../../server/index";

const BASE_URL =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:3001`
    : "http://localhost:3001";

export const backend = treaty<App>(BASE_URL, {
  fetch: {
    credentials: "include",
  },
});

export const client = backend.api;