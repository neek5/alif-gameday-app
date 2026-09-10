import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WarmupSet = { weight: string; reps: string; done: boolean };

type LiftData = {
  peakingNumber: string;
  pr: string;
  nr: string;
  ar: string;
  wr: string;
  warmups: WarmupSet[];
  gaps: number[]; // minutes between warmup[i] and warmup[i+1], length = warmups.length - 1
  startTime: string; // "HH:MM" 24h — anchor for first warmup
  attempt1: string;
  attempt2: string;
  attempt3: string;
};

type Athlete = {
  id: string;
  name: string;
  weightClass: string;
  squatRackHeight: string;
  benchRackHeight: string;
  squat: LiftData;
  bench: LiftData;
  deadlift: LiftData;
};

type Lift = "squat" | "bench" | "deadlift";
type Page =
  | { type: "list" }
  | { type: "detail"; athleteId: string }
  | { type: "warmup"; athleteId: string; lift: Lift }
  | { type: "setup"; athleteId: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "plift_athletes";

function loadAthletes(): Athlete[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Athlete[];
    // migrate: ensure gaps field exists
    return raw.map((a) => ({
      ...a,
      squat: migrateLift(a.squat),
      bench: migrateLift(a.bench),
      deadlift: migrateLift(a.deadlift),
    }));
  } catch {
    return [];
  }
}

function migrateLift(ld: LiftData): LiftData {
  if (!ld) return emptyLift();
  const warmups = ld.warmups ?? [];
  const gaps =
    ld.gaps && ld.gaps.length === warmups.length - 1
      ? ld.gaps
      : Array.from({ length: Math.max(0, warmups.length - 1) }, (_, i) =>
          i === 0 ? 2 : i === 1 ? 5 : 3
        );
  return { ...ld, warmups, gaps };
}

function saveAthletes(athletes: Athlete[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(athletes));
}

function emptyLift(): LiftData {
  return {
    peakingNumber: "",
    pr: "",
    nr: "",
    ar: "",
    wr: "",
    warmups: [
      { weight: "", reps: "", done: false },
      { weight: "", reps: "", done: false },
      { weight: "", reps: "", done: false },
      { weight: "", reps: "", done: false },
    ],
    gaps: [2, 5, 3],
    startTime: "",
    attempt1: "",
    attempt2: "",
    attempt3: "",
  };
}

function emptyAthlete(): Athlete {
  return {
    id: crypto.randomUUID(),
    name: "",
    weightClass: "",
    squatRackHeight: "",
    benchRackHeight: "",
    squat: emptyLift(),
    bench: emptyLift(),
    deadlift: emptyLift(),
  };
}

// Compute scheduled display time for warmup at index given start time "HH:MM" and gaps array
function warmupTime(startTime: string, gapsBefore: number[]): string {
  if (!startTime) return "--:--";
  const [hStr, mStr] = startTime.split(":");
  let total = parseInt(hStr) * 60 + parseInt(mStr);
  for (const g of gapsBefore) total += g;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

function nowTimeString(): string {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

function nowHHMM(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

function parseWeight(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function computeTotal(a: Athlete): string {
  const s = parseWeight(a.squat.peakingNumber);
  const b = parseWeight(a.bench.peakingNumber);
  const d = parseWeight(a.deadlift.peakingNumber);
  if (s === 0 && b === 0 && d === 0) return "—";
  return (s + b + d).toString();
}

const LIFT_LABELS: Record<Lift, string> = {
  squat: "Squat",
  bench: "Bench Press",
  deadlift: "Deadlift",
};

// ─── Shared Input ─────────────────────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em" }}
        className="text-[#666] uppercase"
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2.5 text-[#f0ede8] text-sm outline-none focus:border-[#c9b0db] transition-colors"
        style={{ fontFamily: "var(--font-body)" }}
      />
    </div>
  );
}

// ─── Athletes List ─────────────────────────────────────────────────────────────

function AthletesList({
  athletes,
  onSelect,
  onAdd,
}: {
  athletes: Athlete[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#080808]">
      <div className="px-5 pt-14 pb-6">
        <p
          className="text-[#c9b0db] text-xs tracking-[0.2em] uppercase mb-1"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Competition Day
        </p>
        <h1
          className="text-[#f0ede8] leading-none"
          style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 900 }}
        >
          ATHLETES
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-3">
        {athletes.length === 0 && (
          <p
            className="text-[#444] text-sm text-center mt-16"
            style={{ fontFamily: "var(--font-body)" }}
          >
            No athletes yet. Tap + to add one.
          </p>
        )}
        {athletes.map((a) => {
          const total = computeTotal(a);
          return (
            <div
              key={a.id}
              className="bg-[#111] border border-[rgba(255,255,255,0.07)] rounded-2xl overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => onSelect(a.id)}
            >
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[#f0ede8] leading-none truncate"
                    style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}
                  >
                    {a.name || "Unnamed"}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {a.weightClass && (
                      <span className="text-[#c9b0db] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                        {a.weightClass}kg
                      </span>
                    )}
                    {total !== "—" && (
                      <span className="text-[#555] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                        Total: {total}
                      </span>
                    )}
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#333] shrink-0">
                  <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          );
        })}
        <div className="h-24" />
      </div>

      <div className="absolute bottom-8 right-5">
        <button
          onClick={onAdd}
          className="w-14 h-14 rounded-full bg-[#c9b0db] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#080808" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Athlete Detail ────────────────────────────────────────────────────────────

function AthleteDetail({
  athlete,
  onBack,
  onSetup,
  onLift,
}: {
  athlete: Athlete;
  onBack: () => void;
  onSetup: () => void;
  onLift: (lift: Lift) => void;
}) {
  const total = computeTotal(athlete);
  const s = parseWeight(athlete.squat.peakingNumber);
  const b = parseWeight(athlete.bench.peakingNumber);
  const d = parseWeight(athlete.deadlift.peakingNumber);

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      <div className="px-5 pt-14 pb-2 flex items-start justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[#c9b0db] active:opacity-60 mt-1">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4l-6 6 6 6" stroke="#c9b0db" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>Back</span>
        </button>
        <button
          onClick={onSetup}
          className="text-[#555] active:text-[#c9b0db] transition-colors"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em" }}
        >
          EDIT
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-3 pb-6 border-b border-[rgba(255,255,255,0.06)]">
          <h1
            className="text-[#f0ede8] leading-none"
            style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900 }}
          >
            {athlete.name || "Unnamed"}
          </h1>
          {athlete.weightClass && (
            <p className="text-[#c9b0db] mt-1" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              {athlete.weightClass} KG CLASS
            </p>
          )}
        </div>

        {/* Info */}
        <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Info</p>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Weight Class" value={athlete.weightClass ? `${athlete.weightClass} kg` : "—"} />
            <InfoRow label="Squat Rack Ht." value={athlete.squatRackHeight || "—"} />
            <InfoRow label="Bench Rack Ht." value={athlete.benchRackHeight || "—"} />
          </div>
        </div>

        {/* Peaking Numbers */}
        <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Peaking Numbers</p>
          <div className="flex gap-2">
            {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
              <div key={lift} className="flex-1 text-center">
                <p className="text-[#444] text-[10px] tracking-widest uppercase mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {lift[0].toUpperCase()}
                </p>
                <p className="text-[#f0ede8] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800 }}>
                  {athlete[lift].peakingNumber || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* PRs */}
        <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Personal Records</p>
          <div className="flex gap-2">
            {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
              <div key={lift} className="flex-1 text-center">
                <p className="text-[#444] text-[10px] tracking-widest uppercase mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {lift[0].toUpperCase()}
                </p>
                <p className="text-[#f0ede8] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800 }}>
                  {athlete[lift].pr || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Records */}
        {(["squat", "bench", "deadlift"] as Lift[]).some((l) => athlete[l].nr || athlete[l].ar || athlete[l].wr) && (
          <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
            <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Records</p>
            <div className="flex flex-col gap-2">
              {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => {
                const ld = athlete[lift];
                const records = [ld.nr && `NR ${ld.nr}`, ld.ar && `AR ${ld.ar}`, ld.wr && `WR ${ld.wr}`].filter(Boolean).join(" / ");
                if (!records) return null;
                return (
                  <div key={lift} className="flex items-center gap-3">
                    <span className="text-[#444] text-[10px] tracking-widest uppercase w-4" style={{ fontFamily: "var(--font-mono)" }}>
                      {lift[0].toUpperCase()}
                    </span>
                    <span className="text-[#c9b0db] text-sm" style={{ fontFamily: "var(--font-mono)" }}>{records}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lift rows */}
        <div className="flex flex-col divide-y divide-[rgba(255,255,255,0.06)]">
          {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
            <button
              key={lift}
              onClick={() => onLift(lift)}
              className="flex items-center justify-between px-5 py-5 w-full text-left active:bg-[#111] transition-colors"
            >
              <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, color: "#f0ede8" }}>
                {LIFT_LABELS[lift]}
              </span>
              <div className="flex items-center gap-3">
                {athlete[lift].peakingNumber && (
                  <span className="text-[#555]" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                    {athlete[lift].peakingNumber} kg
                  </span>
                )}
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4l6 6-6 6" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Total */}
        <div className="px-5 py-6 border-t border-[rgba(255,255,255,0.08)]">
          <div className="bg-[#111] rounded-2xl px-5 py-5">
            <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>
              Current Total
            </p>
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-3 text-[#666]" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                <span>{s > 0 ? s : "—"}</span>
                <span className="text-[#333]">+</span>
                <span>{b > 0 ? b : "—"}</span>
                <span className="text-[#333]">+</span>
                <span>{d > 0 ? d : "—"}</span>
              </div>
              <span className="text-[#c9b0db] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900 }}>
                {total}
              </span>
            </div>
          </div>
        </div>
        <div className="h-8" />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#111] rounded-xl px-4 py-3">
      <p className="text-[#444] text-[10px] tracking-[0.14em] uppercase mb-0.5" style={{ fontFamily: "var(--font-mono)" }}>{label}</p>
      <p className="text-[#f0ede8] text-base font-medium" style={{ fontFamily: "var(--font-body)" }}>{value}</p>
    </div>
  );
}

// ─── Warmup Page (fully inline-editable) ──────────────────────────────────────

function WarmupPage({
  athlete,
  lift,
  onBack,
  onUpdate,
}: {
  athlete: Athlete;
  lift: Lift;
  onBack: () => void;
  onUpdate: (updated: Athlete) => void;
}) {
  const [now, setNow] = useState(nowTimeString());
  // Editing state
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState("");
  const [editingGap, setEditingGap] = useState<number | null>(null);
  const [gapDraft, setGapDraft] = useState("");
  const [editingWarmup, setEditingWarmup] = useState<number | null>(null);
  const [warmupDraft, setWarmupDraft] = useState({ weight: "", reps: "" });

  const anchorRef = useRef<HTMLInputElement>(null);
  const gapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(nowTimeString()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (editingAnchor) anchorRef.current?.focus();
  }, [editingAnchor]);

  useEffect(() => {
    if (editingGap !== null) gapRef.current?.select();
  }, [editingGap]);

  const ld = athlete[lift];

  function patch(partial: Partial<LiftData>) {
    onUpdate({ ...athlete, [lift]: { ...ld, ...partial } });
  }

  function toggleDone(idx: number) {
    const warmups = ld.warmups.map((w, i) => (i === idx ? { ...w, done: !w.done } : w));
    patch({ warmups });
  }

  function commitAnchor() {
    patch({ startTime: anchorDraft });
    setEditingAnchor(false);
  }

  function commitGap() {
    if (editingGap === null) return;
    const val = parseInt(gapDraft);
    if (!isNaN(val) && val > 0) {
      const gaps = [...ld.gaps];
      gaps[editingGap] = val;
      patch({ gaps });
    }
    setEditingGap(null);
  }

  function commitWarmup() {
    if (editingWarmup === null) return;
    const warmups = ld.warmups.map((w, i) =>
      i === editingWarmup ? { ...w, weight: warmupDraft.weight, reps: warmupDraft.reps } : w
    );
    patch({ warmups });
    setEditingWarmup(null);
  }

  function addWarmup() {
    const warmups = [...ld.warmups, { weight: "", reps: "", done: false }];
    const gaps = [...ld.gaps, 3];
    patch({ warmups, gaps });
    // Auto-open edit for the new set
    setEditingWarmup(warmups.length - 1);
    setWarmupDraft({ weight: "", reps: "" });
  }

  function removeWarmup(idx: number) {
    const warmups = ld.warmups.filter((_, i) => i !== idx);
    const gaps = ld.gaps.filter((_, i) => i !== idx && i !== idx - 1)
      .concat(idx > 0 && idx < ld.warmups.length - 1 ? [Math.round((ld.gaps[idx - 1] + ld.gaps[idx]) / 2)] : []);
    // simpler: just drop the last gap
    const newGaps = ld.gaps.slice(0, warmups.length - 1);
    patch({ warmups, gaps: newGaps });
    if (editingWarmup === idx) setEditingWarmup(null);
  }

  // Compute scheduled times
  function getTime(idx: number): string {
    const gapsBefore = ld.gaps.slice(0, idx);
    return warmupTime(ld.startTime, gapsBefore);
  }

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-[#c9b0db] mb-4 active:opacity-60">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4l-6 6 6 6" stroke="#c9b0db" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{athlete.name}</span>
        </button>
        <div className="flex items-end justify-between">
          <h2 className="text-[#f0ede8] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 900 }}>
            {LIFT_LABELS[lift].toUpperCase()}
          </h2>
          <span className="text-[#c9b0db] pb-1" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {now}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {/* PR */}
        <div className="flex items-center justify-between bg-[#111] rounded-2xl px-5 py-4 mb-5">
          <span className="text-[#555] text-sm tracking-[0.15em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>PR</span>
          <span className="text-[#f0ede8]" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800 }}>
            {ld.pr || "—"}
          </span>
        </div>

        {/* Warmups label */}
        <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>
          Warmups
        </p>

        {/* Warmup rows */}
        <div className="flex flex-col">
          {ld.warmups.map((w, idx) => {
            const isEditingThis = editingWarmup === idx;
            const timeStr = getTime(idx);
            const isAnchor = idx === 0;

            return (
              <div key={idx}>
                {/* Warmup row */}
                <div className="flex items-center gap-2.5 py-1">
                  {/* Checkbox */}
                  <button
                    onClick={() => { if (!isEditingThis) toggleDone(idx); }}
                    className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                      w.done ? "bg-[#c9b0db] border-[#c9b0db]" : "border-[#333] bg-transparent"
                    }`}
                  >
                    {w.done && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l4 4 6-6" stroke="#080808" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {/* Weight×Reps — tap to edit */}
                  {isEditingThis ? (
                    <div
                      className="flex-1 flex gap-1.5 items-center"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          commitWarmup();
                        }
                      }}
                    >
                      <input
                        autoFocus
                        value={warmupDraft.weight}
                        onChange={(e) => setWarmupDraft((d) => ({ ...d, weight: e.target.value }))}
                        placeholder="kg"
                        inputMode="decimal"
                        className="flex-1 bg-[#222] border border-[#c9b0db] rounded-xl px-3 py-2.5 text-[#f0ede8] text-lg outline-none text-center"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                        onKeyDown={(e) => e.key === "Enter" && commitWarmup()}
                      />
                      <span className="text-[#444]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>×</span>
                      <input
                        value={warmupDraft.reps}
                        onChange={(e) => setWarmupDraft((d) => ({ ...d, reps: e.target.value }))}
                        placeholder="reps"
                        inputMode="numeric"
                        className="flex-1 bg-[#222] border border-[#c9b0db] rounded-xl px-3 py-2.5 text-[#f0ede8] text-lg outline-none text-center"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                        onKeyDown={(e) => e.key === "Enter" && commitWarmup()}
                      />
                    </div>
                  ) : (
                    <button
                      className={`flex-1 rounded-xl px-4 py-3 text-left border transition-colors active:border-[#c9b0db] ${
                        w.done ? "bg-[#111] border-[rgba(255,255,255,0.04)]" : "bg-[#111] border-[rgba(255,255,255,0.06)]"
                      }`}
                      onClick={() => {
                        setEditingWarmup(idx);
                        setWarmupDraft({ weight: w.weight, reps: w.reps });
                      }}
                    >
                      <span
                        className={w.done ? "text-[#444] line-through" : "text-[#f0ede8]"}
                        style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}
                      >
                        {w.weight || "—"}×{w.reps || "—"}
                      </span>
                    </button>
                  )}

                  {/* Time pill — anchor is editable, rest are auto */}
                  {isAnchor && editingAnchor ? (
                    <input
                      ref={anchorRef}
                      type="time"
                      value={anchorDraft}
                      onChange={(e) => setAnchorDraft(e.target.value)}
                      onBlur={commitAnchor}
                      onKeyDown={(e) => e.key === "Enter" && commitAnchor()}
                      className="bg-[#cc2200] rounded-xl px-2 py-3 text-white text-sm outline-none border border-[#ff5533] w-[90px] text-center"
                      style={{ fontFamily: "var(--font-mono)" }}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        if (isAnchor) {
                          setAnchorDraft(ld.startTime || nowHHMM());
                          setEditingAnchor(true);
                        }
                      }}
                      className={`rounded-xl px-3 py-3 min-w-[82px] text-center transition-opacity ${
                        w.done ? "bg-[#1a1a1a]" : "bg-[#cc2200]"
                      } ${isAnchor ? "active:opacity-70" : "cursor-default"}`}
                    >
                      <span
                        className={w.done ? "text-[#444]" : "text-white"}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500 }}
                      >
                        {timeStr}
                      </span>
                    </button>
                  )}

                  {/* Delete row */}
                  <button
                    onClick={() => removeWarmup(idx)}
                    className="text-[#2a2a2a] active:text-[#ff4040] transition-colors shrink-0 w-6 flex justify-center"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Gap badge between warmups */}
                {idx < ld.warmups.length - 1 && (
                  <div className="flex items-center gap-2.5 py-0.5">
                    <div className="w-8" />
                    <div className="flex items-center gap-1.5 flex-1">
                      {editingGap === idx ? (
                        <input
                          ref={gapRef}
                          type="number"
                          min={1}
                          max={60}
                          value={gapDraft}
                          onChange={(e) => setGapDraft(e.target.value)}
                          onBlur={commitGap}
                          onKeyDown={(e) => e.key === "Enter" && commitGap()}
                          className="w-10 bg-[#1a3300] border border-[#c9b0db] rounded-md text-[#c9b0db] text-xs text-center outline-none py-1"
                          style={{ fontFamily: "var(--font-mono)" }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingGap(idx);
                            setGapDraft(String(ld.gaps[idx] ?? 3));
                          }}
                          className="w-7 h-7 rounded-md bg-[#1a3300] text-[#c9b0db] flex items-center justify-center text-xs font-bold active:bg-[#2a4400] transition-colors"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {ld.gaps[idx] ?? 3}
                        </button>
                      )}
                      <div className="flex-1 h-px bg-[rgba(255,255,255,0.04)]" />
                      <span className="text-[#2a2a2a] text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>min</span>
                    </div>
                    <div className="w-6" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Add warmup */}
          <button
            onClick={addWarmup}
            className="flex items-center gap-2.5 py-3 w-full active:opacity-60 transition-opacity mt-1"
          >
            <div className="w-8 h-8 rounded-lg border border-dashed border-[#333] flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[#444] text-sm" style={{ fontFamily: "var(--font-body)" }}>Add warmup set</span>
          </button>
        </div>

        {/* Attempts */}
        <div className="mt-5 mb-2">
          <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            Attempts
          </p>
          <div className="flex flex-col gap-2">
            {[
              { label: "Attempt 1", value: ld.attempt1 },
              { label: "Attempt 2", value: ld.attempt2 },
              { label: "Attempt 3", value: ld.attempt3 },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-[#0d2200] border border-[rgba(201,176,219,0.15)] rounded-2xl px-5 py-3 flex items-center justify-between"
              >
                <span className="text-[#6a8a40] text-xs tracking-[0.12em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>
                  {label}
                </span>
                <span className="text-[#c9b0db]" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800 }}>
                  {value || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-10" />
      </div>
    </div>
  );
}

// ─── Setup Page ───────────────────────────────────────────────────────────────

function SetupPage({
  athlete: initialAthlete,
  onSave,
  onCancel,
  onDelete,
}: {
  athlete: Athlete;
  onSave: (a: Athlete) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [a, setA] = useState<Athlete>(JSON.parse(JSON.stringify(initialAthlete)));
  const [activeTab, setActiveTab] = useState<"info" | Lift>("info");

  function setField<K extends keyof Athlete>(key: K, val: Athlete[K]) {
    setA((prev) => ({ ...prev, [key]: val }));
  }

  function setLiftField<K extends keyof LiftData>(lift: Lift, key: K, val: LiftData[K]) {
    setA((prev) => ({ ...prev, [lift]: { ...prev[lift], [key]: val } }));
  }

  function setWarmup(lift: Lift, idx: number, field: "weight" | "reps", val: string) {
    const warmups = a[lift].warmups.map((w, i) => (i === idx ? { ...w, [field]: val } : w));
    setA((prev) => ({ ...prev, [lift]: { ...prev[lift], warmups } }));
  }

  function addWarmup(lift: Lift) {
    const warmups = [...a[lift].warmups, { weight: "", reps: "", done: false }];
    const gaps = [...a[lift].gaps, 3];
    setA((prev) => ({ ...prev, [lift]: { ...prev[lift], warmups, gaps } }));
  }

  function removeWarmup(lift: Lift, idx: number) {
    const warmups = a[lift].warmups.filter((_, i) => i !== idx);
    const gaps = a[lift].gaps.slice(0, warmups.length);
    setA((prev) => ({ ...prev, [lift]: { ...prev[lift], warmups, gaps } }));
  }

  const tabs: Array<"info" | Lift> = ["info", "squat", "bench", "deadlift"];
  const tabLabels: Record<string, string> = { info: "Info", squat: "Squat", bench: "Bench", deadlift: "Dead" };

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      <div className="px-5 pt-14 pb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-[#555] active:text-[#f0ede8] transition-colors" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Cancel
        </button>
        <h2 className="text-[#f0ede8]" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800 }}>
          {initialAthlete.name ? initialAthlete.name.toUpperCase() : "NEW ATHLETE"}
        </h2>
        <button onClick={() => onSave(a)} className="text-[#c9b0db] active:opacity-60" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Save
        </button>
      </div>

      <div className="flex px-5 gap-2 pb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === t ? "bg-[#c9b0db] text-[#080808]" : "bg-[#1a1a1a] text-[#555]"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        {activeTab === "info" && (
          <div className="flex flex-col gap-4">
            <Input label="Name" value={a.name} onChange={(v) => setField("name", v)} placeholder="Athlete name" />
            <Input label="Weight Class (kg)" value={a.weightClass} onChange={(v) => setField("weightClass", v)} placeholder="e.g. 83" />
            <Input label="Squat Rack Height" value={a.squatRackHeight} onChange={(v) => setField("squatRackHeight", v)} placeholder="e.g. 5" />
            <Input label="Bench Rack Height" value={a.benchRackHeight} onChange={(v) => setField("benchRackHeight", v)} placeholder="e.g. 3" />
            <div className="mt-2">
              <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Danger Zone</p>
              <button
                onClick={onDelete}
                className="w-full py-3 rounded-xl border border-[rgba(255,60,60,0.3)] text-[#ff4040] text-sm active:bg-[rgba(255,60,60,0.1)] transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Delete Athlete
              </button>
            </div>
          </div>
        )}

        {(["squat", "bench", "deadlift"] as Lift[]).includes(activeTab as Lift) && activeTab !== "info" && (
          <LiftSetupForm
            lift={activeTab as Lift}
            ld={a[activeTab as Lift]}
            onChange={(key, val) => setLiftField(activeTab as Lift, key, val)}
            onWarmupChange={(idx, field, val) => setWarmup(activeTab as Lift, idx, field, val)}
            onAddWarmup={() => addWarmup(activeTab as Lift)}
            onRemoveWarmup={(idx) => removeWarmup(activeTab as Lift, idx)}
          />
        )}
      </div>
    </div>
  );
}

function LiftSetupForm({
  lift,
  ld,
  onChange,
  onWarmupChange,
  onAddWarmup,
  onRemoveWarmup,
}: {
  lift: Lift;
  ld: LiftData;
  onChange: <K extends keyof LiftData>(key: K, val: LiftData[K]) => void;
  onWarmupChange: (idx: number, field: "weight" | "reps", val: string) => void;
  onAddWarmup: () => void;
  onRemoveWarmup: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-[#555] text-xs tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>Numbers</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Peaking Number" value={ld.peakingNumber} onChange={(v) => onChange("peakingNumber", v)} placeholder="e.g. 200" />
          <Input label="PR" value={ld.pr} onChange={(v) => onChange("pr", v)} placeholder="e.g. 195" />
          <Input label="NR" value={ld.nr} onChange={(v) => onChange("nr", v)} placeholder="National record" />
          <Input label="AR" value={ld.ar} onChange={(v) => onChange("ar", v)} placeholder="Asian record" />
          <Input label="WR" value={ld.wr} onChange={(v) => onChange("wr", v)} placeholder="World record" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[#555] text-xs tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>Attempts</p>
        <Input label="Attempt 1" value={ld.attempt1} onChange={(v) => onChange("attempt1", v)} placeholder="e.g. 185" />
        <Input label="Attempt 2 (use | for options)" value={ld.attempt2} onChange={(v) => onChange("attempt2", v)} placeholder="e.g. 192.5|195|197.5" />
        <Input label="Attempt 3" value={ld.attempt3} onChange={(v) => onChange("attempt3", v)} placeholder="e.g. 200" />
      </div>

      <div>
        <p className="text-[#555] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Warmup Sets</p>
        <div className="flex flex-col gap-2">
          {ld.warmups.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[#444] w-5 text-center text-sm shrink-0" style={{ fontFamily: "var(--font-mono)" }}>{idx + 1}</span>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  value={w.weight}
                  onChange={(e) => onWarmupChange(idx, "weight", e.target.value)}
                  placeholder="Weight"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2.5 text-[#f0ede8] text-sm outline-none focus:border-[#c9b0db] transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                />
                <input
                  value={w.reps}
                  onChange={(e) => onWarmupChange(idx, "reps", e.target.value)}
                  placeholder="Reps"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2.5 text-[#f0ede8] text-sm outline-none focus:border-[#c9b0db] transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>
              <button onClick={() => onRemoveWarmup(idx)} className="text-[#333] active:text-[#ff4040] transition-colors shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={onAddWarmup}
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-[#333] text-[#444] text-sm active:border-[#c9b0db] active:text-[#c9b0db] transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          + Add Set
        </button>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [athletes, setAthletes] = useState<Athlete[]>(loadAthletes);
  const [page, setPage] = useState<Page>({ type: "list" });

  const persist = useCallback((updated: Athlete[]) => {
    setAthletes(updated);
    saveAthletes(updated);
  }, []);

  function upsertAthlete(a: Athlete) {
    const exists = athletes.find((x) => x.id === a.id);
    persist(exists ? athletes.map((x) => (x.id === a.id ? a : x)) : [...athletes, a]);
  }

  function deleteAthlete(id: string) {
    persist(athletes.filter((x) => x.id !== id));
    setPage({ type: "list" });
  }

  if (page.type === "list") {
    return (
      <AthletesList
        athletes={athletes}
        onSelect={(id) => setPage({ type: "detail", athleteId: id })}
        onAdd={() => {
          const fresh = emptyAthlete();
          persist([...athletes, fresh]);
          setPage({ type: "setup", athleteId: fresh.id });
        }}
      />
    );
  }

  if (page.type === "detail") {
    const a = athletes.find((x) => x.id === page.athleteId);
    if (!a) return null;
    return (
      <AthleteDetail
        athlete={a}
        onBack={() => setPage({ type: "list" })}
        onSetup={() => setPage({ type: "setup", athleteId: a.id })}
        onLift={(lift) => setPage({ type: "warmup", athleteId: a.id, lift })}
      />
    );
  }

  if (page.type === "warmup") {
    const a = athletes.find((x) => x.id === page.athleteId);
    if (!a) return null;
    return (
      <WarmupPage
        athlete={a}
        lift={page.lift}
        onBack={() => setPage({ type: "detail", athleteId: a.id })}
        onUpdate={(updated) => persist(athletes.map((x) => (x.id === updated.id ? updated : x)))}
      />
    );
  }

  if (page.type === "setup") {
    const a = athletes.find((x) => x.id === page.athleteId);
    if (!a) return null;
    return (
      <SetupPage
        athlete={a}
        onSave={(updated) => {
          upsertAthlete(updated);
          setPage({ type: "detail", athleteId: updated.id });
        }}
        onCancel={() => setPage({ type: "detail", athleteId: a.id })}
        onDelete={() => deleteAthlete(a.id)}
      />
    );
  }

  return null;
}
