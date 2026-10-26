# TaskHeat 🔥

> **Turn daily focus into contribution green.**  
> An offline-first, private daily task tracker featuring a GitHub-style activity heatmap and a gamified task roulette to beat procrastination. Zero accounts. Zero tracking. Zero external network requests.

---

## The Problem TaskHeat Solves

When faced with a long list of tasks, decision fatigue sets in: *where do I begin?* TaskHeat solves this by letting you **gamble on your day**:
1. Commit your tasks for the day.
2. Spin the **Task Roulette** to randomly select one task for you.
3. Lock into **Focus Mode** with an elapsed timer until it's done.
4. Watch your progress light up your 53-week GitHub-style contribution heatmap.

---

## Features

- **GitHub-Style Contribution Heatmap**: A 53-week, 7-day responsive contribution graph with 5 levels of activity green, streak counters, and tooltip inspectors.
- **Task Roulette (Gamble CTA)**: Slot-machine reel with smooth cubic-bezier easing, confetti flourish, optional tick audio (Web Audio API), haptic vibration on mobile, and limited rerolls.
- **Focus Mode**: Persistent "Now doing" bar pinned at the bottom with a live elapsed-time counter (`mm:ss`), inline completion, and abandon controls.
- **Draft & Permanence Model**: Newly added tasks are drafts with dashed borders until explicitly saved. Saved tasks permanently count toward your heatmap activity and can only be deleted with explicit confirmation.
- **100% Private & Local**: All data is stored in `localStorage` under versioned schemas. No accounts, no database, no third-party analytics.
- **Backup & Portability**: One-click JSON data export and schema-validated merge/replace import.
- **Full PWA & Offline Support**: Custom zero-dependency Service Worker with cache-first static assets, network-first document updates, and standalone desktop/mobile installation.
- **Accessible & Responsive**: WCAG AA contrast compliance across all tokens, 44×44px minimum touch targets, roving grid tabindex, and full keyboard navigation.

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
|:---:|---|---|
| <kbd>N</kbd> | Focus new task input | Global |
| <kbd>S</kbd> | Save drafts for the viewed day | Global |
| <kbd>G</kbd> | Open Task Roulette (Gamble) | Global |
| <kbd>T</kbd> | Jump to today's date | Global |
| <kbd>←</kbd> | Navigate to previous day | Global |
| <kbd>→</kbd> | Navigate to next day | Global |
| <kbd>?</kbd> | Open keyboard shortcuts help | Global |
| <kbd>Esc</kbd> | Dismiss open dialogs / modal windows | Modals |
| <kbd>Space</kbd> / <kbd>Enter</kbd> | Fast-forward roulette spin to result | Roulette spin |

*Note: Shortcuts are suppressed when typing in input fields or when modals are open.*

---

## Screenshots

<!-- Screenshot Placeholders -->
```
+---------------------------------------------------------------------------------+
| [LOGO] TaskHeat                Track daily tasks               [Settings] [?]   |
|                                                                                 |
| 142 tasks completed in the last year                                            |
| [Total: 142]  [Streak: 12d]  [Longest: 28d]  [Best day: 8]                      |
| [ Heatmap Grid (53 weeks x 7 days)                                            ] |
|                                                               Less [][][][][] More
|                                                                                 |
| Monday, October 26, 2026                 [Today] [<] [>]  [=== 3 / 4 ] [Gamble] |
| [+ Add a task...                                                  ] [Add]       |
|                                                                                 |
| [x] Finish launch-readiness pass                                                |
| [ ] Review pull requests                                    [Now]               |
| [x] Write documentation                                                         |
|                                                                                 |
| Now doing: Review pull requests           04:32    [Done] [Abandon]             |
+---------------------------------------------------------------------------------+
```

---

## Architecture Overview

TaskHeat is built with modern vanilla JavaScript (ES modules) with **zero runtime dependencies**:

```
src/
├── config.js               # Global app constants, storage keys & thresholds
├── main.js                 # App bootstrap, routing, SW registration & wiring
├── router.js               # Hash router (#/YYYY-MM-DD) with date validation
├── state/
│   ├── storage.js          # Versioned localStorage read/write, migrations & cross-tab sync
│   ├── store.js            # In-memory day task store, draft management & count cache
│   └── pick.js             # Active roulette pick state machine & session timer
├── utils/
│   ├── date.js             # Local calendar date calculations, weeks & intensity levels
│   ├── dom.js              # Safe DOM element creation (el/frag) & batching (rAF/idle)
│   ├── random.js           # Crypto-random rejection sampling for unbiased picks
│   └── dataIO.js           # JSON export and schema-validated merge/replace import
├── components/
│   ├── heatmap.js          # Interactive contribution grid with stats row & roving tabindex
│   ├── dayView.js          # Date header, progress bar, task list delegation & add form
│   ├── taskRow.js          # Individual task row with draft chip, now tag & inline confirm
│   ├── roulette.js         # Dialog modal with animated slot reel, confetti & WebAudio
│   ├── focusBar.js         # Sticky "Now doing" focus bar with elapsed timer
│   ├── banner.js           # Stacked, auto-dismissing toast notifications
│   ├── settings.js         # Settings modal (sound, vibrate, max rerolls, export, reset)
│   ├── help.js             # Keyboard shortcuts table modal
│   └── onboarding.js       # First-run 3-step introductory card
└── styles/
    ├── tokens.css          # Design tokens (palette, spacing, typography, radii, motion)
    ├── base.css            # Base reset, layout container, buttons, toasts & forced-colors
    ├── heatmap.css         # Heatmap card, grid layout, stats and tooltip styling
    ├── tasks.css           # Day view header grid, task rows, checkboxes, save bar
    ├── roulette.css        # Roulette modal, reel frame, confetti burst & focus bar
    └── dialogs.css         # Shared modal styling, toggles, shortcuts & onboarding
```

### Key Design Principles:
1. **DOM Safety**: Elements are built exclusively using `document.createElement`, `textContent`, and safe DOM APIs (`el()`, `frag()`). `innerHTML` is never used.
2. **Batching**: DOM mutations are batched using `requestAnimationFrame`, and non-critical operations are deferred using `requestIdleCallback`.
3. **Local Date Safety**: Dates are represented as `YYYY-MM-DD` strings derived from local calendar midnight (`getFullYear()`, `getMonth()`, `getDate()`), never `toISOString()` which causes timezone slippage.

---

## Development & Build

### Prerequisites
- Node.js 18+ (tested on Node 20 LTS and 22)
- npm 9+

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local Vite development server
npm run dev

# 3. Run automated Vitest test suite
npm test

# 4. Compile optimized production build
npm run build

# 5. Preview production build locally
npm run preview
```

---

## Deployment Guide

TaskHeat uses hash-based client routing (`#/YYYY-MM-DD`), making it 100% compatible with static hosting without needing complex URL rewrite engines.

### Cloudflare Pages (Primary)
1. Link your repository in Cloudflare Pages.
2. Set Build command: `npm run build`
3. Set Build output directory: `dist`
4. The included `public/_headers` file is automatically deployed to configure strict CSP, anti-clickjacking headers, and long immutable caching for hashed assets.

### Netlify
1. Create a new site from Git in Netlify.
2. The included `netlify.toml` automatically configures the build command (`npm run build`), publish directory (`dist`), and security/caching headers.

### Vercel
1. Import your Git repository into Vercel.
2. The included `vercel.json` automatically supplies security headers and asset caching directives.

---

## Data & Privacy Statement

- **Zero Accounts**: No registration, no login, no passwords.
- **Zero Tracking**: No Google Analytics, no telemetry, no tracking pixels.
- **Zero Third-Party Requests**: The app executes entirely from static assets cached on your device.
- **Local Storage**: All tasks, streak statistics, and preferences are saved exclusively in your browser's `localStorage`. Clearing your browser storage clears the app. Use the **Export JSON** feature in Settings to maintain external backups.

---

## License

Released under the [MIT License](LICENSE).
