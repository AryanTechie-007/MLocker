"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Search as SearchIcon,
  Film,
  Tv,
  Sparkles,
  Gamepad2,
  BookOpen,
  Plus,
  Star,
  Layers,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import AddMediaModal from "@/components/AddMediaModal";
import { MediaSearchResult, MediaType } from "@/lib/api/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<MediaType | "all">("all");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item for adding
  const [selectedItem, setSelectedItem] = useState<MediaSearchResult | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const categories: Array<{ type: MediaType | "all"; label: string; icon: any }> = [
    { type: "all", label: "All Media", icon: Layers },
    { type: "movie", label: "Movies", icon: Film },
    { type: "tv", label: "TV Shows", icon: Tv },
    { type: "anime", label: "Anime", icon: Sparkles },
    { type: "manga", label: "Manga", icon: Sparkles },
    { type: "novel", label: "Novels & Books", icon: BookOpen },
    { type: "game", label: "Games", icon: Gamepad2 },
  ];

  const handleSearch = async (searchQuery = query, searchType = activeType) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    if (searchType === "game") {
      // Games are manual
      setResults([]);
      setHasSearched(true);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery.trim())}&type=${searchType}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced auto-search on input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        handleSearch(query, activeType);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, activeType]);

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
          Universal <span className="gradient-text">Search & Add</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.98rem" }}>
          Instant access to global movie, TV, anime, manga and book libraries without requiring API keys.
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
            style={{ position: "absolute", left: "16px" }}
          />
          <input
            type="text"
            placeholder="Search by title (e.g. Inception, Breaking Bad, Jujutsu Kaisen, Dune, Elden Ring...)"
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
          <div style={{ position: "absolute", right: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
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
                    setActiveType(cat.type);
                    if (cat.type === "game") {
                      setIsManualModalOpen(true);
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    borderRadius: "9999px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    border: isSelected ? "1px solid var(--accent-cyan)" : "1px solid var(--border-subtle)",
                    background: isSelected
                      ? "linear-gradient(90deg, rgba(139, 92, 246, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%)"
                      : "rgba(255, 255, 255, 0.04)",
                    color: isSelected ? "#fff" : "var(--text-muted)",
                  }}
                >
                  <Icon size={14} color={isSelected ? "var(--accent-cyan)" : "currentColor"} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Add Manually button */}
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="btn-secondary"
            style={{
              fontSize: "0.82rem",
              padding: "7px 14px",
              borderColor: "rgba(139, 92, 246, 0.3)",
              color: "var(--accent-purple)",
            }}
          >
            <Plus size={14} /> Add Title Manually (Games, etc.)
          </button>
        </div>
      </div>

      {/* Special Banner for Games */}
      {activeType === "game" && (
        <div
          className="glass-panel"
          style={{
            padding: "24px",
            marginBottom: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          <div>
            <h4 style={{ color: "#34d399", fontWeight: 700, fontSize: "1.05rem", marginBottom: "4px" }}>
              🎮 Tracking Video Games
            </h4>
            <p style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
              Video games can be added with custom hours played, poster art, platform, and personal reviews.
            </p>
          </div>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="btn-primary"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)" }}
          >
            <Plus size={16} /> Track a Game Now
          </button>
        </div>
      )}

      {/* Results Section */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <Loader2 size={40} className="spinner" color="var(--accent-cyan)" style={{ margin: "0 auto 16px" }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Scanning streaming, literary, and animation registries...
          </p>
        </div>
      ) : results.length > 0 ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Found <strong style={{ color: "#fff" }}>{results.length}</strong> results for &ldquo;{query}&rdquo;
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {results.map((item, idx) => (
              <div
                key={`${item.externalSource}-${item.externalId}-${idx}`}
                className="glass-panel"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  transition: "transform 0.2s ease, border-color 0.2s ease",
                }}
              >
                {/* Poster & Badges */}
                <div style={{ display: "flex", gap: "14px", padding: "14px", flex: 1 }}>
                  <div
                    style={{
                      position: "relative",
                      width: "80px",
                      height: "115px",
                      flexShrink: 0,
                      borderRadius: "6px",
                      overflow: "hidden",
                      backgroundColor: "#151828",
                    }}
                  >
                    {item.posterUrl ? (
                      <Image
                        src={item.posterUrl}
                        alt={item.title}
                        fill
                        sizes="80px"
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
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "var(--text-dim)",
                        }}
                      >
                        <Film size={24} />
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: "var(--accent-cyan)",
                          background: "rgba(6, 182, 212, 0.12)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {item.mediaType}
                      </span>
                      {item.year && (
                        <span style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                          {item.year}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontSize: "0.98rem",
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1.25,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.title}
                    </h3>

                    {item.externalRating && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.78rem",
                          color: "#facc15",
                          marginTop: "6px",
                        }}
                      >
                        <Star size={12} fill="currentColor" />
                        <span>{item.externalRating} / 10</span>
                      </div>
                    )}

                    {item.genres && item.genres.length > 0 && (
                      <p
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--text-dim)",
                          marginTop: "auto",
                          paddingTop: "6px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.genres.slice(0, 2).join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Overview preview */}
                {item.overview && (
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      padding: "0 14px 12px 14px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.overview}
                  </p>
                )}

                {/* Add to Locker CTA */}
                <div style={{ padding: "0 14px 14px 14px", marginTop: "auto" }}>
                  <button
                    onClick={() => setSelectedItem(item)}
                    className="btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: "0.85rem" }}
                  >
                    <Plus size={15} /> Add to My Locker
                  </button>
                </div>
              </div>
            ))}
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
            Try checking spelling or switch categories. If it&apos;s a game, indie book, or custom title, you can add it manually!
          </p>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="btn-primary"
          >
            <Plus size={16} /> Add Custom Title
          </button>
        </div>
      ) : (
        /* Empty landing state for Search */
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

      {/* Add Modals */}
      {selectedItem && (
        <AddMediaModal
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          mediaItem={selectedItem}
        />
      )}

      <AddMediaModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        defaultType={activeType === "all" ? "game" : activeType}
      />
    </div>
  );
}
