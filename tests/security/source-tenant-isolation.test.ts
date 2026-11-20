import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// Mock @/lib/get-user to control authenticated context per test
let currentMockUserId: string | null = null;
vi.mock("@/lib/get-user", () => ({
  getUserId: vi.fn(async () => currentMockUserId),
  getOrCreateUserId: vi.fn(async () => currentMockUserId),
}));

// Import route handlers
import {
  GET as getSources,
  POST as createSource,
} from "@/app/api/media/[id]/sources/route";
import {
  PATCH as updateSource,
  DELETE as deleteSource,
} from "@/app/api/sources/[id]/route";
import { GET as getMediaById } from "@/app/api/media/[id]/route";

describe("Milestone 4 — MediaSource Tenant Isolation & Security Suite", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let userAMedia: { id: string; title: string };
  let userBMedia: { id: string; title: string };

  beforeAll(async () => {
    const timestamp = Date.now();
    userA = await prisma.user.create({
      data: {
        name: "User Alice Sources",
        email: `alice_src_${timestamp}@test.local`,
      },
    });

    userB = await prisma.user.create({
      data: {
        name: "User Bob Sources",
        email: `bob_src_${timestamp}@test.local`,
      },
    });

    userAMedia = await prisma.userMedia.create({
      data: {
        userId: userA.id,
        mediaType: "anime",
        title: "Alice Anime",
        status: "in_progress",
      },
    });

    userBMedia = await prisma.userMedia.create({
      data: {
        userId: userB.id,
        mediaType: "game",
        title: "Bob Game",
        status: "plan_to_consume",
      },
    });
  });

  afterAll(async () => {
    await prisma.mediaSource.deleteMany({
      where: {
        userMediaId: { in: [userAMedia.id, userBMedia.id] },
      },
    });
    await prisma.userMedia.deleteMany({
      where: { id: { in: [userAMedia.id, userBMedia.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  });

  beforeEach(() => {
    currentMockUserId = null;
  });

  describe("1. Authentication Enforcement (Zero Guest Fallback)", () => {
    it("rejects GET /api/media/[id]/sources with 401 when unauthenticated", async () => {
      currentMockUserId = null;
      const res = await getSources(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects POST /api/media/[id]/sources with 401 when unauthenticated", async () => {
      currentMockUserId = null;
      const res = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Crunchyroll",
            url: "https://www.crunchyroll.com/series/test",
            sourceType: "stream",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects PATCH /api/sources/[id] with 401 when unauthenticated", async () => {
      currentMockUserId = null;
      const res = await updateSource(
        new Request("http://localhost/api/sources/fake-id", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        }),
        { params: Promise.resolve({ id: "fake-id" }) }
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects DELETE /api/sources/[id] with 401 when unauthenticated", async () => {
      currentMockUserId = null;
      const res = await deleteSource(
        new Request("http://localhost/api/sources/fake-id", { method: "DELETE" }),
        { params: Promise.resolve({ id: "fake-id" }) }
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });
  });

  describe("2. Relational Tenant Isolation & IDOR Prevention", () => {
    it("denies User B creating a source on User A's media item (returns 404, not 403)", async () => {
      currentMockUserId = userB.id; // Bob attempting to attach a source to Alice's media

      const res = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Bob Attack",
            url: "https://example.com/exploit",
            sourceType: "web",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");

      // Verify no source was created under Alice's item
      const count = await prisma.mediaSource.count({
        where: { userMediaId: userAMedia.id },
      });
      expect(count).toBe(0);
    });

    it("allows User A to create multiple valid sources on their own media item", async () => {
      currentMockUserId = userA.id;

      const res1 = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Crunchyroll Stream",
            url: "https://www.crunchyroll.com/series/G6NQ5DWZ6",
            sourceType: "stream",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );

      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      expect(data1.source.name).toBe("Crunchyroll Stream");
      expect(data1.source.url).toBe("https://www.crunchyroll.com/series/G6NQ5DWZ6");
      expect(data1.source.normalizedDomain).toBe("crunchyroll.com");
      expect(data1.source.sourceType).toBe("stream");

      const res2 = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Official Site",
            url: "http://anime-official.jp/episodes",
            sourceType: "web",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );

      expect(res2.status).toBe(201);
      const data2 = await res2.json();
      expect(data2.source.normalizedDomain).toBe("anime-official.jp");

      // Verify both sources returned in GET /api/media/[id]/sources
      const getRes = await getSources(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.sources.length).toBe(2);

      // Verify sources are also embedded in GET /api/media/[id]
      const mediaRes = await getMediaById(
        new Request(`http://localhost/api/media/${userAMedia.id}`),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(mediaRes.status).toBe(200);
      const mediaData = await mediaRes.json();
      expect(mediaData.item.sources).toBeDefined();
      expect(mediaData.item.sources.length).toBe(2);
    });

    it("denies User B reading User A's sources via GET /api/media/[id]/sources", async () => {
      currentMockUserId = userB.id;

      const res = await getSources(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("denies User B updating User A's source via PATCH /api/sources/[id]", async () => {
      // Find Alice's source
      const aliceSource = await prisma.mediaSource.findFirst({
        where: { userMediaId: userAMedia.id },
      });
      expect(aliceSource).not.toBeNull();

      currentMockUserId = userB.id; // Bob attempting to tamper with Alice's source

      const res = await updateSource(
        new Request(`http://localhost/api/sources/${aliceSource!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Hacked by Bob",
            url: "https://evil.local/hacked",
          }),
        }),
        { params: Promise.resolve({ id: aliceSource!.id }) }
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");

      // Verify Alice's source remains untouched in database
      const checkSource = await prisma.mediaSource.findUnique({
        where: { id: aliceSource!.id },
      });
      expect(checkSource?.name).toBe(aliceSource!.name);
      expect(checkSource?.url).toBe(aliceSource!.url);
    });

    it("denies User B deleting User A's source via DELETE /api/sources/[id]", async () => {
      const aliceSource = await prisma.mediaSource.findFirst({
        where: { userMediaId: userAMedia.id },
      });
      expect(aliceSource).not.toBeNull();

      currentMockUserId = userB.id; // Bob attempting to delete Alice's source

      const res = await deleteSource(
        new Request(`http://localhost/api/sources/${aliceSource!.id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: aliceSource!.id }) }
      );

      expect(res.status).toBe(404);

      // Verify Alice's source still exists in database
      const checkSource = await prisma.mediaSource.findUnique({
        where: { id: aliceSource!.id },
      });
      expect(checkSource).not.toBeNull();
    });

    it("allows User A to update and delete their own source", async () => {
      currentMockUserId = userA.id;
      const aliceSource = await prisma.mediaSource.findFirst({
        where: { userMediaId: userAMedia.id, name: "Official Site" },
      });
      expect(aliceSource).not.toBeNull();

      // Update name and URL
      const updateRes = await updateSource(
        new Request(`http://localhost/api/sources/${aliceSource!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Updated Official Portal",
            url: "https://anime-official.jp/v2/stream",
            sourceType: "stream",
          }),
        }),
        { params: Promise.resolve({ id: aliceSource!.id }) }
      );

      expect(updateRes.status).toBe(200);
      const updateData = await updateRes.json();
      expect(updateData.source.name).toBe("Updated Official Portal");
      expect(updateData.source.url).toBe("https://anime-official.jp/v2/stream");
      expect(updateData.source.sourceType).toBe("stream");

      // Delete the updated source
      const deleteRes = await deleteSource(
        new Request(`http://localhost/api/sources/${aliceSource!.id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: aliceSource!.id }) }
      );
      expect(deleteRes.status).toBe(200);

      // Verify it is gone
      const deletedCheck = await prisma.mediaSource.findUnique({
        where: { id: aliceSource!.id },
      });
      expect(deletedCheck).toBeNull();
    });
  });

  describe("3. Security Validation & Dangerous Protocol Rejection", () => {
    it("rejects javascript: injection schemes in source creation", async () => {
      currentMockUserId = userA.id;

      const res = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "XSS Attempt",
            url: "javascript:alert(document.cookie)",
            sourceType: "web",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("rejects file: and data: injection schemes in source creation", async () => {
      currentMockUserId = userA.id;

      for (const dangerousUrl of [
        "file:///etc/passwd",
        "file:///C:/Windows/System32/cmd.exe",
        "data:text/html,<script>alert(1)</script>",
        "blob:http://localhost/abc",
      ]) {
        const res = await createSource(
          new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Exploit",
              url: dangerousUrl,
              sourceType: "web",
            }),
          }),
          { params: Promise.resolve({ id: userAMedia.id }) }
        );

        expect(res.status).toBe(400);
      }
    });

    it("rejects empty name or invalid source type", async () => {
      currentMockUserId = userA.id;

      const resEmptyName = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "   ",
            url: "https://valid.com",
            sourceType: "web",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(resEmptyName.status).toBe(400);

      const resBadType = await createSource(
        new Request(`http://localhost/api/media/${userAMedia.id}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Valid Name",
            url: "https://valid.com",
            sourceType: "arbitrary_malicious_type",
          }),
        }),
        { params: Promise.resolve({ id: userAMedia.id }) }
      );
      expect(resBadType.status).toBe(400);
    });
  });

  describe("4. Cascade Deletion Integrity", () => {
    it("automatically deletes all attached MediaSources when parent UserMedia is deleted", async () => {
      currentMockUserId = userB.id;

      // Create a temporary media item for User B
      const tempMedia = await prisma.userMedia.create({
        data: {
          userId: userB.id,
          mediaType: "novel",
          title: "Temporary Novel",
        },
      });

      // Add two sources to it
      const s1 = await prisma.mediaSource.create({
        data: {
          userMediaId: tempMedia.id,
          name: "Open Library Reader",
          url: "https://openlibrary.org/works/OL123",
          normalizedDomain: "openlibrary.org",
          sourceType: "reader",
        },
      });

      const s2 = await prisma.mediaSource.create({
        data: {
          userMediaId: tempMedia.id,
          name: "Amazon Store",
          url: "https://amazon.com/dp/B000",
          normalizedDomain: "amazon.com",
          sourceType: "store",
        },
      });

      // Confirm sources exist
      expect(await prisma.mediaSource.count({ where: { userMediaId: tempMedia.id } })).toBe(2);

      // Delete the parent UserMedia
      await prisma.userMedia.delete({
        where: { id: tempMedia.id },
      });

      // Confirm both sources were cascade deleted
      const remainingCount = await prisma.mediaSource.count({
        where: { id: { in: [s1.id, s2.id] } },
      });
      expect(remainingCount).toBe(0);
    });
  });
});
