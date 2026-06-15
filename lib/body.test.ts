import { test } from "node:test";
import assert from "node:assert/strict";
import { project, TARGET_BF_BANDS } from "./body";

test("project — male cut above target, projects weeks range", () => {
  const r = project({
    weight_kg: 90,
    sex: "male",
    goal: "cut",
    goal_rate_kg_per_week: -0.5,
    estimate: { body_fat_pct_low: 22, body_fat_pct_high: 26 },
  });
  assert.equal(r.status, "above_target");
  assert.deepEqual(
    [r.target_bf_pct_low, r.target_bf_pct_high],
    TARGET_BF_BANDS.male.cut
  );
  assert.ok(r.weeks_to_goal);
  // weeks_low < weeks_high (optimistic ends sooner)
  assert.ok(
    r.weeks_to_goal!.weeks_low <= r.weeks_to_goal!.weeks_high,
    `expected low (${r.weeks_to_goal!.weeks_low}) <= high (${r.weeks_to_goal!.weeks_high})`
  );
  assert.ok(r.weeks_to_goal!.weeks_low > 0);
});

test("project — already in target → no weeks projected", () => {
  const r = project({
    weight_kg: 80,
    sex: "male",
    goal: "cut",
    goal_rate_kg_per_week: -0.5,
    estimate: { body_fat_pct_low: 13, body_fat_pct_high: 14 },
  });
  assert.equal(r.status, "in_target");
  assert.equal(r.weeks_to_goal, null);
});

test("project — below target → status below_target, no weeks", () => {
  const r = project({
    weight_kg: 75,
    sex: "male",
    goal: "cut",
    goal_rate_kg_per_week: -0.5,
    estimate: { body_fat_pct_low: 8, body_fat_pct_high: 10 },
  });
  assert.equal(r.status, "below_target");
  assert.equal(r.weeks_to_goal, null);
});

test("project — bulk goal above target → status not_applicable", () => {
  const r = project({
    weight_kg: 95,
    sex: "male",
    goal: "bulk",
    goal_rate_kg_per_week: 0.25,
    estimate: { body_fat_pct_low: 23, body_fat_pct_high: 26 },
  });
  assert.equal(r.status, "not_applicable");
  assert.equal(r.weeks_to_goal, null);
});

test("project — female cut, range bounds drive weeks range", () => {
  const r = project({
    weight_kg: 70,
    sex: "female",
    goal: "cut",
    goal_rate_kg_per_week: -0.4,
    estimate: { body_fat_pct_low: 28, body_fat_pct_high: 32 },
  });
  assert.equal(r.status, "above_target");
  assert.ok(r.weeks_to_goal);
  // Conservative >= optimistic.
  assert.ok(r.weeks_to_goal!.weeks_high >= r.weeks_to_goal!.weeks_low);
});

test("project — lean mass uses BF midpoint", () => {
  // 80kg × (1 - 20/100) = 64
  const r = project({
    weight_kg: 80,
    sex: "male",
    goal: "cut",
    goal_rate_kg_per_week: -0.5,
    estimate: { body_fat_pct_low: 18, body_fat_pct_high: 22 },
  });
  assert.equal(r.lean_mass_kg_estimate, 64);
});

test("project — clamps to minimum weekly loss when goal_rate is 0", () => {
  // Goal_rate of 0 (maintain encoded as cut?) — defensive: should still
  // produce a finite weeks projection using MIN_WEEKLY_LOSS.
  const r = project({
    weight_kg: 100,
    sex: "male",
    goal: "cut",
    goal_rate_kg_per_week: 0,
    estimate: { body_fat_pct_low: 28, body_fat_pct_high: 30 },
  });
  assert.equal(r.status, "above_target");
  assert.ok(r.weeks_to_goal);
  assert.ok(Number.isFinite(r.weeks_to_goal!.weeks_low));
  assert.ok(Number.isFinite(r.weeks_to_goal!.weeks_high));
});
