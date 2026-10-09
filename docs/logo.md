# Project Management — Logo

The app mark is a compact three-bar Gantt glyph. Each bar starts at the same left edge and
runs progressively longer downward, reading as a schedule moving forward. A single teal dot
sits at the end of the second bar — the milestone/finish accent. Bars use `currentColor`, so
the mark inherits its surroundings; the dot is the only fixed color (`#12B3A3`).

Why this shape:

- Three staggered bars say "timeline" without becoming a literal chart screenshot.
- Everything is axis-aligned rectangles plus one circle, so it stays legible at 16px.
- One accent only. Bars follow text color; the dot marks the milestone. No gradients,
  shadows, or second accent.

## Files

| File | Use |
|------|-----|
| `frontend/public/logo-mark.svg` | Square mark (32×32). Avatars, brand chip, app icons. |
| `frontend/public/logo.svg` | Horizontal lockup: mark + "Project Management" wordmark. |
| `frontend/public/favicon.svg` | Browser tab icon. Same mark, transparent background. |
| `frontend/src/components/Logo.tsx` | `LogoMark` / `LogoLockup` React components. |

## Component usage

```tsx
import { LogoMark, LogoLockup } from '../../components/Logo';

<LogoMark size={30} />
<LogoLockup size={24} />
```

`size` sets both width and height (default 24). `className` passes through to the `<svg>`.
The lockup renders the mark plus a `<span className="font-semibold tracking-tight">`; its
color is inherited, so set text color on the wrapper.

## Usage rules

- On light surfaces: bars `#0F172A` (set `color`), dot `#12B3A3`.
- On dark surfaces: set `color:#FFFFFF`; the dot is unchanged.
- Minimum size: 16px square. Below that, the bars merge — use a simplified cut.
- Clear space: one bar height (~4px at 32px) on all sides.
- Never recolor the dot away from `#12B3A3`, add a second accent, or stretch the mark.
