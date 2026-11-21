"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Square,
  Trash2,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
} from "lucide-react";
import { MediaSourceItem, ActivitySessionItem } from "@/lib/api/types";
import { useToast } from "@/components/Toast";

interface Props {
  userMediaId: string;
  mediaTitle?: string;
  mediaType?: string;
  sources?: MediaSourceItem[];
  onSessionComplete?: (session: {
    id: string;
    activeSeconds: number;
    progressEnd?: number | null;
  }) => void;
}

interface QueuedPulse {
  sequenceNumber: number;
  clientNonce: string;
  timestamp: string;
  durationSeconds: number;
  isFocused: boolean;
  eventType?: "HEARTBEAT" | "PAUSE" | "RESUME" | "STOP" | "DISCARD";
}

export default function ActiveSessionTracker({
  userMediaId,
  sources = [],
  onSessionComplete,
}: Props) {
  const { showToast } = useToast();

  const [session, setSession] = useState<ActivitySessionItem | null>(null);
  const [trackingState, setTrackingState] = useState<"idle" | "active" | "paused">("idle");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // References for heartbeat management & FIFO queue
  const queueRef = useRef<QueuedPulse[]>([]);
  const isTransmittingRef = useRef<boolean>(false);
  const sequenceCounterRef = useRef<number>(0);
  const sessionRef = useRef<ActivitySessionItem | null>(null);
  const isFocusedRef = useRef<boolean>(true);

  // Keep sessionRef synchronized inside effect (avoid updating ref during render)
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Track window focus/blur and visibility change
  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
      isFocusedRef.current = true;
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
      isFocusedRef.current = false;
    };
    const handleVisibilityChange = () => {
      const focused = document.visibilityState === "visible";
      setIsWindowFocused(focused);
      isFocusedRef.current = focused;
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Format seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Recover into fresh session on unrecoverable sequence gap
  const recoverNewSession = useCallback(
    async (oldSessionId: string) => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId,
            sourceType: "web",
            supersededSessionId: oldSessionId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSession(data.session);
          sequenceCounterRef.current = 0;
          setElapsedSeconds(0);
          setTrackingState("active");
        }
      } catch {}
    },
    [userMediaId]
  );

  // Process FIFO retransmission queue
  const processQueue = async () => {
    if (isTransmittingRef.current || queueRef.current.length === 0) {
      return;
    }

    const currentSession = sessionRef.current;
    if (!currentSession) {
      queueRef.current = [];
      return;
    }

    isTransmittingRef.current = true;
    const pulse = queueRef.current[0];

    try {
      const res = await fetch("/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSession.id,
          userMediaId,
          sequenceNumber: pulse.sequenceNumber,
          clientNonce: pulse.clientNonce,
          timestamp: pulse.timestamp,
          durationSeconds: pulse.durationSeconds,
          isFocused: pulse.isFocused,
          eventType: pulse.eventType ?? "HEARTBEAT",
        }),
      });

      if (res.ok) {
        // Successfully acknowledged: remove head from FIFO queue
        queueRef.current.shift();
        const data = await res.json();
        if (data.activeSeconds !== undefined) {
          setElapsedSeconds(data.activeSeconds);
        }
      } else if (res.status === 409) {
        const errorData = await res.json();

        if (errorData.code === "SEQUENCE_GAP") {
          const expectedSeq = errorData.details?.expectedSequence;
          const foundIndex = queueRef.current.findIndex(
            (p) => p.sequenceNumber === expectedSeq
          );

          if (foundIndex > 0) {
            // Re-order queue: place missing sequence at head
            const missingPulse = queueRef.current.splice(foundIndex, 1)[0];
            queueRef.current.unshift(missingPulse);
          } else {
            // Unrecoverable gap: call superseded session start
            showToast(
              "Sequence gap unrecoverable; rolling into fresh session",
              "error"
            );
            await recoverNewSession(currentSession.id);
            queueRef.current = [];
          }
        } else if (errorData.code === "SESSION_SEALED") {
          showToast("Session was sealed due to timeout or shutdown", "info");
          setTrackingState("idle");
          setSession(null);
          queueRef.current = [];
        } else {
          // Other conflict: drop invalid head
          queueRef.current.shift();
        }
      }
    } catch {
      // Network drop: pulse remains in queue to retry on next tick
    } finally {
      isTransmittingRef.current = false;
      if (queueRef.current.length > 0) {
        // Continue draining queue
        setTimeout(processQueue, 50);
      }
    }
  };

  const enqueuePulse = (
    durationSeconds = 15,
    eventType:
      | "HEARTBEAT"
      | "PAUSE"
      | "RESUME"
      | "STOP"
      | "DISCARD" = "HEARTBEAT"
  ) => {
    sequenceCounterRef.current += 1;
    const pulse: QueuedPulse = {
      sequenceNumber: sequenceCounterRef.current,
      clientNonce:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      durationSeconds,
      isFocused: isFocusedRef.current,
      eventType,
    };

    queueRef.current.push(pulse);
    processQueue();
  };

  const enqueuePulseRef = useRef(enqueuePulse);
  useEffect(() => {
    enqueuePulseRef.current = enqueuePulse;
  });

  // 1-second display timer and 15-second heartbeat dispatcher
  useEffect(() => {
    if (trackingState !== "active") return;

    let pulseAccumulator = 0;

    const timer = setInterval(() => {
      // Accumulate active seconds only when window is focused
      if (isFocusedRef.current) {
        setElapsedSeconds((prev) => prev + 1);
        pulseAccumulator += 1;
      }

      // Every 15 seconds, emit heartbeat pulse
      if (pulseAccumulator >= 15) {
        enqueuePulseRef.current(15, "HEARTBEAT");
        pulseAccumulator = 0;
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [trackingState]);

  // Start tracking
  const handleStart = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMediaId,
          sourceId: selectedSourceId || null,
          sourceType: "web",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "Failed to start tracking session", "error");
        return;
      }

      const data = await res.json();
      setSession(data.session);
      sequenceCounterRef.current = 0;
      queueRef.current = [];
      setElapsedSeconds(0);
      setTrackingState("active");
      showToast("Tracking session started", "success");
    } catch {
      showToast("Network error starting session", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pause tracking
  const handlePause = () => {
    enqueuePulse(0, "PAUSE");
    setTrackingState("paused");
    showToast("Session paused", "info");
  };

  // Resume tracking
  const handleResume = () => {
    enqueuePulse(0, "RESUME");
    setTrackingState("active");
    showToast("Session resumed", "info");
  };

  // Stop tracking
  const handleStop = async () => {
    setIsSubmitting(true);
    try {
      enqueuePulse(0, "STOP");
      const completedSecs = elapsedSeconds;
      const completedSessionId = session?.id;

      setTrackingState("idle");
      setSession(null);
      queueRef.current = [];

      showToast(
        `Session completed: ${formatTime(completedSecs)} active time recorded`,
        "success"
      );

      if (onSessionComplete && completedSessionId) {
        onSessionComplete({
          id: completedSessionId,
          activeSeconds: completedSecs,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Discard tracking
  const handleDiscard = async () => {
    enqueuePulse(0, "DISCARD");
    setTrackingState("idle");
    setSession(null);
    queueRef.current = [];
    setElapsedSeconds(0);
    showToast("Session discarded without recording time", "info");
  };

  return (
    <div className="bg-gray-800/80 border border-gray-700/80 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Observed Active Time Tracker
            </h3>
            {/* Status indicator pill */}
            {trackingState === "active" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Tracking
              </span>
            )}
            {trackingState === "paused" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Paused
              </span>
            )}
            {trackingState === "idle" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">
                Idle
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            Observed active engagement measured while window is in focus. Not proof of watching.
          </p>
        </div>

        {/* Big Digital Timer Display */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-white tracking-wider">
              {formatTime(elapsedSeconds)}
            </div>
            {trackingState === "active" && !isWindowFocused && (
              <div className="text-xs text-amber-400 flex items-center justify-end gap-1 font-medium mt-0.5">
                <EyeOff className="w-3 h-3" />
                Window unfocused (pulse paused)
              </div>
            )}
            {trackingState === "active" && isWindowFocused && (
              <div className="text-xs text-emerald-400 flex items-center justify-end gap-1 font-medium mt-0.5">
                <Eye className="w-3 h-3" />
                Active window focused
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tracker Controls */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-700/60">
        {trackingState === "idle" && (
          <>
            {sources.length > 0 && (
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">No external source (General session)</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.normalizedDomain})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleStart}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-md disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              Start Session
            </button>
          </>
        )}

        {trackingState === "active" && (
          <>
            <button
              onClick={handlePause}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors shadow-md"
            >
              <Pause className="w-4 h-4 fill-white" />
              Pause
            </button>
            <button
              onClick={handleStop}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-md"
            >
              <Square className="w-4 h-4 fill-white" />
              Stop & Save
            </button>
            <button
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 hover:bg-rose-900/40 text-gray-300 hover:text-rose-300 text-sm transition-colors ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Discard
            </button>
          </>
        )}

        {trackingState === "paused" && (
          <>
            <button
              onClick={handleResume}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-md"
            >
              <Play className="w-4 h-4 fill-white" />
              Resume
            </button>
            <button
              onClick={handleStop}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-md"
            >
              <Square className="w-4 h-4 fill-white" />
              Stop & Save
            </button>
            <button
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 hover:bg-rose-900/40 text-gray-300 hover:text-rose-300 text-sm transition-colors ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
