"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Star,
  Heart,
  Calendar,
  Layers,
  Save,
  Trash2,
  Share2,
  FolderPlus,
  Play,
  Film,
  Tv,
  Sparkles,
  Gamepad2,
  BookOpen,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [item, setItem] = useState<any>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [status, setStatus] = useState("plan_to_consume");
  const [rating, setRating] = useState<number | "">("");
  const [review, setReview] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<number>(0);
  const [totalEpisodes, setTotalEpisodes] = useState<number | null>(null);
  const [readChapters, setReadChapters] = useState<number>(0);
  const [totalChapters, setTotalChapters] = useState<number | null>(null);
  const [hoursPlayed, setHoursPlayed] = useState<number>(0);

  // Fetch Media Details & Collections
  const fetchData = async () => {
    try {
      setLoading(true);
      const [mediaRes, collectionsRes] = await Promise.all([
        fetch(`/api/media/${id}`),
        fetch("/api/collections"),
      ]);

      if (mediaRes.ok) {
        const data = await mediaRes.json();
        const m = data.item;
        setItem(m);
        setStatus(m.status);
        setRating(m.rating !== null && m.rating !== undefined ? m.rating : "");
        setReview(m.review || "");
        setIsFavorite(Boolean(m.isFavorite));
        setWatchedEpisodes(m.watchedEpisodes || 0);
        setTotalEpisodes(m.totalEpisodes || null);
        setReadChapters(m.readChapters || 0);
        setTotalChapters(m.totalChapters || null);
        setHoursPlayed(m.hoursPlayed || 0);
      }

      if (collectionsRes.ok) {
        const collData = await collectionsRes.json();
        setCollections(collData.collections || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          rating: rating !== "" ? Number(rating) : null,
          review: review.trim() || null,
          isFavorite,
          watchedEpisodes,
          totalEpisodes,
          readChapters,
          totalChapters,
          hoursPlayed,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to remove "${item?.title}" from your library?`)) return;
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/library");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleCollection = async (collectionId: string, isInCollection: boolean) => {
    try {
      await fetch(`/api/collections/${collectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMediaId: id,
          action: isInCollection ? "remove" : "add",
        }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px", color: "var(--text-muted)" }}>
        Loading media metadata...
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px" }}>
        <h2 style={{ color: "#fff", marginBottom: "12px" }}>Media Not Found</h2>
        <Link href="/library" className="btn-primary">
          Back to Library
        </Link>
      </div>
    );
  }

  // Parse genres
  let genres: string[] = [];
  if (item.genres) {
    try {
      const parsed = JSON.parse(item.genres);
      if (Array.isArray(parsed)) genres = parsed;
    } catch {
      genres = [item.genres];
    }
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Back button */}
      <Link
        href="/library"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          color: "var(--text-muted)",
          textDecoration: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
          marginBottom: "24px",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ArrowLeft size={16} /> Back to Library
      </Link>

      {/* Hero Card */}
      <div
        className="glass-panel"
        style={{
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          position: "relative",
          marginBottom: "36px",
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          background: "linear-gradient(180deg, rgba(26, 30, 48, 0.8) 0%, rgba(13, 16, 26, 0.95) 100%)",
        }}
      >
        {/* Poster Art */}
        <div
          style={{
            position: "relative",
            width: "300px",
            minHeight: "420px",
            backgroundColor: "#131625",
            flexShrink: 0,
          }}
        >
          {item.posterUrl ? (
            <Image
              src={item.posterUrl}
              alt={item.title}
              fill
              priority
              sizes="300px"
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
                color: "var(--text-dim)",
              }}
            >
              <Film size={60} />
            </div>
          )}
        </div>

        {/* Info Column */}
        <div style={{ flex: 1, minWidth: "320px", padding: "36px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <span
              style={{
                textTransform: "uppercase",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "var(--accent-cyan)",
                background: "rgba(6, 182, 212, 0.12)",
                padding: "3px 10px",
                borderRadius: "6px",
              }}
            >
              {item.mediaType}
            </span>
            {item.year && (
              <span style={{ fontSize: "0.9rem", color: "var(--text-dim)", fontWeight: 600 }}>
                {item.year}
              </span>
            )}
            <StatusBadge status={status} />
          </div>

          <h1 style={{ fontSize: "2.4rem", fontWeight: 800, color: "#fff", lineHeight: 1.15, marginBottom: "12px" }}>
            {item.title}
          </h1>

          {/* Genres pills */}
          {genres.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
              {genres.map((g) => (
                <span
                  key={g}
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-subtle)",
                    padding: "4px 10px",
                    borderRadius: "9999px",
                  }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview text */}
          {item.overview && (
            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--text-muted)",
                marginBottom: "28px",
                maxWidth: "700px",
              }}
            >
              {item.overview}
            </p>
          )}

          {/* Quick Favorite & Delete actions */}
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "12px", paddingTop: "20px" }}>
            <button
              onClick={() => {
                setIsFavorite(!isFavorite);
                handleSave();
              }}
              className="btn-secondary"
              style={{
                color: isFavorite ? "var(--accent-pink)" : "var(--text-muted)",
                borderColor: isFavorite ? "rgba(236, 72, 153, 0.4)" : "var(--border-subtle)",
              }}
            >
              <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "Favorited" : "Add to Favorites"}
            </button>

            <button
              onClick={handleDelete}
              className="btn-secondary"
              style={{ color: "var(--status-dropped)", borderColor: "rgba(248, 113, 113, 0.3)" }}
            >
              <Trash2 size={16} /> Remove from Vault
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Tracking Control Center */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "28px",
          marginBottom: "40px",
        }}
      >
        {/* Status, Score & Progress Box */}
        <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-lg)" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>
            Track Your Progress
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Status Picker */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
                Consumption Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="select-control"
              >
                <option value="plan_to_consume">Plan to Watch / Play</option>
                <option value="in_progress">Currently In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            {/* Personal Rating */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Personal Rating
                </label>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#facc15" }}>
                  {rating !== "" ? `★ ${rating} / 10` : "Not rated"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={rating === "" ? 0 : rating}
                onChange={(e) => setRating(Number(e.target.value) === 0 ? "" : Number(e.target.value))}
                style={{ width: "100%", accentColor: "#facc15", cursor: "pointer" }}
              />
            </div>

            {/* Progress Steppers based on mediaType */}
            {item.mediaType === "game" && (
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
                  Total Hours Played
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={hoursPlayed}
                    onChange={(e) => setHoursPlayed(parseFloat(e.target.value) || 0)}
                    className="input-control"
                  />
                  <button
                    type="button"
                    onClick={() => setHoursPlayed(Math.round((hoursPlayed + 1) * 10) / 10)}
                    className="btn-secondary"
                    style={{ flexShrink: 0, padding: "0 18px" }}
                  >
                    +1 Hr
                  </button>
                </div>
              </div>
            )}

            {(item.mediaType === "anime" || item.mediaType === "tv") && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                    Episodes Watched
                  </label>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                    {watchedEpisodes} / {totalEpisodes || "?"} ep
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="number"
                    min="0"
                    max={totalEpisodes || undefined}
                    value={watchedEpisodes}
                    onChange={(e) => setWatchedEpisodes(parseInt(e.target.value, 10) || 0)}
                    className="input-control"
                  />
                  <button
                    type="button"
                    onClick={() => setWatchedEpisodes(watchedEpisodes + 1)}
                    className="btn-secondary"
                    style={{ flexShrink: 0, padding: "0 18px" }}
                  >
                    +1 Ep
                  </button>
                </div>
              </div>
            )}

            {(item.mediaType === "manga" || item.mediaType === "novel") && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                    Chapters Read
                  </label>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                    {readChapters} / {totalChapters || "?"} ch
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="number"
                    min="0"
                    max={totalChapters || undefined}
                    value={readChapters}
                    onChange={(e) => setReadChapters(parseInt(e.target.value, 10) || 0)}
                    className="input-control"
                  />
                  <button
                    type="button"
                    onClick={() => setReadChapters(readChapters + 1)}
                    className="btn-secondary"
                    style={{ flexShrink: 0, padding: "0 18px" }}
                  >
                    +1 Ch
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
              style={{ marginTop: "10px", justifyContent: "center", padding: "12px" }}
            >
              <Save size={16} />
              {saving ? "Saving Changes..." : "Save Progress & Rating"}
            </button>
          </div>
        </div>

        {/* Review & Custom Collections Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Personal Review Box */}
          <div className="glass-panel" style={{ padding: "28px", borderRadius: "var(--radius-lg)", flex: 1 }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
              Personal Journal & Review
            </h3>
            <textarea
              rows={6}
              placeholder="Write down memorable quotes, analysis, critique, or reflections..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="input-control"
              style={{ resize: "vertical", lineHeight: 1.5, marginBottom: "16px" }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Save size={16} /> Save Journal Entry
            </button>
          </div>

          {/* Add to Custom Collections */}
          <div className="glass-panel" style={{ padding: "24px", borderRadius: "var(--radius-lg)" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>
              Custom Collections
            </h4>
            {collections.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {collections.map((col) => {
                  const isIn = col.items?.some((ci: any) => ci.userMediaId === id);
                  return (
                    <button
                      key={col.id}
                      onClick={() => handleToggleCollection(col.id, isIn)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "9999px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        background: isIn ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.04)",
                        color: isIn ? "var(--accent-purple)" : "var(--text-muted)",
                        border: isIn ? "1px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                      }}
                    >
                      {col.name} {isIn ? "✓" : "+"}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                No collections created yet. Create one in the Collections tab!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
