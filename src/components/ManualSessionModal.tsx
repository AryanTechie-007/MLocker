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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700/60 bg-gray-800/80">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Log Retroactive Session
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">
              {mediaTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Started At
              </label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Ended At
              </label>
              <input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Observed Active Time (Minutes)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={activeMinutes}
                  onChange={(e) => setActiveMinutes(Number(e.target.value))}
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">
                  min
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
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
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Session Notes & Review
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you read, watch, or accomplish during this session?"
              maxLength={2000}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700/60">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-md disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
