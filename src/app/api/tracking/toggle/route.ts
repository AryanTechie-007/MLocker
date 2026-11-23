import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import {
  TrackingPreferencesSchema,
  TrackingToggleSchema,
} from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

const DEFAULT_PREFERENCES = {
  enabled: true,
  autoAccumulateGameHours: false,
};

/**
 * GET /api/tracking/toggle
 * Retrieves the current user's tracking preferences.
 */
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trackingPreferences: true },
    });

    if (!user || !user.trackingPreferences) {
      return NextResponse.json({
        trackingPreferences: DEFAULT_PREFERENCES,
      });
    }

    try {
      const parsed = JSON.parse(user.trackingPreferences);
      const validated = TrackingPreferencesSchema.parse(parsed);
      return NextResponse.json({ trackingPreferences: validated });
    } catch {
      return NextResponse.json({
        trackingPreferences: DEFAULT_PREFERENCES,
      });
    }
  } catch (error) {
    console.error("GET /api/tracking/toggle error:", error);
    return internalErrorResponse("Failed to fetch preferences");
  }
}

/**
 * POST /api/tracking/toggle
 * Updates tracking preferences persisted in User.trackingPreferences.
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = TrackingToggleSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trackingPreferences: true },
    });

    let current = { ...DEFAULT_PREFERENCES };
    if (user?.trackingPreferences) {
      try {
        current = { ...current, ...JSON.parse(user.trackingPreferences) };
      } catch {}
    }

    const merged = {
      ...current,
      ...(parseResult.data.enabled !== undefined
        ? { enabled: parseResult.data.enabled }
        : {}),
      ...(parseResult.data.autoAccumulateGameHours !== undefined
        ? {
            autoAccumulateGameHours:
              parseResult.data.autoAccumulateGameHours,
          }
        : {}),
    };

    const validated = TrackingPreferencesSchema.parse(merged);

    await prisma.user.update({
      where: { id: userId },
      data: {
        trackingPreferences: JSON.stringify(validated),
      },
    });

    return NextResponse.json({ trackingPreferences: validated });
  } catch (error) {
    console.error("POST /api/tracking/toggle error:", error);
    return internalErrorResponse("Failed to update preferences");
  }
}
