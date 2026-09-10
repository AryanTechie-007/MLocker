"use client";

import { useState } from "react";
import { X, Star, Plus, Check } from "lucide-react";
import Image from "next/image";

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaItem?: any; // prefilled search result, or undefined for manual entry
  onSuccess?: () => void;
  defaultType?: string;
}

export default function AddMediaModal({
  isOpen,
  onClose,
  mediaItem,
  onSuccess,
  defaultType = "game",
}: AddMediaModalProps) {
  const [loading, setLoading] = useState(false);

  // Form State
  const [mediaType, setMediaType] = useState(mediaItem?.mediaType || defaultType);
  const [title, setTitle] = useState(mediaItem?.title || "");
  const [posterUrl, setPosterUrl] = useState(mediaItem?.posterUrl || "");
  const [year, setYear] = useState(mediaItem?.year ? String(mediaItem.year) : "");
  const [status, setStatus] = useState("plan_to_consume");
  const [rating, setRating] = useState<number | "">(mediaItem?.externalRating ? Math.round(mediaItem.externalRating) : "");
  const [review, setReview] = useState("");
  const [watchedEpisodes, setWatchedEpisodes] = useState("");
  const [totalEpisodes, setTotalEpisodes] = useState(mediaItem?.totalEpisodes ? String(mediaItem.totalEpisodes) : "");
  const [readChapters, setReadChapters] = useState("");
  const [totalChapters, setTotalChapters] = useState(mediaItem?.totalChapters ? String(mediaItem.totalChapters) : "");
  const [hoursPlayed, setHoursPlayed] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const payload = {
        mediaType,
        externalId: mediaItem?.externalId || null,
        externalSource: mediaItem?.externalSource || "manual",
        title: title.trim(),
        posterUrl: posterUrl.trim() || null,
        year: year ? parseInt(year, 10) : null,
        genres: mediaItem?.genres || [],
        overview: mediaItem?.overview || "",
        status,
        rating: rating !== "" ? Number(rating) : null,
        review: review.trim() || null,
        watchedEpisodes: watchedEpisodes ? parseInt(watchedEpisodes, 10) : 0,
        totalEpisodes: totalEpisodes ? parseInt(totalEpisodes, 10) : null,
        readChapters: readChapters ? parseInt(readChapters, 10) : 0,
        totalChapters: totalChapters ? parseInt(totalChapters, 10) : null,
        hoursPlayed: hoursPlayed ? parseFloat(hoursPlayed) : 0,
      };

      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-highlight)",
          borderRadius: "var(--radius-lg)",
          padding: "28px",
          boxShadow: "var(--shadow-pop)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>
              {mediaItem ? "Add to Locker" : "Track New Media"}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              {mediaItem ? "Set your tracking status and personal rating" : "Manual entry for games, books, or unlisted media"}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>

        {/* Media Preview if provided */}
        {mediaItem && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              padding: "12px",
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "20px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {mediaItem.posterUrl && (
              <div style={{ position: "relative", width: "60px", height: "85px", flexShrink: 0, borderRadius: "6px", overflow: "hidden" }}>
                <Image src={mediaItem.posterUrl} alt={mediaItem.title} fill style={{ objectFit: "cover" }} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>{mediaItem.title}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", textTransform: "capitalize" }}>
                {mediaItem.mediaType} {mediaItem.year ? `• ${mediaItem.year}` : ""}
              </span>
              {mediaItem.externalRating && (
                <span style={{ fontSize: "0.78rem", color: "#facc15", marginTop: "4px" }}>
                  ★ {mediaItem.externalRating} / 10 (Global Score)
                </span>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Manual Entry Fields if no mediaItem passed */}
          {!mediaItem && (
            <>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Category
                </label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value)}
                  className="select-control"
                >
                  <option value="game">Game (PC, Console, Mobile)</option>
                  <option value="movie">Movie</option>
                  <option value="tv">TV Series</option>
                  <option value="anime">Anime</option>
                  <option value="manga">Manga</option>
                  <option value="novel">Novel / Book</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elden Ring, The Witcher 3, Cyberpunk 2077"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-control"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Poster Image URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    className="input-control"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Release Year
                  </label>
                  <input
                    type="number"
                    placeholder="2024"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="input-control"
                  />
                </div>
              </div>
            </>
          )}

          {/* Tracking Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                Status
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

            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                Personal Score (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                placeholder="Rate 1 to 10"
                value={rating}
                onChange={(e) => setRating(e.target.value === "" ? "" : Number(e.target.value))}
                className="input-control"
              />
            </div>
          </div>

          {/* Progress Fields by Type */}
          {mediaType === "game" && (
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                Hours Played
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g. 45.5"
                value={hoursPlayed}
                onChange={(e) => setHoursPlayed(e.target.value)}
                className="input-control"
              />
            </div>
          )}

          {(mediaType === "anime" || mediaType === "tv") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Watched Episodes
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={watchedEpisodes}
                  onChange={(e) => setWatchedEpisodes(e.target.value)}
                  className="input-control"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Total Episodes
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unknown"
                  value={totalEpisodes}
                  onChange={(e) => setTotalEpisodes(e.target.value)}
                  className="input-control"
                />
              </div>
            </div>
          )}

          {(mediaType === "manga" || mediaType === "novel") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Read Chapters
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={readChapters}
                  onChange={(e) => setReadChapters(e.target.value)}
                  className="input-control"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  Total Chapters
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unknown"
                  value={totalChapters}
                  onChange={(e) => setTotalChapters(e.target.value)}
                  className="input-control"
                />
              </div>
            </div>
          )}

          {/* Quick Review / Notes */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              Notes & Thoughts (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="What did you think of it so far? Favorite character, mechanics, etc."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="input-control"
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              <Plus size={16} />
              {loading ? "Adding..." : "Add to Locker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
