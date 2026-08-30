"use client";

import { useState } from "react";

/**
 * Accordion FAQ. Client component (state is which panel is open).
 * Only one open at a time keeps the section short; users toggle
 * between them. Answers grounded in real product facts, not marketing
 * fluff — investors and skeptical Reddit-driven users read these.
 */
const ITEMS = [
  {
    q: "Isn't this just MyFitnessPal?",
    a: "MFP tells you what you ate after the fact. SE7A works one step earlier — at the moment of decision. Photograph a restaurant menu, and it ranks dishes against your remaining kcal + macros. It's also the only app in this market with honest low–high macro ranges, halal-only suggestions, full Arabic RTL, and Gulf food + chain recognition built in from day one.",
  },
  {
    q: "How can a photo know how much oil is in my food?",
    a: "It can't — that's the point. SE7A returns every kcal and macro as a low–high band with a confidence rating. Home-cooked whole foods get tight ranges (±10%). Restaurant items get wider ranges (±25–40%) because a photo can't see the oil. No 3-decimal fake precision.",
  },
  {
    q: "Is everything really halal?",
    a: "Every AI suggestion is halal by default — the coach never proposes pork or alcohol, and when a menu contains them, it redirects to the closest halal alternative and notes the swap. If you scan a menu with non-halal items, they still appear in the ranking with a warning; the app doesn't erase reality, it just doesn't suggest them.",
  },
  {
    q: "What data do you store, and where?",
    a: "Meal logs, weight, workouts, and profile are stored in Supabase (Postgres, encrypted at rest, EU/US regions). Photos used for plate scans are analyzed then discarded — SE7A never keeps the image. Body composition scan photos are never stored server-side. Full details in the Privacy policy linked in the footer.",
  },
  {
    q: "How does cancellation work?",
    a: "One tap in Apple's Subscriptions settings. Access continues through the end of your billing period. No email required, no dark-pattern cancellation flow. Standard 14-day refund window in UAE per consumer protection law.",
  },
  {
    q: "Do I need Pro to get value?",
    a: "No. The free tier is a full nutrition tracker — ring, logging, 5 scans/day, weight, streaks, calendar, achievements, Ramadan mode. Pro adds the meal planner, AI Coach chat, menu scans, unlimited scans, and one 90-Day Plan per quarter. The 90-Day Plan is also available as a 19 AED one-time purchase without Pro.",
  },
  {
    q: "When is Android coming?",
    a: "iOS-first for launch. Android sits on the roadmap after the initial iOS release stabilizes — realistic timeline is Q1 2027. If you're on Android and want early access, joining the waitlist tells us.",
  },
  {
    q: "Does it work in Arabic?",
    a: "Yes — full RTL layout, every screen, every coach response renders natively in Arabic (not Google-translated). Switch language in one tap. Meal names, exercise names, and portions all localized.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="faq-band">
      <div className="faq-header">
        <div className="feature-num">QUESTIONS</div>
        <h2>Things people actually ask.</h2>
      </div>
      <div className="faq-list">
        {ITEMS.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className={`faq-item ${isOpen ? "faq-item-open" : ""}`}>
              <button
                type="button"
                className="faq-q"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span>{it.q}</span>
                <span className="faq-chev">{isOpen ? "−" : "+"}</span>
              </button>
              <div className="faq-a-wrap">
                <div className="faq-a">{it.a}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
