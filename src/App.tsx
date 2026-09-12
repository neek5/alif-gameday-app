import { useState, useEffect, useCallback, useRef } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

type GamedayOpponent = {
  id: string;
  name: string;
  bw: string;
  bestSq: string;
  bestBp: string;
  dl1: string;
  dl2: string;
  dl3: string;
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
  gameday: {
    dl1?: string;
    dl2?: string;
    dl3?: string;
    opponents: GamedayOpponent[];
  };
};

type Lift = "squat" | "bench" | "deadlift";
type Page =
  | { type: "list" }
  | { type: "detail"; athleteId: string }
  | { type: "warmup"; athleteId: string; lift: Lift }
  | { type: "setup"; athleteId: string | null }
  | { type: "gameday"; athleteId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "plift_athletes";

function loadAthletes(): Athlete[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as any[];
    return raw.map((a) => {
      const gameday = a.gameday || {
        opponents: [emptyGamedayOpponent(), emptyGamedayOpponent(), emptyGamedayOpponent()],
      };
      return {
        ...emptyAthlete(),
        ...a,
        gameday,
        squat: migrateLift(a.squat),
        bench: migrateLift(a.bench),
        deadlift: migrateLift(a.deadlift),
      };
    });
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

function emptyGamedayOpponent(): GamedayOpponent {
  return {
    id: crypto.randomUUID(),
    name: "",
    bw: "",
    bestSq: "",
    bestBp: "",
    dl1: "",
    dl2: "",
    dl3: "",
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
    gameday: {
      opponents: [
        emptyGamedayOpponent(),
        emptyGamedayOpponent(),
        emptyGamedayOpponent(),
      ],
    },
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

function SortableAthleteItem({ athlete, onSelect }: { athlete: Athlete; onSelect: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: athlete.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const total = computeTotal(athlete);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[#f9f9f9] border border-[rgba(0,0,0,0.08)] rounded-2xl overflow-hidden active:scale-[0.98] transition-transform shrink-0"
    >
      <div className="px-3 py-4 flex items-center justify-between">
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners} 
          className="p-3 mr-1 text-[#cccccc] cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
        >
          <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="8" cy="4" r="1.5" />
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="8" cy="10" r="1.5" />
            <circle cx="4" cy="16" r="1.5" />
            <circle cx="8" cy="16" r="1.5" />
          </svg>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0" onClick={() => onSelect(athlete.id)}>
          <p
            className="text-[#111111] truncate"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}
          >
            {athlete.name || "Unnamed"}
          </p>
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex items-center gap-2">
              {athlete.weightClass && (
                <span className="text-[#febf33] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                  {athlete.weightClass}kg {athlete.ageCategory}
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

        <div className="pl-3" onClick={() => onSelect(athlete.id)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#aaaaaa] shrink-0">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function AthletesList({
  athletes,
  onSelect,
  onAdd,
  onReorder,
}: {
  athletes: Athlete[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onReorder: (newAthletes: Athlete[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = athletes.findIndex((a) => a.id === active.id);
      const newIndex = athletes.findIndex((a) => a.id === over.id);
      onReorder(arrayMove(athletes, oldIndex, newIndex));
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#ffffff]">
      <div className="px-5 pt-14 pb-6">
        <p
          className="text-[#febf33] text-xs tracking-[0.2em] uppercase mb-1"
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
        
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={athletes.map(a => a.id)} strategy={verticalListSortingStrategy}>
            {athletes.map((a) => (
              <SortableAthleteItem key={a.id} athlete={a} onSelect={onSelect} />
            ))}
          </SortableContext>
        </DndContext>
        
        <div style={{ height: "calc(6rem + env(safe-area-inset-bottom))" }} />
      </div>

      <div
        className="fixed right-5 z-20"
        style={{ bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
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
  onGameday,
}: {
  athlete: Athlete;
  onBack: () => void;
  onSetup: () => void;
  onLift: (lift: Lift) => void;
  onGameday: () => void;
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
                <span className="text-[#febf33] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900 }}>
                  {(total.s > 0 || total.b > 0) ? total.s + total.b : "—"}
                </span>
              </div>
            </div>

            <div className="mt-2">
              <button onClick={onGameday} className="w-full bg-[#111111] text-[#febf33] py-3.5 rounded-xl font-bold tracking-[0.2em] uppercase text-xs active:scale-[0.98] transition-transform flex items-center justify-center gap-2" style={{ fontFamily: "var(--font-mono)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Open Gameday
              </button>
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
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 gap-y-3 text-center items-center">
            {/* Header row */}
            <div></div>
            <div className="text-[#111111] text-[13px] tracking-widest uppercase font-bold" style={{ fontFamily: "var(--font-mono)" }}>S</div>
            <div className="text-[#111111] text-[13px] tracking-widest uppercase font-bold" style={{ fontFamily: "var(--font-mono)" }}>B</div>
            <div className="text-[#111111] text-[13px] tracking-widest uppercase font-bold" style={{ fontFamily: "var(--font-mono)" }}>D</div>
            <div className="text-[#111111] text-[13px] tracking-widest uppercase font-bold" style={{ fontFamily: "var(--font-mono)" }}>T</div>

            {/* ALL-TIME row */}
            <div className="text-[#111111] text-[11px] tracking-widest uppercase text-left font-bold" style={{ fontFamily: "var(--font-mono)" }}>ALL-TIME</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.squat.atpr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.bench.atpr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.deadlift.atpr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
              {(() => {
                const s = parseFloat(athlete.squat.atpr || "0") || 0;
                const b = parseFloat(athlete.bench.atpr || "0") || 0;
                const d = parseFloat(athlete.deadlift.atpr || "0") || 0;
                const total = s + b + d;
                return total > 0 ? total : "—";
              })()}
            </div>

            {/* COMP row */}
            <div className="text-[#111111] text-[11px] tracking-widest uppercase text-left font-bold" style={{ fontFamily: "var(--font-mono)" }}>COMP</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.squat.compPr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.bench.compPr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{athlete.deadlift.compPr || "—"}</div>
            <div className="text-[#111111] leading-none" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
              {(() => {
                const s = parseFloat(athlete.squat.compPr || "0") || 0;
                const b = parseFloat(athlete.bench.compPr || "0") || 0;
                const d = parseFloat(athlete.deadlift.compPr || "0") || 0;
                const total = s + b + d;
                return total > 0 ? total : "—";
              })()}
            </div>
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
                    <span className="text-[#febf33] text-sm" style={{ fontFamily: "var(--font-mono)" }}>{records}</span>
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
          <TopStat label="COMP PR" value={ld.compPr} />
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
            <Input label="Weight Class (kg)" value={a.weightClass} onChange={(v) => setField("weightClass", v)} placeholder="e.g. 83" />
            <Input label="Age Category" value={a.ageCategory} onChange={(v) => setField("ageCategory", v)} placeholder="e.g. Junior" />
            <Input label="Lot Number" value={a.lotNumber} onChange={(v) => setField("lotNumber", v)} placeholder="e.g. 9" />
            <Input label="Body Weight (kg)" value={a.bodyWeight} onChange={(v) => setField("bodyWeight", v)} placeholder="e.g. 82.9" />
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

// ─── Gameday Page ─────────────────────────────────────────────────────────────

function getValidDL(dl1: string, dl2: string, dl3: string): number {
  if (dl3 && !dl3.toLowerCase().includes('x')) return parseFloat(dl3) || 0;
  if (dl2 && !dl2.toLowerCase().includes('x')) return parseFloat(dl2) || 0;
  if (dl1 && !dl1.toLowerCase().includes('x')) return parseFloat(dl1) || 0;
  return 0;
}

// Fixed pixel widths for the Gameday standings table, in column order:
// [Athlete, BW, Best SQ, Best BP, DL1, DL2, DL3, Total]
// Tweak these numbers to make columns tighter/wider — the table now
// obeys them exactly (table-layout: fixed), instead of the browser's
// default <input> width taking over.
const GAMEDAY_COLS = [92, 44, 42, 42, 58, 58, 58, 46];
const GAMEDAY_TABLE_WIDTH = GAMEDAY_COLS.reduce((a, b) => a + b, 0);

function GamedayPage({
  athlete,
  onBack,
  onUpdate,
}: {
  athlete: Athlete;
  onBack: () => void;
  onUpdate: (updated: Athlete) => void;
}) {
  const [recordAtPlay, setRecordAtPlay] = useState(false);
  const gameday = athlete.gameday || { opponents: [] };

  const mainRow = {
    isMain: true,
    id: athlete.id,
    name: athlete.name || "Athlete",
    bw: athlete.bodyWeight || "0",
    bestSq: athlete.squat.best || "0",
    bestBp: athlete.bench.best || "0",
    dl1: gameday.dl1 || "",
    dl2: gameday.dl2 || "",
    dl3: gameday.dl3 || "",
  };

  const rows = [mainRow, ...gameday.opponents.map(o => ({ ...o, isMain: false }))];

  const calculatedRows = rows.map(r => {
    const sq = parseFloat(r.bestSq) || 0;
    const bp = parseFloat(r.bestBp) || 0;
    const dl = getValidDL(r.dl1, r.dl2, r.dl3);
    const total = sq + bp + dl;
    return { ...r, total, bwVal: parseFloat(r.bw) || 0 };
  });

  calculatedRows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.bwVal - b.bwVal;
  });

  // Calculate targets for Win / 2nd / 3rd
  const oppRows = calculatedRows.filter(r => !r.isMain);
  const best1 = oppRows[0];
  const best2 = oppRows[1];
  const best3 = oppRows[2];

  const mainBwVal = parseFloat(athlete.bodyWeight) || 0;
  const mainSubtotal = (parseFloat(athlete.squat.best) || 0) + (parseFloat(athlete.bench.best) || 0);

  function calcReqDL(opp: any) {
    if (!opp || opp.total === 0) return "—";
    const oppTotal = opp.total;
    const oppBw = opp.bwVal;
    
    // If we are heavier, we MUST beat their total. If lighter, tying is enough.
    let targetTotal = mainBwVal >= oppBw ? oppTotal + 0.1 : oppTotal;
    const rawNeeded = targetTotal - mainSubtotal;
    
    if (rawNeeded <= 0) return "0"; // Already winning just on subtotal
    
    const increment = recordAtPlay ? 0.5 : 2.5;
    const w = Math.ceil(rawNeeded / increment) * increment;
    return w;
  }

  const reqWin = calcReqDL(best1);
  const req2nd = calcReqDL(best2);
  const req3rd = calcReqDL(best3);

  const updateMainDL = (field: "dl1"|"dl2"|"dl3", value: string) => {
    onUpdate({
      ...athlete,
      gameday: { ...gameday, [field]: value }
    });
  };

  const updateOpponent = (id: string, field: keyof GamedayOpponent, value: string) => {
    const newOpponents = gameday.opponents.map(o => 
      o.id === id ? { ...o, [field]: value } : o
    );
    onUpdate({ ...athlete, gameday: { ...gameday, opponents: newOpponents } });
  };

  const deleteOpponent = (id: string) => {
    const newOpponents = gameday.opponents.filter(o => o.id !== id);
    onUpdate({ ...athlete, gameday: { ...gameday, opponents: newOpponents } });
  };

  const addOpponent = () => {
    onUpdate({ ...athlete, gameday: { ...gameday, opponents: [...gameday.opponents, emptyGamedayOpponent()] } });
  };

  return (
    <div className="flex flex-col h-full bg-[#ffffff]">
      <div className="px-5 pt-14 pb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[#111111] active:opacity-60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: "bold" }}>Back</span>
        </button>
      </div>

      <div className="px-5 pb-6">
        <h1 className="text-[#111111] leading-none tracking-tight" style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 900 }}>
          GAMEDAY
        </h1>
        <p className="text-[#888888] mt-2 mb-6" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Track attempts and live standings
        </p>

        {/* TOP BOX */}
        <div className="mb-6 bg-[#F9F9F9] rounded-2xl border border-[rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
            <span className="text-[#666] tracking-widest uppercase font-bold text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              Record at Play
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={recordAtPlay} onChange={e => setRecordAtPlay(e.target.checked)} />
              <div className="w-11 h-6 bg-[#e5e5e5] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FEBF33]"></div>
            </label>
          </div>
          <div className="flex divide-x divide-[rgba(0,0,0,0.06)]">
            <div className="flex-1 flex flex-col items-center py-4">
              <span className="text-[#888] tracking-widest uppercase font-bold text-[10px] mb-1" style={{ fontFamily: "var(--font-mono)" }}>Win</span>
              <span className="text-[#111] font-bold text-lg" style={{ fontFamily: "var(--font-mono)" }}>{reqWin}</span>
            </div>
            <div className="flex-1 flex flex-col items-center py-4">
              <span className="text-[#888] tracking-widest uppercase font-bold text-[10px] mb-1" style={{ fontFamily: "var(--font-mono)" }}>2nd</span>
              <span className="text-[#111] font-bold text-lg" style={{ fontFamily: "var(--font-mono)" }}>{req2nd}</span>
            </div>
            <div className="flex-1 flex flex-col items-center py-4">
              <span className="text-[#888] tracking-widest uppercase font-bold text-[10px] mb-1" style={{ fontFamily: "var(--font-mono)" }}>3rd</span>
              <span className="text-[#111] font-bold text-lg" style={{ fontFamily: "var(--font-mono)" }}>{req3rd}</span>
            </div>
          </div>
        </div>

        {/* LEGEND */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FEBF33]"></div>
              <span className="text-[#666] tracking-widest uppercase font-bold text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>My Athlete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#F5E6C4]"></div>
              <span className="text-[#666] tracking-widest uppercase font-bold text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>Opponents</span>
            </div>
          </div>
          <span className="text-[#666] tracking-widest uppercase font-bold text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>tap cell to edit</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto px-5 pb-24">
        <div className="pb-4">
          <table className="text-left border-collapse" style={{ tableLayout: "fixed", width: GAMEDAY_TABLE_WIDTH }}>
            <colgroup>
              {GAMEDAY_COLS.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-left sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.04)]">Athlete</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">BW</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">Best<br/>SQ</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">Best<br/>BP</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">DL 1</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">DL 2</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">DL 3</th>
                <th className="px-1 py-2 font-bold text-[#aaa] text-[10px] tracking-wider uppercase text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {calculatedRows.map((r, idx) => {
                const rowBg = r.isMain ? "bg-[#FEBF33]" : "bg-white";
                const stickyBg = r.isMain ? "bg-[#FEBF33]" : "bg-white";
                const borderCls = r.isMain ? "" : "border-l-4 border-l-[#F5E6C4]";
                const inputCls = `w-full min-w-0 bg-transparent outline-none text-center font-semibold text-[#111] ${r.isMain ? 'placeholder:text-[rgba(0,0,0,0.3)]' : 'placeholder:text-[#ccc]'} text-[13px]`;
                const textCls = `w-full min-w-0 bg-transparent outline-none font-semibold text-[#111] ${r.isMain ? 'placeholder:text-[rgba(0,0,0,0.3)]' : 'placeholder:text-[#ccc]'} text-[13px]`;
                
                return (
                  <tr key={r.id} className={`${rowBg} ${borderCls} border-b border-b-[rgba(0,0,0,0.04)]`}>
                    <td className={`px-1 py-2 sticky left-0 z-10 ${stickyBg} shadow-[1px_0_0_0_rgba(0,0,0,0.04)]`}>
                      <div className="flex items-center gap-1 w-full">
                        <div className={`w-4 flex items-center justify-center font-bold text-xs ${r.isMain ? 'text-[#111]' : 'text-[#888]'} relative group`}>
                          {!r.isMain && (
                            <button onClick={() => deleteOpponent(r.id)} className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#eee] rounded flex items-center justify-center text-[#888] hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 z-10">
                              <span className="text-[10px] font-bold leading-none -mt-0.5">×</span>
                            </button>
                          )}
                          <span>{idx + 1}</span>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          {r.isMain ? (
                            <div className="font-semibold text-[13px] truncate text-[#111]">{r.name}</div>
                          ) : (
                            <input value={r.name} onChange={e => updateOpponent(r.id, "name", e.target.value)} className={textCls} placeholder="Name" />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-2">
                      {r.isMain ? (
                        <div className="text-center font-semibold text-[13px] text-[#111]">{r.bw}</div>
                      ) : (
                        <input value={r.bw} onChange={e => updateOpponent(r.id, "bw", e.target.value)} className={inputCls} placeholder="—" />
                      )}
                    </td>
                    <td className="px-1 py-2">
                      {r.isMain ? (
                        <div className="text-center font-semibold text-[13px] text-[#111]">{r.bestSq}</div>
                      ) : (
                        <input value={r.bestSq} onChange={e => updateOpponent(r.id, "bestSq", e.target.value)} className={inputCls} placeholder="—" />
                      )}
                    </td>
                    <td className="px-1 py-2">
                      {r.isMain ? (
                        <div className="text-center font-semibold text-[13px] text-[#111]">{r.bestBp}</div>
                      ) : (
                        <input value={r.bestBp} onChange={e => updateOpponent(r.id, "bestBp", e.target.value)} className={inputCls} placeholder="—" />
                      )}
                    </td>
                    <td className="px-1 py-2">
                      <input 
                        value={r.dl1} 
                        onChange={e => r.isMain ? updateMainDL("dl1", e.target.value) : updateOpponent(r.id, "dl1", e.target.value)} 
                        className={inputCls} 
                        placeholder="—"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input 
                        value={r.dl2} 
                        onChange={e => r.isMain ? updateMainDL("dl2", e.target.value) : updateOpponent(r.id, "dl2", e.target.value)} 
                        className={inputCls} 
                        placeholder="—"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input 
                        value={r.dl3} 
                        onChange={e => r.isMain ? updateMainDL("dl3", e.target.value) : updateOpponent(r.id, "dl3", e.target.value)} 
                        className={inputCls} 
                        placeholder="—"
                      />
                    </td>
                    <td className="px-1 py-2 text-center font-bold text-[13px] text-[#111]">
                      {r.total > 0 ? r.total : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={addOpponent} className="mt-4 flex items-center gap-2 text-[#888] hover:text-[#111] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            <span className="text-sm font-semibold">Add athlete to standings</span>
          </button>
        </div>
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
        onReorder={persist}
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
        onGameday={() => setPage({ type: "gameday", athleteId: a.id })}
      />
    );
  }

  if (page.type === "gameday") {
    const a = athletes.find((x) => x.id === page.athleteId);
    if (!a) return null;
    return (
      <GamedayPage
        athlete={a}
        onBack={() => setPage({ type: "detail", athleteId: a.id })}
        onUpdate={(updated) => persist(athletes.map((x) => (x.id === updated.id ? updated : x)))}
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
