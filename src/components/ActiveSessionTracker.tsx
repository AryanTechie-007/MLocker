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
    <div
      className="glass-panel"
      style={{
        padding: "24px",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
              <Clock size={18} style={{ color: "var(--accent-purple)" }} />
              Observed Active Time Tracker
            </h3>
            {/* Status indicator pill */}
            {trackingState === "active" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(52, 211, 153, 0.15)",
                  color: "var(--status-completed)",
                  border: "1px solid rgba(52, 211, 153, 0.3)",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "var(--status-completed)",
                  }}
                />
                Tracking
              </span>
            )}
            {trackingState === "paused" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(251, 191, 36, 0.15)",
                  color: "var(--status-on-hold)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "var(--status-on-hold)",
                  }}
                />
                Paused
              </span>
            )}
            {trackingState === "idle" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                Idle
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: "0.82rem",
              color: "var(--text-muted)",
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <HelpCircle size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            Observed active engagement measured while window is in focus. Not proof of watching.
          </p>
        </div>

        {/* Big Digital Timer Display */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "2.2rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.05em",
              }}
            >
              {formatTime(elapsedSeconds)}
            </div>
            {trackingState === "active" && !isWindowFocused && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--status-on-hold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "4px",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                <EyeOff size={13} />
                Window unfocused (pulse paused)
              </div>
            )}
            {trackingState === "active" && isWindowFocused && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--status-completed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "4px",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                <Eye size={13} />
                Active window focused
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tracker Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          paddingTop: "16px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {trackingState === "idle" && (
          <>
            {sources.length > 0 && (
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="select-control"
                style={{ maxWidth: "340px", padding: "8px 12px", fontSize: "0.85rem" }}
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
              className="btn-primary"
              style={{ padding: "8px 20px", fontSize: "0.85rem" }}
            >
              <Play size={14} fill="currentColor" />
              Start Session
            </button>
          </>
        )}

        {trackingState === "active" && (
          <>
            <button
              onClick={handlePause}
              disabled={isSubmitting}
              className="btn-secondary"
              style={{
                padding: "8px 18px",
                fontSize: "0.85rem",
                color: "var(--status-on-hold)",
                borderColor: "rgba(251, 191, 36, 0.4)",
              }}
            >
              <Pause size={14} fill="currentColor" />
              Pause
            </button>
            <button
              onClick={handleStop}
              disabled={isSubmitting}
              className="btn-secondary"
              style={{
                padding: "8px 18px",
                fontSize: "0.85rem",
                color: "var(--status-completed)",
                borderColor: "rgba(52, 211, 153, 0.4)",
              }}
            >
              <Square size={14} fill="currentColor" />
              Stop & Save
            </button>
            <button
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="btn-secondary"
              style={{
                padding: "8px 14px",
                fontSize: "0.85rem",
                color: "var(--status-dropped)",
                borderColor: "rgba(248, 113, 113, 0.4)",
                marginLeft: "auto",
              }}
            >
              <Trash2 size={14} />
              Discard
            </button>
          </>
        )}

        {trackingState === "paused" && (
          <>
            <button
              onClick={handleResume}
              disabled={isSubmitting}
              className="btn-primary"
              style={{ padding: "8px 20px", fontSize: "0.85rem" }}
            >
              <Play size={14} fill="currentColor" />
              Resume
            </button>
            <button
              onClick={handleStop}
              disabled={isSubmitting}
              className="btn-secondary"
              style={{
                padding: "8px 18px",
                fontSize: "0.85rem",
                color: "var(--status-completed)",
                borderColor: "rgba(52, 211, 153, 0.4)",
              }}
            >
              <Square size={14} fill="currentColor" />
              Stop & Save
            </button>
            <button
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="btn-secondary"
              style={{
                padding: "8px 14px",
                fontSize: "0.85rem",
                color: "var(--status-dropped)",
                borderColor: "rgba(248, 113, 113, 0.4)",
                marginLeft: "auto",
              }}
            >
              <Trash2 size={14} />
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
