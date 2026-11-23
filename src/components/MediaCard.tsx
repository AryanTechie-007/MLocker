"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, Heart, Film, Tv, Sparkles, Gamepad2, BookOpen, Edit2, BookMarked } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { useState } from "react";
import { useToast } from "./Toast";
import WatchProviderBadge from "./WatchProviderBadge";
import { UserMediaItem, WatchProvider } from "@/lib/types";
import { apiFetch, getErrorMessage } from "@/lib/api-client";

interface MediaCardProps {
  item: UserMediaItem;
  onEdit?: (item: UserMediaItem) => void;
  onToggleFavorite?: (id: string, current: boolean) => void;
}

export default function MediaCard({ item, onEdit, onToggleFavorite }: MediaCardProps) {
  const { showToast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(item.isFavorite));

  const getTypeIcon = () => {
    switch (item.mediaType) {
      case "movie":
        return <Film size={13} />;
      case "tv":
        return <Tv size={13} />;
      case "anime":
        return <Sparkles size={13} />;
      case "manga":
        return <BookMarked size={13} />;
      case "game":
        return <Gamepad2 size={13} />;
      case "novel":
        return <BookOpen size={13} />;
      default:
        return <Film size={13} />;
    }
  };

  // Calculate progress percentage
  let progressText = "";
  let progressPercent = 0;

  if (item.mediaType === "game" && item.hoursPlayed !== undefined && item.hoursPlayed !== null) {
    progressText = `${item.hoursPlayed} hrs`;
  } else if ((item.mediaType === "anime" || item.mediaType === "tv") && item.watchedEpisodes !== undefined) {
    if (item.totalEpisodes) {
      progressText = `${item.watchedEpisodes || 0} / ${item.totalEpisodes} ep`;
      progressPercent = Math.min(100, Math.round(((item.watchedEpisodes || 0) / item.totalEpisodes) * 100));
    } else if (item.watchedEpisodes) {
      progressText = `${item.watchedEpisodes} ep`;
    }
  } else if ((item.mediaType === "manga" || item.mediaType === "novel") && item.readChapters !== undefined) {
    if (item.totalChapters) {
      progressText = `${item.readChapters || 0} / ${item.totalChapters} ch`;
      progressPercent = Math.min(100, Math.round(((item.readChapters || 0) / item.totalChapters) * 100));
    } else if (item.readChapters) {
      progressText = `${item.readChapters} ch`;
    }
  }

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextVal = !favorite;
    setFavorite(nextVal);
    if (onToggleFavorite) {
      onToggleFavorite(item.id, !favorite);
    } else {
      try {
        await apiFetch(`/api/media/${item.id}`, {
          method: "PATCH",
          body: { isFavorite: nextVal },
        });
        showToast(
          nextVal ? `Added "${item.title}" to favorites` : `Removed "${item.title}" from favorites`,
          "info"
        );
      } catch (err) {
        console.error("Toggle favorite in card error:", err);
        setFavorite(!nextVal);
        showToast(getErrorMessage(err, "Failed to update favorite status"), "error");
      }
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        position: "relative",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-card)",
        transition: "transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.borderColor = "var(--border-highlight)";
        e.currentTarget.style.boxShadow = "var(--shadow-pop)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.boxShadow = "var(--shadow-subtle)";
      }}
    >
      {/* Poster Image Container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          paddingTop: "140%", // 1:1.4 aspect ratio
          backgroundColor: "#121524",
          overflow: "hidden",
        }}
      >
        {item.posterUrl && !imgError ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            style={{ objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
              color: "var(--text-dim)",
              padding: "16px",
              textAlign: "center",
            }}
          >
            {getTypeIcon()}
            <span style={{ fontSize: "0.8rem", marginTop: "8px", fontWeight: 600 }}>
              {item.title}
            </span>
          </div>
        )}

        {/* Media Type Tag Overlay */}
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            background: "rgba(13, 16, 26, 0.8)",
            backdropFilter: "blur(8px)",
            padding: "4px 8px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--accent-cyan)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          {getTypeIcon()}
          {item.mediaType}
        </div>

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(13, 16, 26, 0.8)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.2s ease",
            color: favorite ? "var(--accent-pink)" : "rgba(255, 255, 255, 0.6)",
          }}
          title={favorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart size={16} fill={favorite ? "currentColor" : "none"} />
        </button>

        {/* Progress Bar (if available) */}
        {progressPercent > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "rgba(0, 0, 0, 0.5)",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "var(--accent-gradient)",
              }}
            />
          </div>
        )}
      </div>

      {/* Content Details */}
      <div style={{ padding: "14px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
          <Link
            href={`/media/${item.id}`}
            style={{
              fontWeight: 700,
              fontSize: "0.96rem",
              color: "var(--text-main)",
              textDecoration: "none",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.3,
            }}
            title={item.title}
          >
            {item.title}
          </Link>
          {item.year && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontWeight: 600 }}>
              {item.year}
            </span>
          )}
        </div>

        {/* Streaming Platform Badge if available */}
        {(() => {
          let providers: WatchProvider[] = [];
          if (item.tags) {
            try {
              const parsed = JSON.parse(item.tags);
              if (Array.isArray(parsed)) {
                providers = parsed.map((p) => (typeof p === "string" ? { name: p } : p));
              }
            } catch {
              providers = item.tags.split(",").map((s) => ({ name: s.trim() })).filter((p) => p.name);
            }
          }
          if (providers.length === 0) {
            if (item.mediaType === "anime") {
              providers = [{ name: "Crunchyroll" }];
            } else if (item.mediaType === "game") {
              providers = [{ name: "Steam" }];
            } else if (item.externalSource === "itunes") {
              providers = [{ name: "Apple TV" }];
            }
          }
          return providers.length > 0 ? (
            <div style={{ marginTop: "4px" }}>
              <WatchProviderBadge
                providers={providers}
                compact
                title={item.title}
                mediaType={item.mediaType}
                showQuickSearch={false}
              />
            </div>
          ) : null;
        })()}

        {/* Status and Rating Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: "10px",
          }}
        >
          <StatusBadge status={item.status} />

          {item.rating ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#facc15",
              }}
            >
              <Star size={14} fill="currentColor" />
              <span>{item.rating}</span>
            </div>
          ) : progressText ? (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {progressText}
            </span>
          ) : null}
        </div>

        {/* Quick Edit button */}
        {onEdit && (
          <button
            onClick={() => onEdit(item)}
            className="btn-secondary"
            style={{
              marginTop: "12px",
              padding: "6px 12px",
              fontSize: "0.8rem",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <Edit2 size={13} />
            Quick Update
          </button>
        )}
      </div>
    </div>
  );
}
