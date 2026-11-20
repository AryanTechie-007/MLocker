import { describe, it, expect, vi, beforeEach } from "vitest";
import { launchExternalUrl } from "@/lib/launch-url";

describe("Milestone 4 — Link Launcher Unit Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it("rejects invalid or unsafe URLs before attempting to launch", async () => {
    for (const badUrl of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,test",
      "blob:http://localhost/abc",
      "vbscript:msgbox(1)",
      "not-a-url",
      "",
    ]) {
      const res = await launchExternalUrl(badUrl);
      expect(res).toBe(false);
    }
  });

  it("delegates to window.electronAPI.openExternal when running in Electron", async () => {
    const mockOpenExternal = vi.fn(async (_url: string) => true);

    (globalThis as any).window = {
      electronAPI: {
        isElectron: true,
        openExternal: mockOpenExternal,
      },
    };

    const targetUrl = "https://www.crunchyroll.com/series/G6NQ5DWZ6";
    const res = await launchExternalUrl(targetUrl);

    expect(res).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledTimes(1);
    expect(mockOpenExternal).toHaveBeenCalledWith(targetUrl);
  });

  it("falls back to window.open with noopener,noreferrer when running on Web", async () => {
    const mockWindowOpen = vi.fn((_url: string, _target: string, _features: string) => {
      return { opener: "placeholder" } as any;
    });

    (globalThis as any).window = {
      open: mockWindowOpen,
    };

    const targetUrl = "https://store.steampowered.com/app/1091500";
    const res = await launchExternalUrl(targetUrl);

    expect(res).toBe(true);
    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      targetUrl,
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("returns false if electronAPI.openExternal throws an error", async () => {
    const mockOpenExternal = vi.fn(async (_url: string) => {
      throw new Error("Electron shell error");
    });

    (globalThis as any).window = {
      electronAPI: {
        openExternal: mockOpenExternal,
      },
    };

    const targetUrl = "https://openlibrary.org/works/OL123";
    const res = await launchExternalUrl(targetUrl);

    expect(res).toBe(false);
    expect(mockOpenExternal).toHaveBeenCalledTimes(1);
  });
});
