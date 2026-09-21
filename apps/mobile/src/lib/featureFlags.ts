/**
 * SE7A feature flags.
 *
 * Flip these at compile-time to hide entire product surfaces without
 * ripping out code. Two current use cases:
 *   • Product experiments where we might turn something back on
 *   • Areas paused for focus (see WORKOUTS_ENABLED below)
 *
 * Server-side code doesn't read this file — flags here are purely for
 * the mobile client's UI gating. Keep them narrow and Boolean.
 */

/**
 * Workouts / training UI. Disabled 2026-09-21 while the product focuses
 * on nutrition + health tracking. Underlying schemas, endpoints, and
 * hooks stay intact so flipping this back to true restores the full
 * flow (Progress > Training tab, workout sections in reports, training
 * days in onboarding, workout-related meal-plan phases).
 *
 * When true again:
 *   • Progress > Training subtab appears
 *   • report.tsx renders training tab + workout callouts
 *   • onboarding shows experience / equipment / days_per_week steps
 *   • meal-plan sees days_per_week and paces training-day macros
 */
export const WORKOUTS_ENABLED = false;
