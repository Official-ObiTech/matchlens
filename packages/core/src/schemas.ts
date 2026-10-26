import { z } from "zod";

/** Server-side validation for every client-supplied payload. */

export const marketIdSchema = z.enum([
  "1X2",
  "DOUBLE_CHANCE",
  "DRAW_NO_BET",
  "TOTAL_GOALS",
  "BTTS",
  "HOME_TEAM_GOALS",
  "AWAY_TEAM_GOALS",
  "FIRST_HALF_GOALS",
  "CORRECT_SCORE",
]);

export const fixtureRefSchema = z.string().regex(/^(api_football|football_data):\d{1,12}$/, "Invalid fixture id");

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const slipSelectionInputSchema = z.object({
  fixtureId: fixtureRefSchema,
  market: marketIdSchema,
  outcome: z.string().min(1).max(16).regex(/^[A-Z0-9X-]+$/),
  line: z.number().min(0).max(10).optional(),
});

export const saveSlipSchema = z.object({
  name: z.string().trim().max(80).optional(),
  selections: z.array(slipSelectionInputSchema).min(1).max(20),
});

/** Minutes as returned by Date#getTimezoneOffset (UTC+2 → -120). Defines the user's "day". */
const tzOffsetSchema = z.coerce.number().int().min(-840).max(840);

export const strongestQuerySchema = z.object({
  date: isoDateSchema.optional(),
  tz: tzOffsetSchema.optional(),
  minProbability: z.coerce.number().min(0.5).max(0.99).optional(),
  market: marketIdSchema.optional(),
  competition: z.string().max(40).optional(),
  minQuality: z.enum(["A", "B", "C", "D"]).optional(),
  kickoffFrom: z.string().datetime().optional(),
  kickoffTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const suggestQuerySchema = strongestQuerySchema.extend({
  max: z.coerce.number().int().min(1).max(20).optional(),
});

export const fixturesQuerySchema = z.object({
  date: isoDateSchema.optional(),
  tz: tzOffsetSchema.optional(),
  /** "day" = the given date; "upcoming" = next 7 days from now. */
  range: z.enum(["day", "upcoming"]).optional(),
  q: z.string().trim().max(60).optional(),
  competition: z.string().max(40).optional(),
  country: z.string().max(60).optional(),
  minProbability: z.coerce.number().min(0.5).max(0.99).optional(),
  market: marketIdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100).optional(),
});

export const pushTokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, "Expected an Expo push token"),
  platform: z.enum(["ios", "android", "web"]),
});

export const notificationPrefsSchema = z.object({
  kickoffReminders: z.boolean(),
  results: z.boolean(),
  settlement: z.boolean(),
  matchChanges: z.boolean(),
});

export type SaveSlipInput = z.infer<typeof saveSlipSchema>;
