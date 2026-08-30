import Image from "next/image";
import Waitlist from "@/components/Waitlist";
import { Reveal } from "@/components/Reveal";
import { StickyNav } from "@/components/StickyNav";
import { PlanBandAccent } from "@/components/PlanBandAccent";
import { StaggerText } from "@/components/StaggerText";
import { CountUp } from "@/components/CountUp";
import { ScrollProgress } from "@/components/ScrollProgress";
import { Marquee } from "@/components/Marquee";

export default function Home() {
  return (
    <>
      <ScrollProgress />

      <StickyNav>
        <div className="shell">
          <nav className="nav">
            <div className="wordmark">
              SE<span className="seven">7</span>A
              <span className="arabic">{"صحة"}</span>
            </div>
            <div className="nav-tag">EAT SMART {"·"} TRAIN SMART</div>
          </nav>
        </div>
      </StickyNav>

      <div className="shell">
        {/* ─── HERO ───────────────────────────────────────────────── */}
        <section className="hero">
          <div className="hero-kicker">GULF-FIRST · AI FOOD &amp; FITNESS COACH</div>
          <StaggerText as="h1" className="hero-h1" step={70}>
            {"Honest ranges. "}
            <span className="gold">Not fake precision.</span>
          </StaggerText>
          <p className="hero-sub">
            SE7A scans your plate, ranks a restaurant menu against what you
            have left today, and generates a personalized 90-day plan.{" "}
            <strong>Every macro is a range.</strong> A photo can&apos;t see the
            oil {"—"} we don&apos;t pretend it can.
          </p>
          <Waitlist />
        </section>

        {/* ─── TRUST TICKER ───────────────────────────────────────── */}
        <section className="ticker-band">
          <Marquee duration={36}>
            <span>HONEST RANGES</span>
            <span className="dot">·</span>
            <span>BILINGUAL EN + AR</span>
            <span className="dot">·</span>
            <span>HALAL BY DEFAULT</span>
            <span className="dot">·</span>
            <span>GULF-FIRST RECIPES</span>
            <span className="dot">·</span>
            <span>RAMADAN MODE</span>
            <span className="dot">·</span>
            <span>90-DAY PLAN</span>
            <span className="dot">·</span>
            <span>AI COACH</span>
            <span className="dot">·</span>
            <span>APPLE HEALTH · WHOOP · OURA</span>
            <span className="dot">·</span>
          </Marquee>
        </section>

        {/* ─── FEATURE: HOME ──────────────────────────────────────── */}
        <Reveal>
          <section className="feature-row">
            <div className="feature-copy">
              <div className="feature-num">01 {"—"} REMAINING TODAY</div>
              <h2>Every kcal + macro as a low-high band.</h2>
              <p>
                Your ring shows how much you have left, not just what you ate.
                Slot cards for breakfast, lunch, dinner, and snack expand
                inline so you see exactly what landed in each meal. Tap the
                plus to log more. Nothing hidden behind another screen.
              </p>
            </div>
            <div className="feature-shot">
              <Image
                src="/screens/home.png"
                alt="SE7A Home tab showing the calorie ring, macros, and meal slots"
                width={280}
                height={520}
                className="phone"
                unoptimized
                priority
              />
            </div>
          </section>
        </Reveal>

        {/* ─── FEATURE: LOG ───────────────────────────────────────── */}
        <Reveal>
          <section className="feature-row reverse">
            <div className="feature-copy">
              <div className="feature-num">02 {"—"} LOG</div>
              <h2>Any meal in three taps.</h2>
              <p>
                Snap a plate for honest macro ranges. Scan a menu before you
                order. Barcode a packaged good via Open Food Facts. Or type it
                in with AI food search that knows shawarma, kabsa, and Al Baik
                meals without a USDA database in sight.
              </p>
            </div>
            <div className="feature-shot">
              <Image
                src="/screens/log.png"
                alt="SE7A Log tab showing scan a plate, quick log tiles, and suggest a meal"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── COACH — inline chat mock, no screenshot needed ───── */}
        <Reveal>
          <section className="coach-band">
            <div className="coach-copy">
              <div className="feature-num">03 {"—"} AI COACH</div>
              <h2>Knows your logs. Answers in your voice.</h2>
              <p>
                Ask about your food, workouts, or progress. The coach reads
                your actual profile, this week&apos;s meals, and the PRs you
                just hit. No generic ChatGPT boilerplate.
              </p>
            </div>
            <div className="coach-chat">
              <Reveal delay={150}>
                <div className="coach-bubble user">
                  Is shawarma OK for dinner tonight?
                </div>
              </Reveal>
              <Reveal delay={350}>
                <div className="coach-bubble bot">
                  You have 780 kcal left + 34g protein. A chicken shawarma
                  wrap (~500-620 kcal, 30-38g protein) fits with room for
                  laban. Skip the fries.
                </div>
              </Reveal>
              <Reveal delay={600}>
                <div className="coach-bubble user">
                  My bench felt heavy today.
                </div>
              </Reveal>
              <Reveal delay={800}>
                <div className="coach-bubble bot">
                  Sleep was 5h Tuesday + 6h Wednesday per your Whoop pull.
                  Drop top set to 90% today, deload volume 20%. Full recovery
                  by Saturday.
                </div>
              </Reveal>
            </div>
          </section>
        </Reveal>

        {/* ─── FEATURE: PROGRESS ──────────────────────────────────── */}
        <Reveal>
          <section className="feature-row">
            <div className="feature-copy">
              <div className="feature-num">04 {"—"} PROGRESS</div>
              <h2>Trend over weeks, not any single day.</h2>
              <p>
                Weekly adherence, streak, weight trend, and a projection band
                that re-tunes your targets as the scale moves. Formula-driven,
                never guessed. Weekly weigh-ins keep the plan honest.
              </p>
            </div>
            <div className="feature-shot">
              <Image
                src="/screens/progress.png"
                alt="SE7A Progress tab showing 7-day adherence, streak, weight trend, and projection"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── 90-DAY PLAN BAND ───────────────────────────────────── */}
        <Reveal>
          <section className="plan-band">
            <PlanBandAccent />
            <div className="plan-band-copy">
              <div className="plan-band-kicker">90-DAY PLAN</div>
              <div className="plan-band-rule" />
              <h2>
                A personalized transformation blueprint.
                <span className="gold"> Buy once. Follow for 90 days.</span>
              </h2>
              <p>
                One AI-generated plan built from your profile + recent logs.
                Calorie + macro targets with weekly adjustment rules. A 7-day
                sample meal week with Gulf-friendly swaps. A weekly training
                schedule matched to your equipment + days available. Habit
                rules for hard scenarios. A week-by-week roadmap with monthly
                reviews.
              </p>
              <ul className="plan-bullets">
                <li>
                  <span className="mono">01</span> Personalized nutrition
                  rationale + weekly adjustment rules
                </li>
                <li>
                  <span className="mono">02</span> 7-day meal plan with swap
                  ideas + grocery staples
                </li>
                <li>
                  <span className="mono">03</span> N-day training split matched
                  to your gym / home setup
                </li>
                <li>
                  <span className="mono">04</span> Habits playbook for Ramadan,
                  travel, dining out
                </li>
                <li>
                  <span className="mono">05</span> Week-by-week roadmap over 13
                  weeks
                </li>
                <li>
                  <span className="mono">06</span> Weekly &ldquo;how
                  you&rsquo;re doing&rdquo; check-in auto-regenerated from your
                  logs
                </li>
              </ul>
              <div className="plan-price">
                <span className="mono dim">19 AED once</span>
                <span className="dim">{"·"}</span>
                <span className="mono">or included with Pro</span>
              </div>
            </div>
            <div className="plan-band-shot">
              <Image
                src="/screens/nutrients.png"
                alt="Detailed nutrients breakdown from a SE7A plan"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── MADE FOR THE GULF ─────────────────────────────────── */}
        <Reveal>
          <section className="gulf-band">
            <div className="gulf-header">
              <div className="feature-num">05 {"—"} BUILT FOR THE GULF</div>
              <h2>Not another Western app translated into Arabic.</h2>
            </div>
            <div className="gulf-pillars">
              <div className="gulf-pillar">
                <div className="pillar-kicker">HALAL</div>
                <div className="pillar-title">Every suggestion.</div>
                <div className="pillar-sub">
                  The coach never proposes pork or alcohol. If a menu asks, it
                  redirects to the closest halal alternative and notes the swap.
                </div>
              </div>
              <div className="gulf-pillar">
                <div className="pillar-kicker">EN + AR</div>
                <div className="pillar-title">
                  Bilingual. Full RTL.
                </div>
                <div className="pillar-sub">
                  Switch language in one tap. Every screen, every meal name,
                  every coach response renders naturally in Arabic. Not a
                  Google-Translated afterthought.
                </div>
              </div>
              <div className="gulf-pillar">
                <div className="pillar-kicker">RAMADAN</div>
                <div className="pillar-title">Suhoor + Iftar mode.</div>
                <div className="pillar-sub">
                  During Ramadan the app reshapes: suhoor + iftar windows
                  instead of three meals, fajr/maghrib reminders, and a
                  cumulative view that respects the fast.
                </div>
              </div>
              <div className="gulf-pillar">
                <div className="pillar-kicker">GULF FOOD</div>
                <div className="pillar-title">Machboos to Al Baik.</div>
                <div className="pillar-sub">
                  Recognizes regional dishes and chain menu items {"—"} not
                  just chicken breast + white rice. Portion estimates match
                  how food actually shows up on your plate here.
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ─── FEATURE: FOODS ─────────────────────────────────────── */}
        <Reveal>
          <section className="feature-row reverse">
            <div className="feature-copy">
              <div className="feature-num">06 {"—"} PATTERNS</div>
              <h2>What actually drives your calories.</h2>
              <p>
                Not just today {"—"} the past 30 days. Top foods by share of
                your kcal, protein, carbs, and fat. Nutrient adherence broken
                down row by row against your targets. See the patterns you
                didn&apos;t know you had.
              </p>
            </div>
            <div className="feature-shot">
              <Image
                src="/screens/foods.png"
                alt="Foods driving your calories — top contributors over the last 30 days"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── EDITORIAL STATS with count-up ──────────────────────── */}
        <Reveal>
          <section className="stats-band">
            <div className="stat">
              <div className="stat-value">
                <CountUp to={17} />
              </div>
              <div className="stat-label">Achievements to earn</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={90} suffix=" DAYS" />
              </div>
              <div className="stat-label">Plan length</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={0.5} decimals={1} suffix="s" />
              </div>
              <div className="stat-label">Ring updates on log</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={100} suffix="% HALAL" />
              </div>
              <div className="stat-label">Every suggestion</div>
            </div>
          </section>
        </Reveal>

        {/* ─── WEEKLY RITUAL ──────────────────────────────────────── */}
        <Reveal>
          <section className="ritual-band">
            <div className="ritual-copy">
              <div className="ritual-kicker">WEEKLY RITUAL</div>
              <h2>A pace you can actually keep.</h2>
              <p>
                SE7A meets you twice a week {"—"} once to reflect, once to
                plan. Streaks, checkpoints, and small anniversaries mark the
                distance so 90 days feels like a story, not a slog.
              </p>
            </div>
            <div className="ritual-cards">
              <Reveal delay={120}>
                <div className="ritual-card">
                  <div className="ritual-day">SUN {"·"} 18:00</div>
                  <div className="ritual-title">Weekly Review</div>
                  <div className="ritual-sub">
                    How the past 7 days went {"—"} adherence, streak, weight
                    trend, the coach&rsquo;s take.
                  </div>
                </div>
              </Reveal>
              <Reveal delay={240}>
                <div className="ritual-card">
                  <div className="ritual-day">MON {"·"} 09:00</div>
                  <div className="ritual-title">Plan Check-In</div>
                  <div className="ritual-sub">
                    What went well, what to change, and the week ahead in your
                    90-day plan.
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        </Reveal>

        {/* ─── FEATURE: CALENDAR ──────────────────────────────────── */}
        <Reveal>
          <section className="feature-row">
            <div className="feature-copy">
              <div className="feature-num">07 {"—"} CALENDAR</div>
              <h2>Every day accounted for.</h2>
              <p>
                A month view of meals, workouts, and weigh-ins. Colored dots
                for what you logged each day. Tap into any day for the full
                drawer {"—"} what you ate, what you lifted, where the weight
                went.
              </p>
            </div>
            <div className="feature-shot">
              <Image
                src="/screens/calendar.png"
                alt="SE7A Calendar tab showing a monthly grid with meal, workout, and weigh-in dots"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── EVERYTHING ELSE — mini feature grid ────────────────── */}
        <Reveal>
          <section className="grid-band">
            <div className="grid-header">
              <div className="feature-num">08 {"—"} EVERYTHING ELSE</div>
              <h2>What we didn&apos;t have room to feature above.</h2>
            </div>
            <div className="mini-grid">
              <MiniCard
                title="Voice log"
                body="Hold to talk. SE7A hears the meal, extracts items, macros, portions."
              />
              <MiniCard
                title="Weekly meal plan"
                body="7-day plan with an auto grocery list. Regenerate any meal you don't like."
                tag="PRO"
              />
              <MiniCard
                title="Menu scan"
                body="Photograph a restaurant menu. Dishes ranked against your remaining budget."
                tag="PRO"
              />
              <MiniCard
                title="Body composition scan"
                body="Standing photo → body-fat range + weeks-to-goal. Photo never stored."
                tag="PRO"
              />
              <MiniCard
                title="Fasting timer"
                body="16:8, 18:6, 20:4, and Ramadan windows. Push notifications 15 min before fajr."
              />
              <MiniCard
                title="Workout programs"
                body="PPL, Upper/Lower, home cutting, endurance blocks. Auto-picked by your days available."
              />
              <MiniCard
                title="Streaks + freezes"
                body="Streaks that survive travel. Two free freezes a month so a missed day isn't the end."
              />
              <MiniCard
                title="Apple Health · Whoop · Oura"
                body="Steps, sleep, HRV, workouts all sync in. Weight-outs sync back."
              />
              <MiniCard
                title="iOS widget"
                body="Home + lock screen. Remaining kcal at a glance, no unlock needed."
              />
              <MiniCard
                title="Progress photos"
                body="Weekly photo journal, aligned so slow changes are visible over months."
              />
              <MiniCard
                title="Cycle tracking"
                body="Optional. Nutrition and energy shift with phase — the coach adapts recommendations."
              />
              <MiniCard
                title="Google sign-in"
                body="Or one-tap email magic link. No passwords to remember."
              />
            </div>
          </section>
        </Reveal>

        {/* ─── FINAL CTA ──────────────────────────────────────────── */}
        <Reveal>
          <section className="final-cta">
            <div className="hero-kicker">EARLY ACCESS</div>
            <h2 className="final-h">
              Built in the Gulf.
              <br />
              <span className="gold">Made for the Gulf.</span>
            </h2>
            <p className="final-sub">
              SE7A launches soon on iOS. Get on the waitlist to be one of the
              first in when it opens.
            </p>
            <Waitlist />
          </section>
        </Reveal>

        <footer>
          <div className="mono">SE7A {"©"} 2026 {"·"} DUBAI, UAE</div>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </footer>
      </div>
    </>
  );
}

function MiniCard({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag?: string;
}) {
  return (
    <div className="mini-card">
      <div className="mini-head">
        <div className="mini-title">{title}</div>
        {tag ? <div className="mini-tag">{tag}</div> : null}
      </div>
      <div className="mini-body">{body}</div>
    </div>
  );
}
