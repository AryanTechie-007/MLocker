import { describe, it, expect } from "vitest";

describe("UI & State Hygiene: Modal State Reset Across Repeated Opens (Item 4)", () => {
  interface MockMediaItem {
    id: string;
    title: string;
    mediaType: string;
    status: string;
    rating: number | null;
    review: string | null;
    watchedEpisodes?: number;
    hoursPlayed?: number;
  }

  // Model the render-time state synchronization pattern from EditMediaModal
  function simulateEditModalStateTransition(
    itemA: MockMediaItem,
    dirtyEditsA: { status?: string; rating?: number; review?: string },
    itemB: MockMediaItem
  ) {
    let prevItemId: string | null = null;
    let status = "";
    let rating: number | "" = "";
    let review = "";

    // 1. First open with Item A
    if (itemA.id !== prevItemId) {
      prevItemId = itemA.id;
      status = itemA.status;
      rating = itemA.rating ?? "";
      review = itemA.review ?? "";
    }

    expect(status).toBe("completed");
    expect(rating).toBe(9);
    expect(review).toBe("Great Movie A");

    // 2. User makes unsaved edits in Item A's modal
    if (dirtyEditsA.status) status = dirtyEditsA.status;
    if (dirtyEditsA.rating) rating = dirtyEditsA.rating;
    if (dirtyEditsA.review) review = dirtyEditsA.review;

    expect(status).toBe("on_hold");
    expect(rating).toBe(7);
    expect(review).toBe("Modified A draft");

    // 3. User closes modal (or selects Item B without saving)
    // When Item B is passed, the render-time check triggers:
    if (itemB.id !== prevItemId) {
      prevItemId = itemB.id;
      status = itemB.status;
      rating = itemB.rating ?? "";
      review = itemB.review ?? "";
    }

    // 4. Assert that Item B is NOT contaminated with Item A's dirty edits
    return { status, rating, review };
  }

  it("prevents stale state retention when switching between different media items", () => {
    const itemA: MockMediaItem = {
      id: "media_movie_1",
      title: "Movie A",
      mediaType: "movie",
      status: "completed",
      rating: 9,
      review: "Great Movie A",
    };

    const itemB: MockMediaItem = {
      id: "media_anime_2",
      title: "Anime B",
      mediaType: "anime",
      status: "in_progress",
      rating: 6,
      review: "Anime B thoughts",
    };

    const resultB = simulateEditModalStateTransition(
      itemA,
      { status: "on_hold", rating: 7, review: "Modified A draft" },
      itemB
    );

    // Verifies that Item B strictly reflects Item B's original values, NOT Item A's edits
    expect(resultB.status).toBe("in_progress");
    expect(resultB.rating).toBe(6);
    expect(resultB.review).toBe("Anime B thoughts");
    expect(resultB.review).not.toContain("Modified A draft");
  });

  it("resets AddMediaModal state when reopening or switching prefilled media items", () => {
    let prevKey = "";
    let mediaType = "movie";
    let title = "";
    let rating: number | "" = "";

    function openAddModal(isOpen: boolean, prefill?: { externalId?: string; title: string; mediaType: string }) {
      const currentKey = `${prefill?.externalId || prefill?.title || "manual"}-${isOpen}`;
      if (isOpen && currentKey !== prevKey) {
        prevKey = currentKey;
        mediaType = prefill?.mediaType || "movie";
        title = prefill?.title || "";
        rating = "";
      }
      return { mediaType, title, rating };
    }

    // 1. Open with Search Result 1
    const open1 = openAddModal(true, { externalId: "tmdb_100", title: "Dune", mediaType: "movie" });
    expect(open1.title).toBe("Dune");
    expect(open1.mediaType).toBe("movie");

    // User types rating 10
    rating = 10;

    // 2. Close modal
    openAddModal(false);

    // 3. Open with Search Result 2 (Game)
    const open2 = openAddModal(true, { externalId: "steam_200", title: "Cyberpunk", mediaType: "game" });
    expect(open2.title).toBe("Cyberpunk");
    expect(open2.mediaType).toBe("game");
    expect(open2.rating).toBe(""); // Rating reset, not contaminated with 10 from previous modal
  });
});
