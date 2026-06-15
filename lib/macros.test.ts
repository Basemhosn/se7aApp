import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageFromBirthdate,
  bmrMifflinStJeor,
  carbTarget,
  computeTargets,
  fatTarget,
  kcalTarget,
  proteinTarget,
  tdee,
} from "./macros";

test("BMR — 30yo male, 80kg, 180cm", () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(
    bmrMifflinStJeor({ sex: "male", weight_kg: 80, height_cm: 180, age: 30 }),
    1780
  );
});

test("BMR — 30yo female, 65kg, 165cm", () => {
  // 10*65 + 6.25*165 - 5*30 - 161 = 1370.25
  assert.equal(
    bmrMifflinStJeor({ sex: "female", weight_kg: 65, height_cm: 165, age: 30 }),
    1370.25
  );
});

test("TDEE — activity multipliers", () => {
  assert.equal(tdee({ bmr: 1780, activity_level: "sedentary" }), 1780 * 1.2);
  assert.equal(tdee({ bmr: 1780, activity_level: "moderate" }), 1780 * 1.55);
  assert.equal(tdee({ bmr: 1780, activity_level: "very_active" }), 1780 * 1.9);
});

test("kcal target — moderate cut, not clamped", () => {
  // 2500 + (-0.5 * 7700 / 7) = 2500 - 550 = 1950
  const r = kcalTarget({
    tdee: 2500,
    goal_rate_kg_per_week: -0.5,
    sex: "male",
  });
  assert.equal(r.kcal, 1950);
  assert.equal(r.clamped, false);
});

test("kcal target — clamps when below female floor", () => {
  // 1800 - 770 = 1030 → clamp 1200
  const r = kcalTarget({
    tdee: 1800,
    goal_rate_kg_per_week: -0.7,
    sex: "female",
  });
  assert.equal(r.kcal, 1200);
  assert.equal(r.clamped, true);
});

test("kcal target — maintain leaves TDEE alone", () => {
  const r = kcalTarget({ tdee: 2200, goal_rate_kg_per_week: 0, sex: "male" });
  assert.equal(r.kcal, 2200);
  assert.equal(r.clamped, false);
});

test("kcal target — bulk adds calories", () => {
  // 2500 + 0.25 * 7700 / 7 = 2500 + 275 = 2775
  const r = kcalTarget({
    tdee: 2500,
    goal_rate_kg_per_week: 0.25,
    sex: "male",
  });
  assert.equal(r.kcal, 2775);
});

test("protein — cut at 2.2 g/kg of total weight when no BF%", () => {
  assert.equal(proteinTarget({ weight_kg: 80, goal: "cut" }), 176);
});

test("protein — bulk at 1.6 g/kg", () => {
  assert.equal(proteinTarget({ weight_kg: 80, goal: "bulk" }), 128);
});

test("protein — uses lean mass when BF% supplied", () => {
  // 80 * 0.8 = 64kg lean, cut 2.2 → 140.8 → 141
  assert.equal(
    proteinTarget({ weight_kg: 80, goal: "cut", body_fat_pct: 20 }),
    141
  );
});

test("fat — 27% of kcal at 9 kcal/g", () => {
  // 2000 * 0.27 / 9 = 60
  assert.equal(fatTarget({ daily_kcal_target: 2000 }), 60);
});

test("carbs — fill the remainder", () => {
  // 2000 - 150*4 - 60*9 = 860 → 215g
  assert.equal(
    carbTarget({ daily_kcal_target: 2000, protein_g: 150, fat_g: 60 }),
    215
  );
});

test("carbs — never negative", () => {
  assert.equal(
    carbTarget({ daily_kcal_target: 1000, protein_g: 300, fat_g: 100 }),
    0
  );
});

test("computeTargets — 30yo male moderate cut, no clamp", () => {
  const t = computeTargets({
    sex: "male",
    age: 30,
    height_cm: 180,
    weight_kg: 80,
    activity_level: "moderate",
    goal: "cut",
    goal_rate_kg_per_week: -0.5,
  });
  assert.equal(t.bmr, 1780);
  assert.equal(t.tdee, 2759); // 1780 * 1.55
  assert.equal(t.daily_kcal_target, 2209);
  assert.equal(t.daily_protein_g, 176);
  assert.equal(t.daily_fat_g, 66); // 2209 * 0.27 / 9 = 66.27
  assert.equal(t.daily_carb_g, 228); // (2209 - 704 - 594) / 4
  assert.deepEqual(t.notes, []);
});

test("computeTargets — aggressive female cut applies floor and flags it", () => {
  const t = computeTargets({
    sex: "female",
    age: 28,
    height_cm: 165,
    weight_kg: 60,
    activity_level: "sedentary",
    goal: "cut",
    goal_rate_kg_per_week: -1.0,
  });
  // 1330.25 BMR → 1596.3 TDEE → 1596.3 - 1100 = 496 → clamp 1200
  assert.equal(t.daily_kcal_target, 1200);
  assert.ok(t.notes.includes("kcal_floor_applied"));
});

test("ageFromBirthdate — exact birthday", () => {
  assert.equal(ageFromBirthdate("1995-06-11", new Date("2026-06-11")), 31);
});

test("ageFromBirthdate — day before birthday still subtracts a year", () => {
  assert.equal(ageFromBirthdate("1995-06-12", new Date("2026-06-11")), 30);
});

test("ageFromBirthdate — later month not yet reached", () => {
  assert.equal(ageFromBirthdate("1995-12-31", new Date("2026-06-11")), 30);
});
