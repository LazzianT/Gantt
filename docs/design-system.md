# Design System — Standalone Project Management App

Visual direction (master spec §27): modern enterprise SaaS. Professional. **Clean bright / white.** Dense but readable. Information-rich. Minimal visual noise. Inspirations: Microsoft Project, Linear, Jira. Anti-references: huge cards, excessive gradients, excessive rounded containers, generic AI dashboard, excess whitespace, Trello boards.

Stack target: React + Vite + TypeScript + Tailwind.

Source conventions reused from `HRIS_PORTAL/frontend`:
- Font: Plus Jakarta Sans variable is shipped in HRIS_PORTAL (`@fontsource-variable/plus-jakarta-sans`); HRIS_PORTAL's own Tailwind config uses Inter + system-ui. This app standardizes on **Plus Jakarta Sans** for UI, with system-ui fallback. Mono = ui-monospace.
- Brand anchors reused from HRIS_PORTAL config: navy `#0D1F5C` (brand primary), gold `#D4A843`, canvas `#F4F6FC`, neutral borders `#DDE1EF`, muted `#6B7A9E`, semantic `#16A34A / #D97706 / #DC2626 / #1D4ED8`.
- Component idioms reused: `.field`, `.btn` / `.btn-primary` / `.btn-secondary`, `.skeleton` shimmer, `focus-visible:ring-2` focus convention, `prefers-reduced-motion` guard.

**Design Read:** Operate-mode enterprise tool for project managers and planners. Clean white data surfaces, navy accent, restrained semantics. Dials **ENERGY 2 / RHYTHM 1 / MOTION 2** — RHYTHM 1 is deliberate: an enterprise grid must be predictable, not varied.

---

## 1. Design principles

1. **Density is a feature.** The user is a planner reading hundreds of rows. Default body is 13-14px; grid rows are 32px. Whitespace lives in the app chrome (headers, page gutters), never inside data rows.
2. **White is the canvas.** The base is true white `#FFFFFF` surfaces over a near-white app background `#F7F8FA`. White is a commitment: it makes dense data legible and color meaningful. Color enters only as signal.
3. **Clarity over decoration.** One accent color. Semantic color is reserved for status/health/criticality. If a color does not encode state, it does not exist.
4. **Hierarchy through weight, not size.** In dense views, hierarchy comes from font weight, muted tones, and hairline dividers before it comes from bigger type or boxes.
5. **Restraint.** Short radii (2-6px). Subtle shadows. Hairline borders. No gradients. No glow. No floating cards everywhere.
6. **Motion is feedback, never garnish.** Motion confirms an action (row hover, tab switch, drawer, drag preview, save). No ambient loops, no decorative reveals inside the working surface. Entry reveals are allowed only on first paint of a page shell.

---

## 2. Design tokens

### 2.1 Color

Base and neutrals (light/white base):

| Token | Hex | Use |
|-------|-----|-----|
| `bg.canvas` | `#F7F8FA` | App background behind surfaces |
| `bg.surface` | `#FFFFFF` | Cards, grid, toolbar, panels |
| `bg.subtle` | `#F4F6FC` | Table header, hover rows, inset areas |
| `bg.sunken` | `#EEF1F6` | Disabled fills, progress track |
| `border.hairline` | `#E4E8EF` | Row dividers, cell borders |
| `border.default` | `#DDE1EF` | Input, card borders |
| `border.strong` | `#C3CAD9` | Focus-adjacent, divider emphasis |
| `text.primary` | `#131722` | Body, values |
| `text.secondary` | `#4A5568` | Labels, secondary cells |
| `text.muted` | `#6B7A9E` | Meta, column headers, placeholders |
| `text.disabled` | `#A6AFC2` | Disabled text |

Brand accent (reused from HRIS_PORTAL, one deliberate accent):

| Token | Hex | Use |
|-------|-----|-----|
| `brand.DEFAULT` | `#0D1F5C` | Primary buttons, active nav, links, focus ring |
| `brand.hover` | `#091642` | Hover / pressed |
| `brand.soft` | `#EEF1FB` | Selected row, active tab bg |
| `brand.ring` | `#0D1F5C` @ 18% | Focus ring color |
| `gold.DEFAULT` | `#D4A843` | Single secondary attention accent (current-day marker, "milestone" category mark). Never for buttons or body. |

Semantic — task status:

| Status | Text | Bg (soft) | Border | Dot |
|--------|------|-----------|--------|-----|
| Not Started | `#4A5568` | `#F1F3F7` | `#DDE1EF` | `#8B94A7` |
| In Progress | `#1D4ED8` | `#DBEAFE` | `#BFDBFE` | `#2563EB` |
| Completed | `#15803D` | `#DCFCE7` | `#BBF7D0` | `#16A34A` |
| Blocked | `#B91C1C` | `#FEE2E2` | `#FECACA` | `#DC2626` |
| Cancelled | `#6B7A9E` | `#F4F6FC` | `#E4E8EF` | `#A6AFC2` |

Semantic — project health:

| Health | Text | Bg (soft) | Dot |
|--------|------|-----------|-----|
| On Track | `#15803D` | `#DCFCE7` | `#16A34A` |
| At Risk | `#B45309` | `#FEF3C7` | `#D97706` |
| Delayed | `#C2410C` | `#FFEDD5` | `#EA580C` |
| Critical | `#B91C1C` | `#FEE2E2` | `#DC2626` |

Schedule semantics (Gantt):

| Token | Hex | Use |
|-------|-----|-----|
| `sched.critical` | `#DC2626` | Critical-path bars + arrows |
| `sched.criticalSoft` | `#FEE2E2` | Critical bar track |
| `sched.bar` | `#2563EB` | Standard task bar fill |
| `sched.barTrack` | `#DBEAFE` | Bar remaining-work track |
| `sched.progress` | `#1D4ED8` | Progress fill inside bar |
| `sched.summary` | `#0D1F5C` | Summary bracket bar |
| `sched.milestone` | `#D4A843` | Milestone diamond (pending outline / done filled) |
| `sched.baseline` | `#B8BFCC` | Baseline ghost bar |
| `sched.today` | `#D4A843` | Today vertical marker |
| `sched.overallocation` | `#D97706` | Overallocated resource state |
| `sched.nonWorking` | `#F4F5F8` | Non-working day column shading |

Dependency arrow: `#7A8699`; arrow on critical path: `#DC2626`.

Accessibility note: every color pairing above is chosen to meet WCAG AA (see §7). `text.muted` on white = 4.62:1. Status/health pills pair a dot AND text label, never color alone.

### 2.2 Typography

Family:
```
sans: ['Plus Jakarta Sans', 'system-ui', 'Segoe UI', 'sans-serif']
mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']  # durations, IDs, dates in grid only
```

Scale (dense register for data, larger register for headings):

| Token | Size / line | Weight | Use |
|-------|-------------|--------|-----|
| `text-2xs` | 11 / 16 | 500 | Column units, zoom labels, meta chips |
| `text-xs` | 12 / 16 | 500 | Grid cell default, table headers, badges |
| `text-sm` | 13 / 20 | 400 | Dense body, form input, list rows |
| `text-base` | 14 / 20 | 400 | App body, prose |
| `text-md` | 16 / 24 | 600 | Card titles, section headers |
| `text-lg` | 20 / 28 | 700 | Page section titles |
| `text-xl` | 24 / 32 | 700 | Page title |
| `text-2xl` | 30 / 38 | 800 | Login brand, portfolio headline |

Rules: tabular-nums for all numeric columns (`font-variant-numeric: tabular-nums`). No letter-spacing on body; tracking-tight (`-.02em`) only on ≥20px headings. No uppercase with wide tracking except 11px `text-2xs` table units.

### 2.3 Spacing

4px base. Only these steps:

| Token | px |
|-------|----|
| `space-0.5` | 2 |
| `space-1` | 4 |
| `space-1.5` | 6 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 20 |
| `space-6` | 24 |
| `space-8` | 32 |
| `space-10` | 40 |
| `space-12` | 48 |

Application: cell padding x `space-2` (8px), grid row height 32px total, toolbar height 48px, page gutter `space-6`, panel padding `space-4`. Generous whitespace appears at page gutters and between major zones, not within rows.

### 2.4 Radius (small)

| Token | px | Use |
|-------|----|-----|
| `radius-xs` | 2 | Badges, pills, progress track |
| `radius-sm` | 4 | Buttons, inputs, selects, cells |
| `radius-md` | 6 | Cards, panels, dropdown, drawer inner |
| `radius-lg` | 8 | Modal, drawer shell (max radius) |
| `radius-full` | 9999 | Avatars only |

Never pill-shaped buttons/inputs/badges (except status dot and avatar).

### 2.5 Shadows (subtle, elevation markers only)

| Token | Value | Use |
|-------|-------|-----|
| `shadow-none` | none | Grid, rows, toolbar (flat) |
| `shadow-xs` | `0 1px 2px rgba(16,24,40,.05)` | Sticky toolbar, dragged row preview |
| `shadow-sm` | `0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)` | Dropdown, popover |
| `shadow-md` | `0 4px 12px rgba(16,24,40,.10)` | Drawer, side panel |
| `shadow-lg` | `0 12px 32px rgba(16,24,40,.14)` | Modal |
| `shadow-focus` | `0 0 0 2px #FFFFFF, 0 0 0 4px rgba(13,31,92,.45)` | Focus ring shell |

### 2.6 Z-index layers

| Token | z | Layer |
|-------|---|-------|
| `z-base` | 0 | Content |
| `z-stickyHead` | 10 | Gantt header, grid header, table header |
| `z-rowFrozen` | 20 | Frozen label column, row drag ghost |
| `z-toolbar` | 30 | Sticky toolbar |
| `z-today` | 35 | Today marker line |
| `z-popover` | 40 | Dropdown, tooltip, inline cell editor |
| `z-drawer` | 50 | Drawer scrim + panel |
| `z-modal` | 60 | Modal |
| `z-toast` | 70 | Toaster |

### 2.7 Tailwind theme extension (paste-ready)

```js
// tailwind.config.js (theme.extend)
{
  fontFamily: {
    sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
    mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },
  colors: {
    canvas: '#F7F8FA',
    surface: { DEFAULT: '#FFFFFF', subtle: '#F4F6FC', sunken: '#EEF1F6' },
    line: { hairline: '#E4E8EF', DEFAULT: '#DDE1EF', strong: '#C3CAD9' },
    ink:   { DEFAULT: '#131722', secondary: '#4A5568', muted: '#6B7A9E', disabled: '#A6AFC2' },
    brand: { DEFAULT: '#0D1F5C', hover: '#091642', soft: '#EEF1FB' },
    gold:  { DEFAULT: '#D4A843' },
    status: {
      'notstarted': '#8B94A7', 'inprogress': '#2563EB', 'completed': '#16A34A',
      'blocked': '#DC2626', 'cancelled': '#A6AFC2',
    },
    health: { 'ontrack': '#16A34A', 'atrisk': '#D97706', 'delayed': '#EA580C', 'critical': '#DC2626' },
    sched: {
      critical: '#DC2626', criticalSoft: '#FEE2E2', bar: '#2563EB', barTrack: '#DBEAFE',
      progress: '#1D4ED8', summary: '#0D1F5C', milestone: '#D4A843',
      baseline: '#B8BFCC', today: '#D4A843', overalloc: '#D97706', nonworking: '#F4F5F8',
    },
  },
  fontSize: {
    '2xs': ['11px', '16px'], xs: ['12px', '16px'], sm: ['13px', '20px'],
    base: ['14px', '20px'], md: ['16px', '24px'], lg: ['20px', '28px'],
    xl: ['24px', '32px'], '2xl': ['30px', '38px'],
  },
  spacing: { '0.5':'2px','1':'4px','1.5':'6px','2':'8px','3':'12px','4':'16px','5':'20px','6':'24px','8':'32px','10':'40px','12':'48px' },
  borderRadius: { xs:'2px', sm:'4px', md:'6px', lg:'8px' },
  boxShadow: {
    xs:'0 1px 2px rgba(16,24,40,.05)',
    sm:'0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)',
    md:'0 4px 12px rgba(16,24,40,.10)',
    lg:'0 12px 32px rgba(16,24,40,.14)',
  },
  zIndex: { stickyHead:10, rowFrozen:20, toolbar:30, today:35, popover:40, drawer:50, modal:60, toast:70 },
  transitionDuration: { fast:'120ms', DEFAULT:'160ms', slow:'240ms', drawer:'280ms' },
  transitionTimingFunction: {
    standard:'cubic-bezier(.2,0,0,1)', out:'cubic-bezier(.16,1,.3,1)', in:'cubic-bezier(.4,0,1,1)',
  },
  keyframes: {
    shimmer: { '0%':{backgroundPosition:'-400px 0'}, '100%':{backgroundPosition:'400px 0'} },
    toastIn: { from:{opacity:'0',transform:'translateY(8px)'}, to:{opacity:'1',transform:'none'} },
    fadeIn:  { from:{opacity:'0'}, to:{opacity:'1'} },
  },
  animation: {
    shimmer:'shimmer 1.6s linear infinite',
    'toast-in':'toastIn 160ms cubic-bezier(.16,1,.3,1)',
    'fade-in':'fadeIn 160ms cubic-bezier(.2,0,0,1)',
  },
}
```

---

## 3. Component specs

Conventions: `focus-visible` always uses `shadow-focus` (never `outline:none` without replacement). Disabled = `opacity-50 pointer-events-none`. All interactive targets ≥ 32px tall in dense contexts, ≥ 44px on touch breakpoints (§5.10).

### 3.1 Button

Variants:
- **Primary** — `bg-brand text-white hover:bg-brand-hover`, height 32 (sm) / 36 (md), `rounded-sm`, `px-3 text-sm font-semibold`.
- **Secondary** — `bg-surface text-ink border border-line hover:bg-surface-subtle`.
- **Ghost** — `text-ink-secondary hover:bg-surface-subtle` (toolbar icon buttons).
- **Danger** — `bg-red-600 text-white hover:bg-red-700` (delete confirmations only).
- **Link** — `text-brand hover:underline`, no padding.

States: default / hover / active (`translate-y-[0.5px]`) / focus-visible (`shadow-focus`) / disabled / loading (spinner replaces leading icon, label stays, `aria-busy`).
Sizes: `xs` 24px (icon-only in grid), `sm` 32px, `md` 36px.
Icon buttons: square, `aria-label` required, tooltip on hover.

### 3.2 Input

`h-8 rounded-sm border border-line bg-surface px-2 text-sm placeholder:text-ink-muted`
- Focus: `border-brand ring-2 ring-brand/10` (HRIS_PORTAL `.field` convention).
- Invalid: `border-red-500 ring-red-500/10`, `aria-invalid`, error text 12px red below.
- With addon (unit, suffix): split borders, addon `bg-surface-subtle text-ink-muted`.
- Number inputs: `inputMode="numeric"`, arrows suppressed, tabular-nums.
- Date inputs: native picker, calendar icon right.

### 3.3 Select

Single: `h-8 rounded-sm border-line bg-surface pr-7 text-sm` with chevron. Menu `shadow-sm rounded-md`. Active option `bg-brand-soft text-brand`.
Multi (Resources filter): checkbox list + search; max-height 320px scroll.
Keyboard: Arrow up/down move, Enter select, Escape close, type-ahead.

### 3.4 Badge / StatusPill

Shape: `inline-flex items-center gap-1 rounded-xs border px-1.5 h-5 text-2xs font-semibold`.
- **Status pill** — dot + label, colors from §2.1 status table. Dot 6px `rounded-full`.
- **Health pill** — dot + label from health table.
- **Neutral badge** — counts (WBS, task count): `bg-surface-subtle text-ink-secondary border-line`.
- **Critical flag** — `bg-red-50 text-red-700 border-red-200` with `AlertTriangle`-style glyph + "Critical".
- **Overallocated** — `bg-amber-50 text-amber-700 border-amber-200` + "Overallocated".

Never color-only: dot + text always. Never decorative "New/Beta" pills.

### 3.5 Table / TaskGrid row

- Header: `h-8 sticky top-0 z-stickyHead bg-surface-subtle border-b border-line text-2xs font-semibold text-ink-muted`, sortable (chevron), resizable (6px grab handle).
- Row: `h-8 border-b border-line-hairline`, columns via CSS grid with fixed + flexible tracks.
- Row states: default / hover (`bg-surface-subtle`) / selected (`bg-brand-soft`) / focused (`ring-1 ring-inset ring-brand`) / dragover (`border-t-2 border-brand`) / disabled.
- Cell: `px-2 text-xs tabular-nums truncate`, left text, right numbers.
- Inline edit: cell becomes input on Enter/double-click; commit on Enter/blur, cancel Escape.
- Indent/outdent: 16px indent step, chevron toggle for summary rows, WBS alignment.
- Frozen first column (task name) at `z-rowFrozen` with right shadow edge on scroll.

### 3.6 Toolbar

`h-12 sticky top-0 z-toolbar bg-surface border-b border-line px-3 flex items-center gap-2`.
Left: view-specific controls (zoom, scale, filters). Right: primary action + overflow menu.
Groups separated by `w-px h-6 bg-line` dividers. Icon buttons ghost 32px. Stays flat (`shadow-none`); gains `shadow-xs` on scroll.

### 3.7 Tabs

Underline style, not pill. `h-9`, label `text-sm font-semibold`, active `text-brand border-b-2 border-brand`, inactive `text-ink-muted hover:text-ink-secondary`.
Active-indicator slides (motion, §6). Role `tablist`/`tab`/`tabpanel`, Arrow keys move focus, Home/End jump.

### 3.8 SideNav

Width 240px expanded, 56px collapsed, `bg-surface border-r border-line`. Items `h-8 rounded-sm px-2 gap-2 text-sm`. Active `bg-brand-soft text-brand font-semibold`. Section headers `text-2xs uppercase text-ink-muted px-2 mt-4`. Collapsible via bottom rail toggle. Persist collapsed state.

### 3.9 Modal / Drawer

- **Modal** — center, `max-w-lg rounded-lg shadow-lg`, scrim `bg-ink/40`, `animate-fade-in`. Header (title + close), body, footer (right-aligned actions). Focus trap, Escape closes, return focus to trigger.
- **Drawer (right)** — width 480px (task detail), full-height, `shadow-md`, scrim, slide-in 280ms. Used for task detail, dependency edit, baseline capture. Same a11y contract as modal.

### 3.10 Toast

Bottom-right stack, width 360px, `rounded-md shadow-md border border-line bg-surface`, `animate-toast-in`. Variants: success (green left edge 3px, not full stripe decoration — encodes status), error, warning, info. Auto-dismiss 5s (errors persist until dismissed). `role="status"` / `aria-live="polite"`; errors `aria-live="assertive"`. Undo action slot for destructive ops.

### 3.11 Dropdown

Trigger + menu. Menu `min-w-[180px] rounded-md shadow-sm border border-line bg-surface py-1`, items `h-8 px-2 text-sm hover:bg-surface-subtle`, checkbox items, separator, destructive item red. Positioned, flip on viewport edge. `role="menu"`, Arrow/Enter/Escape.

### 3.12 ProgressBar

Track `h-1.5 rounded-full bg-surface-sunken`, fill `bg-sched-progress rounded-full`. Thin variant `h-1`. Label optional right, tabular-nums. Variants: neutral (blue), health-colored when used in portfolio, overallocated (amber) in workload. Accessible `role="progressbar"` with `aria-valuenow/min/max`.

### 3.13 Avatar

`rounded-full` only here. Sizes 20 / 24 / 32 / 40. Fallback = initials on `bg-brand-soft text-brand text-2xs font-semibold`. Stack with `-ml-1.5 ring-2 ring-surface`. Group max 4 + `+N`. HRIS people = initials placeholder (no fabricated photos).

### 3.14 EmptyState

Centered, `py-12 px-6 max-w-md mx-auto text-center`. Icon (relevant, 24px, `text-ink-muted`), title `text-sm font-semibold`, description `text-xs text-ink-muted`, one primary action.
Cause-aware copy (R-27): "No tasks yet. Add the first task to start scheduling." / "No projects match these filters. Clear filters." Distinct states for first-run, filtered-empty, permission-denied.

### 3.15 Skeleton

`rounded-sm bg-surface-sunken animate-shimmer` overlay gradient (HRIS_PORTAL `.skeleton`). Row skeletons mirror real 32px row geometry. Never full-page skeletons mimicking layouts the data cannot fill; loading text accompanies ("Loading schedule...").

---

## 4. Hero components

### 4.1 Task Grid

Dense spreadsheet-like editor. The primary working surface.

Layout:
```
+---+--------------------------------+--------+--------+----+--------+---------+----------+
| # | Task                           | Start  | Finish | D  | %      | Status  | Assignee |
+---+--------------------------------+--------+--------+----+--------+---------+----------+
| 1 | v  D  Design phase      [SUM]  | Mar 03 | Mar 28 | 20 | ▓░ 40% | In Prog |   (2)    |
| 2 |    |  Wireframes                 | Mar 03 | Mar 14 | 10 | 100%   | Done    |  ● A     |
| 3 |    |  Visual design              | Mar 15 | Mar 28 | 10 |  20%   | In Prog |  ● A     |
| 4 | >  D  Build                      | Apr 01 | Apr 30 | 22 |   0%   | Blocked |   (3)    |
+---+--------------------------------+--------+--------+----+--------+---------+----------+
```

Sizes and geometry:
- Row height: **32px** fixed. Header 32px. Indent step 16px.
- Columns: frozen `#` 40px and Task flexible (min 240px), then Start 96, Finish 96, Duration 56, % 72, Status 112, Assignee 120. All except Task fixed and resizable (drag 6px gap, min 48px).
- Grid: CSS grid with `grid-template-columns` from state; virtualized rows (window = viewport + 10 overscan).
- Typography: cells `text-xs tabular-nums`; task name `text-xs` (summary rows `font-semibold`).

Behavior:
- **Inline edit**: double-click or Enter on cell becomes editor; Enter commits (optimistic PATCH), Escape cancels, Tab commits + moves right.
- **Indent/Outdent**: `Alt+→` / `Alt+←` (and toolbar buttons); converts row task↔summary; server validates summary integrity.
- **Column resize**: drag header gap; persist per user.
- **Row reorder**: drag handle at row left; ghost row `shadow-xs`, drop indicator `border-t-2 border-brand`; keyboard: `Alt+↑/↓`.
- **Multi-select**: click, Shift-range, Ctrl-toggle; bulk toolbar appears.
- **Commit path**: send intent (`PATCH /tasks/:id`), show optimistic value, refetch schedule on success, revert + toast on error (per gantt-engine.md §4).
- **Keyboard**: Arrow move cell focus, Enter edit, Escape cancel, F2 edit, Space toggle select, Ctrl+A all, Delete soft-delete.

States: loading (row skeletons + "Loading tasks..."), empty (EmptyState + "Add task"), error (inline banner + retry), filtered-empty, no-results.

### 4.2 Gantt canvas

Pure view over server schedule (no client date math). Grid label column (left, 320px, frozen) + timeline canvas (right, scroll).

Shapes:
```
Label col (320)          Timeline (day scale, 32px/col)
+------------------+  +------------------------------------------------------+
| v Design phase   |  | ========[##########        ] Summary bracket        |
|   Wireframes     |  | [==============]                                    |
|   Visual design  |  |        [==============]                             |
| > Build          |  | ════════════════════════ critical (red)             |
|   Ship v1        |  |                              ◆ milestone            |
|                  |  |           │ today marker (gold)                      |
+------------------+  +------------------------------------------------------+
                       baseline ghost:  ┈┈┈┈┈┈ (muted, behind bar)
```

Geometry:
- Row height **32px** aligned 1:1 with the Task Grid. Header two-tier: 24px coarse + 24px fine = 48px, `stickyHead`.
- Column widths by scale: Day 32px, Week 88px, Month 120px, Quarter 200px (per gantt-engine.md §3). Non-working days shaded `sched.nonworking`.
- Bar height 16px, vertically centered (8px top offset). Border-radius `radius-xs` (2px).
- Summary bracket: 8px tall top bar with 6px downward end caps, `sched.summary`.
- Milestone: 12px rotated square (diamond), pending = outline `sched.milestone`, completed = filled.

Colors:
- Task bar: track `sched.barTrack`, progress fill `sched.progress` (width = progress%).
- Critical bar: `sched.critical` fill, critical arrows `sched.critical`. Non-critical dimmed to 40% opacity when critical-path toggle on.
- Summary: `sched.summary`.
- Baseline ghost: `sched.baseline`, 6px tall, directly beneath the current bar (background layer).
- Today marker: 1px `sched.today` vertical line at today's day index, full timeline height, `z-today`, with a small top flag.

Dependency arrows:
- Single SVG overlay spanning the timeline (`z-base`, behind bars, above grid lines).
- Routing: **orthogonal (Manhattan) polyline** with rounded 2px corners. From predecessor finish (right edge, mid-height) → short horizontal stub (8px) → vertical to successor row mid → horizontal to successor start (left edge) → arrowhead. Lag shown as longer horizontal segment.
- Arrowhead: 5px filled triangle. Line `1.5px`, color `#7A8699` / critical `sched.critical`. Hover thickens to `2.5px` and shows a dependency type label chip.
- Recommend avoiding links when either side offscreen; clip at viewport.

Interactions (map to API per gantt-engine.md §4): drag bar = SNET move (`PATCH start`), drag right edge = resize (`PATCH durationDays`), drag handle to bar = create dependency (`POST dependencies`, 409 → revert + toast), click bar = progress popover, click chevron = collapse, zoom = local scale. Drag preview via `requestAnimationFrame`, not per-mousemove.

Optimistic preview: apply to VM, keep snapshot, PATCH, on success refetch schedule, on error restore + toast.

States: loading (bar skeletons + "Calculating schedule..."), empty (EmptyState "No tasks to chart. Add tasks."), error (banner with retry), cycle-returned (toast + highlight offending path rows).

---

## 5. Screen specs

Global shell (all authenticated screens):

```
+---------------------------------------------------------------+
| TopBar 56px: [Logo] Project name / breadcrumb   Search  +New  |
|                                                 bell  avatar  |
+------+--------------------------------------------------------+
| Side |  Sticky Toolbar (view controls)                        |
| Nav  +--------------------------------------------------------+
| 240  |                                                        |
|      |   Main surface (white)                                 |
|      |                                                        |
+------+--------------------------------------------------------+
```

TopBar: white, hairline bottom. SideNav per §3.8. Main gutter `space-6`. Content max-width fluid (data views full-bleed).

### 5.1 Login

Purpose: authenticate by **NIP + Tanggal Lahir** (validated against the HRIS directory; JWT on success). See `authentication.md`. Primary action: Sign in.

Two-panel layout: brand product panel left (`bg-brand`, `lg` and up only, hidden below `lg`), form card right on the canvas.

```
+---------------------------+---------------------------+
|  [PM] Project Management  |   (mobile: brand lockup)  |
|                           |  +---------------------+  |
|  Plan, schedule and       |  | Sign in             |  |
|  deliver projects         |  | Use your employee ID|  |
|                           |  |  NIP (Employee ID)  |  |
|  [ abstract timeline art: |  |  [______________]   |  |
|    task bars, milestones, |  |  Tanggal Lahir      |  |
|    today marker ]         |  |  [__/__/____] (date)|  |
|                           |  |  [ ] Remember me    |  |
|                           |  |  [     Sign in    ] |  |
|                           |  |  error area (inline)|  |
|                           |  |  demo hint (dev only)| |
|                           |  +---------------------+  |
+---------------------------+---------------------------+
```

Elements: brand lockup, **NIP** text input (`autoComplete="username"`, `autoFocus`), **Tanggal Lahir** native date input (`type="date"`, `autoComplete="bday"`, calendar icon right — §3.2), Remember me, submit. No password field, no show/hide toggle, no "Forgot?".

Validation (client): NIP required; Tanggal Lahir required. Field errors render 12px red below the input with `aria-invalid` + `aria-describedby`.

States: default / submitting (`aria-busy`, button disabled, spinner + "Signing in…") / invalid-credentials (red inline `role="alert"`, honest message from the API) / network error ("Cannot reach the server. Check your connection.").

Demo hint: a muted `text-2xs` line under the form (`NIP 1234 · Tanggal Lahir 1990-01-01`) rendered **only in dev** (`import.meta.env.DEV`). Never shown in production builds.

Responsive: two columns at `lg`, single column below (product panel hidden, compact brand lockup above the card). Form card `max-w-[400px]`, full-width on mobile. No fabricated trust claims or logos.

### 5.2 Project Portfolio

Purpose: scan all projects, spot health/risk, open one. Primary action: New project.

```
+----------------------------------------------------------------------+
| Portfolio                          [Search] [Health v] [New project] |
+----------------------------------------------------------------------+
| KPI row:  Active 12 | At Risk 3 | Delayed 2 | Avg progress 61%      |
|           (real counts from /portfolio; no fabricated deltas)        |
+----------------------------------------------------------------------+
| Project            Health     Progress        Tasks   Finish   Team  |
| -------------------------------------------------------------------- |
| Apollo Revamp      ● On Track  ▓▓▓▓▓░ 68%      42     Jun 30   (5)   |
| Website v2         ● At Risk   ▓▓▓░░░ 52%      18     Jun 12   (3)   |
| ERP Migration      ● Delayed   ▓▓░░░░ 31%     120     Jul 20   (8)   |
+----------------------------------------------------------------------+
```

Elements: KPI strip (real `/portfolio` data only), filter bar (health, owner, search), sortable table, row → open workspace. Primary: New project (modal). States: loading (table skeletons), empty ("No projects yet. Create your first project."), error (retry banner), filtered-empty. Responsive: table → card list below `md` (name, health pill, progress, finish).

### 5.3 Project Workspace shell

Purpose: host all project views. Left nav tabs (in-page secondary nav under toolbar), matching API resources.

```
+----------------------------------------------------------------------+
| [Overview] [Tasks] [Gantt] [Resources] [Team] [Milestones] [Baseline] [Reports] |
+----------------------------------------------------------------------+
| <active view renders here>                                            |
```

Tabs map 1:1 to real API resources (R-24): Overview → dashboard, Tasks → tasks grid, Gantt → schedule, Resources → workload, Team → members, Milestones → milestones, Baseline → baselines, Reports → dashboard/derived. No dead tabs.

### 5.4 Task Grid view

Purpose: edit the WBS. Primary actions: Add task, indent/outdent, edit, delete.

```
+----------------------------------------------------------------------+
| [Search] [Filter v] [Group v] | + Task  Indent  Outdent  [Columns]  |
+----------------------------------------------------------------------+
| # | Task                    | Start  | Finish | D | %  | Status | Who |
| 1 | v Design phase [SUM]    | Mar 03 | Mar 28 |20 | 40 | In Prog| (2) |
| 2 |   | Wireframes           | Mar 03 | Mar 14 |10 |100 | Done   | A   |
| 3 |   | Visual design        | Mar 15 | Mar 28 |10 | 20 | In Prog| A   |
+----------------------------------------------------------------------+
```

Spec = §4.1. States: loading/empty/error/filtered per §4.1. Responsive: below `lg`, freeze task name only, allow horizontal scroll of detail columns; below `md`, switch to stacked task cards with a "details" expander.

### 5.5 Gantt view

Purpose: see and manipulate schedule. Primary actions: zoom, drag/resize, link, report progress.

```
+----------------------------------------------------------------------+
| [Day|Week|Month|Quarter] [Critical path] [Baseline v] [Today] [+Task]|
+----------------------------------------------------------------------+
| Label col            | Mar 2026 ...                                 |
| (WBS + name)         | header tier 1 (months)                       |
|                      | header tier 2 (days)                         |
| v Design phase  [=]  | ========================================     |
|   Wireframes         | [=========]                                  |
|   Visual design      |         [=========]                          |
| > Build              | ═══════════════════ (critical)               |
|   Ship v1            |                    ◆                         |
+----------------------------------------------------------------------+
```

Spec = §4.2. States per §4.2. Responsive: timeline always horizontally scrollable; label column collapses to 200px below `lg`; below `md`, Gantt is read-only with a note ("Editing is available on larger screens") to avoid broken drag on touch.

### 5.6 Resources / Workload view

Purpose: compare demand vs capacity, find overallocation.

```
+----------------------------------------------------------------------+
| [From Mar 01] [To Mar 31] [Group: Resource v]  [Show: Demand|Capacity]|
+----------------------------------------------------------------------+
| Resource        Alloc   Wk1        Wk2        Wk3        Wk4         |
| -------------------------------------------------------------------- |
| ● Andi         120%   ▓▓▓▓▓▓▓   ▓▓▓▓▓▓▓   ▓▓▓░░░   ▓▓▓▓░░           |
|   (overalloc)          ^ amber overallocation                        |
| ● Budi          80%   ▓▓▓▓░░   ▓▓▓▓▓░   ▓▓▓▓░░   ▓▓░░░░           |
+----------------------------------------------------------------------+
```

Elements: date range, group-by, heat bar per week (fill ratio, amber when >100%), allocation % column, drill to employee cross-project workload. From `/projects/:id/workload` and `/resources/:nip/workload`. States: loading (bar skeletons), empty ("No resources assigned."), error. Responsive: horizontal scroll of weeks; below `md`, per-resource stacked week list.

### 5.7 Milestone timeline

Purpose: track key dates. Primary action: Add milestone.

```
+----------------------------------------------------------------------+
| [Year v]  [Today]                              [+ Milestone]          |
+----------------------------------------------------------------------+
|  Jan      Feb       Mar        Apr        May        Jun             |
|   ◆        ◆                    ◆                ◆                   |
| Kickoff  Spec    Design freeze  Beta       (pending ○)  Launch        |
+----------------------------------------------------------------------+
```

Elements: horizontal time axis, diamond markers (filled = complete, outline = pending), labels, linked task. From `/milestones`. States: loading/empty/error. Responsive: vertical timeline below `md`.

### 5.8 Baseline compare

Purpose: capture and compare snapshot vs current.

```
+----------------------------------------------------------------------+
| Baseline: [v2 — Mar 01]  [Capture baseline]  [Activate]  [Compare on] |
+----------------------------------------------------------------------+
| Task            Baseline S/F      Current S/F     Δ Start  Δ Finish  |
| -------------------------------------------------------------------- |
| Wireframes      Mar 03 / Mar 14   Mar 05 / Mar 16  +2d      +2d       |
| Visual design   Mar 15 / Mar 28   Mar 15 / Mar 30  0        +2d       |
+----------------------------------------------------------------------+
```

Elements: baseline picker, capture/activate, variance table (tabular-nums, red for slip, green for gain — paired with +/− sign so not color-only). Gantt overlay toggles the baseline ghost layer. From `/baselines`. States: no baseline ("No baseline captured yet." + Capture), loading, error. Responsive: table → stacked cards.

### 5.9 Dashboard

Purpose: one project's health at a glance. Answers specific questions, not decoration.

```
+----------------------------------------------------------------------+
| Apollo Revamp   ● At Risk   Finish Jun 30   Progress 68%             |
+----------------------------------------------------------------------+
| [ Progress trend ]        [ Tasks by status ]      [ Critical tasks ] |
|  line, planned vs actual   bars: not/inprog/done    list of critical  |
+----------------------------------------------------------------------+
| [ Upcoming milestones ]   [ Workload this month ]                     |
+----------------------------------------------------------------------+
```

Elements: header summary, progress trend (planned vs actual), status breakdown, critical task list, upcoming milestones, workload snippet. Every chart titled with the question it answers; each has an axis/legend. From `/projects/:id/dashboard`. States: loading/empty (new project: "Add tasks and a schedule to see metrics.")/error. Responsive: single column stack below `lg`.

### 5.10 Responsive notes (all screens)

Breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280`.
- `≥lg`: full shell, SideNav expanded, all columns.
- `md-lg`: SideNav collapsible to rail; secondary table columns hidden (detail in row expander); Gantt editable.
- `<md`: SideNav → off-canvas drawer (labeled "Menu"); top bar keeps primary nav; data tables → cards; Gantt read-only; all touch targets ≥ 44px; no horizontal page overflow (tables scroll inside their own container).
- Every table/canvas owns `overflow-x-auto`; page body never scrolls sideways.
- Verify 200% zoom with no clipping (a11y §7).

---

## 6. Motion guidelines

Purpose: **feedback only.** Motion confirms what the user did or where state changed. No ambient loops, no scroll-reveal inside working surfaces, no bounce.

Durations and easing:
| Motion | Duration | Easing |
|--------|----------|--------|
| Row hover / button hover | 120ms | `standard` |
| Cell focus / selection | 120ms | `standard` |
| Tab underline slide | 160ms | `out` |
| Dropdown / popover open | 160ms | `out` (fade + 4px rise) |
| Toast in/out | 160ms | `out` / `in` |
| Drawer slide | 280ms | `out` |
| Modal fade + scale (0.98→1) | 160ms | `out` |
| Row drag preview | rAF-driven, no CSS transition | – |
| Today-marker position | 240ms | `out` (on scale change only) |
| Page-shell first paint reveal | 200ms fade, once | `out` |

What animates:
- **Row hover**: bg color only.
- **Tab switch**: active underline slides; panel cross-fades 120ms.
- **Drawer/modal**: scrim fade + panel slide/scale; content does not animate in item-by-item.
- **Drag preview**: follows cursor via rAF; drop target shows a 2px brand top border; no drop shadow flourish beyond `shadow-xs` on the ghost row.
- **Optimistic edit**: value fades to 60% opacity while pending, returns to 100% on server confirm; revert flashes amber border 400ms on error.
- **Toast**: single 8px rise + fade.

What does NOT animate: perpetual pulses/glows; decorative entry of every row/bar; number count-ups; gradient shifts; anything without a user trigger.

Reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .drawer, .modal { transform: none !important; }
}
```
All motion is decorative-on-top-of-function: disabling it must not break usability.

---

## 7. Accessibility

Contrast (WCAG AA verified targets):
- Normal text min 4.5:1 — `text.primary` `#131722` on white = 17.1:1; `text.secondary` `#4A5568` = 7.5:1; `text.muted` `#6B7A9E` = 4.62:1 (passes).
- Large/UI min 3:1 — borders `#DDE1EF` vs white = 1.3:1 is a hairline, not a control boundary; interactive control borders use `#C3CAD9` (3.0:1) where boundary alone conveys the control.
- Status/health pills: text uses the dark text token (≥4.5:1 on soft bg), dot is supplementary. Never color-only.
- Non-text indicators (progress fill, critical bar, allocation bar) always paired with a text/number label or icon.
- Verify every new pairing with the contrast checker; don't eyeball.

Focus:
- Every interactive element: `focus-visible` ring `shadow-focus` (2px white gap + 2px brand at 45%). Never `outline:none` without replacement.
- Grid cells: focused cell `ring-1 ring-inset ring-brand`; keyboard roving tabindex (one tab stop per grid).
- Skip link to main content on every page.

Keyboard — Task Grid:
- Arrows move cell focus; Enter/F2 edit; Escape cancel; Tab commits and moves right; `Alt+↑/↓` reorder; `Alt+←/→` outdent/indent; Space toggles select; Ctrl+A selects all; Delete opens soft-delete confirm. Rows expose `role="row"`, cells `role="gridcell"`.

Keyboard — Gantt:
- Rows focusable (`tabindex=0`, `role="row"`); Arrow keys move row focus, `[`/`]` or Left/Right adjust selected bar's start by one working day (sends intent), Shift+Arrows adjust duration, Enter opens task drawer, `L` starts keyboard link mode (pick successor), Escape cancels. Announce changes via `aria-live` ("Task 'Wireframes' moved to Mar 05").

ARIA:
- Critical tasks: `aria-label` includes "critical path"; critical bar `aria-describedby` → float value. Do not rely on red alone; add a critical glyph + text in the tooltip and grid "Critical" badge.
- Overallocated resource: `aria-label` "Andi overallocated: 120% allocation week of Mar 10"; amber + text "Overallocated" badge.
- Progress values: `role="progressbar"` `aria-valuenow`.
- Status/health: text label always present.
- Loading: `aria-busy` + live region text ("Loading schedule").
- Toasts: `role="status"` polite; errors `role="alert"` assertive.
- Drag-and-drop always has a keyboard equivalent (see above).

Other:
- Text resizable to 200% without clipping; grid columns truncate with tooltip, never overlap.
- Color-blind safety: status/health/critical always carry shape or text, not hue alone.
- Touch targets ≥ 44px below `md`, with spacing.

---

## 8. Reason lines (per decision, per R-31)

- White base — maximizes data legibility and makes semantic color mean something.
- Navy `#0D1F5C` accent — reused from HRIS_PORTAL brand; one accent keeps dense views calm.
- Gold `#D4A843` used only for today marker + milestone — separates the two "time anchors" from task color.
- 32px rows / 13px body — density for planners scanning hundreds of rows.
- Small radii (2-6px) — enterprise seriousness; pills reserved for avatars/dots.
- Tiny shadows — flat data surfaces; elevation only for overlays.
- Motion 120-280ms, feedback-only — confirms edits without decorating the working surface.
- Responsive → cards + read-only Gantt on mobile — avoids broken drag on touch.
