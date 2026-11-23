"use client";

import React, { useState } from "react";
import { X, Calendar, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userMediaId: string;
  mediaTitle: string;
  mediaType: string;
  currentProgress?: number | null;
  onSessionCreated: () => void;
}

// Helper to format ISO datetime-local string
function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ManualSessionModal({
  isOpen,
  onClose,
  userMediaId,
  mediaTitle,
  mediaType,
  currentProgress = 0,
  onSessionCreated,
}: Props) {
  const { showToast } = useToast();

  const [startedAt, setStartedAt] = useState<string>(() => {
    const now = new Date();
    return toLocalISO(new Date(now.getTime() - 30 * 60 * 1000));
  });
  const [endedAt, setEndedAt] = useState<string>(() => toLocalISO(new Date()));
  const [activeMinutes, setActiveMinutes] = useState<number>(30);
  const [notes, setNotes] = useState<string>("");
  const [progressEnd, setProgressEnd] = useState<number | "">(
    currentProgress ? currentProgress + 1 : ""
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form State Hygiene (AGENTS.md Section 3.4 & Audit § 46):
  // Sync/reset form state during render whenever selected media item or modal open state changes
  const [prevItemId, setPrevItemId] = useState<string>(userMediaId);
  const [prevIsOpen, setPrevIsOpen] = useState<boolean>(isOpen);

  if (userMediaId !== prevItemId || (isOpen && !prevIsOpen)) {
    setPrevItemId(userMediaId);
    setPrevIsOpen(isOpen);
    const now = new Date();
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
    setStartedAt(toLocalISO(thirtyMinsAgo));
    setEndedAt(toLocalISO(now));
    setActiveMinutes(30);
    setNotes("");
    setProgressEnd(currentProgress ? currentProgress + 1 : "");
    setError(null);
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setError("Please provide valid start and end dates/times.");
      return;
    }

    if (endDate < startDate) {
      setError("End date/time cannot be earlier than start date/time.");
      return;
    }

    const nowBuffer = Date.now() + 5 * 60 * 1000;
    if (endDate.getTime() > nowBuffer) {
      setError("Session cannot end in the future.");
      return;
    }

    const wallClockSecs = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
    const activeSecs = activeMinutes * 60;

    if (activeSecs <= 0) {
      setError("Active minutes must be greater than 0.");
      return;
    }

    if (activeSecs > wallClockSecs) {
      setError(
        `Active duration (${activeMinutes}m) cannot exceed total elapsed time (${Math.floor(wallClockSecs / 60)}m).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMediaId,
          sourceType: "manual",
          startedAt: startDate.toISOString(),
          endedAt: endDate.toISOString(),
          activeSeconds: activeSecs,
          notes: notes.trim() || null,
          progressStart: currentProgress || null,
          progressEnd: progressEnd === "" ? null : Number(progressEnd),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to record manual session");
        return;
      }

      showToast("Manual session recorded successfully", "success");
      onSessionCreated();
      onClose();
    } catch {
      setError("Network error while recording session");
    } finally {
      setSubmitting(false);
    }
  };

  const getProgressLabel = () => {
    if (mediaType === "anime" || mediaType === "tv") return "Episode Reached";
    if (mediaType === "manga" || mediaType === "novel") return "Chapter Reached";
    if (mediaType === "game") return "New Total Hours";
    return "Progress Reached";
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
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
          maxWidth: "520px",
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
            marginBottom: "6px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Calendar size={18} style={{ color: "var(--accent-purple)" }} />
              Log Retroactive Session
            </h2>
            <p
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                marginTop: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "380px",
              }}
            >
              {mediaTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ width: "32px", height: "32px" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}
        >
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(248, 113, 113, 0.15)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                color: "var(--status-dropped)",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
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
                Started At
              </label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                required
                className="input-control"
                style={{ fontSize: "0.85rem" }}
              />
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
                Ended At
              </label>
              <input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
                required
                className="input-control"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
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
                Observed Active Time (Minutes)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={activeMinutes}
                  onChange={(e) => setActiveMinutes(Number(e.target.value))}
                  required
                  className="input-control"
                  style={{ paddingRight: "40px", fontSize: "0.85rem" }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "0.78rem",
                    color: "var(--text-dim)",
                  }}
                >
                  min
                </span>
              </div>
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
                {getProgressLabel()} (Optional)
              </label>
              <input
                type="number"
                min="0"
                value={progressEnd}
                onChange={(e) =>
                  setProgressEnd(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder={currentProgress ? `Current: ${currentProgress}` : "e.g. 1"}
                className="input-control"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
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
              Session Notes & Review
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you read, watch, or accomplish during this session?"
              maxLength={2000}
              className="input-control"
              style={{ fontSize: "0.85rem", resize: "vertical" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
              paddingTop: "16px",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary"
              style={{ padding: "8px 18px", fontSize: "0.85rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ padding: "8px 22px", fontSize: "0.85rem" }}
            >
              {submitting ? "Saving..." : "Save Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
