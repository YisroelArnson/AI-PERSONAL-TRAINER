# History Page (Segmented) - Screen-by-Screen Wireframe Spec

**Date:** 2026-02-24  
**Status:** Draft  
**Scope:** iOS `History` destination UI/UX only (no API contract changes in this spec)  
**Primary surfaces:** `StatsPageView`, `StatsView`, workout history/detail views, exercise analytics views

---

## 1. Overview

This spec defines a single `History` destination with segmented navigation:

1. `Overview`
2. `Workouts`
3. `Exercises`

The goal is to let users:

- see all past workouts,
- drill into specific exercises and set-level data,
- read trend-oriented analytics and insights in the same destination.

---

## 2. Information Architecture

## 2.1 Entry

- User opens `History` from app menu.
- Default segment: `Workouts`.

## 2.2 Segment model

- Segments are top-level content states on one screen.
- Segment switch does not dismiss or leave page.
- Global time filter applies to all segments.

---

## 3. Global History Container Wireframe

```
+--------------------------------------------------+
|                    History                       |
|                                                  |
| [ 7D ] [ 4W ] [ 3M ] [ All ]      [Filter Icon] |
|                                                  |
| [ Overview ] [ Workouts ] [ Exercises ]          |
| ------------------------------------------------ |
|                                                  |
|               Segment Content Area               |
|                                                  |
+--------------------------------------------------+
```

## 3.1 Global components

- Title: `History` (centered, existing top bar style).
- Time chips: `7D`, `4W`, `3M`, `All`.
- Segment control: `Overview`, `Workouts`, `Exercises`.
- Optional filter icon opens filter sheet (status/type toggle).

## 3.2 Persistence rules

- Remember last selected segment per app launch.
- Remember last selected time range per app launch.

---

## 4. Segment A - Overview

## 4.1 Purpose

High-level “how am I doing?” view with fast-read metrics and trends.

## 4.2 Wireframe

```
+--------------------------------------------------+
| KPI Row                                           |
| [Workouts 12] [Avg Dur 41m] [Completion 86%]    |
|                                                  |
| Trend Cards                                       |
| +--------------------+  +----------------------+ |
| | Volume (4W)        |  | Avg RPE (4W)         | |
| | 18,420 lb          |  | 7.2                  | |
| | ▲ +11% vs prior    |  | ▼ -0.3 vs prior      | |
| +--------------------+  +----------------------+ |
|                                                  |
| Insights                                          |
| - Strong consistency Tue/Thu/Sat                 |
| - Squat volume is trending up 2 weeks            |
| - High-RPE days cluster on lower body sessions   |
|                                                  |
| Weekly Snapshot                                   |
| [Mon] [Tue✓] [Wed] [Thu✓] [Fri] [Sat✓] [Sun]    |
+--------------------------------------------------+
```

## 4.3 Modules

- KPI row: workouts completed, avg duration, completion rate.
- Trend cards: volume trend and avg RPE trend.
- Insight bullets: 2-3 plain-language takeaways.
- Weekly snapshot strip: day-by-day adherence indicator.

## 4.4 Interaction rules

- Tapping a trend card opens a modal with trend details.
- Tapping weekly day cell (if completed) jumps to that day’s workout list in `Workouts`.

---

## 5. Segment B - Workouts

## 5.1 Purpose

Chronological session history with direct drill-down.

## 5.2 Wireframe

```
+--------------------------------------------------+
| Search: [ Search workouts...                  ]  |
|                                                  |
| Feb 2026                                          |
| +----------------------------------------------+ |
| | Today                                         | |
| | Lower Body Power                              | |
| | 42m  |  6 ex  |  5 done 1 skipped  | RPE 8   | |
| | Volume 4,680 lb                         >     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Yesterday                                     | |
| | Upper Pull + Core                             | |
| | 37m  |  5 ex  |  5 done 0 skipped  | RPE 7   | |
| | Volume 3,920 lb                         >     | |
| +----------------------------------------------+ |
|                                                  |
| [Loading more...]                                 |
+--------------------------------------------------+
```

## 5.3 Workout card fields

- Relative date label (`Today`, `Yesterday`, else formatted date).
- Workout title.
- Duration.
- Exercise counts: total, completed, skipped.
- Session RPE.
- Total volume.
- Chevron to detail.

## 5.4 Interaction rules

- Tap card -> `Workout Detail Screen`.
- Infinite scroll when user approaches list bottom.
- Pull to refresh reloads current range.

---

## 6. Screen - Workout Detail

## 6.1 Purpose

Explain what happened in one specific session, including exercise-by-exercise results.

## 6.2 Wireframe

```
+--------------------------------------------------+
| < Back                    Lower Body Power       |
| Tue, Feb 24, 2026                                 |
|                                                  |
| [Duration 42m] [Exercises 6] [Volume 4,680 lb]   |
|                                                  |
| Exercise List                                     |
| +----------------------------------------------+ |
| | Barbell Back Squat                            | |
| | 4 sets  |  reps: 8/8/7/6  | load: 185 lb     | |
| | Completed                                >     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Romanian Deadlift                             | |
| | 3 sets  |  reps: 10/10/9 | load: 155 lb      | |
| | Completed                                >     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Walking Lunge                                 | |
| | 3 sets  | planned 12/12/12                    | |
| | Skipped (knee discomfort)                >     | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

## 6.3 Interaction rules

- Tap exercise card -> `Exercise Detail Screen`.
- Back returns to `Workouts` at same list position.

---

## 7. Screen - Exercise Detail

## 7.1 Purpose

Show set-level execution and contextual metadata for a single exercise instance.

## 7.2 Wireframe

```
+--------------------------------------------------+
| < Back                  Barbell Back Squat       |
|                                                  |
| Sets                                              |
| +----------------------------------------------+ |
| | Set 1  | reps 8 | 185 lb | RPE 7 | done      | |
| | Set 2  | reps 8 | 185 lb | RPE 8 | done      | |
| | Set 3  | reps 7 | 185 lb | RPE 8 | done      | |
| | Set 4  | reps 6 | 185 lb | RPE 9 | done      | |
| +----------------------------------------------+ |
|                                                  |
| Muscles                                           |
| [Quads] [Glutes] [Hamstrings] [Core]             |
|                                                  |
| Goals Addressed                                   |
| [Strength] [Lower-body power]                     |
|                                                  |
| Why This Exercise                                 |
| "Primary squat pattern for strength adaptation..."|
+--------------------------------------------------+
```

## 7.3 Interaction rules

- Back returns to `Workout Detail`.
- No edit behavior in history mode (read-only).

---

## 8. Segment C - Exercises

## 8.1 Purpose

Exercise-centric analytics (performance and frequency across sessions).

## 8.2 Wireframe

```
+--------------------------------------------------+
| Search: [ Search exercises...                 ]  |
| Sort: [ Most Performed v ]                       |
|                                                  |
| +----------------------------------------------+ |
| | Barbell Back Squat                            | |
| | Sessions: 14 | Total Volume: 42,300 lb       | |
| | Trend: ▲ volume up 8% (4W)              >     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | Dumbbell Bench Press                          | |
| | Sessions: 11 | Total Volume: 19,400 lb       | |
| | Trend: → stable (4W)                     >     | |
| +----------------------------------------------+ |
| +----------------------------------------------+ |
| | 5K Easy Run                                   | |
| | Sessions: 9 | Total Time: 278 min            | |
| | Trend: ▲ pace improving                   >    | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

## 8.3 Exercise analytics card fields

- Exercise name.
- Sessions performed.
- Primary metric:
  - Strength: total volume.
  - Endurance/duration: total time or distance.
- Trend badge (`up`, `flat`, `down`).

## 8.4 Interaction rules

- Tap card -> `Exercise Trend Detail Screen`.

---

## 9. Screen - Exercise Trend Detail

## 9.1 Purpose

Show progression for one exercise across time.

## 9.2 Wireframe

```
+--------------------------------------------------+
| < Back               Barbell Back Squat (4W)     |
|                                                  |
| Summary                                           |
| Sessions: 6 | Avg top set: 195 lb x 6            |
| Total volume: 12,800 lb | Trend: ▲ +8%           |
|                                                  |
| Trend chart area                                  |
| [Week 1] [Week 2] [Week 3] [Week 4]              |
|     *       *          *           *              |
|                                                  |
| Recent Sessions                                   |
| Feb 24 - 185x8, 185x8, 185x7, 185x6              |
| Feb 20 - 185x8, 185x8, 185x8, 185x7              |
| Feb 17 - 175x8, 175x8, 175x8, 175x8              |
+--------------------------------------------------+
```

---

## 10. Empty, Loading, Error States

## 10.1 Empty states

- `Overview`: “No workout data yet.” + CTA to start workout.
- `Workouts`: empty illustration + “Complete your first workout to see history.”
- `Exercises`: “No tracked exercises yet.” + guidance text.

## 10.2 Loading states

- Skeleton KPI pills and trend cards in `Overview`.
- Skeleton list cards in `Workouts` and `Exercises`.
- Keep segment control interactive while loading.

## 10.3 Error states

- Inline error card per segment with `Retry` button.
- Detail screen error keeps back navigation available.

---

## 11. Navigation Map

```
History (Segmented)
  -> Overview
  -> Workouts
      -> Workout Detail
          -> Exercise Detail
  -> Exercises
      -> Exercise Trend Detail
```

---

## 12. Data-to-UI Mapping (Current Backend)

Use currently available fields first:

- `Workouts` segment list:
  - `title`, `started_at`, `status`, `actual_duration_min`,
  - `exercise_count`, `completed_exercise_count`, `skipped_exercise_count`,
  - `total_volume`, `session_rpe`
  - source: `GET /trainer/workout-history`
- `Workout Detail` and `Exercise Detail`:
  - source: `GET /trainer/workout-sessions/:sessionId`
  - use returned `instance.exercises` + `exercises` tracking rows for set/status details.
- `Overview` and `Exercises` segment analytics:
  - phase 1: client-side aggregation from history + details.
  - phase 2: move heavy aggregations to backend endpoints when needed.

---

## 13. MVP Build Slice (Aligned to This Wireframe)

1. Build segmented container (`Overview | Workouts | Exercises`) with global time filter.
2. Implement full `Workouts` list + `Workout Detail` + `Exercise Detail`.
3. Add `Overview` KPI/trend cards with client-side computed metrics.
4. Add `Exercises` ranked list with basic trend badges.
5. Add robust empty/loading/error states on each segment.

---

## 14. Out of Scope for This Spec

- Bottom “ask stat questions” input box and agent-based Q&A.
- New backend endpoints beyond existing history/session detail routes.
- Push notifications or recommendations engine logic.

