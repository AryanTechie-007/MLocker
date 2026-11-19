import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { CreateCollectionSchema } from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
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
    return internalErrorResponse("Failed to fetch collections");
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = CreateCollectionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { name, description, coverUrl } = parseResult.data;

    const collection = await prisma.collection.create({
      data: {
        userId,
        name,
        description: description || null,
        coverUrl: coverUrl || null,
      },
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error("POST /api/collections error:", error);
    return internalErrorResponse("Failed to create collection");
  }
}
