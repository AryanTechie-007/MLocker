import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { getUserId, getOrCreateUserId } from "@/lib/get-user";

describe("Security: getUserId & getOrCreateUserId Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when session is unauthenticated (No guest creation/fallback)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const userId = await getUserId();
    expect(userId).toBeNull();

    const orCreateId = await getOrCreateUserId();
    expect(orCreateId).toBeNull();
  });

  it("returns null when session exists but user.id is missing", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: {} } as any);

    const userId = await getUserId();
    expect(userId).toBeNull();
  });

  it("returns user id when authenticated session exists", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "user_secure_456", name: "Alice", email: "alice@example.com" },
    } as any);

    const userId = await getUserId();
    expect(userId).toBe("user_secure_456");
  });
});
