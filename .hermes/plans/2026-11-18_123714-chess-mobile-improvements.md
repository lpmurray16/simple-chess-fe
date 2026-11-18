# Chess Mobile Improvements Implementation Plan

**Goal:** Improve board readability, show captures in a drawer, make online move submission failure-safe, and optionally add offline pass-and-play.

**Architecture:** Preserve the existing Angular board and chess.js rules. Validate online moves on an isolated candidate engine and only publish accepted state. Keep local play explicitly separate from the shared PocketBase game.

**Tech Stack:** Angular 21, chess.js 1.4, PocketBase, Capacitor 8.

## Scope and constraints
- User likes coordinates and checked-king highlighting, wants captures in a slide-out drawer, considers submission recovery important, and is interested in local play.
- Offline play is proposed scope, not assumed approved implementation.
- Preserve current wizard styling and existing untracked IDEA.md.
- Do not build, run tests, install an APK, commit, or push without the relevant approval. No new test suite by default.
- Current source has been inspected; the installed older APK may differ.

## 1. Make online moves failure-safe
Files: src/app/services/game.service.ts; src/app/components/board/board.component.ts; src/app/components/board/board.component.html.
- Re-read current files and trace updateLocalState, makeMove, resetGame, subscriptions, and UI callers before edits.
- Add a submission-in-progress guard to prevent repeat moves and conflicting reset/mode switches.
- Construct a candidate Chess instance from current PGN (FEN fallback) so repetition history survives. Validate and calculate the candidate move/status without mutating the authoritative local engine.
- Save candidate FEN/PGN to the backend. On acceptance, adopt returned canonical state without losing player expansions or allowing a late response to overwrite a newer game/mode.
- Emit capture effects only for accepted moves; avoid duplicates from realtime updates. Separate accepted-move state from ancillary notification/history failures.
- On failure preserve the original position, surface a retryable error, and reconcile uncertain network outcomes with a server refresh. Never automatically replay a possibly accepted move.
- Clear the pending guard in finally. Gate all terminal game states, including Draw.
- This does not solve concurrent server-side writes; inspect backend availability/rules before claiming atomic move enforcement.

## 2. Add coordinates and checked-king styling
Files: src/app/components/board/board.component.ts, .html, .scss.
- Read existing board styles before editing.
- Render a-h and 1-8 labels along board edges using getSquareFromVisual so black orientation stays correct.
- Determine the checked square using the current position: king of the side to move while chess.inCheck().
- Add a persistent contrasting inset outline/glow that remains visible with selection/last-move styles, including the mating position.
- Preserve square dimensions and touch targets; provide an accessible check description rather than relying only on color.

## 3. Captured-piece slide-out drawer
Files: src/app/components/board/board.component.ts, .html, .scss; src/app/services/game.service.ts.
- Add a compact Captures button, not permanent piece rows around the board.
- Slide a panel in from the right, with separate 'Captured by White' and 'Captured by Black' groups and an empty state.
- Derive captures from verbose move history (captured field and mover color), not starting-material subtraction; account for en passant and promotion correctly.
- Cache derived capture data per accepted game state; reset/recompute on game or mode changes.
- For FEN-only games without history show capture history unavailable, not an invented list.
- Include close button, backdrop dismissal, Escape, focus management, aria-expanded/dialog labeling, reduced motion, and mobile-safe sizing.

## 4. Optional offline pass-and-play
Files: src/app/services/game.service.ts; src/app/app.ts, .html, .scss; src/app/components/header/header.component.ts, .html; src/app/components/board/board.component.ts, .html; inspect src/app/components/overlay/overlay.component.ts and .html before modifying mode-dependent behavior.
- Provide an explicit Online / Play on this phone choice reachable without signing in. Current app forces an authentication overlay, so merely bypassing makeMove networking is insufficient.
- Keep one local saved game in versioned localStorage using PGN with defensive load/error handling. No local-game writes to PocketBase, notifications, or online history.
- Use White / Black player names, current-side move permission, and neutral local outcome text rather than online user identity.
- Default to fixed orientation with a Flip board control; avoid automatic rotation immediately after each move unless user chooses it.
- Isolate local state from pending online fetch/subscription/auth callbacks; switching modes cannot let remote updates replace a local game.
- Local New Game confirmation affects only the local save; returning online restores/refetches the existing shared game.
- Reuse coordinates, checked-king indication, captures, promotion, and chess.js game-end handling.
- Verify actual offline operation for bundled Capacitor assets; inspect external fonts/assets before promising full offline visual fidelity.

## Validation (permission required for execution)
- Ask before builds/tests; do not create a test suite by default.
- If approved run npm run build. Manual checks should cover both board orientations, check/checkmate, draw input blocking, capture drawer and en passant/promotion, failed/slow move submissions, realtime response ordering, and retry recovery.
- Local mode: fresh signed-out launch, airplane mode, both players moving, promotion, restart/resume, reset confirmation, and switching online/local while fetches are pending.
- Inspect drawer and coordinates at the phone viewport; verify focus, dismissal, and reduced-motion behavior.
- Build/sync/reinstall a new APK only with approval; the currently installed APK will not reflect source changes automatically.
