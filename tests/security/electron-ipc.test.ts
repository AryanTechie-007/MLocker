import { describe, it, expect, vi, beforeEach } from "vitest";
const {
  handleOpenExternal,
  handleGetAppVersion,
  registerIpcHandlers,
} = require("../../electron/ipc-handlers");

describe("Security: Actual Electron IPC Handler Execution (Item 3)", () => {
  let mockShell: { openExternal: ReturnType<typeof vi.fn> };
  let mockApp: { getVersion: ReturnType<typeof vi.fn> };
  let mockIpcMain: {
    handlers: Record<string, (...args: any[]) => any>;
    handle: (channel: string, listener: (...args: any[]) => any) => void;
  };

  beforeEach(() => {
    mockShell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
    };
    mockApp = {
      getVersion: vi.fn().mockReturnValue("1.0.0"),
    };
    mockIpcMain = {
      handlers: {},
      handle(channel: string, listener: (...args: any[]) => any) {
        this.handlers[channel] = listener;
      },
    };
  });

  describe("handleOpenExternal function", () => {
    it("opens valid https URLs and returns true", async () => {
      const result = await handleOpenExternal(mockShell, "https://store.steampowered.com/app/10");
      expect(result).toBe(true);
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://store.steampowered.com/app/10");
    });

    it("opens valid http URLs and returns true", async () => {
      const result = await handleOpenExternal(mockShell, "http://localhost:3000/media");
      expect(result).toBe(true);
      expect(mockShell.openExternal).toHaveBeenCalledWith("http://localhost:3000/media");
    });

    it("rejects javascript: protocol injection and does not invoke shell.openExternal", async () => {
      const result = await handleOpenExternal(mockShell, "javascript:alert(document.cookie)");
      expect(result).toBe(false);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("rejects file:/// local filesystem protocol access", async () => {
      const result = await handleOpenExternal(mockShell, "file:///C:/Windows/System32/calc.exe");
      expect(result).toBe(false);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("rejects data: protocol and dangerous URI schemes", async () => {
      const result = await handleOpenExternal(mockShell, "data:text/html,<script>alert(1)</script>");
      expect(result).toBe(false);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("rejects non-string inputs safely (numbers, objects, null, undefined)", async () => {
      expect(await handleOpenExternal(mockShell, 12345 as any)).toBe(false);
      expect(await handleOpenExternal(mockShell, null as any)).toBe(false);
      expect(await handleOpenExternal(mockShell, undefined as any)).toBe(false);
      expect(await handleOpenExternal(mockShell, { url: "https://evil.com" } as any)).toBe(false);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it("rejects malformed strings and incomplete URLs", async () => {
      expect(await handleOpenExternal(mockShell, "not a url")).toBe(false);
      expect(await handleOpenExternal(mockShell, "   ")).toBe(false);
      expect(await handleOpenExternal(mockShell, "http://")).toBe(false);
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });
  });

  describe("handleGetAppVersion function", () => {
    it("returns version from app.getVersion", () => {
      const version = handleGetAppVersion(mockApp);
      expect(version).toBe("1.0.0");
      expect(mockApp.getVersion).toHaveBeenCalledTimes(1);
    });

    it("safely handles null/missing app instance", () => {
      expect(handleGetAppVersion(null)).toBe("0.0.0");
      expect(handleGetAppVersion({})).toBe("0.0.0");
    });
  });

  describe("registerIpcHandlers registration & end-to-end IPC invocation", () => {
    it("registers 'open-external' and executes through ipcMain listener", async () => {
      registerIpcHandlers(mockIpcMain, mockShell, mockApp);

      expect(typeof mockIpcMain.handlers["open-external"]).toBe("function");
      expect(typeof mockIpcMain.handlers["get-app-version"]).toBe("function");

      // Invoke open-external through the registered handler
      const openResult = await mockIpcMain.handlers["open-external"](
        {},
        "https://themoviedb.org"
      );
      expect(openResult).toBe(true);
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://themoviedb.org/");

      // Invoke malicious payload through registered handler
      const badResult = await mockIpcMain.handlers["open-external"](
        {},
        "file:///etc/shadow"
      );
      expect(badResult).toBe(false);

      // Invoke get-app-version through registered handler
      const versionResult = mockIpcMain.handlers["get-app-version"]();
      expect(versionResult).toBe("1.0.0");
    });
  });
});
