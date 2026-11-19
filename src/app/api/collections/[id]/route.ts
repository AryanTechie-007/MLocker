import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import {
  UpdateCollectionSchema,
  CollectionItemActionSchema,
  SafeIdSchema,
} from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const collection = await prisma.collection.findFirst({
      where: { id, userId },
      include: {
        items: {
          include: {
            userMedia: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!collection) {
      return notFoundResponse("Collection not found");
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error("GET /api/collections/[id] error:", error);
    return internalErrorResponse("Failed to fetch collection");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const existing = await prisma.collection.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return notFoundResponse("Collection not found");
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = UpdateCollectionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { name, description, coverUrl } = parseResult.data;

    const collection = await prisma.collection.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description || null : undefined,
        coverUrl: coverUrl !== undefined ? coverUrl || null : undefined,
      },
    });

    return NextResponse.json({ collection });
  } catch (error) {
    console.error("PATCH /api/collections/[id] error:", error);
    return internalErrorResponse("Failed to update collection");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const existing = await prisma.collection.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return notFoundResponse("Collection not found");
    }

    await prisma.collection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/collections/[id] error:", error);
    return internalErrorResponse("Failed to delete collection");
  }
}

/**
 * Mutate collection items (add or remove).
 * Enforces dual-tenant isolation (SEC-01): Verifies that BOTH the collection
 * and the referenced userMediaId belong to the authenticated user.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const idValidation = SafeIdSchema.safeParse(collectionId);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    // 1. Authorize collection ownership
    const collection = await prisma.collection.findFirst({
      where: { id: collectionId, userId },
    });
    if (!collection) {
      return notFoundResponse("Collection not found");
    }

    // 2. Validate request payload with Zod
    const rawBody = await req.json().catch(() => null);
    const parseResult = CollectionItemActionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { userMediaId, action } = parseResult.data;

    // 3. Strict Relational Tenant Isolation Check (SEC-01 fix):
    // Verify that the media item belongs to the same authenticated user
    const userMedia = await prisma.userMedia.findFirst({
      where: { id: userMediaId, userId },
    });
    if (!userMedia) {
      return notFoundResponse("Media item not found or unauthorized");
    }

    if (action === "remove") {
      await prisma.collectionItem.deleteMany({
        where: {
          collectionId,
          userMediaId,
        },
      });
      return NextResponse.json({ success: true, action: "removed" });
    }

    // Add item (or return existing)
    const existing = await prisma.collectionItem.findUnique({
      where: {
        collectionId_userMediaId: {
          collectionId,
          userMediaId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ item: existing, action: "already_exists" });
    }

    const count = await prisma.collectionItem.count({ where: { collectionId } });

    const newItem = await prisma.collectionItem.create({
      data: {
        collectionId,
        userMediaId,
        order: count,
      },
    });

    return NextResponse.json({ item: newItem, action: "added" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/collections/[id] item error:", error);
    return internalErrorResponse("Failed to modify collection items");
  }
}
