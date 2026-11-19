"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Tv, ExternalLink, Gamepad2, Sparkles, ChevronDown } from "lucide-react";
import { WatchProvider, MediaType } from "@/lib/api/types";
import { getDirectStreamingUrl } from "@/lib/api/tmdb";

interface Props {
  providers?: WatchProvider[];
  compact?: boolean;
  title?: string;
  mediaType?: MediaType;
  showQuickSearch?: boolean;
}

export function getProviderTheme(name: string) {
  const lower = (name || "").toLowerCase();

  // Gaming Storefronts
  if (lower.includes("steam")) {
    return {
      color: "#66c0f4",
      bg: "rgba(102, 192, 244, 0.18)",
      border: "rgba(102, 192, 244, 0.4)",
      label: "Steam",
      action: "Play on",
      isGame: true,
      isAnime: false,
    };
  }
  if (lower.includes("epic")) {
    return {
      color: "#f8fafc",
      bg: "rgba(255, 255, 255, 0.16)",
      border: "rgba(255, 255, 255, 0.38)",
      label: "Epic Games",
      action: "Get on",
      isGame: true,
      isAnime: false,
    };
  }
  if (lower.includes("gog")) {
    return {
      color: "#d8b4fe",
      bg: "rgba(168, 85, 247, 0.18)",
      border: "rgba(192, 132, 252, 0.4)",
      label: "GOG",
      action: "Get on",
      isGame: true,
      isAnime: false,
    };
  }
  if (lower.includes("xbox")) {
    return {
      color: "#4ade80",
      bg: "rgba(34, 197, 94, 0.18)",
      border: "rgba(74, 222, 128, 0.4)",
      label: "Xbox",
      action: "Get on",
      isGame: true,
      isAnime: false,
    };
  }
  if (lower.includes("playstation") || lower.includes("psn")) {
    return {
      color: "#60a5fa",
      bg: "rgba(59, 130, 246, 0.18)",
      border: "rgba(96, 165, 250, 0.4)",
      label: "PlayStation",
      action: "Get on",
      isGame: true,
      isAnime: false,
    };
  }

  // Anime & Asian Media
  if (lower.includes("crunchyroll")) {
    return {
      color: "#ff640a",
      bg: "rgba(255, 100, 10, 0.18)",
      border: "rgba(255, 100, 10, 0.42)",
      label: "Crunchyroll",
      action: "Watch on",
      isGame: false,
      isAnime: true,
    };
  }
  if (lower.includes("hidive")) {
    return {
      color: "#38bdf8",
      bg: "rgba(0, 164, 228, 0.18)",
      border: "rgba(56, 189, 248, 0.4)",
      label: "HIDIVE",
      action: "Watch on",
      isGame: false,
      isAnime: true,
    };
  }
  if (lower.includes("viki")) {
    return {
      color: "#00b8ff",
      bg: "rgba(0, 184, 255, 0.18)",
      border: "rgba(0, 184, 255, 0.4)",
      label: "Viki",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }

  // Mainstream Streaming Platforms
  if (lower.includes("netflix")) {
    return {
      color: "#ff4d5a",
      bg: "rgba(229, 9, 20, 0.18)",
      border: "rgba(229, 9, 20, 0.4)",
      label: "Netflix",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("prime") || lower.includes("amazon")) {
    return {
      color: "#38bdf8",
      bg: "rgba(0, 168, 225, 0.18)",
      border: "rgba(0, 168, 225, 0.4)",
      label: "Prime Video",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("disney") || lower.includes("hotstar")) {
    return {
      color: "#60a5fa",
      bg: "rgba(17, 60, 207, 0.25)",
      border: "rgba(96, 165, 250, 0.45)",
      label: lower.includes("hotstar") ? "Hotstar" : "Disney+",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("hbo") || lower.includes("max")) {
    return {
      color: "#c084fc",
      bg: "rgba(168, 85, 247, 0.18)",
      border: "rgba(192, 132, 252, 0.4)",
      label: lower.includes("max") ? "Max" : "HBO",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("apple") || lower.includes("itunes")) {
    return {
      color: "#f1f5f9",
      bg: "rgba(255, 255, 255, 0.12)",
      border: "rgba(255, 255, 255, 0.28)",
      label: "Apple TV",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("hulu")) {
    return {
      color: "#4ade80",
      bg: "rgba(34, 197, 94, 0.18)",
      border: "rgba(74, 222, 128, 0.4)",
      label: "Hulu",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("paramount")) {
    return {
      color: "#93c5fd",
      bg: "rgba(0, 100, 255, 0.2)",
      border: "rgba(147, 197, 253, 0.4)",
      label: "Paramount+",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("peacock")) {
    return {
      color: "#facc15",
      bg: "rgba(234, 179, 8, 0.18)",
      border: "rgba(250, 204, 21, 0.4)",
      label: "Peacock",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("youtube")) {
    return {
      color: "#f87171",
      bg: "rgba(239, 68, 68, 0.18)",
      border: "rgba(248, 113, 113, 0.4)",
      label: "YouTube",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("google play") || lower.includes("google tv")) {
    return {
      color: "#60a5fa",
      bg: "rgba(59, 130, 246, 0.18)",
      border: "rgba(96, 165, 250, 0.4)",
      label: "Google TV",
      action: "Get on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("tubi")) {
    return {
      color: "#fb923c",
      bg: "rgba(251, 146, 60, 0.18)",
      border: "rgba(251, 146, 60, 0.4)",
      label: "Tubi",
      action: "Watch free on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("pluto")) {
    return {
      color: "#fde047",
      bg: "rgba(253, 224, 71, 0.18)",
      border: "rgba(253, 224, 71, 0.4)",
      label: "Pluto TV",
      action: "Watch free on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("jiocinema")) {
    return {
      color: "#f472b6",
      bg: "rgba(244, 114, 182, 0.18)",
      border: "rgba(244, 114, 182, 0.4)",
      label: "JioCinema",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("sony") || lower.includes("liv")) {
    return {
      color: "#4ade80",
      bg: "rgba(74, 222, 128, 0.18)",
      border: "rgba(74, 222, 128, 0.4)",
      label: "Sony LIV",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("zee5")) {
    return {
      color: "#c084fc",
      bg: "rgba(192, 132, 252, 0.18)",
      border: "rgba(192, 132, 252, 0.4)",
      label: "ZEE5",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("discovery")) {
    return {
      color: "#38bdf8",
      bg: "rgba(14, 165, 233, 0.18)",
      border: "rgba(56, 189, 248, 0.4)",
      label: "Discovery+",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("starz")) {
    return {
      color: "#e2e8f0",
      bg: "rgba(226, 232, 240, 0.15)",
      border: "rgba(226, 232, 240, 0.35)",
      label: "Starz",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("mubi")) {
    return {
      color: "#22d3ee",
      bg: "rgba(34, 211, 238, 0.18)",
      border: "rgba(34, 211, 238, 0.4)",
      label: "MUBI",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("criterion")) {
    return {
      color: "#ffffff",
      bg: "rgba(255, 255, 255, 0.15)",
      border: "rgba(255, 255, 255, 0.35)",
      label: "Criterion",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }
  if (lower.includes("iplayer") || lower.includes("bbc")) {
    return {
      color: "#fb7185",
      bg: "rgba(251, 113, 133, 0.18)",
      border: "rgba(251, 113, 133, 0.4)",
      label: "BBC iPlayer",
      action: "Watch on",
      isGame: false,
      isAnime: false,
    };
  }

  return {
    color: "#a5b4fc",
    bg: "rgba(99, 102, 241, 0.16)",
    border: "rgba(129, 140, 248, 0.35)",
    label: name,
    action: "Watch on",
    isGame: false,
    isAnime: false,
  };
}

export interface QuickSearchOption {
  name: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  url: string;
}

export function getQuickSearchProviders(
  title: string,
  mediaType?: MediaType
): QuickSearchOption[] {
  const cleanTitle = encodeURIComponent(title.trim());

  if (mediaType === "game") {
    return [
      {
        name: "Steam",
        label: "Steam",
        color: "#66c0f4",
        bg: "rgba(102, 192, 244, 0.16)",
        border: "rgba(102, 192, 244, 0.35)",
        url: `https://store.steampowered.com/search/?term=${cleanTitle}`,
      },
      {
        name: "Epic Games",
        label: "Epic Games",
        color: "#f8fafc",
        bg: "rgba(255, 255, 255, 0.12)",
        border: "rgba(255, 255, 255, 0.3)",
        url: `https://store.epicgames.com/en-US/browse?q=${cleanTitle}`,
      },
      {
        name: "GOG",
        label: "GOG",
        color: "#d8b4fe",
        bg: "rgba(168, 85, 247, 0.15)",
        border: "rgba(192, 132, 252, 0.35)",
        url: `https://www.gog.com/en/games?query=${cleanTitle}`,
      },
      {
        name: "Xbox",
        label: "Xbox Store",
        color: "#4ade80",
        bg: "rgba(34, 197, 94, 0.15)",
        border: "rgba(74, 222, 128, 0.35)",
        url: `https://www.xbox.com/en-US/games/browse?q=${cleanTitle}`,
      },
      {
        name: "PlayStation",
        label: "PlayStation Store",
        color: "#60a5fa",
        bg: "rgba(59, 130, 246, 0.15)",
        border: "rgba(96, 165, 250, 0.35)",
        url: `https://store.playstation.com/en-us/search/${cleanTitle}`,
      },
    ];
  }

  if (mediaType === "anime") {
    return [
      {
        name: "Crunchyroll",
        label: "Crunchyroll",
        color: "#ff640a",
        bg: "rgba(255, 100, 10, 0.18)",
        border: "rgba(255, 100, 10, 0.4)",
        url: `https://www.crunchyroll.com/search?q=${cleanTitle}`,
      },
      {
        name: "Netflix",
        label: "Netflix",
        color: "#ff4d5a",
        bg: "rgba(229, 9, 20, 0.15)",
        border: "rgba(229, 9, 20, 0.35)",
        url: `https://www.netflix.com/search?q=${cleanTitle}`,
      },
      {
        name: "HIDIVE",
        label: "HIDIVE",
        color: "#38bdf8",
        bg: "rgba(0, 164, 228, 0.15)",
        border: "rgba(56, 189, 248, 0.35)",
        url: `https://www.hidive.com/search?q=${cleanTitle}`,
      },
      {
        name: "Hulu",
        label: "Hulu",
        color: "#4ade80",
        bg: "rgba(34, 197, 94, 0.15)",
        border: "rgba(74, 222, 128, 0.35)",
        url: `https://www.hulu.com/search?q=${cleanTitle}`,
      },
      {
        name: "Prime Video",
        label: "Prime Video",
        color: "#38bdf8",
        bg: "rgba(0, 168, 225, 0.15)",
        border: "rgba(0, 168, 225, 0.35)",
        url: `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${cleanTitle}`,
      },
    ];
  }

  if (mediaType === "manga") {
    return [
      {
        name: "MangaDex",
        label: "MangaDex",
        color: "#ff6740",
        bg: "rgba(255, 103, 64, 0.16)",
        border: "rgba(255, 103, 64, 0.35)",
        url: `https://mangadex.org/search?q=${cleanTitle}`,
      },
      {
        name: "BookWalker",
        label: "BookWalker",
        color: "#38bdf8",
        bg: "rgba(56, 189, 248, 0.15)",
        border: "rgba(56, 189, 248, 0.35)",
        url: `https://global.bookwalker.jp/search/?word=${cleanTitle}`,
      },
      {
        name: "Crunchyroll",
        label: "Crunchyroll",
        color: "#ff640a",
        bg: "rgba(255, 100, 10, 0.15)",
        border: "rgba(255, 100, 10, 0.35)",
        url: `https://www.crunchyroll.com/search?q=${cleanTitle}`,
      },
      {
        name: "Viz",
        label: "VIZ Media",
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.15)",
        border: "rgba(239, 68, 68, 0.35)",
        url: `https://www.viz.com/search?search=${cleanTitle}`,
      },
    ];
  }

  if (mediaType === "novel" || (mediaType as string) === "book") {
    return [
      {
        name: "Open Library",
        label: "Open Library",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.16)",
        border: "rgba(16, 185, 129, 0.35)",
        url: `https://openlibrary.org/search?q=${cleanTitle}`,
      },
      {
        name: "Goodreads",
        label: "Goodreads",
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.16)",
        border: "rgba(245, 158, 11, 0.35)",
        url: `https://www.goodreads.com/search?q=${cleanTitle}`,
      },
      {
        name: "Google Books",
        label: "Google Books",
        color: "#60a5fa",
        bg: "rgba(96, 165, 250, 0.15)",
        border: "rgba(96, 165, 250, 0.35)",
        url: `https://www.google.com/search?tbm=bks&q=${cleanTitle}`,
      },
      {
        name: "Amazon",
        label: "Kindle / Books",
        color: "#f8fafc",
        bg: "rgba(255, 255, 255, 0.12)",
        border: "rgba(255, 255, 255, 0.3)",
        url: `https://www.amazon.com/s?k=${cleanTitle}&i=stripbooks`,
      },
    ];
  }

  return [
    {
      name: "Crunchyroll",
      label: "Crunchyroll",
      color: "#ff640a",
      bg: "rgba(255, 100, 10, 0.15)",
      border: "rgba(255, 100, 10, 0.35)",
      url: `https://www.crunchyroll.com/search?q=${cleanTitle}`,
    },
    {
      name: "Netflix",
      label: "Netflix",
      color: "#ff4d5a",
      bg: "rgba(229, 9, 20, 0.15)",
      border: "rgba(229, 9, 20, 0.35)",
      url: `https://www.netflix.com/search?q=${cleanTitle}`,
    },
    {
      name: "Prime Video",
      label: "Prime Video",
      color: "#38bdf8",
      bg: "rgba(0, 168, 225, 0.15)",
      border: "rgba(0, 168, 225, 0.35)",
      url: `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${cleanTitle}`,
    },
    {
      name: "Disney+",
      label: "Disney+",
      color: "#60a5fa",
      bg: "rgba(17, 60, 207, 0.18)",
      border: "rgba(96, 165, 250, 0.35)",
      url: `https://www.disneyplus.com/search?q=${cleanTitle}`,
    },
    {
      name: "Max",
      label: "Max",
      color: "#c084fc",
      bg: "rgba(168, 85, 247, 0.15)",
      border: "rgba(192, 132, 252, 0.35)",
      url: `https://play.max.com/search?q=${cleanTitle}`,
    },
    {
      name: "Apple TV",
      label: "Apple TV",
      color: "#f1f5f9",
      bg: "rgba(255, 255, 255, 0.12)",
      border: "rgba(255, 255, 255, 0.25)",
      url: `https://tv.apple.com/search?term=${cleanTitle}`,
    },
    {
      name: "Hulu",
      label: "Hulu",
      color: "#4ade80",
      bg: "rgba(34, 197, 94, 0.15)",
      border: "rgba(74, 222, 128, 0.35)",
      url: `https://www.hulu.com/search?q=${cleanTitle}`,
    },
    {
      name: "YouTube",
      label: "YouTube",
      color: "#f87171",
      bg: "rgba(239, 68, 68, 0.15)",
      border: "rgba(248, 113, 113, 0.35)",
      url: `https://www.youtube.com/results?search_query=${cleanTitle}+full+movie`,
    },
  ];
}

export default function WatchProviderBadge({
  providers,
  compact = false,
  title,
  mediaType,
  showQuickSearch = true,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Deduplicate by normalized label
  const seen = new Set<string>();
  const uniqueProviders: WatchProvider[] = [];

  if (providers && providers.length > 0) {
    for (const p of providers) {
      const theme = getProviderTheme(p.name);
      if (!seen.has(theme.label)) {
        seen.add(theme.label);
        uniqueProviders.push(p);
      }
    }
  }

  // Display top 3 providers
  const displayProviders = uniqueProviders.slice(0, 3);
  const quickSearchOptions = title ? getQuickSearchProviders(title, mediaType) : [];

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
        marginTop: "4px",
      }}
    >
      {displayProviders.map((wp, index) => {
        const theme = getProviderTheme(wp.name);

        // Guarantee direct service website URL
        let directUrl = wp.url;
        if (!directUrl || directUrl.includes("themoviedb.org")) {
          directUrl = getDirectStreamingUrl(wp.name, title || wp.name);
        }

        const badgeContent = (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4.5px",
              padding: compact ? "2px 6px" : "3px 8px",
              borderRadius: "5px",
              fontSize: compact ? "0.68rem" : "0.72rem",
              fontWeight: 600,
              color: theme.color,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
              backdropFilter: "blur(6px)",
              transition: "transform 0.15s ease, opacity 0.15s ease",
            }}
          >
            {wp.logoUrl ? (
              <Image
                src={wp.logoUrl}
                alt={theme.label}
                width={12}
                height={12}
                style={{ borderRadius: "2px", objectFit: "cover" }}
              />
            ) : theme.isGame ? (
              <Gamepad2 size={11} color={theme.color} />
            ) : theme.isAnime ? (
              <Sparkles size={11} color={theme.color} />
            ) : (
              <Tv size={11} color={theme.color} />
            )}
            <span>{compact ? theme.label : `${theme.action || "Stream on"} ${theme.label}`}</span>
            {directUrl && <ExternalLink size={9} opacity={0.7} />}
          </span>
        );

        if (directUrl) {
          return (
            <a
              key={index}
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${wp.name} directly on ${theme.label}`}
              style={{ textDecoration: "none", display: "inline-block" }}
            >
              {badgeContent}
            </a>
          );
        }

        return <span key={index}>{badgeContent}</span>;
      })}

      {/* Quick Search Dropdown Toggle (if title is provided and enabled) */}
      {showQuickSearch && title && (
        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setDropdownOpen((prev) => !prev);
            }}
            title="Search title across other streaming services"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              padding: compact ? "2px 5px" : "3px 6px",
              borderRadius: "5px",
              fontSize: compact ? "0.64rem" : "0.68rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              lineHeight: 1.2,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.borderColor = "var(--border-highlight)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border-subtle)";
            }}
          >
            <span>Search on...</span>
            <ChevronDown size={10} />
          </button>

          {dropdownOpen && (
            <>
              {/* Backdrop closer */}
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 998,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDropdownOpen(false);
                }}
              />

              {/* Dropdown Menu */}
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 999,
                  minWidth: "170px",
                  background: "#0d101a",
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  borderRadius: "8px",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.7)",
                  backdropFilter: "blur(12px)",
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "var(--text-dim)",
                    padding: "4px 8px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Direct Searches
                </div>
                {quickSearchOptions.map((opt) => (
                  <a
                    key={opt.name}
                    href={opt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDropdownOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: "5px",
                      textDecoration: "none",
                      color: opt.color,
                      fontSize: "0.74rem",
                      fontWeight: 600,
                      background: "transparent",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = opt.bg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span>{opt.label}</span>
                    <ExternalLink size={10} opacity={0.7} />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
