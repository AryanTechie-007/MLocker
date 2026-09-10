import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOrCreateUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const guest = await prisma.user.findUnique({
    where: { email: "guest@medialocker.local" },
  });
  return guest?.id || null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error("GET /api/collections/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, coverUrl } = body;

    const collection = await prisma.collection.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        description: description !== undefined ? description?.trim() : undefined,
        coverUrl: coverUrl !== undefined ? coverUrl : undefined,
      },
    });

    return NextResponse.json({ collection });
  } catch (error) {
    console.error("PATCH /api/collections/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.collection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/collections/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}

// POST to add item to collection or toggle item in collection
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userMediaId, action } = await req.json();

    if (!userMediaId) {
      return NextResponse.json(
        { error: "userMediaId is required" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Failed to modify collection items" },
      { status: 500 }
    );
  }
}
