import type { Program } from "./types";

/**
 * Six starter programs covering the day/week × experience × equipment matrix.
 * Rep ranges + RPE targets follow standard hypertrophy / strength conventions:
 *   - 3-5 reps @ RPE 8-9  → strength
 *   - 6-8 reps @ RPE 8    → strength/hypertrophy
 *   - 8-12 reps @ RPE 7-8 → hypertrophy
 *   - 12-20 reps @ RPE 8+ → endurance / metabolic
 *
 * Every session is designed to fit in 45-60 min for beginners, 60-75 for
 * intermediate/advanced. Rest values are on the low side of typical to keep
 * total time bounded.
 */
export const PROGRAMS: Program[] = [
  {
    id: "beginner-full-body-3d",
    name: "Foundation Full Body",
    description:
      "Three full-body days a week. Compound movements only, moderate volume. The right first program for a new lifter.",
    days_per_week: 3,
    target_experience: "beginner",
    target_equipment: "gym",
    goal_alignment: ["recomp", "maintain", "bulk", "cut"],
    sessions: [
      {
        name: "Day A",
        focus: "Squat-focused full body",
        exercises: [
          { name: "Back squat", sets: 3, reps: "5-8", rpe: 7, rest_sec: 180, cue: "Brace before you unrack. Knees track over toes." },
          { name: "Bench press", sets: 3, reps: "5-8", rpe: 7, rest_sec: 180, cue: "Shoulder blades pinned, feet planted." },
          { name: "Bent-over row", sets: 3, reps: "8-10", rpe: 7, rest_sec: 120, cue: "Torso ~45°. Pull to lower chest." },
          { name: "Plank", sets: 3, reps: "30-45 sec", rpe: null, rest_sec: 60 },
        ],
      },
      {
        name: "Day B",
        focus: "Hinge-focused full body",
        exercises: [
          { name: "Romanian deadlift", sets: 3, reps: "6-8", rpe: 7, rest_sec: 180, cue: "Hips back, bar close to shins." },
          { name: "Overhead press", sets: 3, reps: "5-8", rpe: 7, rest_sec: 180, cue: "Ribs down. Squeeze glutes." },
          { name: "Pull-up (assisted OK)", sets: 3, reps: "AMRAP-8", rpe: 8, rest_sec: 120, substitutes: ["Lat pulldown"] },
          { name: "Farmer carry", sets: 3, reps: "30 sec", rpe: null, rest_sec: 60, cue: "Tall posture. Don't shrug." },
        ],
      },
      {
        name: "Day C",
        focus: "Squat pattern variety",
        exercises: [
          { name: "Front squat", sets: 3, reps: "5-8", rpe: 7, rest_sec: 180, substitutes: ["Goblet squat"] },
          { name: "Incline dumbbell press", sets: 3, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Seated cable row", sets: 3, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Hanging knee raise", sets: 3, reps: "8-12", rpe: 8, rest_sec: 60 },
        ],
      },
    ],
  },
  {
    id: "intermediate-upper-lower-4d",
    name: "Upper / Lower Split",
    description:
      "Four days: two upper, two lower. Balanced volume, room to grow strength on the main lifts.",
    days_per_week: 4,
    target_experience: "intermediate",
    target_equipment: "gym",
    goal_alignment: ["recomp", "maintain", "bulk", "cut"],
    sessions: [
      {
        name: "Upper A (strength)",
        focus: "Horizontal push + vertical pull",
        exercises: [
          { name: "Bench press", sets: 4, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Weighted pull-up", sets: 4, reps: "6-8", rpe: 8, rest_sec: 180, substitutes: ["Lat pulldown"] },
          { name: "Seated dumbbell press", sets: 3, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Chest-supported row", sets: 3, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Face pull", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Lower A (squat)",
        focus: "Quads + squat pattern",
        exercises: [
          { name: "Back squat", sets: 4, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Bulgarian split squat", sets: 3, reps: "8-10/side", rpe: 8, rest_sec: 90 },
          { name: "Leg press", sets: 3, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Standing calf raise", sets: 3, reps: "10-15", rpe: 8, rest_sec: 60 },
          { name: "Hanging leg raise", sets: 3, reps: "8-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Upper B (hypertrophy)",
        focus: "Vertical push + horizontal pull",
        exercises: [
          { name: "Overhead press", sets: 4, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Barbell row", sets: 4, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Incline dumbbell press", sets: 3, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Cable row", sets: 3, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Lateral raise", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Barbell curl", sets: 3, reps: "8-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Lower B (hinge)",
        focus: "Posterior chain",
        exercises: [
          { name: "Deadlift", sets: 3, reps: "3-5", rpe: 8, rest_sec: 240 },
          { name: "Romanian deadlift", sets: 3, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Walking lunge", sets: 3, reps: "10-12/side", rpe: 8, rest_sec: 90 },
          { name: "Seated leg curl", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
          { name: "Ab wheel rollout", sets: 3, reps: "6-10", rpe: 8, rest_sec: 60, substitutes: ["Plank"] },
        ],
      },
    ],
  },
  {
    id: "intermediate-ppl-6d",
    name: "Push / Pull / Legs ×2",
    description:
      "Classic 6-day PPL for hypertrophy. High volume, high frequency. Only sign up if you can commit 6 sessions weekly.",
    days_per_week: 6,
    target_experience: "advanced",
    target_equipment: "gym",
    goal_alignment: ["bulk", "recomp"],
    sessions: [
      {
        name: "Push A",
        focus: "Chest / shoulders / triceps (strength)",
        exercises: [
          { name: "Bench press", sets: 4, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Overhead press", sets: 3, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Incline dumbbell press", sets: 3, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Cable fly", sets: 3, reps: "12-15", rpe: 9, rest_sec: 60 },
          { name: "Tricep pushdown", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Pull A",
        focus: "Back / biceps (strength)",
        exercises: [
          { name: "Deadlift", sets: 3, reps: "3-5", rpe: 8, rest_sec: 240 },
          { name: "Weighted pull-up", sets: 4, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Barbell row", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Face pull", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Barbell curl", sets: 3, reps: "8-10", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Legs A",
        focus: "Squat + quads",
        exercises: [
          { name: "Back squat", sets: 4, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Front squat", sets: 3, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Bulgarian split squat", sets: 3, reps: "8-10/side", rpe: 8, rest_sec: 90 },
          { name: "Standing calf raise", sets: 4, reps: "8-12", rpe: 9, rest_sec: 60 },
        ],
      },
      {
        name: "Push B",
        focus: "Chest / shoulders (hypertrophy)",
        exercises: [
          { name: "Incline bench press", sets: 4, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Dumbbell shoulder press", sets: 4, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Dips", sets: 3, reps: "AMRAP-12", rpe: 9, rest_sec: 90, substitutes: ["Machine dip"] },
          { name: "Lateral raise", sets: 4, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Overhead tricep extension", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Pull B",
        focus: "Back / biceps (hypertrophy)",
        exercises: [
          { name: "Chest-supported row", sets: 4, reps: "8-10", rpe: 8, rest_sec: 120 },
          { name: "Lat pulldown", sets: 4, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Cable row", sets: 3, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Rear-delt fly", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Hammer curl", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Legs B",
        focus: "Hinge + hamstrings",
        exercises: [
          { name: "Romanian deadlift", sets: 4, reps: "6-8", rpe: 8, rest_sec: 150 },
          { name: "Leg press", sets: 4, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Seated leg curl", sets: 4, reps: "10-12", rpe: 8, rest_sec: 60 },
          { name: "Hip thrust", sets: 3, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Seated calf raise", sets: 4, reps: "10-15", rpe: 8, rest_sec: 60 },
        ],
      },
    ],
  },
  {
    id: "home-bodyweight-3d",
    name: "Home Bodyweight",
    description:
      "Three full-body sessions using nothing but your bodyweight and a doorway pull-up bar (optional). Built for space, not equipment.",
    days_per_week: 3,
    target_experience: "beginner",
    target_equipment: "bodyweight",
    goal_alignment: ["cut", "recomp", "maintain"],
    sessions: [
      {
        name: "Session A",
        focus: "Squat / push / pull",
        exercises: [
          { name: "Bodyweight squat", sets: 4, reps: "15-20", rpe: 8, rest_sec: 60, cue: "Chest tall, knees track over toes." },
          { name: "Push-up", sets: 4, reps: "AMRAP-15", rpe: 9, rest_sec: 60, substitutes: ["Incline push-up"] },
          { name: "Inverted row (or pull-up)", sets: 4, reps: "AMRAP-12", rpe: 9, rest_sec: 90, substitutes: ["Doorway row"] },
          { name: "Plank", sets: 3, reps: "30-60 sec", rpe: null, rest_sec: 45 },
        ],
      },
      {
        name: "Session B",
        focus: "Hinge / single-leg / core",
        exercises: [
          { name: "Reverse lunge", sets: 4, reps: "10-12/side", rpe: 8, rest_sec: 60 },
          { name: "Single-leg glute bridge", sets: 4, reps: "12-15/side", rpe: 8, rest_sec: 60 },
          { name: "Pike push-up", sets: 3, reps: "6-10", rpe: 8, rest_sec: 90, substitutes: ["Wall handstand hold"] },
          { name: "Superman hold", sets: 3, reps: "20-40 sec", rpe: null, rest_sec: 45 },
        ],
      },
      {
        name: "Session C",
        focus: "Conditioning + accessories",
        exercises: [
          { name: "Jump squat", sets: 4, reps: "10-12", rpe: 8, rest_sec: 60, cue: "Land quiet. Reset before next rep." },
          { name: "Dive-bomber push-up", sets: 3, reps: "6-10", rpe: 8, rest_sec: 60 },
          { name: "Chin-up (or inverted row)", sets: 3, reps: "AMRAP-10", rpe: 9, rest_sec: 90 },
          { name: "Mountain climber", sets: 3, reps: "30 sec", rpe: null, rest_sec: 45 },
          { name: "Dead bug", sets: 3, reps: "8-10/side", rpe: null, rest_sec: 45 },
        ],
      },
    ],
  },
  {
    id: "cutting-circuit-4d",
    name: "Cutting Circuit",
    description:
      "Four days of strength + finisher circuits. Preserves muscle in a deficit while adding a metabolic kick.",
    days_per_week: 4,
    target_experience: "intermediate",
    target_equipment: "gym",
    goal_alignment: ["cut"],
    sessions: [
      {
        name: "Upper strength + finisher",
        focus: "Chest / back / arms + AMRAP",
        exercises: [
          { name: "Bench press", sets: 4, reps: "5-6", rpe: 8, rest_sec: 150 },
          { name: "Barbell row", sets: 4, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Dumbbell shoulder press", sets: 3, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Cable curl", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
          { name: "Finisher: Dips + push-up (10 min AMRAP)", sets: 1, reps: "10 min", rpe: 9, rest_sec: null, cue: "5 dips, 10 push-ups. Rounds." },
        ],
      },
      {
        name: "Lower strength + finisher",
        focus: "Squat + posterior + sled",
        exercises: [
          { name: "Back squat", sets: 4, reps: "5-6", rpe: 8, rest_sec: 150 },
          { name: "Romanian deadlift", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Walking lunge", sets: 3, reps: "10/side", rpe: 8, rest_sec: 60 },
          { name: "Finisher: Sled push (8 min)", sets: 1, reps: "8 min", rpe: 9, rest_sec: null, substitutes: ["Prowler push", "Loaded carries"] },
        ],
      },
      {
        name: "Upper hypertrophy + finisher",
        focus: "Volume + conditioning",
        exercises: [
          { name: "Incline dumbbell press", sets: 4, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Lat pulldown", sets: 4, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Lateral raise", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Cable row", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
          { name: "Finisher: Kettlebell swing (100 reps)", sets: 1, reps: "100 total", rpe: 9, rest_sec: null, cue: "Break as needed. Hinge, don't squat." },
        ],
      },
      {
        name: "Lower hypertrophy + intervals",
        focus: "Legs + rowing",
        exercises: [
          { name: "Front squat", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Leg press", sets: 3, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Seated leg curl", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Finisher: Row intervals (8 × 200m)", sets: 1, reps: "8 rounds", rpe: 9, rest_sec: 60, substitutes: ["Bike intervals"] },
        ],
      },
    ],
  },
  {
    id: "advanced-ppl-6d",
    name: "PPL: Strength Emphasis",
    description:
      "Six days for lifters chasing strength records. Lower volume than the hypertrophy PPL, heavier singles/doubles on main lifts.",
    days_per_week: 6,
    target_experience: "advanced",
    target_equipment: "gym",
    goal_alignment: ["maintain", "bulk"],
    sessions: [
      {
        name: "Push (heavy)",
        focus: "Bench + press strength",
        exercises: [
          { name: "Bench press", sets: 5, reps: "3-5", rpe: 8, rest_sec: 240 },
          { name: "Overhead press", sets: 4, reps: "4-6", rpe: 8, rest_sec: 180 },
          { name: "Close-grip bench", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Skull crusher", sets: 3, reps: "8-10", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Pull (heavy)",
        focus: "Deadlift + row strength",
        exercises: [
          { name: "Deadlift", sets: 4, reps: "2-3", rpe: 8, rest_sec: 300 },
          { name: "Weighted pull-up", sets: 4, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Barbell row", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Barbell curl", sets: 3, reps: "6-8", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Legs (heavy)",
        focus: "Squat strength",
        exercises: [
          { name: "Back squat", sets: 5, reps: "3-5", rpe: 8, rest_sec: 240 },
          { name: "Pause squat", sets: 3, reps: "5-6", rpe: 8, rest_sec: 180 },
          { name: "Leg curl", sets: 3, reps: "8-10", rpe: 8, rest_sec: 60 },
          { name: "Standing calf raise", sets: 4, reps: "6-8", rpe: 9, rest_sec: 60 },
        ],
      },
      {
        name: "Push (volume)",
        focus: "Chest + shoulder accessories",
        exercises: [
          { name: "Incline bench press", sets: 4, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Dumbbell shoulder press", sets: 4, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Cable fly", sets: 3, reps: "12-15", rpe: 9, rest_sec: 60 },
          { name: "Lateral raise", sets: 4, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Tricep pushdown", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Pull (volume)",
        focus: "Lat width + arm size",
        exercises: [
          { name: "Chest-supported row", sets: 4, reps: "8-10", rpe: 8, rest_sec: 90 },
          { name: "Lat pulldown", sets: 4, reps: "10-12", rpe: 8, rest_sec: 90 },
          { name: "Face pull", sets: 3, reps: "12-15", rpe: 8, rest_sec: 60 },
          { name: "Preacher curl", sets: 3, reps: "8-10", rpe: 8, rest_sec: 60 },
          { name: "Hammer curl", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
        ],
      },
      {
        name: "Legs (volume)",
        focus: "Hinge + accessories",
        exercises: [
          { name: "Romanian deadlift", sets: 4, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Front squat", sets: 3, reps: "6-8", rpe: 8, rest_sec: 120 },
          { name: "Bulgarian split squat", sets: 3, reps: "8-10/side", rpe: 8, rest_sec: 90 },
          { name: "Seated leg curl", sets: 3, reps: "10-12", rpe: 8, rest_sec: 60 },
          { name: "Seated calf raise", sets: 4, reps: "10-15", rpe: 8, rest_sec: 60 },
        ],
      },
    ],
  },
];
