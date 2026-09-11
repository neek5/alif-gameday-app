# Alif Gameday App

A local-first, mobile-optimized web application designed to help powerlifting coaches and handlers manage athletes during a powerlifting meet. The app removes the need for manual clipboard calculations by automatically scheduling and tracking warmup timings based on live competition flow.

## 🏋️‍♂️ Core Features

### 1. Athlete Management
- Add and manage multiple athletes concurrently.
- **Drag-and-drop reordering:** Organize athletes seamlessly to match the competition flight order.
- Track critical setup details: Name, Weight Class, Squat Rack Height, and Bench Rack Height.
- Tabulate and display the athlete's current Total automatically.

### 2. SBD Tracking (Squat, Bench, Deadlift)
- Track **Peaking Numbers**.
- Detailed **Personal Records Grid**: Track both **ALL-TIME PRs** and **COMP PRs** across Squat, Bench, and Deadlift with auto-calculated Totals.
- Display any relevant **Records** (National Record / Asian Record / World Record).
- Manage the **3 Attempts** (Opener, 2nd attempt, 3rd attempt) for each lift.

### 3. Dynamic Warmup Scheduler
- **Anchor Timing:** Set the start time for the first warmup set (the "anchor").
- **Customizable Gaps:** Adjust the rest periods between sets on the fly (e.g., 2 mins, 5 mins, 3 mins).
- **Auto-Calculated Schedule:** Subsequent warmup times are automatically calculated based on the anchor time and the custom rest gaps.
- **On-the-fly Editing:** Easily edit weight and reps for each warmup set while on the warmup page.
- **Completion Tracking:** Mark warmup sets as completed as the athlete progresses.

## 🛠 Tech Stack

- **Framework:** React 19 + Vite 8
- **Styling:** Tailwind CSS v4 (Clean light theme with `#FEBF33` accent)
- **Drag and Drop:** `@dnd-kit` for mobile-optimized touch reordering
- **State Management:** React Hooks + `localStorage` (Local-first architecture, no database required)
- **Deployment:** Vercel (or any static hosting provider)

## 🎨 Design & Aesthetics
- Mobile-first layout optimized for use on an iPhone during a busy meet.
- Clean light mode for high contrast and readability under bright gym lighting.
- **Montserrat** typography for clean, modern readability.
- Tap-friendly touch targets and intuitive drag handles.

## 🚀 Getting Started Locally

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.
