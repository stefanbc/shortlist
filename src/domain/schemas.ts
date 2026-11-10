import { z } from 'zod'

/** 1-5 inclusive, in 0.5 steps (matches the spreadsheet's scoring scale). */
export const scoreValueSchema = z
  .number()
  .min(1)
  .max(5)
  .refine((value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9, {
    message: 'Score must be a multiple of 0.5',
  })
export type ScoreValueInput = z.infer<typeof scoreValueSchema>

export const criterionInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  // Plain z.number() (not z.coerce.number()) so '' and non-numeric strings
  // fail the type check instead of coercing to 0 and passing weight > 0.
  weight: z.number().gt(0).max(1000),
  position: z.number().int().min(1),
})
export type CriterionInput = z.infer<typeof criterionInputSchema>

export const themeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
})
export type ThemeInput = z.infer<typeof themeInputSchema>

export const teamInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  members: z.array(z.string()),
  pitchOrder: z.number().int().min(1),
  project: z.object({
    name: z.string().nullable(),
    description: z.string().max(5000).nullable(),
    // Id (uuid string) or null.
    themeId: z.uuid().nullable(),
    repoUrl: z.url().nullable(),
  }),
})
export type TeamInput = z.infer<typeof teamInputSchema>

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    pitchMinutes: z.number().int().min(1).max(60).default(7),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
export type EventInput = z.infer<typeof eventInputSchema>

export const userInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.email().optional(),
  role: z.enum(['admin', 'juror']),
})
export type UserInput = z.infer<typeof userInputSchema>
