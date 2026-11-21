import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Standard structured API error response envelope adhering to AGENTS.md Section 3.3.
 */
export interface ApiErrorEnvelope {
  error: string;
  code: string;
  details?: unknown;
}

export function unauthorizedResponse(
  message = "Unauthorized: Authentication required"
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}

export function forbiddenResponse(
  message = "Forbidden: You do not have permission to access this resource"
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code: "FORBIDDEN" },
    { status: 403 }
  );
}

export function notFoundResponse(
  message = "Resource not found"
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code: "NOT_FOUND" },
    { status: 404 }
  );
}

export function badRequestResponse(
  message: string,
  details?: unknown,
  code = "BAD_REQUEST"
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code, details },
    { status: 400 }
  );
}

export function validationErrorResponse(
  error: ZodError
): NextResponse<ApiErrorEnvelope> {
  const formatted = error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  return NextResponse.json(
    {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: formatted,
    },
    { status: 400 }
  );
}

export function conflictResponse(
  message = "Conflict",
  code = "CONFLICT",
  details?: unknown
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code, details },
    { status: 409 }
  );
}

export function internalErrorResponse(
  message = "An unexpected internal server error occurred"
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: message, code: "INTERNAL_SERVER_ERROR" },
    { status: 500 }
  );
}
