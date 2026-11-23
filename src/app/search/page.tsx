"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Search as SearchIcon,
  Film,
  Tv,
  Gamepad2,
  Sparkles,
  BookMarked,
  BookOpen,
  Plus,
  Star,
  Layers,
  Loader2,
} from "lucide-react";
import AddMediaModal from "@/components/AddMediaModal";
import WatchProviderBadge from "@/components/WatchProviderBadge";
import { MediaSearchResult, MediaType } from "@/lib/api/types";
import { apiFetch } from "@/lib/api-client";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<MediaType | "all">("all");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item for adding
  const [selectedItem, setSelectedItem] = useState<MediaSearchResult | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const categories: Array<{ type: MediaType | "all"; label: string; icon: typeof Layers }> = [
    { type: "all", label: "All Titles", icon: Layers },
    { type: "movie", label: "Movies", icon: Film },
    { type: "tv", label: "TV Shows", icon: Tv },
    { type: "anime", label: "Anime", icon: Sparkles },
    { type: "manga", label: "Manga", icon: BookMarked },
    { type: "game", label: "Games", icon: Gamepad2 },
    { type: "novel", label: "Novels & Books", icon: BookOpen },
  ];

  const handleSearch = useCallback(async (searchQuery = query, searchType = activeType) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const data = await apiFetch<{ results: MediaSearchResult[] }>(
        `/api/search?q=${encodeURIComponent(searchQuery.trim())}&type=${searchType}`
      );
      setResults(data.results || []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, [query, activeType]);

  // Debounced auto-search on input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        handleSearch(query, activeType);
      } else if (query.trim().length === 0) {
        setResults([]);
        setHasSearched(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, activeType, handleSearch]);

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
          Universal <span className="gradient-text">Search & Explore</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.98rem" }}>
          Search movies, TV shows, anime, manga, games, and novels/books with direct links to streaming, reading, and gaming storefronts.
        </p>
      </div>

      {/* Search Bar Container */}
      <div
        className="glass-panel"
        style={{
          padding: "20px",
          marginBottom: "28px",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <SearchIcon
            size={20}
            color="var(--accent-purple)"
            style={{ position: "absolute", left: "16px", pointerEvents: "none" }}
          />
          <input
            type="text"
            placeholder="Search titles (e.g. Dune, Stranger Things, Demon Slayer, Elden Ring, Cyberpunk 2077...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="input-control"
            style={{
              paddingLeft: "48px",
              paddingRight: "120px",
              fontSize: "1.05rem",
              height: "52px",
              borderRadius: "var(--radius-sm)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {loading && <Loader2 size={20} className="spinner" color="var(--accent-cyan)" />}
            <button
              onClick={() => handleSearch()}
              className="btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
            >
              Search
            </button>
          </div>
        </div>

        {/* Category Pills & Manual Entry Trigger */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeType === cat.type;
              return (
                <button
                  key={cat.type}
                  onClick={() => {
                    const newType = cat.type;
                    setActiveType(newType);
                    if (query.trim().length >= 2) {
                      handleSearch(query, newType);
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    border: isSelected
                      ? "1px solid var(--accent-purple)"
                      : "1px solid var(--border-subtle)",
                    background: isSelected
                      ? "linear-gradient(90deg, rgba(139, 92, 246, 0.25) 0%, rgba(6, 182, 212, 0.15) 100%)"
                      : "rgba(255, 255, 255, 0.04)",
                    color: isSelected ? "#fff" : "var(--text-muted)",
                  }}
                >
                  <Icon size={15} color={isSelected ? "var(--accent-cyan)" : "currentColor"} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 14px" }}
          >
            <Plus size={15} /> Add Custom Entry
          </button>
        </div>
      </div>

      {/* Results or Empty States */}
      {results.length > 0 ? (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Found <strong style={{ color: "#fff" }}>{results.length}</strong> results for &ldquo;{query}&rdquo;
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))",
              gap: "22px",
            }}
          >
            {results.map((item, idx) => {
              const badgeStyle = (() => {
                switch (item.mediaType) {
                  case "movie":
                    return { color: "#818cf8", bg: "rgba(99, 102, 241, 0.15)", border: "rgba(99, 102, 241, 0.3)" };
                  case "tv":
                    return { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)", border: "rgba(56, 189, 248, 0.3)" };
                  case "anime":
                    return { color: "#c084fc", bg: "rgba(192, 132, 252, 0.15)", border: "rgba(192, 132, 252, 0.3)" };
                  case "manga":
                    return { color: "#f472b6", bg: "rgba(244, 114, 182, 0.15)", border: "rgba(244, 114, 182, 0.3)" };
                  case "novel":
                    return { color: "#34d399", bg: "rgba(52, 211, 153, 0.15)", border: "rgba(52, 211, 153, 0.3)" };
                  case "game":
                    return { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.3)" };
                  default:
                    return { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", border: "rgba(6, 182, 212, 0.3)" };
                }
              })();

              return (
                <div
                  key={`${item.externalSource}-${item.externalId}-${idx}`}
                  className="search-card"
                >
                  {/* Poster & Badges Header */}
                  <div style={{ display: "flex", gap: "14px", padding: "16px 16px 12px 16px" }}>
                    <div
                      style={{
                        position: "relative",
                        width: "84px",
                        height: "120px",
                        flexShrink: 0,
                        borderRadius: "8px",
                        overflow: "hidden",
                        backgroundColor: "#151828",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                      }}
                    >
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt={item.title}
                          fill
                          sizes="84px"
                          className="search-card-poster"
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(255, 255, 255, 0.04)",
                            color: "var(--text-dim)",
                          }}
                        >
                          <Film size={26} />
                        </div>
                      )}
                    </div>

                    {/* Metadata column with guaranteed uniform vertical spacing */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                      }}
                    >
                      {/* Category & Year Row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: badgeStyle.color,
                            background: badgeStyle.bg,
                            border: `1px solid ${badgeStyle.border}`,
                            padding: "2px 7px",
                            borderRadius: "4px",
                          }}
                        >
                          {item.mediaType === "novel" ? "Novel / Book" : item.mediaType}
                        </span>
                        {item.year && (
                          <span
                            style={{
                              fontSize: "0.76rem",
                              color: "var(--text-dim)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {item.year}
                          </span>
                        )}
                      </div>

                      {/* Title: 2 lines max height reserved */}
                      <h3
                        title={item.title}
                        style={{
                          fontSize: "0.98rem",
                          fontWeight: 700,
                          color: "#ffffff",
                          lineHeight: 1.3,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          minHeight: "2.6em",
                        }}
                      >
                        {item.title}
                      </h3>

                      {/* Rating row: Consistent height regardless of presence */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "0.78rem",
                          minHeight: "20px",
                          marginTop: "2px",
                        }}
                      >
                        {item.externalRating ? (
                          <>
                            <Star size={13} fill="#fbbf24" color="#fbbf24" />
                            <span style={{ fontWeight: 700, color: "#fff" }}>
                              {item.externalRating.toFixed(1)}
                            </span>
                            <span style={{ color: "var(--text-dim)", fontSize: "0.72rem" }}>
                              / 10
                            </span>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-dim)", fontSize: "0.72rem" }}>
                            • Rating unavailable
                          </span>
                        )}
                      </div>

                      {/* Streaming / Platform Badge & Quick Search */}
                      <WatchProviderBadge
                        providers={item.watchProviders || []}
                        compact
                        title={item.title}
                        mediaType={item.mediaType}
                        showQuickSearch={true}
                      />

                      {/* Genres */}
                      <p
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--text-dim)",
                          marginTop: "auto",
                          paddingTop: "4px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.genres && item.genres.length > 0
                          ? item.genres.slice(0, 2).join(", ")
                          : "General"}
                      </p>
                    </div>
                  </div>

                  {/* Overview synopsis: Clamped to 2 lines */}
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      padding: "0 16px 14px 16px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      lineHeight: 1.45,
                      minHeight: "2.9em",
                    }}
                  >
                    {item.overview || "No overview available for this release."}
                  </p>

                  {/* Clean CTA Button */}
                  <div style={{ padding: "0 16px 16px 16px", marginTop: "auto" }}>
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="search-card-btn"
                    >
                      <Plus size={14} /> Add to My Locker
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : hasSearched ? (
        <div
          className="glass-panel"
          style={{
            padding: "60px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              marginBottom: "16px",
            }}
          >
            <SearchIcon size={24} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            No results found for &ldquo;{query}&rdquo;
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", marginBottom: "20px" }}>
            Try checking the spelling or switch categories. If it&apos;s a game, indie book, or custom title, you can add it manually!
          </p>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="btn-primary"
          >
            <Plus size={16} /> Add Custom Title
          </button>
        </div>
      ) : (
        /* Clean landing state for Search */
        <div
          className="glass-panel"
          style={{
            padding: "60px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-cyan)",
              marginBottom: "18px",
            }}
          >
            <Sparkles size={28} />
          </div>
          <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
            Search Millions of Titles
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", maxWidth: "480px", lineHeight: 1.5 }}>
            Type any film, anime, novel, manga, or television show above. Or create your own custom media card for video games and rare items.
          </p>
        </div>
      )}

      {/* Add Modals with explicit keys */}
      {selectedItem && (
        <AddMediaModal
          key={`search-item-${selectedItem.externalId || selectedItem.title}`}
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          mediaItem={selectedItem}
        />
      )}

      <AddMediaModal
        key={isManualModalOpen ? `manual-${activeType}` : "manual-closed"}
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        defaultType={activeType === "all" ? "game" : activeType}
      />
    </div>
  );
}
