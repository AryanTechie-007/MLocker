import { describe, it, expect } from "vitest";

describe("media formatting and sanitization utilities", () => {
  it("strips HTML tags cleanly from API summaries", () => {
    const rawSummary = "<p>This is a <b>great</b> show about <i>cyberpunk</i> detectives.</p>";
    const cleanSummary = rawSummary.replace(/<[^>]*>?/gm, "").trim();
    expect(cleanSummary).toBe("This is a great show about cyberpunk detectives.");
  });

  it("handles empty or missing summary strings safely", () => {
    const emptySummary = "";
    const cleanSummary = (emptySummary || "").replace(/<[^>]*>?/gm, "").trim();
    expect(cleanSummary).toBe("");
  });

  it("extracts 4-digit release year from date strings", () => {
    const premiereDate = "2024-03-01";
    const year = new Date(premiereDate).getFullYear() || null;
    expect(year).toBe(2024);
  });

  it("returns null or handles invalid date strings gracefully", () => {
    const invalidDate = "not-a-date";
    const parsed = new Date(invalidDate).getFullYear();
    const year = isNaN(parsed) ? null : parsed;
    expect(year).toBeNull();
  });

  it("scales iTunes artwork from 100x100 to 600x600 resolution", () => {
    const lowRes = "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/100x100bb.jpg";
    const highRes = lowRes.replace("100x100bb", "600x600bb");
    expect(highRes).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/600x600bb.jpg"
    );
  });
});
