import { auth } from "./auth";

/**
 * Retrieves the authenticated user's ID from the session.
 * Returns null if the request is unauthenticated.
 * Strictly adheres to AGENTS.md: Never creates or returns a shared guest user.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}

/**
 * Alias for getUserId() to preserve compatibility across existing API handlers,
 * while strictly requiring an authenticated session (no guest creation/fallback).
 */
export async function getOrCreateUserId(): Promise<string | null> {
  return getUserId();
}
