# Motion

Every animated value in the chat surface is defined in this folder.

## The rule

Components import `useMotion()` and spread the preset they need. They do not write
`animationName`, `animationDuration`, `animationDelay`, `animationTimingFunction`,
`transition*`, or `@keyframes` themselves.

```tsx
import { useMotion } from '../../motion';

const SuggestionCard = ({ index }: { index: number }) => {
  const motion = useMotion();
  return <Card {...motion.enterStagger(index)} {...motion.interactive()} />;
};
```

An `animation*` or `transition*` prop anywhere outside `src/motion/` is a defect. It is the
one thing to look for when reviewing a component in this app.

## Why it exists

Nimbus publishes no motion token scale - its recipes inline `cubic-bezier(...)` values - so
without a shared module every component invents its own timing. The redesign adds a lot of
motion at once (staggered card entrances, drawer slides, the composer's centre-to-bottom
move, thinking and streaming indicators), and inconsistent timing between them is the kind of
thing that reads as "cheap" without anyone being able to say why.

## What is here

| File | What it holds |
|---|---|
| `tokens.ts` | The numbers: durations, easings, rise distance, stagger step. Keyframe names. |
| `presets.ts` | Pure functions returning style-prop objects: `enter`, `enterStagger`, `enterLarge`, `exit`, `drawerIn`, `fadeIn`, `spin`, `pulse`, `caret`, `interactive`, `tint`. |
| `use-motion.ts` | `useMotion()` - the presets with reduced motion already applied. **Use this.** |
| `use-reduced-motion.ts` | Tracks `prefers-reduced-motion`. |
| `use-flip-transition.ts` | Animates one element between two layout positions. Used by the composer. |

## Keyframes

No `@keyframes` is declared in this codebase. `fade-in`, `fade-out`, `scale-in`, `scale-out`,
`slide-from-*` and `slide-to-*` come from the Nimbus theme; `spin`, `pulse`, `bounce` and
`ping` come from the Chakra base it is built on. Both resolve through the `animationName`
style prop.

## Reduced motion

Every preset returns an empty object when the user has `prefers-reduced-motion: reduce` set,
so elements appear in place instead of animating, and `useFlipTransition` switches the
composer instantly rather than gliding it.

The design file has a `motionMode` switch with a `subtle` setting. The product has no in-app
motion toggle, so that setting is not reproduced: the operating system preference is the
single control, and it means "off" rather than "less".
