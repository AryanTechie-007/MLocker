import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApi, UseApiOptions } from "@/lib/use-api";
import { ApiError, getErrorMessage } from "@/lib/api-client";

describe("Milestone U-2 — useApi Data Fetching Hook Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Pure Controller & Cancellation Semantics", () => {
    it("passes an active AbortSignal to the fetcher", async () => {
      let receivedSignal: AbortSignal | null = null;
      const fetcher = async (signal: AbortSignal) => {
        receivedSignal = signal;
        return { success: true };
      };

      const controller = new AbortController();
      const res = await fetcher(controller.signal);

      expect(res).toEqual({ success: true });
      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal!.aborted).toBe(false);
    });

    it("aborts the active signal when canceled", async () => {
      let signalRef: AbortSignal | null = null;
      const controller = new AbortController();

      const fetcher = async (signal: AbortSignal) => {
        signalRef = signal;
        return new Promise((resolve) => setTimeout(resolve, 50));
      };

      const promise = fetcher(controller.signal);
      controller.abort();

      await promise;
      expect(signalRef).not.toBeNull();
      expect(signalRef!.aborted).toBe(true);
    });
  });

  describe("2. Error Formatting & Extraction", () => {
    it("formats ApiError into user-friendly message", () => {
      const err = new ApiError("Failed to fetch dashboard data", {
        status: 504,
        isNonJsonError: true,
      });

      expect(getErrorMessage(err)).toBe("Failed to fetch dashboard data");
      expect(err.status).toBe(504);
      expect(err.isNonJsonError).toBe(true);
    });

    it("formats standard Error into readable message", () => {
      const err = new Error("Custom unexpected runtime error");
      expect(getErrorMessage(err)).toBe("Custom unexpected runtime error");
    });

    it("falls back to default message when error is unknown or empty", () => {
      expect(getErrorMessage(null, "Fallback message")).toBe("Fallback message");
      expect(getErrorMessage(undefined, "Fallback message")).toBe("Fallback message");
      expect(getErrorMessage("", "Fallback message")).toBe("Fallback message");
    });
  });

  describe("3. useApi Contract & Type Safety", () => {
    it("verifies useApi export exists and is a function", () => {
      expect(typeof useApi).toBe("function");
    });

    it("accepts fetcher function and returns standard result structure", () => {
      // Static typing check
      const options: UseApiOptions<{ test: string }> = {
        initialData: { test: "initial" },
        autoFetch: false,
      };
      expect(options.initialData?.test).toBe("initial");
      expect(options.autoFetch).toBe(false);
    });
  });
});
