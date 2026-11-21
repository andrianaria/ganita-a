import { beforeEach, vi } from "vitest";

// Unit tests must stub transport explicitly; never contact Clerk or a partner API.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network disabled in unit tests. Mock fetch explicitly."))));
});
