# Alif Gameday App

A local-first, mobile-optimized web application designed to help powerlifting coaches and handlers manage athletes during a powerlifting meet. The app removes the need for manual clipboard calculations by automatically scheduling and tracking warmup timings based on live competition flow.

## 🏋️‍♂️ Core Features

### 1. Athlete Management
- Add and manage multiple athletes concurrently.
- Track critical setup details: Name, Weight Class, Squat Rack Height, and Bench Rack Height.
- Tabulate and display the athlete's current Total automatically.

### 2. SBD Tracking (Squat, Bench, Deadlift)
- Track **Peaking Numbers** and **Personal Records (PRs)**.
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
- **Styling:** Tailwind CSS v4 (Custom dark theme with `#c9b0db` accent)
- **State Management:** React Hooks + `localStorage` (Local-first architecture, no database required)
- **Deployment:** Vercel (or any static hosting provider)

## 🎨 Design & Aesthetics
- Mobile-first layout optimized for use on an iPhone during a busy meet.
- High-contrast dark mode for battery saving and visibility.
- Tap-friendly touch targets for on-the-fly editing.

## 🚀 Getting Started Locally

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.
