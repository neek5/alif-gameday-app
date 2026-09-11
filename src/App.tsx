import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WarmupSet = { weight: string; reps: string; done: boolean };

type LiftData = {
  peakingNumber: string;
  atpr: string;
  compPr: string;
  best: string;
  notes: string;
  nr: string;
  ar: string;
  wr: string;
  warmups: WarmupSet[];
  gaps: number[]; // minutes between warmup[i] and warmup[i+1]
  gapToAttempt1: number; // minutes between last warmup and attempt 1
  drillsDuration: number;
  drillsGap: number; // gap between drills and first warmup
  drillsDone: boolean;
  attempt1Time: string; // "HH:MM" 24h — anchor for 1st attempt
  attempt1: string;
  attempt2: string;
  attempt3: string;
  openCurrent: string;
  openTotal: string;
};

type Athlete = {
  id: string;
  name: string;
  ageCategory: string;
  lotNumber: string;
  bodyWeight: string;
  weightClass: string;
  squatRackHeight: string;
  benchRackHeight: string;
  benchSafetyHeight: string;
  liftOff: string;
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
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as any[];
    return raw.map((a) => ({
      ...emptyAthlete(),
      ...a,
      squat: migrateLift(a.squat),
      bench: migrateLift(a.bench),
      deadlift: migrateLift(a.deadlift),
    }));
  } catch {
    return [];
  }
}

function migrateLift(ld: any): LiftData {
  if (!ld) return emptyLift();
  const warmups = ld.warmups ?? [];
  const gaps =
    ld.gaps && ld.gaps.length === warmups.length - 1
      ? ld.gaps
      : Array.from({ length: Math.max(0, warmups.length - 1) }, (_, i) =>
          i === 0 ? 2 : i === 1 ? 5 : 3
        );
  return { 
    ...emptyLift(),
    ...ld,
    warmups, 
    gaps,
    atpr: ld.atpr ?? ld.pr ?? "",
    attempt1Time: ld.attempt1Time ?? ld.startTime ?? "",
  };
}

function saveAthletes(athletes: Athlete[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(athletes));
}

function emptyLift(): LiftData {
  return {
    peakingNumber: "",
    atpr: "",
    compPr: "",
    best: "",
    notes: "",
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
    gapToAttempt1: 5,
    drillsDuration: 15,
    drillsGap: 5,
    drillsDone: false,
    attempt1Time: "",
    attempt1: "",
    attempt2: "",
    attempt3: "",
    openCurrent: "",
    openTotal: "",
  };
}

function emptyAthlete(): Athlete {
  return {
    id: crypto.randomUUID(),
    name: "",
    ageCategory: "",
    lotNumber: "",
    bodyWeight: "",
    weightClass: "",
    squatRackHeight: "",
    benchRackHeight: "",
    benchSafetyHeight: "",
    liftOff: "",
    squat: emptyLift(),
    bench: emptyLift(),
    deadlift: emptyLift(),
  };
}

function timeSubtract(timeStr: string, minutes: number): string {
  if (!timeStr) return "--:--";
  const [hStr, mStr] = timeStr.split(":");
  let total = parseInt(hStr) * 60 + parseInt(mStr);
  total -= minutes;
  while (total < 0) total += 24 * 60;
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

function computeTotal(a: Athlete) {
  const s = parseWeight(a.squat.best);
  const b = parseWeight(a.bench.best);
  const d = parseWeight(a.deadlift.best);
  return { s, b, d, total: s + b + d };
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
        className="bg-[#f0f0f0] border border-[rgba(0,0,0,0.15)] rounded-lg px-3 py-2.5 text-[#111111] text-sm outline-none focus:border-[#FEBF33] transition-colors"
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
    <div className="flex flex-col h-full bg-[#ffffff]">
      <div className="px-5 pt-14 pb-6">
        <p
          className="text-[#FEBF33] text-xs tracking-[0.2em] uppercase mb-1"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Competition Day
        </p>
        <h1
          className="text-[#111111] leading-none"
          style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 900 }}
        >
          ATHLETES
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-3">
        {athletes.length === 0 && (
          <p
            className="text-[#777777] text-sm text-center mt-16"
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
              className="bg-[#f9f9f9] border border-[rgba(0,0,0,0.08)] rounded-2xl overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => onSelect(a.id)}
            >
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[#111111] leading-none truncate"
                    style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}
                  >
                    {a.name || "Unnamed"}
                  </p>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex items-center gap-2">
                      {a.weightClass && (
                        <span className="text-[#FEBF33] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                          {a.weightClass}kg {a.ageCategory}
                        </span>
                      )}
                    </div>
                    {total.total > 0 && (
                      <span className="text-[#111111] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                        S: {total.s || "-"}, B: {total.b || "-"}, D: {total.d || "-"}, Total: {total.total}
                      </span>
                    )}
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#aaaaaa] shrink-0">
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
          className="w-14 h-14 rounded-full bg-[#FEBF33] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
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
    <div className="flex flex-col h-full bg-[#ffffff]">
      <div className="px-5 pt-14 pb-2 flex items-start justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[#FEBF33] active:opacity-60 mt-1">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4l-6 6 6 6" stroke="#FEBF33" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>Back</span>
        </button>
        <button
          onClick={onSetup}
          className="text-[#666666] active:text-[#FEBF33] transition-colors"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em" }}
        >
          EDIT
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-3 pb-6 border-b border-[rgba(0,0,0,0.08)]">
          <h1
            className="text-[#111111] leading-none"
            style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900 }}
          >
            {athlete.name || "Unnamed"}
          </h1>
          <p className="text-[#FEBF33] mt-2 flex flex-wrap gap-x-2 gap-y-1" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {athlete.weightClass && <span>{athlete.weightClass}kg</span>}
            {athlete.ageCategory && <span>{athlete.ageCategory}</span>}
            {athlete.lotNumber && <span>- Lot {athlete.lotNumber}</span>}
            {athlete.bodyWeight && <span>- BW {athlete.bodyWeight}kg</span>}
          </p>
        </div>

        {/* Info */}
        <div className="px-5 py-5 border-b border-[rgba(0,0,0,0.08)]">
          <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Info</p>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Squat Rack Ht." value={athlete.squatRackHeight || "—"} />
            <InfoRow label="Bench Rack Ht." value={athlete.benchRackHeight || "—"} />
            <InfoRow label="Bench Safety Ht." value={athlete.benchSafetyHeight || "—"} />
            <InfoRow label="Lift Off" value={athlete.liftOff || "—"} />
          </div>
        </div>

        {/* LIVE TOTAL & SUBTOTAL */}
        <div className="px-5 py-6 border-b border-[rgba(0,0,0,0.08)] bg-[#f9f9f9]">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[#666666] text-[13px] font-bold tracking-[0.18em] uppercase mb-2" style={{ fontFamily: "var(--font-mono)" }}>
                Live Total
              </p>
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-2 text-[#666]" style={{ fontFamily: "var(--font-mono)", fontSize: 16 }}>
                  <span>{total.s > 0 ? total.s : "—"}</span>
                  <span className="text-[#aaaaaa]">-</span>
                  <span>{total.b > 0 ? total.b : "—"}</span>
                  <span className="text-[#aaaaaa]">-</span>
                  <span>{total.d > 0 ? total.d : "—"}</span>
                </div>
                <span className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900 }}>
                  {total.total > 0 ? total.total : "—"}
                </span>
              </div>
            </div>
            
            <div>
              <p className="text-[#666666] text-[13px] font-bold tracking-[0.18em] uppercase mb-2" style={{ fontFamily: "var(--font-mono)" }}>
                Live Subtotal
              </p>
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-2 text-[#666]" style={{ fontFamily: "var(--font-mono)", fontSize: 16 }}>
                  <span>{total.s > 0 ? total.s : "—"}</span>
                  <span className="text-[#aaaaaa]">+</span>
                  <span>{total.b > 0 ? total.b : "—"}</span>
                </div>
                <span className="text-[#FEBF33] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900 }}>
                  {(total.s > 0 || total.b > 0) ? total.s + total.b : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Peaking Numbers */}
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.08)] opacity-60">
          <p className="text-[#666666] text-[10px] tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Peaking Numbers</p>
          <div className="flex gap-2">
            {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
              <div key={lift} className="flex-1 text-center">
                <p className="text-[#777777] text-[9px] tracking-widest uppercase mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {lift[0].toUpperCase()}
                </p>
                <p className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700 }}>
                  {athlete[lift].peakingNumber || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* PRs */}
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <p className="text-[#666666] text-[10px] tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Personal Records</p>
          <div className="flex gap-2">
            {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
              <div key={lift} className="flex-1 text-center">
                <p className="text-[#777777] text-[9px] tracking-widest uppercase mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                  {lift[0].toUpperCase()}
                </p>
                <p className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700 }}>
                  {athlete[lift].atpr || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Records */}
        {(["squat", "bench", "deadlift"] as Lift[]).some((l) => athlete[l].nr || athlete[l].ar || athlete[l].wr) && (
          <div className="px-5 py-5 border-b border-[rgba(0,0,0,0.08)]">
            <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-4" style={{ fontFamily: "var(--font-mono)" }}>Records</p>
            <div className="flex flex-col gap-2">
              {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => {
                const ld = athlete[lift];
                const records = [ld.nr && `NR ${ld.nr}`, ld.ar && `AR ${ld.ar}`, ld.wr && `WR ${ld.wr}`].filter(Boolean).join(" / ");
                if (!records) return null;
                return (
                  <div key={lift} className="flex items-center gap-3">
                    <span className="text-[#777777] text-[10px] tracking-widest uppercase w-4" style={{ fontFamily: "var(--font-mono)" }}>
                      {lift[0].toUpperCase()}
                    </span>
                    <span className="text-[#FEBF33] text-sm" style={{ fontFamily: "var(--font-mono)" }}>{records}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lift rows */}
        <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.08)]">
          {(["squat", "bench", "deadlift"] as Lift[]).map((lift) => (
            <button
              key={lift}
              onClick={() => onLift(lift)}
              className="flex items-center justify-between px-5 py-5 w-full text-left active:bg-[#f9f9f9] transition-colors"
            >
              <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, color: "#111111" }}>
                {LIFT_LABELS[lift]}
              </span>
              <div className="flex items-center gap-3">
                {athlete[lift].peakingNumber && (
                  <span className="text-[#666666]" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                    {athlete[lift].peakingNumber} kg
                  </span>
                )}
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4l6 6-6 6" stroke="#aaaaaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>
        
        <div className="h-8" />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f9f9f9] rounded-xl px-4 py-3">
      <p className="text-[#777777] text-[10px] tracking-[0.14em] uppercase mb-0.5" style={{ fontFamily: "var(--font-mono)" }}>{label}</p>
      <p className="text-[#111111] text-base font-medium" style={{ fontFamily: "var(--font-body)" }}>{value}</p>
    </div>
  );
}

function TopStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-[#666666] text-[9px] tracking-widest uppercase mb-0.5" style={{ fontFamily: "var(--font-mono)" }}>{label}</span>
      <span className="text-[#111111] font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>{value || "—"}</span>
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
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState("");
  const [editingWarmup, setEditingWarmup] = useState<number | null>(null);
  const [warmupDraft, setWarmupDraft] = useState({ weight: "", reps: "" });

  const anchorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(nowTimeString()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (editingAnchor) anchorRef.current?.focus();
  }, [editingAnchor]);

  const ld = athlete[lift];

  function patch(partial: Partial<LiftData>) {
    onUpdate({ ...athlete, [lift]: { ...ld, ...partial } });
  }

  function toggleDone(idx: number) {
    const warmups = ld.warmups.map((w, i) => (i === idx ? { ...w, done: !w.done } : w));
    patch({ warmups });
  }

  function commitAnchor() {
    patch({ attempt1Time: anchorDraft });
    setEditingAnchor(false);
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
    setEditingWarmup(warmups.length - 1);
    setWarmupDraft({ weight: "", reps: "" });
  }

  function removeWarmup(idx: number) {
    const warmups = ld.warmups.filter((_, i) => i !== idx);
    const newGaps = ld.gaps.slice(0, warmups.length - 1);
    patch({ warmups, gaps: newGaps });
    if (editingWarmup === idx) setEditingWarmup(null);
  }

  function getWarmupTime(idx: number): string {
    let mins = ld.gapToAttempt1 || 0;
    for (let i = idx; i < ld.gaps.length; i++) {
      mins += ld.gaps[i];
    }
    return timeSubtract(ld.attempt1Time, mins);
  }

  function getDrillsTime(): string {
    let mins = ld.gapToAttempt1 || 0;
    for (const g of ld.gaps) mins += g;
    mins += (ld.drillsGap || 0) + (ld.drillsDuration || 0);
    return timeSubtract(ld.attempt1Time, mins);
  }

  return (
    <div className="flex flex-col h-full bg-[#ffffff]">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-[#FEBF33] mb-4 active:opacity-60">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M13 4l-6 6 6 6" stroke="#FEBF33" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{athlete.name}</span>
        </button>
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <h2 className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 900 }}>
              {LIFT_LABELS[lift].toUpperCase()}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[#666666] text-[10px] tracking-widest uppercase" style={{ fontFamily: "var(--font-mono)" }}>BEST</span>
              <input 
                value={ld.best}
                onChange={(e) => patch({ best: e.target.value })}
                placeholder="kg"
                className="bg-[#f0f0f0] border border-[rgba(0,0,0,0.15)] rounded px-2 py-1 text-[#111111] text-sm w-16 text-center outline-none focus:border-[#FEBF33]"
              />
            </div>
          </div>
          <span className="text-[#FEBF33] pb-1" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700 }}>
            {now}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        
        {/* Top Records Area */}
        <div className="grid grid-cols-3 gap-y-3 gap-x-2 mb-4 bg-[#f9f9f9] rounded-2xl p-4 border border-[rgba(0,0,0,0.06)]">
          <TopStat label="PEAK" value={ld.peakingNumber} />
          <TopStat label="ATPR" value={ld.atpr} />
          <TopStat label="COMP" value={ld.compPr} />
          {ld.nr && <TopStat label="NR" value={ld.nr} />}
          {ld.ar && <TopStat label="AR" value={ld.ar} />}
          {ld.wr && <TopStat label="WR" value={ld.wr} />}
        </div>

        {/* __ of __ to OPEN */}
        <div className="flex items-center gap-2 mb-6">
          <input value={ld.openCurrent} onChange={e => patch({openCurrent: e.target.value})} className="bg-[#f9f9f9] border border-[rgba(0,0,0,0.15)] focus:border-[#FEBF33] text-[#111111] text-center w-10 py-1 rounded outline-none text-sm" />
          <span className="text-[#666666] text-[10px] uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>of</span>
          <input value={ld.openTotal} onChange={e => patch({openTotal: e.target.value})} className="bg-[#f9f9f9] border border-[rgba(0,0,0,0.15)] focus:border-[#FEBF33] text-[#111111] text-center w-10 py-1 rounded outline-none text-sm" />
          <span className="text-[#666666] text-[10px] uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>to OPEN</span>
        </div>

        {/* Drills */}
        <div className="mb-1">
          <div className="flex items-center gap-2.5 py-1">
            <button
              onClick={() => patch({ drillsDone: !ld.drillsDone })}
              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                ld.drillsDone ? "bg-[#FEBF33] border-[#FEBF33]" : "border-[#dddddd] bg-transparent"
              }`}
            >
              {ld.drillsDone && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-6" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <div className="flex-1 bg-[#f0ede6] rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-[#111111] tracking-widest uppercase font-bold text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>[DRILLS]</span>
              <div className="flex items-center gap-1">
                <input value={ld.drillsDuration || ""} onChange={e => patch({drillsDuration: parseInt(e.target.value) || 0})} className="bg-transparent border-b border-[#111111] w-8 text-center text-[#111111] font-bold outline-none" />
                <span className="text-[#111111] text-[10px] uppercase font-bold" style={{ fontFamily: "var(--font-mono)" }}>min</span>
              </div>
            </div>
            <div className="rounded-xl px-2 py-3 min-w-[76px] text-center bg-[#cc2200]">
              <span className="text-white" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500 }}>
                {getDrillsTime()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 py-0.5">
            <div className="w-8" />
            <div className="flex items-center gap-1.5 flex-1">
              <input value={ld.drillsGap || ""} onChange={e => patch({drillsGap: parseInt(e.target.value) || 0})} className="w-10 bg-[#eaf5dd] border border-[#FEBF33] rounded-md text-[#FEBF33] text-xs font-bold text-center outline-none py-1" />
              <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
              <span className="text-[#666666] text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>min</span>
            </div>
            <div className="w-[76px]" />
          </div>
        </div>

        {/* Warmups label */}
        <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mt-4 mb-3" style={{ fontFamily: "var(--font-mono)" }}>
          Warmups
        </p>

        {/* Warmup rows */}
        <div className="flex flex-col">
          {ld.warmups.map((w, idx) => {
            const isEditingThis = editingWarmup === idx;
            const timeStr = getWarmupTime(idx);

            return (
              <div key={idx}>
                {/* Warmup row */}
                <div className="flex items-center gap-2.5 py-1">
                  <button
                    onClick={() => { if (!isEditingThis) toggleDone(idx); }}
                    className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                      w.done ? "bg-[#FEBF33] border-[#FEBF33]" : "border-[#dddddd] bg-transparent"
                    }`}
                  >
                    {w.done && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l4 4 6-6" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

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
                        className="flex-1 bg-[#f0f0f0] border border-[#FEBF33] rounded-xl px-3 py-2.5 text-[#111111] text-lg outline-none text-center"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                        onKeyDown={(e) => e.key === "Enter" && commitWarmup()}
                      />
                      <span className="text-[#777777]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>×</span>
                      <input
                        value={warmupDraft.reps}
                        onChange={(e) => setWarmupDraft((d) => ({ ...d, reps: e.target.value }))}
                        placeholder="reps"
                        inputMode="numeric"
                        className="flex-1 bg-[#f0f0f0] border border-[#FEBF33] rounded-xl px-3 py-2.5 text-[#111111] text-lg outline-none text-center"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                        onKeyDown={(e) => e.key === "Enter" && commitWarmup()}
                      />
                    </div>
                  ) : (
                    <button
                      className={`flex-1 rounded-xl px-4 py-3 text-left border transition-colors active:border-[#FEBF33] ${
                        w.done ? "bg-[#f9f9f9] border-[rgba(0,0,0,0.06)]" : "bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]"
                      }`}
                      onClick={() => {
                        setEditingWarmup(idx);
                        setWarmupDraft({ weight: w.weight, reps: w.reps });
                      }}
                    >
                      <span
                        className={w.done ? "text-[#777777] line-through" : "text-[#111111]"}
                        style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}
                      >
                        {w.weight || "—"}×{w.reps || "—"}
                      </span>
                    </button>
                  )}

                  <div className={`rounded-xl px-2 py-3 min-w-[76px] text-center transition-opacity ${
                    w.done ? "bg-[#f0f0f0]" : "bg-[#cc2200]"
                  }`}>
                    <span
                      className={w.done ? "text-[#777777]" : "text-white"}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500 }}
                    >
                      {timeStr}
                    </span>
                  </div>

                  <button
                    onClick={() => removeWarmup(idx)}
                    className="text-[#666666] active:text-[#ff4040] transition-colors shrink-0 w-5 flex justify-center"
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
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={ld.gaps[idx] || ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          const gaps = [...ld.gaps];
                          gaps[idx] = val;
                          patch({ gaps });
                        }}
                        className="w-10 bg-[#eaf5dd] border border-[#FEBF33] rounded-md text-[#FEBF33] text-xs font-bold text-center outline-none py-1"
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                      <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
                      <span className="text-[#666666] text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>min</span>
                    </div>
                    <div className="w-[76px]" />
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={addWarmup}
            className="flex items-center gap-2.5 py-3 w-full active:opacity-60 transition-opacity mt-1"
          >
            <div className="w-8 h-8 rounded-lg border border-dashed border-[#dddddd] flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="#999999" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[#777777] text-sm" style={{ fontFamily: "var(--font-body)" }}>Add warmup set</span>
          </button>
        </div>

        {/* Gap to Attempt 1 */}
        {ld.warmups.length > 0 && (
          <div className="flex items-center gap-2.5 py-0.5 mb-2 mt-4">
            <div className="w-8" />
            <div className="flex items-center gap-1.5 flex-1">
              <input value={ld.gapToAttempt1 || ""} onChange={e => patch({gapToAttempt1: parseInt(e.target.value) || 0})} className="w-10 bg-[#eaf5dd] border border-[#FEBF33] rounded-md text-[#FEBF33] text-xs font-bold text-center outline-none py-1" />
              <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
              <span className="text-[#666666] text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>min</span>
            </div>
            <div className="w-[76px]" />
          </div>
        )}

        {/* Attempts */}
        <div className="mt-2 mb-6">
          <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            Attempts
          </p>
          <div className="flex flex-col gap-2">
            {[
              { key: "attempt1", label: "Attempt 1", value: ld.attempt1 },
              { key: "attempt2", label: "Attempt 2", value: ld.attempt2 },
              { key: "attempt3", label: "Attempt 3", value: ld.attempt3 },
            ].map(({ key, label, value }, idx) => (
              <div key={label} className="bg-[#f7fcf0] border border-[rgba(201,176,219,0.5)] rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-[#4a6b22] text-[10px] tracking-[0.12em] uppercase w-16" style={{ fontFamily: "var(--font-mono)" }}>
                  {label}
                </span>
                <input
                  value={value}
                  onChange={e => patch({ [key]: e.target.value })}
                  placeholder="—"
                  className="bg-transparent text-right text-[#FEBF33] outline-none flex-1 min-w-0"
                  style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}
                />
                {idx === 0 && (
                  <div className="ml-3 pl-3 border-l border-[rgba(0,0,0,0.15)]">
                    {editingAnchor ? (
                      <input
                        ref={anchorRef}
                        type="time"
                        value={anchorDraft}
                        onChange={(e) => setAnchorDraft(e.target.value)}
                        onBlur={commitAnchor}
                        onKeyDown={(e) => e.key === "Enter" && commitAnchor()}
                        className="bg-[#cc2200] rounded-xl px-1 py-2 text-white text-sm outline-none border border-[#ff5533] w-[76px] text-center"
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setAnchorDraft(ld.attempt1Time || nowHHMM());
                          setEditingAnchor(true);
                        }}
                        className="bg-[#cc2200] rounded-xl px-1 py-2 text-white text-[13px] font-medium outline-none border border-transparent w-[76px] text-center active:opacity-70"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {ld.attempt1Time || "--:--"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Notes</p>
          <textarea
            value={ld.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            className="w-full bg-[#f9f9f9] border border-[rgba(0,0,0,0.08)] rounded-xl p-4 text-[#111111] text-sm outline-none focus:border-[#FEBF33] transition-colors min-h-[120px]"
            placeholder="Any notes for this lift..."
            style={{ fontFamily: "var(--font-body)" }}
          />
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
    <div className="flex flex-col h-full bg-[#ffffff]">
      <div className="px-5 pt-14 pb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-[#666666] active:text-[#111111] transition-colors" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Cancel
        </button>
        <h2 className="text-[#111111]" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800 }}>
          {initialAthlete.name ? initialAthlete.name.toUpperCase() : "NEW ATHLETE"}
        </h2>
        <button onClick={() => onSave(a)} className="text-[#FEBF33] active:opacity-60" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Save
        </button>
      </div>

      <div className="flex px-5 gap-2 pb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === t ? "bg-[#FEBF33] text-[#111111]" : "bg-[#f0f0f0] text-[#666666]"
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
            <Input label="Age Category" value={a.ageCategory} onChange={(v) => setField("ageCategory", v)} placeholder="e.g. Junior" />
            <Input label="Lot Number" value={a.lotNumber} onChange={(v) => setField("lotNumber", v)} placeholder="e.g. 9" />
            <Input label="Body Weight (kg)" value={a.bodyWeight} onChange={(v) => setField("bodyWeight", v)} placeholder="e.g. 82.9" />
            <Input label="Weight Class (kg)" value={a.weightClass} onChange={(v) => setField("weightClass", v)} placeholder="e.g. 83" />
            <Input label="Squat Rack Height" value={a.squatRackHeight} onChange={(v) => setField("squatRackHeight", v)} placeholder="e.g. 5" />
            <Input label="Bench Rack Height" value={a.benchRackHeight} onChange={(v) => setField("benchRackHeight", v)} placeholder="e.g. 3" />
            <Input label="Bench Safety Height" value={a.benchSafetyHeight} onChange={(v) => setField("benchSafetyHeight", v)} placeholder="e.g. 2" />
            <Input label="Lift Off" value={a.liftOff} onChange={(v) => setField("liftOff", v)} placeholder="Yes / No" />
            <div className="mt-2">
              <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Danger Zone</p>
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
        <p className="text-[#666666] text-xs tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>Numbers</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Peaking Number" value={ld.peakingNumber} onChange={(v) => onChange("peakingNumber", v)} placeholder="e.g. 200" />
          <Input label="ATPR" value={ld.atpr} onChange={(v) => onChange("atpr", v)} placeholder="e.g. 195" />
          <Input label="COMP PR" value={ld.compPr} onChange={(v) => onChange("compPr", v)} placeholder="e.g. 190" />
          <Input label="NR" value={ld.nr} onChange={(v) => onChange("nr", v)} placeholder="National record" />
          <Input label="AR" value={ld.ar} onChange={(v) => onChange("ar", v)} placeholder="Asian record" />
          <Input label="WR" value={ld.wr} onChange={(v) => onChange("wr", v)} placeholder="World record" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[#666666] text-xs tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-mono)" }}>Attempts</p>
        <Input label="Attempt 1" value={ld.attempt1} onChange={(v) => onChange("attempt1", v)} placeholder="e.g. 185" />
        <Input label="Attempt 2 (use | for options)" value={ld.attempt2} onChange={(v) => onChange("attempt2", v)} placeholder="e.g. 192.5|195|197.5" />
        <Input label="Attempt 3" value={ld.attempt3} onChange={(v) => onChange("attempt3", v)} placeholder="e.g. 200" />
      </div>

      <div>
        <p className="text-[#666666] text-xs tracking-[0.18em] uppercase mb-3" style={{ fontFamily: "var(--font-mono)" }}>Warmup Sets</p>
        <div className="flex flex-col gap-2">
          {ld.warmups.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[#777777] w-5 text-center text-sm shrink-0" style={{ fontFamily: "var(--font-mono)" }}>{idx + 1}</span>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  value={w.weight}
                  onChange={(e) => onWarmupChange(idx, "weight", e.target.value)}
                  placeholder="Weight"
                  className="bg-[#f0f0f0] border border-[rgba(0,0,0,0.15)] rounded-lg px-3 py-2.5 text-[#111111] text-sm outline-none focus:border-[#FEBF33] transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                />
                <input
                  value={w.reps}
                  onChange={(e) => onWarmupChange(idx, "reps", e.target.value)}
                  placeholder="Reps"
                  className="bg-[#f0f0f0] border border-[rgba(0,0,0,0.15)] rounded-lg px-3 py-2.5 text-[#111111] text-sm outline-none focus:border-[#FEBF33] transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>
              <button onClick={() => onRemoveWarmup(idx)} className="text-[#aaaaaa] active:text-[#ff4040] transition-colors shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={onAddWarmup}
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-[#dddddd] text-[#777777] text-sm active:border-[#FEBF33] active:text-[#FEBF33] transition-colors"
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
