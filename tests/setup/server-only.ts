import { vi } from "vitest";

// `server-only` throws when imported outside a React Server environment.
// Tests run server code directly in Node, so stub it.
vi.mock("server-only", () => ({}));
