import { z } from "zod";

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
