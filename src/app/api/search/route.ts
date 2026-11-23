import { NextResponse } from "next/server";
import { searchMedia } from "@/lib/api/unified-search";
import { SearchQuerySchema } from "@/lib/domain/validation";
import { getUserId } from "@/lib/get-user";
import {
  unauthorizedResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const type = searchParams.get("type") || "all";

    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const parseResult = SearchQuerySchema.safeParse({ q: query, type });
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const results = await searchMedia(parseResult.data.q, parseResult.data.type);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search API Error:", error);
    return internalErrorResponse("Failed to search media");
  }
}
