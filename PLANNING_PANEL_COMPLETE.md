# Planning Panel Implementation

**Date:** 2026-02-28 (UI shell) · **2026-11-14 (wired to a real store)**
**Status:** Implemented — real plans, persisted per profile

---

## Overview

Warp AI-style `/plan` command with a dedicated Planning panel for
tracking implementation plans. The 2026-02-28 shell shipped as a
mock — two hardcoded placeholder plans, a "Create New Plan" button
with no `onClick`, and a detail view that said "Plan details coming
soon" — and the platform-sweep audit (2026-11-14, item 1) ranked
that the most trust-damaging surface in the product: a user who ran
`/plan` was shown fake data and a dead button. The 2026-11-14
change wires the panel to a real store instead of deleting it: the
design the mock was a mock *of* was settled and documented here and
in `helpData.ts` ("Create and track implementation plans"), so the
missing pieces were engineering, not design.

---

## Design (settled, from the original note)

- A plan has a title, a description, a creation date, a status
  (`draft` / `in-progress` / `completed`), and steps.
- Plan cards show the status badge, a done/total step count, and a
  mini progress bar; clicking a card opens the detail view.
- The detail view shows the plan metadata (date, author, status),
  a full progress bar, and the steps themselves ("detailed steps,
  progress tracking, and notes").
- Status is derived from the steps, never stored separately: no
  steps (or none done) is a draft; some done is in-progress; all
  done is completed. That matches the two original examples (0/5
  draft, 6/6 completed).

## What the store does (`src/stores/planStore.ts`)

- `Plan { id, title, description, created, steps: PlanStep[] }`
  with `PlanStep { id, title, done }`. Counts and status are
  derived (`planStatus`, `planStepCounts`).
- Persistence is `localStorage['lucid-plans-v1']`, one plan list
  per profile id — the same per-profile pattern as the command
  history store. Caps: 100 plans per profile, 200 steps per plan.
- Actions: `createPlan(title, description)`, `deletePlan(id)`,
  `addStep(planId, title)`, `toggleStep(planId, stepId)`,
  `deleteStep(planId, stepId)`. Empty titles are ignored.
- Guest veil, copied from the command-history store exactly:
  entering a guest session stashes the owner's plans in memory
  and shows an empty list; the guest's own plans live only for
  the session and are never persisted; exiting restores the
  owner's plans exactly. Wired from the same choke points
  (`profileStore.selectProfile`, the Terminal / MiniTerminal
  mount effects). Wiping a profile clears its plans
  (`clearProfilePlans`, called from `wipeProfile` next to
  `clearProfileCommandHistory`).
- Corrupt stored entries are repaired or dropped, never trusted
  blindly. Writes are synchronous on each mutation, best-effort,
  never throwing.

## What the panel does (`src/components/Planning/PlanningPanel.tsx`)

- List view: the "Create New Plan" button opens a real form
  (title + optional description, Enter submits, Esc cancels);
  creating a plan opens its detail view. Plans render from the
  store; the empty state ("No plans yet") shows when there are
  none. Nothing is hardcoded — there are no placeholder plans.
- Detail view: real steps with checkboxes (toggle done), an
  add-step input, per-step delete, the progress bar from the
  derived counts, and a two-click "Delete plan" (arm, then
  confirm) that returns to the list.
- The glass styling is unchanged (`glassMatch.test.tsx` still
  renders the panel and checks its translucent/blurred classes).

## Changes Made (2026-11-14)

- **New:** `src/stores/planStore.ts` (the store above).
- **Rewrote:** `src/components/Planning/PlanningPanel.tsx`
  (store-backed list + create form + real step detail + delete).
- **Wired:** `src/stores/profileStore.ts` (veil + wipe),
  `src/components/Terminal/Terminal.tsx` and
  `src/components/Terminal/MiniTerminal.tsx` (load the active
  profile's plans on mount).
- **Tests:** `tests/planStore.test.ts`,
  `tests/planningPanel.test.tsx`.
- **Unchanged:** the `/plan` routing (`commandRouter.ts`,
  `Terminal.tsx` handler), the help entry (`helpData.ts`),
  the LuciferAI + silenced gates (a `/plan` with LuciferAI off
  or silenced still answers with the one-line note and never
  opens the panel).

---

## Command Flow

```
User types "/plan"
    ↓
parseCommand() → type: 'plan'
    ↓
LuciferAI gate (off → one-line note; silenced → silenced note)
    ↓
setShowPlanningPanel(true)
    ↓
PlanningPanel modal appears, plans loaded from the store
    ↓
No terminal block created (clean UX)
```

---

## FixNet Audit Documentation (2026-02-28, unchanged)

All BotFortress VPS code examples in `FIXNET_AUDIT.md` were
commented out as placeholder for a future batch upload system
(`FUTURE:` prefixes, "Not implemented yet"). Key sections
commented: `lucid:uploadFixToVPS`, `lucid:syncRefsFromVPS`,
`lucid:voteOnFix` IPC handlers and `upload_to_vps()` in
fixnet_uploader.py. Current reality: direct GitHub API push
(active), local storage in `~/.luciferai/`, BotFortress VPS
documented, not implemented.

---

## Not built (deliberately)

- Edit plan title/description after creation (create covers it;
  add later if Gary wants it).
- Step reorder, step dependencies, time estimates.
- Link plans to FixNet fixes / GitHub issues, export to
  markdown, import from GitHub projects, sharing/collaboration.
  Those were the original note's Phase 3–5 "future
  enhancements" and remain future — none of them was invented
  as part of wiring the panel to a store.
