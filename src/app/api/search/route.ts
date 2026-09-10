import { NextResponse } from "next/server";
import { searchMedia } from "@/lib/api/unified-search";
import { MediaType } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const type = (searchParams.get("type") || "all") as MediaType | "all";

    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchMedia(query, type);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      { error: "Failed to search media" },
      { status: 500 }
    );
  }
}
