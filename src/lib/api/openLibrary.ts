import { MediaSearchResult } from "./types";

interface OpenLibraryDoc {
  key: string;
  title: string;
  first_publish_year?: number;
  cover_i?: number;
  author_name?: string[];
  subject?: string[];
  ratings_average?: number;
}

export async function searchBooks(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const docs: OpenLibraryDoc[] = data.docs || [];

    return docs.map((doc) => {
      const poster = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : null;

      const authors = doc.author_name ? `By ${doc.author_name.slice(0, 2).join(", ")}` : "";

      return {
        externalId: doc.key.replace("/works/", ""),
        externalSource: "openlibrary",
        mediaType: "novel",
        title: doc.title,
        posterUrl: poster,
        year: doc.first_publish_year || null,
        genres: (doc.subject || []).slice(0, 3),
        overview: authors,
        externalRating: doc.ratings_average ? Math.round(doc.ratings_average * 2 * 10) / 10 : null, // Convert 5-star to 10-scale
      };
    });
  } catch (err) {
    console.error("Open Library Search Error:", err);
    return [];
  }
}
