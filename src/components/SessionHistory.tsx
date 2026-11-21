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
      const res = await fetch(`/api/media/${userMediaId}/sessions?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setTotalCount(data.total || 0);
      }
    } catch {
      showToast("Failed to load session history", "error");
    } finally {
      setLoading(false);
    }
  }, [userMediaId, showToast]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/media/${userMediaId}/sessions?limit=50`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to load");
      })
      .then((data) => {
        if (!ignore) {
          setSessions(data.sessions || []);
          setTotalCount(data.total || 0);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          showToast("Failed to load session history", "error");
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
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
          Manual Entry
        </span>
      );
    }

    switch (session.status) {
      case "active":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            Active Now
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Paused
          </span>
        );
      case "recovered":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
            Crash Recovered
          </span>
        );
      case "abandoned":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30">
            Discarded
          </span>
        );
      case "completed":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
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
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editingNotes.trim() || null }),
      });

      if (!res.ok) {
        showToast("Failed to update session notes", "error");
        return;
      }

      showToast("Session notes updated", "success");
      setEditingSessionId(null);
      fetchSessions();
    } catch {
      showToast("Network error updating session", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete session handler
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    try {
      const res = await fetch(`/api/sessions/${sessionToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        showToast("Failed to delete session", "error");
        return;
      }

      showToast("Session deleted", "success");
      setSessionToDelete(null);
      fetchSessions();
    } catch {
      showToast("Network error deleting session", "error");
    }
  };

  // Compute total observed active time
  const totalActiveSeconds = sessions.reduce((acc, s) => acc + s.activeSeconds, 0);

  return (
    <div className="bg-gray-800/80 border border-gray-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      {/* Header and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-700/60">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            Activity History & Sessions
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Historical active window sessions and retroactive logs.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-gray-900/80 px-3 py-1.5 rounded-lg border border-gray-700/50 text-right">
            <div className="text-xs text-gray-400 font-medium">Total Observed Time</div>
            <div className="text-sm font-bold text-indigo-300 font-mono">
              {formatDuration(totalActiveSeconds)}
            </div>
          </div>
          <div className="bg-gray-900/80 px-3 py-1.5 rounded-lg border border-gray-700/50 text-right">
            <div className="text-xs text-gray-400 font-medium">Total Sessions</div>
            <div className="text-sm font-bold text-indigo-300 font-mono">{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Sessions Timeline List */}
      <div className="mt-4">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mr-2" />
            Loading session history...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <Clock className="w-10 h-10 mx-auto text-gray-500 mb-2 opacity-60" />
            <p className="text-sm font-medium">No recorded sessions yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Start an active tracking session or log a manual entry above.
            </p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(s)}
                    <span className="text-sm font-bold font-mono text-white">
                      {formatDuration(s.activeSeconds)}
                    </span>
                    {s.closeReason && (
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {getReasonLabel(s.closeReason)}
                      </span>
                    )}
                    {s.progressEnd !== null && s.progressEnd !== undefined && (
                      <span className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded">
                        Progress: #{s.progressEnd}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(s.startedAt)}
                    </span>

                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleStartEdit(s)}
                        title="Edit session notes"
                        className="p-1 hover:text-white rounded hover:bg-gray-800 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setSessionToDelete(s)}
                        title="Delete session"
                        className="p-1 hover:text-rose-400 rounded hover:bg-gray-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notes editing or display */}
                {editingSessionId === s.id ? (
                  <div className="mt-3 pt-3 border-t border-gray-700/40 flex flex-col gap-2">
                    <textarea
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Add notes or review for this session..."
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingSessionId(null)}
                        disabled={savingEdit}
                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(s.id)}
                        disabled={savingEdit}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                      >
                        {savingEdit ? "Saving..." : "Save Notes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  s.notes && (
                    <div className="mt-2.5 pt-2 border-t border-gray-800/80 text-xs text-gray-300 italic flex items-start gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
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
