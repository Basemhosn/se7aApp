import Waitlist from "@/components/Waitlist";

export default function Home() {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="wordmark">
          SE<span className="seven">7</span>A
          <span className="arabic">{"\u0635\u062d\u0629"}</span>
        </div>
        <div className="nav-tag">EAT SMART {"\u00b7"} TRAIN SMART</div>
      </nav>

      <section className="hero">
        <div className="hero-kicker">AI food &amp; fitness coach {"\u00b7"} built in the Gulf</div>
        <h1>
          Scan any menu.<br />
          Know <span className="gold">what to order.</span>
        </h1>
        <p className="hero-sub">
          Every diet dies at a restaurant table. SE7A reads the menu, checks what you&apos;ve
          already eaten today, and tells you <strong>exactly what to order</strong> to stay on
          plan {"\u2014"} before the waiter arrives. Plus AI training programs, food photo
          tracking with honest estimates, and macro targets computed from real formulas.
        </p>
        <Waitlist />
      </section>

      <section className="moment">
        <div>
          <h2>The Thursday-dinner problem, solved.</h2>
          <p>
            Trackers tell you what you ate after the damage is done. SE7A works one step
            earlier {"\u2014"} at the moment of decision. It knows you have 740 calories and
            52g of protein left today, reads the menu in front of you, and makes the call.
            Sahtain.
          </p>
        </div>
        <div className="chat" aria-label="Example of a menu scan">
          <div className="bubble user">[ menu photo {"\u00b7"} 8:42 PM {"\u00b7"} 740 kcal remaining ]</div>
          <div className="bubble se7a">
            <div className="dish">Grilled hammour with saluna {"\u2192"} order this</div>
            <div className="why">~46g protein, fits your remaining budget with room for karak</div>
            <div className="kcal">~520{"\u2013"}640 kcal</div>
          </div>
          <div className="bubble se7a">
            <div className="dish">Dynamite shrimp {"\u2192"} skip tonight</div>
            <div className="why">fried + creamy sauce {"\u2248"} your whole remaining budget in one starter</div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <div className="num">01</div>
          <h3>Menu intelligence</h3>
          <p>
            Photograph any menu. SE7A ranks dishes by what actually fits
            what you have left for today {"\u2014"} so you order once, right,
            without doing the math at the table.
          </p>
        </div>
        <div className="feature">
          <div className="num">02</div>
          <h3>Honest food scanning</h3>
          <p>
            Snap your plate, get calories and macros as ranges with a confidence rating. No
            fake precision {"\u2014"} a photo can&apos;t see the oil, and we don&apos;t pretend it can.
          </p>
        </div>
        <div className="feature">
          <div className="num">03</div>
          <h3>Programs that adapt</h3>
          <p>
            AI-designed training and lifestyle plans with realistic timeframes. Weekly weigh-ins
            retune your targets automatically {"\u2014"} formula-driven, never guessed.
          </p>
        </div>
      </section>

      <footer>
        <div className="mono">SE7A {"\u00a9"} 2026 {"\u00b7"} DUBAI, UAE</div>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}
