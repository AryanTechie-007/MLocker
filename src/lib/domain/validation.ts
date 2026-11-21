import { z } from "zod";
import {
  SOURCE_TYPES,
  type SourceType,
  isValidSourceUrl,
} from "./source-domain";

/**
 * Pure Domain Validation Schemas
 * Zero framework / Next.js / Electron imports.
 * Enforces strict typing, numeric bounds, URL protocols, and enum validation.
 */

export const MEDIA_TYPES = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "novel",
] as const;

export const MEDIA_STATUSES = [
  "plan_to_consume",
  "in_progress",
  "completed",
  "on_hold",
  "dropped",
] as const;

export const CanonicalMediaTypeEnum = z.enum(MEDIA_TYPES);

/**
 * Validates media categories and normalizes the API-boundary alias "book" to canonical "novel".
 */
export const MediaTypeEnum = z
  .enum([...MEDIA_TYPES, "book"] as const)
  .transform((val) => (val === "book" ? "novel" : val) as (typeof MEDIA_TYPES)[number]);

export const MediaStatusEnum = z.enum(MEDIA_STATUSES);

export const SafeIdSchema = z
  .string()
  .trim()
  .min(1, "ID cannot be empty")
  .max(128, "ID exceeds maximum length");

export const SafeUrlSchema = z
  .string()
  .trim()
  .url("Invalid URL format")
  .max(2000, "URL exceeds maximum length")
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "Only http:// and https:// URLs are permitted" }
  );

export const OptionalSafeUrlSchema = z
  .union([SafeUrlSchema, z.literal("")])
  .optional()
  .nullable();

// Registration
export const RegisterUserSchema = z.object({
  name: z.string().trim().max(100, "Name must be under 100 characters").optional().nullable(),
  email: z.string().trim().email("Valid email required").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

// Media creation
export const CreateMediaSchema = z.object({
  mediaType: MediaTypeEnum,
  title: z.string().trim().min(1, "Title is required").max(500),
  externalId: z.union([z.string().trim().max(255), z.number().transform(String)]).optional().nullable(),
  externalSource: z.string().trim().max(100).optional().nullable(),
  posterUrl: OptionalSafeUrlSchema,
  year: z.coerce.number().int().min(1800).max(2200).optional().nullable(),
  genres: z.union([z.array(z.string().trim().max(100)), z.string()]).optional().nullable(),
  overview: z.string().max(10000).optional().nullable(),
  status: MediaStatusEnum.optional().default("plan_to_consume"),
  rating: z.coerce.number().min(0, "Rating cannot be negative").max(10, "Rating cannot exceed 10").optional().nullable(),
  review: z.string().max(10000).optional().nullable(),
  isFavorite: z.boolean().optional().default(false),
  totalEpisodes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  watchedEpisodes: z.coerce.number().int().min(0).max(100000).optional().default(0),
  totalChapters: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  readChapters: z.coerce.number().int().min(0).max(100000).optional().default(0),
  hoursPlayed: z.coerce.number().min(0).max(100000).optional().default(0),
  tags: z.union([z.array(z.string().trim().max(100)), z.string()]).optional().nullable(),
});

// Media updates (PATCH)
export const UpdateMediaSchema = z.object({
  status: MediaStatusEnum.optional(),
  rating: z.coerce.number().min(0, "Rating cannot be negative").max(10, "Rating cannot exceed 10").optional().nullable(),
  review: z.string().max(10000).optional().nullable(),
  isFavorite: z.boolean().optional(),
  totalEpisodes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  watchedEpisodes: z.coerce.number().int().min(0).max(100000).optional(),
  totalChapters: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  readChapters: z.coerce.number().int().min(0).max(100000).optional(),
  hoursPlayed: z.coerce.number().min(0).max(100000).optional(),
  tags: z.union([z.array(z.string().trim().max(100)), z.string()]).optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

// Media query parameters (GET /api/media)
export const MediaQuerySchema = z.object({
  type: z.union([MediaTypeEnum, z.literal("all")]).optional(),
  status: z.union([MediaStatusEnum, z.literal("all")]).optional(),
  favorite: z.enum(["true", "false"]).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sortBy: z.enum(["updatedAt", "createdAt", "rating", "year", "title"]).optional().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

// Collections
export const CreateCollectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name is required").max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  coverUrl: OptionalSafeUrlSchema,
});

export const UpdateCollectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name cannot be empty").max(150).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  coverUrl: OptionalSafeUrlSchema,
});

export const CollectionItemActionSchema = z.object({
  userMediaId: SafeIdSchema,
  action: z.enum(["add", "remove"]).optional().default("add"),
});

// External search query
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(200),
  type: z.union([MediaTypeEnum, z.literal("all")]).optional().default("all"),
});

// Electron IPC External URL validation
export const ExternalUrlSchema = z
  .string()
  .trim()
  .url("Invalid URL format")
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "Only http:// and https:// URLs are allowed" }
  );

// ---------------------------------------------------------------------------
// External Media Sources (Milestone 4)
// ---------------------------------------------------------------------------

export { SOURCE_TYPES, type SourceType };

export const SourceTypeEnum = z.enum(SOURCE_TYPES);

export const SourceUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2000, "URL exceeds maximum length")
  .refine(isValidSourceUrl, {
    message: "Only valid http:// and https:// URLs are permitted",
  });

export const CreateMediaSourceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Source name is required")
    .max(100, "Source name cannot exceed 100 characters"),
  url: SourceUrlSchema,
  sourceType: SourceTypeEnum.optional().default("web"),
});

export const UpdateMediaSourceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Source name cannot be empty")
    .max(100, "Source name cannot exceed 100 characters")
    .optional(),
  url: SourceUrlSchema.optional(),
  sourceType: SourceTypeEnum.optional(),
});

export type CreateMediaSourceInput = z.infer<typeof CreateMediaSourceSchema>;
export type UpdateMediaSourceInput = z.infer<typeof UpdateMediaSourceSchema>;

// ---------------------------------------------------------------------------
// Activity Sessions & Tracking (Milestone 5)
// ---------------------------------------------------------------------------

import {
  SESSION_STATUSES,
  SESSION_CLOSE_REASONS,
  SESSION_EVENT_TYPES,
  SESSION_SOURCE_TYPES,
  type SessionStatus,
  type SessionCloseReason,
  type SessionEventType,
  type SessionSourceType,
} from "./session-engine";

export {
  SESSION_STATUSES,
  SESSION_CLOSE_REASONS,
  SESSION_EVENT_TYPES,
  SESSION_SOURCE_TYPES,
  type SessionStatus,
  type SessionCloseReason,
  type SessionEventType,
  type SessionSourceType,
};

export const SessionStatusEnum = z.enum(SESSION_STATUSES);
export const SessionCloseReasonEnum = z.enum(SESSION_CLOSE_REASONS);
export const SessionEventTypeEnum = z.enum(SESSION_EVENT_TYPES);
export const SessionSourceTypeEnum = z.enum(SESSION_SOURCE_TYPES);

export const HeartbeatPayloadSchema = z.object({
  sessionId: SafeIdSchema,
  userMediaId: SafeIdSchema,
  sequenceNumber: z.number().int().min(1, "Sequence number must be at least 1"),
  clientNonce: z
    .string()
    .trim()
    .min(1, "Client nonce is required")
    .max(128, "Client nonce exceeds maximum length"),
  timestamp: z.string().datetime({ message: "Invalid ISO timestamp format" }),
  durationSeconds: z.number().int().min(0).max(60).default(15),
  isFocused: z.boolean().default(true),
  eventType: SessionEventTypeEnum.default("HEARTBEAT"),
});

export const CreateSessionSchema = z.object({
  userMediaId: SafeIdSchema,
  sourceId: SafeIdSchema.nullable().optional(),
  sourceType: SessionSourceTypeEnum.optional().default("web"),
  supersededSessionId: SafeIdSchema.nullable().optional(),
});

export const CreateManualSessionSchema = z
  .object({
    userMediaId: SafeIdSchema,
    sourceType: z.literal("manual").default("manual"),
    startedAt: z
      .string()
      .datetime({ message: "Invalid startedAt ISO datetime" }),
    endedAt: z
      .string()
      .datetime({ message: "Invalid endedAt ISO datetime" }),
    activeSeconds: z
      .number()
      .int()
      .min(1, "Active seconds must be at least 1")
      .max(86400, "Active seconds cannot exceed 24 hours"),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
    progressStart: z.number().int().min(0).nullable().optional(),
    progressEnd: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.startedAt).getTime();
      const end = new Date(data.endedAt).getTime();
      return end >= start;
    },
    {
      message: "endedAt must be greater than or equal to startedAt",
      path: ["endedAt"],
    }
  )
  .refine(
    (data) => {
      const end = new Date(data.endedAt).getTime();
      // Allow up to 5 minutes clock skew into future
      const nowBuffer = Date.now() + 5 * 60 * 1000;
      return end <= nowBuffer;
    },
    {
      message: "endedAt cannot be in the future",
      path: ["endedAt"],
    }
  )
  .refine(
    (data) => {
      const start = new Date(data.startedAt).getTime();
      const end = new Date(data.endedAt).getTime();
      const wallClockSeconds = Math.floor((end - start) / 1000);
      return data.activeSeconds <= wallClockSeconds;
    },
    {
      message:
        "activeSeconds cannot exceed wall clock duration between startedAt and endedAt",
      path: ["activeSeconds"],
    }
  );

export const UpdateSessionSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(2000, "Notes cannot exceed 2000 characters")
    .nullable()
    .optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  progressEnd: z.number().int().min(0).nullable().optional(),
  activeSeconds: z.number().int().min(0).max(86400).optional(),
});

export const SessionQuerySchema = z.object({
  userMediaId: SafeIdSchema.optional(),
  status: SessionStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const TrackingPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  autoAccumulateGameHours: z.boolean().default(false),
});

export const TrackingToggleSchema = z.object({
  enabled: z.boolean().optional(),
  autoAccumulateGameHours: z.boolean().optional(),
});

export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type CreateManualSessionInput = z.infer<
  typeof CreateManualSessionSchema
>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type SessionQueryInput = z.infer<typeof SessionQuerySchema>;
export type TrackingPreferencesInput = z.infer<
  typeof TrackingPreferencesSchema
>;
export type TrackingToggleInput = z.infer<typeof TrackingToggleSchema>;
