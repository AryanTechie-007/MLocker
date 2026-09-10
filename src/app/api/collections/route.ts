import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOrCreateUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const guest = await prisma.user.upsert({
    where: { email: "guest@medialocker.local" },
    update: {},
    create: {
      name: "Guest Explorer",
      email: "guest@medialocker.local",
    },
  });
  return guest.id;
}

export async function GET() {
  try {
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collections = await prisma.collection.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            userMedia: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ collections });
  } catch (error) {
    console.error("GET /api/collections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description, coverUrl } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Collection name is required" },
        { status: 400 }
      );
    }

    const collection = await prisma.collection.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        coverUrl: coverUrl || null,
      },
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error("POST /api/collections error:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }
}
