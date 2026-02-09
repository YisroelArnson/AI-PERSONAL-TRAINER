import { useState, useEffect, useRef, useCallback } from "react";

const T = {
  bg: "#000000", surface: "#111111", text: "#FFFFFF",
  textSec: "rgba(255,255,255,0.6)", textTer: "rgba(255,255,255,0.4)",
  accent: "#FFFFFF", danger: "#FF3B30",
};
const R = { sm: 7, md: 11, lg: 15, pill: 44 };
const orbGradient = "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.9) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,150,255,0.8) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(100,180,255,0.9) 0%, rgba(30,144,255,1) 60%, rgba(0,100,200,1) 100%)";

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @keyframes orbFloat { 0%,100%{transform:scale(1);box-shadow:0 3px 12px rgba(30,144,255,0.3)} 50%{transform:scale(1.04);box-shadow:0 5px 20px rgba(30,144,255,0.45)} }
  @keyframes orbListen { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,59,48,0.3),0 3px 12px rgba(30,144,255,0.3)} 50%{transform:scale(1.06);box-shadow:0 0 0 8px rgba(255,59,48,0),0 5px 20px rgba(30,144,255,0.45)} }
  @keyframes orbBreathe { 0%,100%{transform:scale(1);box-shadow:0 0 40px rgba(30,144,255,0.3),0 0 80px rgba(30,144,255,0.15)} 50%{transform:scale(1.06);box-shadow:0 0 60px rgba(30,144,255,0.45),0 0 120px rgba(30,144,255,0.2)} }
  @keyframes orbPulseActive { 0%,100%{transform:scale(1);box-shadow:0 0 30px rgba(30,144,255,0.4)} 30%{transform:scale(1.08);box-shadow:0 0 50px rgba(30,144,255,0.6)} 60%{transform:scale(0.97);box-shadow:0 0 20px rgba(30,144,255,0.3)} }
  @keyframes orbSettle { 0%{transform:scale(1.04);box-shadow:0 0 40px rgba(30,144,255,0.4)} 100%{transform:scale(1);box-shadow:0 3px 12px rgba(30,144,255,0.3)} }
  @keyframes micPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
  @keyframes waveform { 0%,100%{height:4px} 50%{height:var(--wave-h,16px)} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes introFadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes introOrbReveal { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
  @keyframes labelFadeOut { from{opacity:1} to{opacity:0} }
  @keyframes labelFadeIn { from{opacity:0} to{opacity:1} }
  @keyframes glowShift { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
  .pills-scroll::-webkit-scrollbar { display: none; }
`;

// ─── Screen Data ─────────────────────────────────────────────

const SCREENS = [
  { id: "intro1", type: "intro",
    headline: "I'm your trainer.",
    body: null,
    orbSize: 120,
  },
  { id: "intro2", type: "intro",
    headline: "I'll learn everything about you.",
    body: "Your body, your goals, your schedule, what you love, what hurts. Then I'll build a program that's actually yours.",
  },
  { id: "intro3", type: "intro",
    headline: "I adapt as we go.",
    body: "Tell me what's working and what's not. No rigid plans that ignore real life.",
  },
  { id: "intro4", type: "intro",
    headline: "Let's start.",
    body: "I'll ask some questions — just talk or type. The more I know, the better your program.",
    cta: "Begin",
  },
  {
    id: "name", type: "textInput", label: "ABOUT YOU",
    question: "What should I call you?", placeholder: "Your first name", field: "name",
  },
  {
    id: "age", type: "stepper", label: "ABOUT YOU",
    question: "How old are you?", field: "age",
    min: 13, max: 99, initial: 28, unit: "years old",
  },
  {
    id: "gender", type: "simpleSelect", label: "ABOUT YOU",
    question: "What's your biological sex?",
    sub: "This helps me tailor recovery, volume, and baseline expectations.",
    field: "gender", options: ["Male", "Female"],
  },
  {
    id: "goals", type: "guidedVoice", label: "YOUR GOALS",
    question: "Tell me about your goals.",
    prompts: [
      "What's your main goal right now?",
      "What's motivating you to start?",
      "Any secondary goals beyond the main one?",
    ],
    field: "goals",
    pills: ["Lose fat", "Build muscle", "Get stronger", "Improve endurance", "General health"],
  },
  {
    id: "timeline", type: "voice", label: "YOUR GOALS",
    question: "Do you have a timeline in mind?",
    sub: "A wedding, a vacation, a sport season — or are you in no rush? This helps me set realistic milestones.",
    field: "timeline",
    pills: ["No deadline", "3 months", "6 months", "1 year"],
  },
  {
    id: "experienceLevel", type: "voice", label: "TRAINING HISTORY",
    question: "How would you describe your experience?",
    sub: "Have you trained before? How long? What kind of training?",
    field: "experienceLevel",
    pills: ["Complete beginner", "Some experience", "Intermediate", "Advanced"],
  },
  {
    id: "frequency", type: "voice", label: "TRAINING HISTORY",
    question: "How many days a week can you train?",
    sub: "How many days, which days work best, and how much time do you have per session?",
    field: "frequency",
  },
  {
    id: "currentRoutine", type: "voice", label: "TRAINING HISTORY",
    question: "Tell me about your current routine.",
    sub: "What does a typical week of exercise look like for you?",
    field: "currentRoutine",
  },
  {
    id: "pastAttempts", type: "voice", label: "TRAINING HISTORY",
    question: "Have you tried a program before that didn't stick?",
    sub: "What happened? Too time-consuming, got bored, got hurt? Knowing what hasn't worked helps me build something that will.",
    field: "pastAttempts",
    pills: ["This is my first time"],
  },
  {
    id: "hobbySports", type: "voice", label: "TRAINING HISTORY",
    question: "Do you play any sports or have active hobbies?",
    sub: "Recreational leagues, hiking, martial arts, cycling — anything physical I should program around.",
    field: "hobbySports",
    pills: ["None right now"],
  },
  {
    id: "height", type: "stepper", label: "BODY METRICS",
    question: "How tall are you?", field: "height",
    min: 48, max: 96, initial: 68, unit: "inches",
    displayFn: (v) => `${Math.floor(v / 12)}'${v % 12}"`,
  },
  {
    id: "weight", type: "stepper", label: "BODY METRICS",
    question: "What's your current weight?", field: "weight",
    min: 80, max: 400, initial: 170, unit: "lbs",
  },
  {
    id: "bodyComp", type: "voice", label: "BODY METRICS",
    question: "Do you know your body composition?",
    sub: "Body fat percentage, DEXA scan results, or just a general sense — are you carrying extra fat, feeling lean, somewhere in between?",
    field: "bodyComp",
    pills: ["Not sure"],
  },
  {
    id: "physicalBaseline", type: "guidedVoice", label: "FITNESS BASELINE",
    question: "Let's get a quick snapshot of where you are.",
    prompts: [
      "Can you do a full squat? Roughly how many?",
      "How about push-ups? How many can you do?",
      "Can you touch your toes?",
      "Any movements that cause pain or discomfort?",
    ],
    field: "physicalBaseline",
  },
  {
    id: "mobility", type: "voice", label: "FITNESS BASELINE",
    question: "How's your flexibility and mobility?",
    sub: "Any joints that feel stiff or restricted? Areas where your range of motion is limited? This is the foundation everything else is built on.",
    field: "mobility",
    pills: ["Pretty flexible", "Average", "Very stiff"],
  },
  {
    id: "injuries", type: "voice", label: "HEALTH",
    question: "Any injuries or conditions I should know about?",
    sub: "Past surgeries, chronic pain, joint issues — anything that affects how you move.",
    field: "injuries", pills: ["None — I'm good"],
  },
  {
    id: "healthNuances", type: "voice", label: "HEALTH",
    question: "Any other health things I should know?",
    sub: "Digestive issues, food allergies, asthma, medications you're on — anything that could affect how you train or eat.",
    field: "healthNuances",
    pills: ["Nothing comes to mind"],
  },
  {
    id: "supplements", type: "voice", label: "HEALTH",
    question: "Are you taking any supplements or vitamins?",
    sub: "Protein powder, creatine, multivitamins, pre-workout — whatever you're currently using.",
    field: "supplements",
    pills: ["None right now"],
  },
  {
    id: "activityLevel", type: "voice", label: "LIFESTYLE",
    question: "How active are you outside of training?",
    sub: "Think about your daily life — desk job, on your feet, physical labor?",
    field: "activityLevel",
    pills: ["Sedentary", "Lightly active", "Active", "Very active"],
  },
  {
    id: "sleep", type: "voice", label: "LIFESTYLE",
    question: "How's your sleep?", sub: "Recovery starts with rest.",
    field: "sleep", pills: ["Poor", "Fair", "Good", "Great"],
  },
  {
    id: "nutrition", type: "voice", label: "LIFESTYLE",
    question: "Tell me about how you eat.",
    sub: "Are you tracking calories? Any dietary restrictions? How many meals a day? I'm not judging — I just need to know what we're working with.",
    field: "nutrition",
  },
  {
    id: "environment", type: "voice", label: "EQUIPMENT",
    question: "Describe your training space.",
    sub: "Where do you train? What equipment do you have? How much room do you have to work with?",
    field: "environment",
  },
  {
    id: "movementPrefs", type: "voice", label: "PREFERENCES",
    question: "What kind of movement do you actually enjoy?",
    sub: "Lifting, running, yoga, swimming, group classes, being outdoors — I want to build something you'll look forward to, not dread.",
    field: "movementPrefs",
  },
  {
    id: "coachingStyle", type: "voice", label: "PREFERENCES",
    question: "How do you like to be coached?",
    sub: "Everyone responds differently — what works for you?",
    field: "coachingStyle",
    pills: ["Tough love", "Balanced", "Encouraging", "Just tell me what to do"],
  },
  {
    id: "anythingElse", type: "voice", label: "ALMOST DONE",
    question: "Anything else I should know?",
    sub: "Work schedule, stress levels, things on your mind — anything that helps me build the right program.",
    field: "anythingElse",
  },
  { id: "complete", type: "complete", field: "_complete" },
];

// ─── Section Map ─────────────────────────────────────────────

const SECTIONS = (() => {
  const s = []; let c = null;
  SCREENS.forEach((sc, i) => {
    if (!sc.label) return;
    if (!c || c.label !== sc.label) { c = { label: sc.label, startIndex: i, count: 0 }; s.push(c); }
    c.count++;
  });
  return s;
})();

// ─── Shared Components ───────────────────────────────────────

function Orb({ size = 44, recording = false }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: orbGradient, boxShadow: "0 3px 12px rgba(30,144,255,0.3)", flexShrink: 0, animation: recording ? "orbListen 1.5s ease-in-out infinite" : "orbFloat 4s ease-in-out infinite" }} />;
}

function SegmentedProgress({ currentStep }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {SECTIONS.map(sec => {
        const end = sec.startIndex + sec.count, into = currentStep - sec.startIndex;
        let pct = currentStep >= end ? 100 : into > 0 ? (into / sec.count) * 100 : 0;
        return (
          <div key={sec.label} style={{ flex: sec.count, height: 3, background: T.surface, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.text, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
          </div>
        );
      })}
    </div>
  );
}

function TopBar({ onBack, showBack, label, prevLabel }) {
  const [fk, setFk] = useState(0);
  const pr = useRef(label);
  const ch = prevLabel !== null && prevLabel !== label;
  useEffect(() => { if (pr.current !== label) { setFk(k => k + 1); pr.current = label; } }, [label]);
  const ls = { fontSize: 12, fontWeight: 500, color: T.textTer, textTransform: "uppercase", letterSpacing: "0.05em", position: "absolute", whiteSpace: "nowrap", left: "50%", transform: "translateX(-50%)" };
  return (
    <div style={{ height: 44, padding: "0 20px", display: "flex", alignItems: "center" }}>
      <div onClick={showBack ? onBack : undefined} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: showBack ? "pointer" : "default", opacity: showBack ? 1 : 0, transition: "opacity 0.2s" }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.textSec} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </div>
      <div style={{ position: "relative", height: 18, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ch && <span key={`o${fk}`} style={{ ...ls, animation: "labelFadeOut 0.25s ease forwards" }}>{prevLabel}</span>}
        <span key={`i${fk}`} style={{ ...ls, animation: ch ? "labelFadeIn 0.25s ease 0.15s forwards" : "none", opacity: ch ? 0 : 1 }}>{label || ""}</span>
      </div>
      <div style={{ width: 36 }} />
    </div>
  );
}

function Waveform({ active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 24 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{ width: 3, borderRadius: 2, background: active ? T.danger : T.textTer, "--wave-h": `${6 + Math.random() * 14}px`, animation: active ? `waveform ${0.4 + Math.random() * 0.4}s ease-in-out ${i * 0.03}s infinite` : "none", height: active ? undefined : 4, ...(!active && { height: 4 }) }} />
      ))}
    </div>
  );
}

function ChevronButton({ enabled, onClick }) {
  return (
    <button onClick={enabled ? onClick : undefined} style={{ width: 88, height: 52, borderRadius: 26, background: enabled ? T.accent : T.surface, border: "none", cursor: enabled ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={enabled ? T.bg : T.textTer} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  );
}

function PillsRow({ pills, selected, onSelect, multi = false }) {
  if (!pills) return null;
  const selSet = multi ? new Set(Array.isArray(selected) ? selected : []) : null;
  return (
    <div style={{ padding: "0 0 12px", overflow: "hidden" }}>
      <div className="pills-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {pills.map(pill => {
          const sel = multi ? selSet.has(pill) : selected === pill;
          return <button key={pill} onClick={() => onSelect(pill)} style={{ padding: "9px 16px", background: sel ? T.accent : T.surface, color: sel ? T.bg : T.textSec, borderRadius: R.pill, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>{pill}</button>;
        })}
      </div>
    </div>
  );
}

function VoiceBottomBar({ recording, hasAnswer, onMic, onNext }) {
  return (
    <div style={{ padding: "12px 20px 32px", display: "flex", alignItems: "center", gap: 10 }}>
      {/* Mic — circle when idle, expands to pill with waveform when recording */}
      <button onClick={onMic} style={{
        height: 52, borderRadius: 26,
        width: recording ? "100%" : 52,
        maxWidth: recording ? 200 : 52,
        background: recording ? "rgba(255,59,48,0.1)" : T.surface,
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: recording ? "flex-start" : "center",
        gap: 10, padding: recording ? "0 16px" : 0,
        flexShrink: recording ? 1 : 0,
        animation: recording ? "micPulse 1.5s ease-in-out infinite" : "none",
        transition: "width 0.3s ease, max-width 0.3s ease, background 0.2s ease, padding 0.3s ease, border-radius 0.3s ease",
      }}>
        {recording ? (
          <>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: T.danger, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Waveform active />
            </div>
          </>
        ) : (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
      {!recording && <div style={{ flex: 1 }} />}
      {!recording && <ChevronButton enabled={hasAnswer} onClick={onNext} />}
    </div>
  );
}

function SimpleBottomBar({ enabled, onNext }) {
  return (
    <div style={{ padding: "12px 20px 32px", display: "flex", justifyContent: "flex-end" }}>
      <ChevronButton enabled={enabled} onClick={onNext} />
    </div>
  );
}

// ─── Screen: Intro (unique layout per screen) ───────────────

function IntroScreen({ screen, onNext, step }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); const t = setTimeout(() => setReady(true), 50); return () => clearTimeout(t); }, [step]);

  const glowColors = [
    "radial-gradient(ellipse at 50% 40%, rgba(30,144,255,0.08) 0%, transparent 70%)",
    "radial-gradient(ellipse at 30% 60%, rgba(100,180,255,0.06) 0%, transparent 70%)",
    "radial-gradient(ellipse at 60% 30%, rgba(0,200,255,0.07) 0%, transparent 70%)",
    "radial-gradient(ellipse at 50% 50%, rgba(30,144,255,0.05) 0%, transparent 60%)",
  ];

  const stagger = (i, base = 400) => ({
    opacity: ready ? 1 : 0,
    transform: ready ? "translateY(0)" : "translateY(20px)",
    transition: `opacity 0.6s ease ${base + i * 150}ms, transform 0.6s ease ${base + i * 150}ms`,
  });

  // Screen 1: Large orb hero, text fades in after delay
  if (screen.id === "intro1") return (
    <div onClick={onNext} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", userSelect: "none", background: glowColors[0] }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <div style={{ opacity: ready ? 1 : 0, transform: ready ? "scale(1)" : "scale(0.7)", transition: "opacity 0.8s ease 100ms, transform 0.8s cubic-bezier(0.34,1.56,0.64,1) 100ms" }}>
          <div style={{ width: 140, height: 140, borderRadius: "50%", background: orbGradient, boxShadow: "0 0 60px rgba(30,144,255,0.35), 0 0 120px rgba(30,144,255,0.15)", animation: "orbBreathe 4s ease-in-out infinite" }} />
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: T.text, lineHeight: 1.1, letterSpacing: "-0.03em", textAlign: "center", marginTop: 48, ...stagger(0, 800) }}>
          I'm your trainer.
        </h1>
      </div>
      <div style={{ padding: "0 28px 44px", ...stagger(1, 1200) }}>
        <span style={{ fontSize: 13, color: T.textTer }}>Tap to continue</span>
      </div>
    </div>
  );

  // Screen 2: Orb small top-left, text editorial left-aligned, body lines stagger in
  if (screen.id === "intro2") {
    const bodyLines = [
      "Your body. Your goals.",
      "Your schedule. What you love.",
      "What hurts. What's failed before.",
      "Then I'll build a program that's actually yours.",
    ];
    return (
      <div onClick={onNext} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", userSelect: "none", background: glowColors[1] }}>
        <div style={{ padding: "48px 28px 0" }}>
          <div style={{ opacity: ready ? 1 : 0, transform: ready ? "scale(1)" : "scale(0.6)", transition: "opacity 0.5s ease 100ms, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 100ms" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: orbGradient, boxShadow: "0 0 20px rgba(30,144,255,0.3)", animation: "orbFloat 4s ease-in-out infinite" }} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: T.text, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 28, ...stagger(0, 300) }}>
            I'll learn everything about you.
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bodyLines.map((line, i) => (
              <p key={i} style={{ fontSize: 16, color: i === bodyLines.length - 1 ? T.text : T.textSec, lineHeight: 1.5, fontWeight: i === bodyLines.length - 1 ? 600 : 400, ...stagger(i + 1, 500) }}>
                {line}
              </p>
            ))}
          </div>
        </div>
        <div style={{ padding: "0 28px 44px", ...stagger(5, 1200) }}>
          <span style={{ fontSize: 13, color: T.textTer }}>Tap to continue</span>
        </div>
      </div>
    );
  }

  // Screen 3: Orb center, active pulsing, text centered, short and punchy
  if (screen.id === "intro3") return (
    <div onClick={onNext} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", userSelect: "none", background: glowColors[2] }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 36px" }}>
        <div style={{ opacity: ready ? 1 : 0, transform: ready ? "scale(1)" : "scale(0.8)", transition: "opacity 0.6s ease 100ms, transform 0.6s cubic-bezier(0.34,1.56,0.64,1) 100ms" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: orbGradient, boxShadow: "0 0 30px rgba(30,144,255,0.4)", animation: "orbPulseActive 2s ease-in-out infinite" }} />
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: T.text, lineHeight: 1.1, letterSpacing: "-0.03em", textAlign: "center", marginTop: 40, ...stagger(0, 400) }}>
          I adapt as we go.
        </h1>
        <p style={{ fontSize: 17, color: T.textSec, lineHeight: 1.6, textAlign: "center", marginTop: 20, ...stagger(1, 600) }}>
          Tell me what's working, what's not, and how you're feeling.
        </p>
        <p style={{ fontSize: 17, color: T.text, fontWeight: 600, lineHeight: 1.6, textAlign: "center", marginTop: 8, ...stagger(2, 800) }}>
          No rigid plans that ignore real life.
        </p>
      </div>
      <div style={{ padding: "0 28px 44px", ...stagger(3, 1100) }}>
        <span style={{ fontSize: 13, color: T.textTer }}>Tap to continue</span>
      </div>
    </div>
  );

  // Screen 4: Everything converges, orb settles, clean CTA
  return (
    <div onClick={onNext} style={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", userSelect: "none", background: glowColors[3] }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 36px" }}>
        <div style={{ opacity: ready ? 1 : 0, transition: "opacity 0.8s ease 200ms" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: orbGradient, boxShadow: "0 3px 12px rgba(30,144,255,0.3)", animation: "orbSettle 1.5s ease forwards, orbFloat 4s ease-in-out 1.5s infinite" }} />
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: T.text, lineHeight: 1.1, letterSpacing: "-0.03em", textAlign: "center", marginTop: 40, ...stagger(0, 500) }}>
          Let's start.
        </h1>
        <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.6, textAlign: "center", marginTop: 16, maxWidth: 280, ...stagger(1, 700) }}>
          I'll ask some questions — just talk or type. The more I know, the better your program.
        </p>
      </div>
      <div style={{ padding: "0 20px 40px", display: "flex", justifyContent: "center", ...stagger(2, 1000) }}>
        <button style={{ padding: "16px 56px", background: T.accent, color: T.bg, borderRadius: R.pill, fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Begin</button>
      </div>
    </div>
  );
}

// ─── Screen: Text Input ──────────────────────────────────────

function TextInputScreen({ screen, value, onChange, onNext }) {
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 300); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0 20px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1.2, letterSpacing: "-0.03em" }}>{screen.question}</h1>
        <input ref={ref} type="text" value={value || ""} onChange={e => onChange(screen.field, e.target.value)}
          onKeyDown={e => e.key === "Enter" && value && onNext()} placeholder={screen.placeholder}
          style={{ width: "100%", padding: 16, background: T.surface, borderRadius: R.md, fontSize: 18, fontWeight: 500, color: T.text, border: "none", outline: "none", fontFamily: "inherit" }} />
      </div>
      <SimpleBottomBar enabled={!!value} onNext={onNext} />
    </div>
  );
}

// ─── Screen: Stepper (no gray card) ──────────────────────────

function StepperScreen({ screen, value, onChange, onNext }) {
  const v = value ?? screen.initial;
  const d = screen.displayFn ? screen.displayFn(v) : v;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0 20px" }}>
      <div style={{ padding: "24px 0 0" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1.2, letterSpacing: "-0.03em" }}>{screen.question}</h1>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <button onClick={() => v > screen.min && onChange(screen.field, v - 1)} style={{
            width: 52, height: 52, borderRadius: "50%", background: T.surface, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", color: T.text, fontSize: 24, fontFamily: "inherit",
          }}>−</button>
          <div style={{ textAlign: "center", minWidth: 110 }}>
            <div style={{ fontSize: 56, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{d}</div>
            {!screen.displayFn && <div style={{ fontSize: 13, color: T.textTer, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{screen.unit}</div>}
          </div>
          <button onClick={() => v < screen.max && onChange(screen.field, v + 1)} style={{
            width: 52, height: 52, borderRadius: "50%", background: T.surface, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", color: T.text, fontSize: 24, fontFamily: "inherit",
          }}>+</button>
        </div>
      </div>
      <SimpleBottomBar enabled onNext={onNext} />
    </div>
  );
}

// ─── Screen: Simple Select (rectangular buttons, no mic) ─────

function SimpleSelectScreen({ screen, value, onChange, onNext }) {
  const select = (opt) => { onChange(screen.field, opt); };
  useEffect(() => { if (value) { /* auto-advance after brief pause */ } }, [value]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "24px 20px 0" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1.2, letterSpacing: "-0.03em", marginBottom: 8 }}>{screen.question}</h1>
        {screen.sub && <p style={{ fontSize: 15, color: T.textSec, lineHeight: 1.5 }}>{screen.sub}</p>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {screen.options.map(opt => (
            <button key={opt} onClick={() => select(opt)} style={{
              width: "100%", padding: "16px 20px", textAlign: "left",
              background: value === opt ? T.accent : T.surface,
              color: value === opt ? T.bg : T.text,
              borderRadius: R.lg, border: "none", fontSize: 16, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
            }}>{opt}</button>
          ))}
        </div>
      </div>
      <SimpleBottomBar enabled={!!value} onNext={onNext} />
    </div>
  );
}

// ─── Screen: Guided Voice (minimal — multiple prompts) ───────

function GuidedVoiceScreen({ screen, value, onChange, onNext }) {
  const [rec, setRec] = useState(false);
  const [text, setText] = useState(value || "");
  const ir = useRef(null);

  const mic = () => {
    if (rec) {
      setRec(false);
      if (!text) {
        const s = "My main goal is to build muscle and lose some fat. I've been feeling sluggish lately and want to feel strong again. I'd also love to improve my flexibility.";
        setText(s); onChange(screen.field, s);
      }
    } else { setText(""); setRec(true); }
  };
  const selPill = (p) => { setText(p); setRec(false); onChange(screen.field, p); };
  const handleChange = (e) => { setText(e.target.value); onChange(screen.field, e.target.value); };
  const has = !!text.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 28px 0", overflow: "auto" }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: T.text, lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: 20 }}>
            {screen.question}
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {screen.prompts.map((prompt, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.textTer, marginTop: 8, flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: T.textSec, lineHeight: 1.5 }}>{prompt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Unified textarea */}
        <textarea ref={ir} value={text} onChange={handleChange}
          placeholder="Speak or type your answer..."
          style={{ marginTop: 28, width: "100%", minHeight: 80, flex: 1, padding: 0, background: "transparent", fontSize: 18, color: T.text, border: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.6, resize: "none" }} />
      </div>

      {!has && !rec && <PillsRow pills={screen.pills} selected={null} onSelect={selPill} />}
      <VoiceBottomBar recording={rec} hasAnswer={has} onMic={mic} onNext={onNext} />
    </div>
  );
}

// ─── Screen: Voice (minimal design) ──────────────────────────

function VoiceScreen({ screen, value, onChange, onNext }) {
  const [rec, setRec] = useState(false);
  const [text, setText] = useState(value || "");
  const ir = useRef(null);

  const mic = () => {
    if (rec) { setRec(false); if (!text) { const s = "Simulated transcription — in the real app, words appear here one by one as you speak."; setText(s); onChange(screen.field, s); } }
    else { setText(""); setRec(true); }
  };
  const selPill = (p) => { setText(p); setRec(false); onChange(screen.field, p); };
  const handleChange = (e) => { setText(e.target.value); onChange(screen.field, e.target.value); };
  const has = !!text.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 28px 0", overflow: "auto" }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: T.text, lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: 12 }}>
            {screen.question}
          </h1>
          {screen.sub && (
            <p style={{ fontSize: 15, color: T.textSec, lineHeight: 1.6 }}>{screen.sub}</p>
          )}
        </div>

        {/* Unified textarea */}
        <textarea ref={ir} value={text} onChange={handleChange}
          placeholder="Speak or type your answer..."
          style={{ marginTop: 28, width: "100%", minHeight: 80, flex: 1, padding: 0, background: "transparent", fontSize: 18, color: T.text, border: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.6, resize: "none" }} />
      </div>

      {!has && !rec && <PillsRow pills={screen.pills} selected={null} onSelect={selPill} />}
      <VoiceBottomBar recording={rec} hasAnswer={has} onMic={mic} onNext={onNext} />
    </div>
  );
}

// ─── Screen: Complete ────────────────────────────────────────

function CompleteScreen({ data, onReset }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
      <div />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, padding: "0 20px" }}>
        <Orb size={100} />
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1.2, letterSpacing: "-0.03em", marginBottom: 16 }}>Got it, {data.name || "there"}.</h1>
          <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.5 }}>I have everything I need to start building your program. Let's get to work.</p>
        </div>
      </div>
      <div style={{ padding: "0 20px 40px", display: "flex", flexDirection: "column" }}>
        <button onClick={() => alert("→ Proceed to signup / assessment")} style={{ width: "100%", padding: "16px 24px", background: T.accent, color: T.bg, borderRadius: R.pill, fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Create my program</button>
        <button onClick={onReset} style={{ width: "100%", padding: "14px 24px", background: "transparent", color: T.textSec, borderRadius: R.pill, fontSize: 15, fontWeight: 500, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Start over (demo)</button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────

export default function OnboardingComplete() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const [animKey, setAnimKey] = useState(0);
  const [prevLabel, setPrevLabel] = useState(null);
  const screen = SCREENS[step];

  const handleChange = useCallback((field, value) => { setData(d => ({ ...d, [field]: value })); }, []);

  const goNext = useCallback(() => {
    const n = step + 1;
    if (n >= SCREENS.length) return;
    const cl = SCREENS[step].label, nl = SCREENS[n].label;
    if (cl && nl && cl !== nl) { setPrevLabel(cl); setTimeout(() => setPrevLabel(null), 500); }
    setStep(n); setAnimKey(k => k + 1);
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      const cl = SCREENS[step].label, pl = SCREENS[step - 1].label;
      if (cl && pl && cl !== pl) { setPrevLabel(cl); setTimeout(() => setPrevLabel(null), 500); }
      setStep(step - 1); setAnimKey(k => k + 1);
    }
  }, [step]);

  const reset = useCallback(() => { setStep(0); setData({}); setAnimKey(k => k + 1); setPrevLabel(null); }, []);

  const render = () => {
    const p = { screen, value: data[screen.field], onChange: handleChange, onNext: goNext };
    switch (screen.type) {
      case "intro": return <IntroScreen screen={screen} onNext={goNext} step={step} />;
      case "textInput": return <TextInputScreen {...p} />;
      case "stepper": return <StepperScreen {...p} />;
      case "simpleSelect": return <SimpleSelectScreen {...p} />;
      case "guidedVoice": return <GuidedVoiceScreen {...p} />;
      case "voice": return <VoiceScreen {...p} />;
      case "complete": return <CompleteScreen data={data} onReset={reset} />;
      default: return null;
    }
  };

  return (
    <div style={{
      width: "100%", maxWidth: 393, height: "100vh", maxHeight: 852,
      margin: "0 auto", background: T.bg,
      fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif",
      color: T.text, display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
      borderRadius: window.innerWidth > 500 ? 24 : 0,
      boxShadow: window.innerWidth > 500 ? "0 0 0 1px rgba(255,255,255,0.06)" : "none",
    }}>
      <style>{css}</style>
      {screen.type !== "intro" && (
        <div style={{ paddingTop: 4 }}>
          <TopBar onBack={goBack} showBack={step > 1} label={screen.label} prevLabel={prevLabel} />
          <div style={{ padding: "0 20px 8px" }}><SegmentedProgress currentStep={step} /></div>
        </div>
      )}
      <div key={animKey} style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {render()}
      </div>
    </div>
  );
}