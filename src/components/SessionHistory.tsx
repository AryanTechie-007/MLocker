"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  Trash2,
  Edit2,
  Clock,
  Calendar,
  FileText,
  Loader2,
} from "lucide-react";
import { ActivitySessionItem } from "@/lib/api/types";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { apiFetch, getErrorMessage } from "@/lib/api-client";

interface Props {
  userMediaId: string;
  mediaTitle?: string;
  refreshTrigger?: number;
}

export default function SessionHistory({
  userMediaId,
  refreshTrigger = 0,
}: Props) {
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<ActivitySessionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [sessionToDelete, setSessionToDelete] = useState<ActivitySessionItem | null>(null);

  // Editing notes state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: ActivitySessionItem[]; total: number }>(
        `/api/media/${userMediaId}/sessions?limit=50`
      );
      setSessions(data.sessions || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error("Fetch sessions error:", err);
      showToast(getErrorMessage(err, "Failed to load session history"), "error");
    } finally {
      setLoading(false);
    }
  }, [userMediaId, showToast]);

  useEffect(() => {
    let ignore = false;
    apiFetch<{ sessions: ActivitySessionItem[]; total: number }>(
      `/api/media/${userMediaId}/sessions?limit=50`
    )
      .then((data) => {
        if (!ignore) {
          setSessions(data.sessions || []);
          setTotalCount(data.total || 0);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Initial session fetch error:", err);
          showToast(getErrorMessage(err, "Failed to load session history"), "error");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [userMediaId, refreshTrigger, showToast]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h`;
    if (mins > 0) return `${mins}m`;
    return `${secs}s`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
      }).format(d);
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (session: ActivitySessionItem) => {
    if (session.isManual) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: "9999px",
            fontSize: "0.72rem",
            fontWeight: 600,
            backgroundColor: "rgba(251, 191, 36, 0.15)",
            color: "var(--status-on-hold)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
          }}
        >
          Manual Entry
        </span>
      );
    }

    switch (session.status) {
      case "active":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              backgroundColor: "rgba(52, 211, 153, 0.15)",
              color: "var(--status-completed)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
            }}
          >
            Active Now
          </span>
        );
      case "paused":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              backgroundColor: "rgba(251, 191, 36, 0.15)",
              color: "var(--status-on-hold)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
            }}
          >
            Paused
          </span>
        );
      case "recovered":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              color: "var(--accent-purple)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
            }}
          >
            Crash Recovered
          </span>
        );
      case "abandoned":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              backgroundColor: "rgba(248, 113, 113, 0.15)",
              color: "var(--status-dropped)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
            }}
          >
            Discarded
          </span>
        );
      case "completed":
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              backgroundColor: "rgba(6, 182, 212, 0.15)",
              color: "var(--accent-cyan)",
              border: "1px solid rgba(6, 182, 212, 0.3)",
            }}
          >
            Completed
          </span>
        );
    }
  };

  const getReasonLabel = (reason: string | null) => {
    if (!reason) return null;
    switch (reason) {
      case "clean_shutdown":
        return "App Shutdown";
      case "crash_recovery":
        return "Crash Recovery";
      case "inactivity_timeout":
        return "Inactivity Timeout";
      case "active_gap":
        return "Active Gap Exceeded";
      case "max_duration":
        return "Max 12h Duration";
      case "unrecoverable_sequence_gap":
        return "Sequence Gap Rollover";
      case "manual_entry":
        return "Retroactive Entry";
      case "user_stop":
        return "Manual Stop";
      case "user_discard":
        return "Discarded by User";
      default:
        return reason;
    }
  };

  // Edit notes handlers
  const handleStartEdit = (session: ActivitySessionItem) => {
    setEditingSessionId(session.id);
    setEditingNotes(session.notes || "");
  };

  const handleSaveEdit = async (sessionId: string) => {
    setSavingEdit(true);
    try {
      await apiFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: { notes: editingNotes.trim() || null },
      });

      showToast("Session notes updated", "success");
      setEditingSessionId(null);
      fetchSessions();
    } catch (err) {
      console.error("Save edit session error:", err);
      showToast(getErrorMessage(err, "Failed to update session notes"), "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete session handler
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    try {
      await apiFetch(`/api/sessions/${sessionToDelete.id}`, {
        method: "DELETE",
      });

      showToast("Session deleted", "success");
      setSessionToDelete(null);
      fetchSessions();
    } catch (err) {
      console.error("Delete session error:", err);
      showToast(getErrorMessage(err, "Failed to delete session"), "error");
    }
  };

  // Compute total observed active time
  const totalActiveSeconds = sessions.reduce((acc, s) => acc + s.activeSeconds, 0);

  return (
    <div
      className="glass-panel"
      style={{
        padding: "24px",
        borderRadius: "var(--radius-lg)",
      }}
    >
      {/* Header and stats */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "1.15rem",
              fontWeight: 700,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <History size={18} style={{ color: "var(--accent-purple)" }} />
            Activity History & Sessions
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>
            Historical active window sessions and retroactive logs.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              backgroundColor: "var(--bg-elevated)",
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500 }}>
              Total Observed Time
            </div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--accent-purple)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {formatDuration(totalActiveSeconds)}
            </div>
          </div>
          <div
            style={{
              backgroundColor: "var(--bg-elevated)",
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500 }}>
              Total Sessions
            </div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--accent-cyan)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {totalCount}
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Timeline List */}
      <div style={{ marginTop: "16px" }}>
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 0",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
            }}
          >
            <Loader2 size={20} className="animate-spin" style={{ marginRight: "8px", color: "var(--accent-purple)" }} />
            Loading session history...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <Clock size={36} style={{ margin: "0 auto 10px", color: "var(--text-dim)", opacity: 0.5 }} />
            <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-muted)" }}>
              No recorded sessions yet
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "4px" }}>
              Start an active tracking session or log a manual entry above.
            </p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="glass-panel"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 18px",
                  transition: "border-color 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {getStatusBadge(s)}
                    <span
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        color: "#fff",
                      }}
                    >
                      {formatDuration(s.activeSeconds)}
                    </span>
                    {s.closeReason && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-dim)",
                          backgroundColor: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid var(--border-subtle)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {getReasonLabel(s.closeReason)}
                      </span>
                    )}
                    {s.progressEnd !== null && s.progressEnd !== undefined && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--accent-purple)",
                          backgroundColor: "rgba(139, 92, 246, 0.12)",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        Progress: #{s.progressEnd}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      fontSize: "0.8rem",
                      color: "var(--text-dim)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Calendar size={13} />
                      {formatDate(s.startedAt)}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "8px" }}>
                      <button
                        onClick={() => handleStartEdit(s)}
                        title="Edit session notes"
                        className="btn-icon"
                        style={{ width: "28px", height: "28px" }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setSessionToDelete(s)}
                        title="Delete session"
                        className="btn-icon"
                        style={{ width: "28px", height: "28px", color: "var(--status-dropped)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notes editing or display */}
                {editingSessionId === s.id ? (
                  <div
                    style={{
                      marginTop: "12px",
                      paddingTop: "12px",
                      borderTop: "1px solid var(--border-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <textarea
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Add notes or review for this session..."
                      rows={2}
                      className="input-control"
                      style={{ fontSize: "0.85rem", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                      <button
                        onClick={() => setEditingSessionId(null)}
                        disabled={savingEdit}
                        className="btn-secondary"
                        style={{ padding: "4px 12px", fontSize: "0.78rem" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(s.id)}
                        disabled={savingEdit}
                        className="btn-primary"
                        style={{ padding: "4px 14px", fontSize: "0.78rem" }}
                      >
                        {savingEdit ? "Saving..." : "Save Notes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  s.notes && (
                    <div
                      style={{
                        marginTop: "10px",
                        paddingTop: "8px",
                        borderTop: "1px solid var(--border-subtle)",
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px",
                      }}
                    >
                      <FileText size={13} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: "2px" }} />
                      <span>&ldquo;{s.notes}&rdquo;</span>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(sessionToDelete)}
        title="Delete Session Record"
        message="Are you sure you want to delete this activity session? This action cannot be undone and will deduct the observed time from your statistics."
        confirmText="Delete Session"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setSessionToDelete(null)}
      />
    </div>
  );
}
