import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, getErrorMessage } from "@/lib/api-client";

describe("Shared API Client: apiFetch & Error Categorization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("1. Real Network Failure (Case 1)", () => {
    it("identifies TypeError: Failed to fetch as a true network failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      try {
        await apiFetch("/api/test-endpoint");
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.isNetworkError).toBe(true);
        expect(apiErr.isNonJsonError).toBe(false);
        expect(apiErr.message).toBe("Network connection failed. Please check your internet connection.");
      }
    });

    it("rethrows AbortError directly without classifying as network failure", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(apiFetch("/api/test-endpoint")).rejects.toThrow(abortError);
    });
  });

  describe("2. Non-JSON Server Responses / Gateway HTML Pages (Case 2)", () => {
    it("handles HTML 504 Gateway Timeout without throwing unhandled SyntaxError", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          "<html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1></body></html>",
          {
            status: 504,
            statusText: "Gateway Time-out",
            headers: { "Content-Type": "text/html" },
          }
        )
      );

      try {
        await apiFetch("/api/search?q=test");
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.isNonJsonError).toBe(true);
        expect(apiErr.isNetworkError).toBe(false);
        expect(apiErr.status).toBe(504);
        expect(apiErr.message).toBe("Server returned an unexpected response (504)");
      }
    });

    it("handles HTML 502 Bad Gateway with informative status message", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "Content-Type": "text/html" },
        })
      );

      try {
        await apiFetch("/api/media");
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.isNonJsonError).toBe(true);
        expect(apiErr.status).toBe(502);
        expect(apiErr.message).toBe("Server returned an unexpected response (502)");
      }
    });

    it("handles HTML 500 Internal Server Error crash page", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html>Server Crash</html>", {
          status: 500,
          statusText: "Internal Server Error",
        })
      );

      try {
        await apiFetch("/api/sessions");
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.isNonJsonError).toBe(true);
        expect(apiErr.status).toBe(500);
        expect(apiErr.message).toBe("Server returned an unexpected response (500)");
      }
    });
  });

  describe("3. 401 Unauthorized Session Handling", () => {
    it("handles 401 response by throwing UNAUTHORIZED ApiError", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
          status: 401,
          statusText: "Unauthorized",
          headers: { "Content-Type": "application/json" },
        })
      );

      try {
        await apiFetch("/api/collections");
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("4. Structured API Errors (400, 404, 409)", () => {
    it("extracts structured error messages from JSON error envelopes", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Title is required and must not exceed 255 chars",
            code: "VALIDATION_ERROR",
          }),
          {
            status: 400,
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      try {
        await apiFetch("/api/media", { method: "POST", body: {} });
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe("VALIDATION_ERROR");
        expect(apiErr.message).toBe("Title is required and must not exceed 255 chars");
      }
    });

    it("extracts conflict messages on 409 Conflict", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Sequence gap detected",
            code: "SEQUENCE_GAP",
            details: { expectedSequence: 5 },
          }),
          {
            status: 409,
            statusText: "Conflict",
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      try {
        await apiFetch("/api/sessions/heartbeat", { method: "POST" });
        expect.unreachable("Should have thrown ApiError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("SEQUENCE_GAP");
        expect(apiErr.message).toBe("Sequence gap detected");
      }
    });
  });

  describe("5. Successful JSON Responses", () => {
    it("parses and returns typed JSON body on 200 OK", async () => {
      const mockData = { items: [{ id: "m1", title: "Inception" }] };
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await apiFetch<typeof mockData>("/api/media");
      expect(result).toEqual(mockData);
    });

    it("automatically serializes JavaScript object body and injects Content-Type header", async () => {
      const capturedInit: RequestInit[] = [];
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedInit.push(init);
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });

      await apiFetch("/api/media", {
        method: "POST",
        body: { title: "Steins;Gate", mediaType: "anime" },
      });

      expect(capturedInit.length).toBe(1);
      const headers = capturedInit[0].headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("Accept")).toBe("application/json");
      expect(capturedInit[0].body).toBe(JSON.stringify({ title: "Steins;Gate", mediaType: "anime" }));
    });
  });

  describe("6. getErrorMessage Utility", () => {
    it("extracts message from ApiError directly", () => {
      const err = new ApiError("Specific API failure reason");
      expect(getErrorMessage(err)).toBe("Specific API failure reason");
    });

    it("extracts message from standard Error", () => {
      const err = new Error("Something broke internally");
      expect(getErrorMessage(err)).toBe("Something broke internally");
    });

    it("handles string error values", () => {
      expect(getErrorMessage("Direct error string")).toBe("Direct error string");
    });

    it("falls back to default fallback when error is unknown or empty", () => {
      expect(getErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
      expect(getErrorMessage(undefined, "Custom fallback")).toBe("Custom fallback");
      expect(getErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
    });
  });
});
