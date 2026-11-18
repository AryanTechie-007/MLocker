---
name: mlocker-session-tracking
description: Activity session tracking engine, source domain registration, idle detection heuristics, heartbeat rollups, and privacy controls for MLocker.
---

# MLocker Session Tracking Skill

## 1. Core Principles & Philosophy

1. **Observed Active Time ≠ Absolute Proof of Consumption:**
   - MLocker records observed active window engagement when a user is focused on a matched source.
   - It does **not** claim to know if a user physically watched or read every second.
   - UI copy and analytics must reflect this distinction accurately (e.g., "Active Time: 45 mins", not "Verified 100% Watched").
2. **Strict Opt-In Matching:**
   - Activity tracking triggers **only** for URLs matching user-configured external sources or explicitly mapped domains.
   - Never track arbitrary or unmapped browsing sessions.
3. **Privacy by Design:**
   - Extension and local trackers inspect only the active tab URL host and path pattern.
   - No DOM scraping, audio/video stream sniffing, form inputs, or keystrokes are ever captured.

---

## 2. Event Pipeline & Architecture

```
┌────────────────────────────────────────────────────────┐
│               Chrome Extension Service                 │
│  - chrome.tabs.onActivated                             │
│  - chrome.windows.onFocusChanged                       │
│  - chrome.idle.onStateChanged (e.g. 60s cutoff)        │
└───────────────────────────┬────────────────────────────┘
                            │ Heartbeat (every 15s)
                            ▼
┌────────────────────────────────────────────────────────┐
│           Desktop Bridge / Local Loopback API          │
│   (POST /api/tracking/heartbeat + Bearer Auth Token)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Session Rollup Engine                  │
│  - Validates source match                              │
│  - Debounces & aggregates continuous pulses            │
│  - Closes session when gap > maxThreshold (e.g. 45s)   │
│  - Persists ActivitySession (start, end, activeSecs)   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Heuristics & Idle Detection

### 3.1 Idle & Focus Rules
- **Active State:** Tab is active, browser window has OS focus, and user activity (mouse/keyboard) was detected within the idle window.
- **Idle Threshold:** Configure `chrome.idle.setDetectionInterval(60)` (60 seconds). Once the user is marked `idle` or `locked`, pulse emissions immediately halt.
- **Background Tabs:** If a video or audio continues playing in a background tab, the extension does not emit active heartbeats unless explicitly configured with background media detection permissions, and even then must mark it as `isBackground: true`.

### 3.2 Heartbeat Payload Contract
```typescript
export interface HeartbeatPayload {
  sourceId: string;           // Registered external source identifier
  mediaItemId: string;        // Target MediaItem UUID
  timestamp: string;          // ISO 8601 timestamp of heartbeat
  durationSeconds: number;    // Elapsed active seconds since last pulse (typically 15s)
  isFocused: boolean;         // Tab and window were actively focused
  clientNonce: string;        // Deduplication nonce
}
```

---

## 4. Session Rollup Engine

Continuous heartbeats must not spam the database with thousands of micro-rows. The session rollup engine groups pulses into cohesive `ActivitySession` records.

### 4.1 Rollup Algorithm
1. Receive Heartbeat `H(mediaItemId, timestamp, duration)`.
2. Look up the currently open session for `(userId, mediaItemId)`:
   - If an open session exists AND `timestamp - session.endedAt <= MAX_GAP` (e.g. 45 seconds):
     - Extend existing session:
       - `session.endedAt = timestamp`
       - `session.activeSeconds += duration`
   - If no open session exists OR `timestamp - session.endedAt > MAX_GAP`:
     - Close previous session (if any).
     - Create a new `ActivitySession`:
       - `startedAt = timestamp - duration`
       - `endedAt = timestamp`
       - `activeSeconds = duration`
       - `sourceType = 'EXTENSION'`
3. Flush open sessions to persistent storage after inactivity or upon application shutdown.

---

## 5. User Controls & Privacy Configuration

- **Global Tracking Toggle:** Users must have a single master toggle to pause all tracking instantly.
- **Per-Source Toggle:** Users can pause tracking on individual external sources without deleting them.
- **Manual Adjustments:** Users can edit or delete any recorded `ActivitySession` from their session history view at any time.
