import { auth } from "./auth";
import { prisma } from "./prisma";

export const GUEST_EMAIL = "guest@medialocker.local";

/**
 * Retrieves the authenticated user's ID or creates/returns the fallback guest user ID.
 */
export async function getOrCreateUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }

  // Fallback guest user for effortless local usage
  const guest = await prisma.user.upsert({
    where: { email: GUEST_EMAIL },
    update: {},
    create: {
      name: "Guest Explorer",
      email: GUEST_EMAIL,
    },
  });

  return guest.id;
}

/**
 * Retrieves the authenticated user's ID or looks up the guest user ID without creating one.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }

  const guest = await prisma.user.findUnique({
    where: { email: GUEST_EMAIL },
  });

  return guest?.id || null;
}
