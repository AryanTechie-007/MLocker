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
  GET as getCollections,
  POST as createCollection,
} from "@/app/api/collections/route";
import {
  GET as getCollectionById,
  PATCH as updateCollectionById,
  DELETE as deleteCollectionById,
  POST as mutateCollectionItem,
} from "@/app/api/collections/[id]/route";
import {
  GET as getMedia,
  POST as createMedia,
} from "@/app/api/media/route";
import {
  GET as getMediaById,
  PATCH as updateMediaById,
  DELETE as deleteMediaById,
} from "@/app/api/media/[id]/route";
import { GET as getStats } from "@/app/api/stats/route";

describe("Security & Tenant Isolation Regression Suite", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let userAMedia: { id: string; title: string };
  let userBMedia: { id: string; title: string };
  let userACollection: { id: string; name: string };
  let userBCollection: { id: string; name: string };

  beforeAll(async () => {
    const timestamp = Date.now();
    // Seed isolated test users
    userA = await prisma.user.create({
      data: {
        name: "User Alice",
        email: `alice_${timestamp}@test.local`,
      },
    });

    userB = await prisma.user.create({
      data: {
        name: "User Bob",
        email: `bob_${timestamp}@test.local`,
      },
    });

    // Seed User A's media & collection
    userAMedia = await prisma.userMedia.create({
      data: {
        userId: userA.id,
        mediaType: "movie",
        title: "Alice's Private Movie",
        rating: 9,
        status: "completed",
        review: "Secret Alice thoughts",
      },
    });

    userACollection = await prisma.collection.create({
      data: {
        userId: userA.id,
        name: "Alice's Top Picks",
      },
    });

    // Seed User B's media & collection
    userBMedia = await prisma.userMedia.create({
      data: {
        userId: userB.id,
        mediaType: "anime",
        title: "Bob's Confidential Anime",
        rating: 8.5,
        status: "in_progress",
        review: "Bob's private notes",
      },
    });

    userBCollection = await prisma.collection.create({
      data: {
        userId: userB.id,
        name: "Bob's Private Vault",
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.collectionItem.deleteMany({
        where: {
          collectionId: { in: [userACollection?.id, userBCollection?.id].filter(Boolean) },
        },
      });
      await prisma.collection.deleteMany({
        where: { id: { in: [userACollection?.id, userBCollection?.id].filter(Boolean) } },
      });
      await prisma.userMedia.deleteMany({
        where: { id: { in: [userAMedia?.id, userBMedia?.id].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userA?.id, userB?.id].filter(Boolean) } },
      });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  beforeEach(() => {
    currentMockUserId = null;
  });

  // Scenario 1: Unauthenticated users cannot access protected endpoints
  describe("Scenario 1: Unauthenticated Access Rejection", () => {
    it("returns 401 Unauthorized for unauthenticated GET /api/collections", async () => {
      currentMockUserId = null;
      const res = await getCollections();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 Unauthorized for unauthenticated POST /api/collections", async () => {
      currentMockUserId = null;
      const req = new Request("http://localhost:3000/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacker Collection" }),
      });
      const res = await createCollection(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 Unauthorized for unauthenticated GET /api/media", async () => {
      currentMockUserId = null;
      const req = new Request("http://localhost:3000/api/media");
      const res = await getMedia(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 Unauthorized for unauthenticated POST /api/media", async () => {
      currentMockUserId = null;
      const req = new Request("http://localhost:3000/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "movie", title: "Unauthenticated Item" }),
      });
      const res = await createMedia(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 Unauthorized for unauthenticated GET /api/stats", async () => {
      currentMockUserId = null;
      const res = await getStats();
      expect(res.status).toBe(401);
    });

    it("returns 401 Unauthorized for unauthenticated GET /api/media/[id]", async () => {
      currentMockUserId = null;
      const req = new Request(`http://localhost:3000/api/media/${userAMedia.id}`);
      const res = await getMediaById(req, { params: Promise.resolve({ id: userAMedia.id }) });
      expect(res.status).toBe(401);
    });
  });

  // Scenario 2: A user can access their own collection
  describe("Scenario 2: Authorized Access to Own Resources", () => {
    it("allows User A to access User A's collection (200 OK)", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/collections/${userACollection.id}`);
      const res = await getCollectionById(req, {
        params: Promise.resolve({ id: userACollection.id }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.collection.id).toBe(userACollection.id);
      expect(data.collection.name).toBe("Alice's Top Picks");
    });

    it("allows User A to access User A's media item (200 OK)", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/media/${userAMedia.id}`);
      const res = await getMediaById(req, {
        params: Promise.resolve({ id: userAMedia.id }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.item.id).toBe(userAMedia.id);
      expect(data.item.title).toBe("Alice's Private Movie");
    });
  });

  // Scenario 3: User A cannot access User B's collection
  describe("Scenario 3: Cross-Tenant Collection Access Prevention", () => {
    it("prevents User A from viewing User B's collection (returns 404)", async () => {
      currentMockUserId = userA.id; // Logged in as User A
      const req = new Request(`http://localhost:3000/api/collections/${userBCollection.id}`);
      const res = await getCollectionById(req, {
        params: Promise.resolve({ id: userBCollection.id }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });
  });

  // Scenario 4: User A cannot attach User B's media to their collection (SEC-01 IDOR fix)
  describe("Scenario 4: Relational IDOR Prevention (SEC-01)", () => {
    it("rejects User A attempting to add User B's media item into User A's collection", async () => {
      currentMockUserId = userA.id; // Logged in as User A
      const req = new Request(`http://localhost:3000/api/collections/${userACollection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMediaId: userBMedia.id, // User B's media!
          action: "add",
        }),
      });

      const res = await mutateCollectionItem(req, {
        params: Promise.resolve({ id: userACollection.id }),
      });

      // Must be rejected with 404 Not Found / Unauthorized
      expect(res.status).toBe(404);

      // Verify in database that NO CollectionItem was created
      const joinRecord = await prisma.collectionItem.findUnique({
        where: {
          collectionId_userMediaId: {
            collectionId: userACollection.id,
            userMediaId: userBMedia.id,
          },
        },
      });
      expect(joinRecord).toBeNull();
    });

    it("allows User A to attach User A's own media item to User A's collection", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/collections/${userACollection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMediaId: userAMedia.id,
          action: "add",
        }),
      });

      const res = await mutateCollectionItem(req, {
        params: Promise.resolve({ id: userACollection.id }),
      });
      expect(res.status).toBe(201);

      // Verify database record was created
      const joinRecord = await prisma.collectionItem.findUnique({
        where: {
          collectionId_userMediaId: {
            collectionId: userACollection.id,
            userMediaId: userAMedia.id,
          },
        },
      });
      expect(joinRecord).not.toBeNull();
    });
  });

  // Scenario 5: User A cannot modify User B's media
  describe("Scenario 5: Cross-Tenant Media Modification Prevention", () => {
    it("rejects User A attempting to PATCH User B's media item", async () => {
      currentMockUserId = userA.id; // Alice tries to alter Bob's rating
      const req = new Request(`http://localhost:3000/api/media/${userBMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: 1.0,
          review: "Hacked by Alice",
        }),
      });

      const res = await updateMediaById(req, {
        params: Promise.resolve({ id: userBMedia.id }),
      });
      expect(res.status).toBe(404);

      // Verify in database that Bob's media was NOT modified
      const bobMediaInDb = await prisma.userMedia.findUnique({
        where: { id: userBMedia.id },
      });
      expect(bobMediaInDb?.rating).toBe(8.5);
      expect(bobMediaInDb?.review).toBe("Bob's private notes");
    });
  });

  // Scenario 6: User A cannot delete User B's records
  describe("Scenario 6: Cross-Tenant Deletion Prevention", () => {
    it("rejects User A attempting to DELETE User B's media item", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/media/${userBMedia.id}`, {
        method: "DELETE",
      });

      const res = await deleteMediaById(req, {
        params: Promise.resolve({ id: userBMedia.id }),
      });
      expect(res.status).toBe(404);

      // Verify Bob's item remains intact in DB
      const bobMediaInDb = await prisma.userMedia.findUnique({
        where: { id: userBMedia.id },
      });
      expect(bobMediaInDb).not.toBeNull();
    });

    it("rejects User A attempting to DELETE User B's collection", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/collections/${userBCollection.id}`, {
        method: "DELETE",
      });

      const res = await deleteCollectionById(req, {
        params: Promise.resolve({ id: userBCollection.id }),
      });
      expect(res.status).toBe(404);

      // Verify Bob's collection remains intact in DB
      const bobColInDb = await prisma.collection.findUnique({
        where: { id: userBCollection.id },
      });
      expect(bobColInDb).not.toBeNull();
    });
  });

  // Scenario 7 & 8: Malformed payloads and invalid enums are rejected (400)
  describe("Scenario 7 & 8: Input Validation & Boundary Defense", () => {
    it("returns 400 for malformed media creation payload (missing required title)", async () => {
      currentMockUserId = userA.id;
      const req = new Request("http://localhost:3000/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "movie" }), // Missing title
      });

      const res = await createMedia(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid media type enum", async () => {
      currentMockUserId = userA.id;
      const req = new Request("http://localhost:3000/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "invalid_category",
          title: "Some Media",
        }),
      });

      const res = await createMedia(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for negative rating in update payload", async () => {
      currentMockUserId = userA.id;
      const req = new Request(`http://localhost:3000/api/media/${userAMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: -10 }),
      });

      const res = await updateMediaById(req, {
        params: Promise.resolve({ id: userAMedia.id }),
      });
      expect(res.status).toBe(400);
    });
  });

  // Scenario 9: Client-supplied ownership identifiers cannot override authenticated identity
  describe("Scenario 9: Identity Spoofing Immunity", () => {
    it("ensures media creation strictly uses authenticated userId and ignores client-provided userId", async () => {
      currentMockUserId = userA.id; // Alice is authenticated

      const req = new Request("http://localhost:3000/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "game",
          title: "Alice Created Game",
          userId: userB.id, // Attacker attempts to forge creator as Bob!
        }),
      });

      const res = await createMedia(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      // Must be created under Alice's account, NOT Bob's!
      expect(data.item.userId).toBe(userA.id);
      expect(data.item.userId).not.toBe(userB.id);

      // Clean up newly created game
      await prisma.userMedia.delete({ where: { id: data.item.id } });
    });
  });
});
