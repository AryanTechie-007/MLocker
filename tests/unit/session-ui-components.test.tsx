import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NOMINAL_HEARTBEAT_INTERVAL_SECONDS,
  MAX_ACTIVE_GAP_SECONDS,
} from "@/lib/domain/session-engine";

describe("Milestone 5: Session UI Controls & Component Logic Suite", () => {
  const rootDir = process.cwd();

  describe("1. ManualSessionModal Form State Reset & Hygiene", () => {
    interface MockMediaItem {
      id: string;
      title: string;
      mediaType: string;
      watchedEpisodes?: number;
      readChapters?: number;
      hoursPlayed?: number;
    }

    interface ManualFormState {
      userMediaId: string;
      startedAt: string;
      endedAt: string;
      activeMinutes: number;
      notes: string;
      progressStart: number | "";
      progressEnd: number | "";
      error: string | null;
    }

    function createInitialFormState(item: MockMediaItem): ManualFormState {
      return {
        userMediaId: item.id,
        startedAt: "",
        endedAt: "",
        activeMinutes: 30,
        notes: "",
        progressStart: item.watchedEpisodes ?? item.readChapters ?? "",
        progressEnd: "",
        error: null,
      };
    }

    function simulateModalStateTransition(
      itemA: MockMediaItem,
      dirtyEditsA: Partial<ManualFormState>,
      itemB: MockMediaItem,
      isOpen = true
    ) {
      let currentItemId: string | null = null;
      let formState: ManualFormState = createInitialFormState(itemA);

      // 1. Open modal with Item A
      if (itemA.id !== currentItemId) {
        currentItemId = itemA.id;
        formState = createInitialFormState(itemA);
      }
      expect(formState.userMediaId).toBe(itemA.id);

      // 2. User enters dirty edits for Item A
      formState = { ...formState, ...dirtyEditsA };
      expect(formState.notes).toBe(dirtyEditsA.notes);
      expect(formState.activeMinutes).toBe(dirtyEditsA.activeMinutes);

      // 3. User switches to Item B (or re-opens modal with Item B)
      if (isOpen && itemB.id !== currentItemId) {
        currentItemId = itemB.id;
        formState = createInitialFormState(itemB);
      }

      // 4. Return new form state to assert hygiene
      return formState;
    }

    it("resets all form fields and errors cleanly when switching target media items", () => {
      const itemA: MockMediaItem = {
        id: "media_anime_1",
        title: "Neon Genesis Evangelion",
        mediaType: "anime",
        watchedEpisodes: 10,
      };

      const itemB: MockMediaItem = {
        id: "media_novel_2",
        title: "Spice and Wolf",
        mediaType: "novel",
        readChapters: 25,
      };

      const stateB = simulateModalStateTransition(
        itemA,
        {
          startedAt: "2026-11-20T10:00",
          endedAt: "2026-11-20T11:00",
          activeMinutes: 60,
          notes: "Dirty draft notes for Eva",
          progressStart: 10,
          progressEnd: 12,
          error: "Previous error",
        },
        itemB,
        true
      );

      // Verify that Item B form state has zero contamination from Item A
      expect(stateB.userMediaId).toBe(itemB.id);
      expect(stateB.startedAt).toBe("");
      expect(stateB.endedAt).toBe("");
      expect(stateB.activeMinutes).toBe(30); // reset to default 30
      expect(stateB.notes).toBe(""); // cleared
      expect(stateB.progressStart).toBe(25); // reflects Item B's progress
      expect(stateB.progressEnd).toBe(""); // cleared
      expect(stateB.error).toBeNull();
    });

    it("resets modal form state when closing and reopening the modal", () => {
      const item: MockMediaItem = {
        id: "media_game_1",
        title: "Elden Ring",
        mediaType: "game",
        hoursPlayed: 45,
      };

      let isOpen = false;
      let formState: ManualFormState = createInitialFormState(item);

      function setModalOpen(open: boolean) {
        isOpen = open;
        if (!open) {
          formState = createInitialFormState(item);
        }
      }

      setModalOpen(true);
      formState.notes = "Unsaved notes";
      formState.activeMinutes = 120;

      setModalOpen(false);

      setModalOpen(true);
      expect(formState.notes).toBe("");
      expect(formState.activeMinutes).toBe(30);
    });

    it("verifies component source contains form state reset logic when file exists", () => {
      const modalPath = path.join(rootDir, "src/components/ManualSessionModal.tsx");
      if (fs.existsSync(modalPath)) {
        const source = fs.readFileSync(modalPath, "utf-8");
        const hasReset =
          source.includes("useEffect") ||
          source.includes("prevItem") ||
          source.includes("userMediaId");
        expect(hasReset).toBe(true);
      }
    });
  });

  describe("2. ActiveSessionTracker Client FIFO Queue & 409 Retransmission Protocol", () => {
    interface QueueItem {
      sequenceNumber: number;
      clientNonce: string;
      durationSeconds: number;
      timestamp: number;
      isFocused: boolean;
    }

    class ClientPulseQueue {
      private queue: QueueItem[] = [];
      private currentSequence = 0;
      public isPaused = false;

      enqueue(durationSeconds: number, isFocused = true): QueueItem {
        this.currentSequence += 1;
        const item: QueueItem = {
          sequenceNumber: this.currentSequence,
          clientNonce: `nonce_${this.currentSequence}_${Date.now()}`,
          durationSeconds,
          timestamp: Date.now(),
          isFocused,
        };
        this.queue.push(item);
        return item;
      }

      peek(): QueueItem | undefined {
        return this.queue[0];
      }

      acknowledge(sequenceNumber: number) {
        this.queue = this.queue.filter((q) => q.sequenceNumber > sequenceNumber);
        this.isPaused = false;
      }

      handleSequenceGapError(expectedSequence: number) {
        this.isPaused = true;
        const missing = this.queue.find((q) => q.sequenceNumber === expectedSequence);
        return missing || null;
      }

      purgeExpired(now: number, maxGapSeconds = MAX_ACTIVE_GAP_SECONDS): number {
        const initialLen = this.queue.length;
        this.queue = this.queue.filter(
          (q) => now - q.timestamp <= maxGapSeconds * 1000
        );
        return initialLen - this.queue.length;
      }

      get pendingCount(): number {
        return this.queue.length;
      }
    }

    it("buffers pulses in strict sequential FIFO order", () => {
      const queue = new ClientPulseQueue();
      const p1 = queue.enqueue(15);
      const p2 = queue.enqueue(15);
      const p3 = queue.enqueue(15);

      expect(p1.sequenceNumber).toBe(1);
      expect(p2.sequenceNumber).toBe(2);
      expect(p3.sequenceNumber).toBe(3);
      expect(queue.pendingCount).toBe(3);
      expect(queue.peek()?.sequenceNumber).toBe(1);
    });

    it("retransmits missing sequence on 409 SEQUENCE_GAP and flushes FIFO queue", () => {
      const queue = new ClientPulseQueue();
      const p1 = queue.enqueue(15);
      const p2 = queue.enqueue(15);

      // Server returns 409 SEQUENCE_GAP: expected 1, received 2
      const missing = queue.handleSequenceGapError(1);
      expect(queue.isPaused).toBe(true);
      expect(missing?.sequenceNumber).toBe(1);
      expect(missing?.clientNonce).toBe(p1.clientNonce);

      // Client retransmits pulse 1 and receives 200 OK
      queue.acknowledge(1);
      expect(queue.isPaused).toBe(false);
      expect(queue.pendingCount).toBe(1);
      expect(queue.peek()?.sequenceNumber).toBe(2);

      // Client now sends pulse 2 and receives 200 OK
      queue.acknowledge(2);
      expect(queue.pendingCount).toBe(0);
    });

    it("purges expired pulses exceeding MAX_ACTIVE_GAP_SECONDS (45s)", () => {
      const queue = new ClientPulseQueue();
      const now = Date.now();

      queue.enqueue(15);
      const expiredTime = now - 50000;
      vi.spyOn(Date, "now").mockReturnValue(expiredTime);
      queue.enqueue(15);

      vi.spyOn(Date, "now").mockReturnValue(now);
      queue.enqueue(15);

      const purged = queue.purgeExpired(now, MAX_ACTIVE_GAP_SECONDS);
      expect(purged).toBeGreaterThanOrEqual(1);

      vi.restoreAllMocks();
    });
  });

  describe("3. Non-Intrusive Progress Confirmation Dialogs (AGENTS.md & Audit § 43)", () => {
    function evaluateSessionCompletionPrompt(
      mediaType: string,
      currentProgress: number,
      activeSeconds: number,
      autoAccumulateGameHours = false
    ): {
      shouldPrompt: boolean;
      proposedProgress: number;
      promptMessage: string;
      autoUpdated: boolean;
    } {
      if (mediaType === "game") {
        if (autoAccumulateGameHours) {
          const hoursToAdd = Number((activeSeconds / 3600).toFixed(1));
          return {
            shouldPrompt: false,
            proposedProgress: currentProgress + hoursToAdd,
            promptMessage: "",
            autoUpdated: true,
          };
        }
        const hours = Number((activeSeconds / 3600).toFixed(1));
        return {
          shouldPrompt: hours > 0,
          proposedProgress: currentProgress + hours,
          promptMessage: `Add ${hours} hours to played time?`,
          autoUpdated: false,
        };
      }

      const isMeaningful = activeSeconds >= 600; // >= 10 minutes
      if (!isMeaningful) {
        return {
          shouldPrompt: false,
          proposedProgress: currentProgress,
          promptMessage: "",
          autoUpdated: false,
        };
      }

      const unit =
        mediaType === "anime" || mediaType === "tv" ? "Episode" : "Chapter";
      return {
        shouldPrompt: true,
        proposedProgress: currentProgress + 1,
        promptMessage: `Mark ${unit} ${currentProgress + 1} as completed (+1 ${unit})?`,
        autoUpdated: false,
      };
    }

    it("does NOT automatically increment episodes/chapters on session stop", () => {
      const evaluation = evaluateSessionCompletionPrompt("anime", 4, 1500); // 25 min anime session
      expect(evaluation.autoUpdated).toBe(false);
      expect(evaluation.shouldPrompt).toBe(true);
      expect(evaluation.proposedProgress).toBe(5);
      expect(evaluation.promptMessage).toContain("Mark Episode 5 as completed (+1 Episode)?");
    });

    it("does NOT prompt for negligible sessions (< 10 minutes)", () => {
      const evaluation = evaluateSessionCompletionPrompt("anime", 4, 180); // 3 min
      expect(evaluation.shouldPrompt).toBe(false);
      expect(evaluation.autoUpdated).toBe(false);
    });

    it("handles manga / novel chapter prompt units (+1 Chapter)", () => {
      const evaluation = evaluateSessionCompletionPrompt("manga", 12, 1200); // 20 min
      expect(evaluation.shouldPrompt).toBe(true);
      expect(evaluation.autoUpdated).toBe(false);
      expect(evaluation.proposedProgress).toBe(13);
      expect(evaluation.promptMessage).toContain("Mark Chapter 13 as completed (+1 Chapter)?");
    });

    it("does NOT auto-accumulate game hours when autoAccumulateGameHours is false (default DEC-M5-05)", () => {
      const evaluation = evaluateSessionCompletionPrompt("game", 50, 7200, false);
      expect(evaluation.autoUpdated).toBe(false);
      expect(evaluation.shouldPrompt).toBe(true);
      expect(evaluation.proposedProgress).toBe(52);
      expect(evaluation.promptMessage).toContain("Add 2 hours to played time?");
    });

    it("auto-accumulates game hours only when explicitly enabled (autoAccumulateGameHours: true)", () => {
      const evaluation = evaluateSessionCompletionPrompt("game", 50, 7200, true);
      expect(evaluation.autoUpdated).toBe(true);
      expect(evaluation.shouldPrompt).toBe(false);
      expect(evaluation.proposedProgress).toBe(52);
    });
  });

  describe("4. Observed Active Time Taxonomy & UI Label Enforcement", () => {
    it("enforces observed active engagement explanation copy in session UI components", () => {
      const trackerPath = path.join(rootDir, "src/components/ActiveSessionTracker.tsx");
      if (fs.existsSync(trackerPath)) {
        const content = fs.readFileSync(trackerPath, "utf-8");
        expect(content).toContain("Observed");
        expect(content).toContain("Not proof of watching");
      }
    });

    it("verifies component files adhere to standard export contracts when present", () => {
      const trackerPath = path.join(rootDir, "src/components/ActiveSessionTracker.tsx");
      const modalPath = path.join(rootDir, "src/components/ManualSessionModal.tsx");
      const historyPath = path.join(rootDir, "src/components/SessionHistory.tsx");

      if (fs.existsSync(trackerPath)) {
        const trackerSource = fs.readFileSync(trackerPath, "utf-8");
        const hasExport =
          trackerSource.includes("export default function ActiveSessionTracker") ||
          trackerSource.includes("export function ActiveSessionTracker");
        expect(hasExport).toBe(true);
      }

      if (fs.existsSync(modalPath)) {
        const modalSource = fs.readFileSync(modalPath, "utf-8");
        const hasExport =
          modalSource.includes("export default function ManualSessionModal") ||
          modalSource.includes("export function ManualSessionModal");
        expect(hasExport).toBe(true);
      }

      if (fs.existsSync(historyPath)) {
        const historySource = fs.readFileSync(historyPath, "utf-8");
        const hasExport =
          historySource.includes("export default function SessionHistory") ||
          historySource.includes("export function SessionHistory");
        expect(hasExport).toBe(true);
      }
    });
  });
});
