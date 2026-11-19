"use client";

import { useState } from "react";
import { X, Save, Trash2, Loader2 } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { UserMediaItem } from "@/lib/types";

interface EditMediaModalProps {
  item: UserMediaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
}

export default function EditMediaModal({
  item,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: EditMediaModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [status, setStatus] = useState<string>(item?.status || "plan_to_consume");
  const [rating, setRating] = useState<number | "">(
    item?.rating !== null && item?.rating !== undefined ? item.rating : ""
  );
  const [review, setReview] = useState(item?.review || "");
  const [watchedEpisodes, setWatchedEpisodes] = useState(
    item?.watchedEpisodes !== null && item?.watchedEpisodes !== undefined
      ? String(item.watchedEpisodes)
      : ""
  );
  const [readChapters, setReadChapters] = useState(
    item?.readChapters !== null && item?.readChapters !== undefined
      ? String(item.readChapters)
      : ""
  );
  const [hoursPlayed, setHoursPlayed] = useState(
    item?.hoursPlayed !== null && item?.hoursPlayed !== undefined
      ? String(item.hoursPlayed)
      : ""
  );

  // Reset/sync form state during render whenever selected item changes (Rule 3.4 IDOR/stale state fix)
  const [prevItemId, setPrevItemId] = useState<string | null>(item?.id || null);
  if (item && item.id !== prevItemId) {
    setPrevItemId(item.id);
    setStatus(item.status || "plan_to_consume");
    setRating(
      item.rating !== null && item.rating !== undefined ? item.rating : ""
    );
    setReview(item.review || "");
    setWatchedEpisodes(
      item.watchedEpisodes !== null && item.watchedEpisodes !== undefined
        ? String(item.watchedEpisodes)
        : ""
    );
    setReadChapters(
      item.readChapters !== null && item.readChapters !== undefined
        ? String(item.readChapters)
        : ""
    );
    setHoursPlayed(
      item.hoursPlayed !== null && item.hoursPlayed !== undefined
        ? String(item.hoursPlayed)
        : ""
    );
  }

  if (!isOpen || !item) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        status,
        rating: rating !== "" ? Number(rating) : null,
        review: review.trim() || null,
      };

      if (watchedEpisodes !== "")
        payload.watchedEpisodes = parseInt(watchedEpisodes, 10);
      if (readChapters !== "") payload.readChapters = parseInt(readChapters, 10);
      if (hoursPlayed !== "") payload.hoursPlayed = parseFloat(hoursPlayed);

      const res = await fetch(`/api/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`Updated "${item.title}" successfully!`, "success");
        onUpdated();
        onClose();
      } else {
        showToast("Failed to update media item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while updating media", "error");
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/media/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(`Removed "${item.title}" from your library`, "info");
        if (onDeleted) onDeleted();
        else onUpdated();
        setIsConfirmOpen(false);
        onClose();
      } else {
        showToast("Failed to remove media item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while deleting media", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
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
            maxWidth: "540px",
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
          {/* Header with Poster preview */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
            {item.posterUrl && (
              <div
                style={{
                  position: "relative",
                  width: "70px",
                  height: "100px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  style={{ objectFit: "cover" }}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <h3
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: "#fff",
                    lineHeight: 1.25,
                    wordBreak: "break-word",
                  }}
                >
                  {item.title}
                </h3>
                <button onClick={onClose} className="btn-icon">
                  <X size={18} />
                </button>
              </div>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--accent-cyan)",
                  textTransform: "capitalize",
                  marginTop: "4px",
                }}
              >
                {item.mediaType} {item.year ? `• ${item.year}` : ""}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSave}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input-control"
                >
                  <option value="in_progress">
                    {item.mediaType === "game"
                      ? "Playing"
                      : item.mediaType === "manga" || item.mediaType === "novel"
                      ? "Reading"
                      : "Watching"}
                  </option>
                  <option value="completed">Completed</option>
                  <option value="plan_to_consume">
                    {item.mediaType === "game"
                      ? "Plan to Play"
                      : item.mediaType === "manga" || item.mediaType === "novel"
                      ? "Plan to Read"
                      : "Plan to Watch"}
                  </option>
                  <option value="on_hold">On Hold</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Your Score (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  placeholder="Rate 1-10"
                  value={rating}
                  onChange={(e) =>
                    setRating(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="input-control"
                />
              </div>
            </div>

            {/* Progress based on type */}
            {item.mediaType === "game" && (
              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Hours Played
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={hoursPlayed}
                  onChange={(e) => setHoursPlayed(e.target.value)}
                  className="input-control"
                />
              </div>
            )}

            {(item.mediaType === "anime" || item.mediaType === "tv") && (
              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Episodes Watched {item.totalEpisodes ? `/ ${item.totalEpisodes}` : ""}
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    min="0"
                    max={item.totalEpisodes || undefined}
                    value={watchedEpisodes}
                    onChange={(e) => setWatchedEpisodes(e.target.value)}
                    className="input-control"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setWatchedEpisodes(
                        String((parseInt(watchedEpisodes || "0", 10) || 0) + 1)
                      )
                    }
                    className="btn-secondary"
                    style={{ flexShrink: 0, padding: "0 16px" }}
                  >
                    +1 Ep
                  </button>
                </div>
              </div>
            )}

            {(item.mediaType === "manga" || item.mediaType === "novel") && (
              <div>
                <label
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Chapters Read {item.totalChapters ? `/ ${item.totalChapters}` : ""}
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    min="0"
                    max={item.totalChapters || undefined}
                    value={readChapters}
                    onChange={(e) => setReadChapters(e.target.value)}
                    className="input-control"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReadChapters(
                        String((parseInt(readChapters || "0", 10) || 0) + 1)
                      )
                    }
                    className="btn-secondary"
                    style={{ flexShrink: 0, padding: "0 16px" }}
                  >
                    +1 Ch
                  </button>
                </div>
              </div>
            )}

            <div>
              <label
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Personal Review / Notes
              </label>
              <textarea
                rows={3}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                className="input-control"
                style={{ resize: "vertical" }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                disabled={deleting}
                className="btn-secondary"
                style={{
                  color: "var(--status-dropped)",
                  borderColor: "rgba(248, 113, 113, 0.3)",
                }}
              >
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Remove"}
              </button>

              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={`Delete "${item.title}"?`}
        message="Are you sure you want to delete this media entry from your locker? This action cannot be undone."
        confirmText={deleting ? "Deleting..." : "Delete Entry"}
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={executeDelete}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
