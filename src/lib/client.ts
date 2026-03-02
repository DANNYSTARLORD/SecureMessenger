import { treaty } from "@elysiajs/eden";
import type { App } from "../../server/index";

export const backend = treaty<App>("http://localhost:3001", {
  fetch: {
    credentials: "include",
  },
});

export const client = backend.api;