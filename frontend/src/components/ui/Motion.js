import { Children, Fragment, isValidElement, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text } from 'react-native';

/**
 * Small animation toolkit built on React Native's Animated API, so it works on Android, iOS and
 * the web with no extra native modules. Every effect switches itself off when the phone's
 * "Reduce motion" setting is on.
 */

export const nativeDriver = Platform.OS !== 'web';

/* ---------- Reduce motion: one shared listener for the whole app ---------- */
let reduceMotion = false;
const listeners = new Set();
let watching = false;

function watchReduceMotion() {
  if (watching) return;
  watching = true;
  const set = (value) => {
    reduceMotion = Boolean(value);
    listeners.forEach((listener) => listener());
  };
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
}

function subscribe(listener) {
  watchReduceMotion();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => reduceMotion, () => reduceMotion);
}

/* ---------- Press feedback ---------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that springs down a little while pressed. Takes every Pressable prop; `style` may be
 * a function of `{ pressed }` like Pressable's. `scaleTo` sets how far it shrinks.
 */
export function PressableScale({ style, scaleTo = 0.96, onPressIn, onPressOut, children, ...props }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const to = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: nativeDriver, speed: 40, bounciness: value === 1 ? 8 : 0 }).start();
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...props}
      style={[resolved, { transform: [{ scale }] }]}
      onPressIn={(event) => {
        setPressed(true);
        if (!reduced) to(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        if (!reduced) to(1);
        onPressOut?.(event);
      }}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  );
}

/* ---------- Entrance animations ---------- */

/** Fades and slides its children up into place once, when first shown. */
export function Appear({ delay = 0, distance = 10, duration = 320, style, children }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver });
    animation.start();
    return () => animation.stop();
    // Runs once on mount: entrances don't replay when data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const STAGGER_MS = 45;
const STAGGER_MAX = 8;

/**
 * Flattens fragments so each visible block of a screen gets its own entrance. Keys of nested
 * children are prefixed with their fragment's key so they stay unique and stable.
 */
function flatten(children, prefix = '') {
  return Children.toArray(children).flatMap((child) => {
    const key = `${prefix}${isValidElement(child) ? child.key : ''}`;
    if (isValidElement(child) && child.type === Fragment) return flatten(child.props.children, `${key}/`);
    return [{ key, child }];
  });
}

/**
 * Gives each child a staggered entrance, one after another. Returns a fragment, so the children
 * still sit directly in the parent's layout (its `gap` keeps working).
 */
export function Stagger({ children, step = STAGGER_MS }) {
  return (
    <>
      {flatten(children).map(({ key, child }, index) => (
        <Appear key={key || index} delay={Math.min(index, STAGGER_MAX) * step}>
          {child}
        </Appear>
      ))}
    </>
  );
}

/* ---------- Animated numbers and progress ---------- */

/**
 * Animates a number towards `target` and returns the in-between value, for things drawn from a
 * number every frame (SVG rings, counters).
 */
export function useAnimatedNumber(target, { duration = 700, delay = 120 } = {}) {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(reduced ? target : 0));
  const [current, setCurrent] = useState(reduced ? target : 0);
  useEffect(() => {
    const id = value.addListener(({ value: next }) => setCurrent(next));
    return () => value.removeListener(id);
  }, [value]);
  useEffect(() => {
    if (reduced) {
      value.setValue(target);
      return undefined;
    }
    const animation = Animated.timing(value, { toValue: target, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [target, duration, delay, reduced, value]);
  return reduced ? target : current;
}

/** A whole number that counts up to `value`. Screen readers get the final number. */
export function CountUp({ value, style, suffix = '', ...props }) {
  const shown = useAnimatedNumber(Number(value) || 0);
  return (
    <Text style={style} accessibilityLabel={`${value}${suffix}`} {...props}>
      {Math.round(shown)}
      {suffix}
    </Text>
  );
}

/** Horizontal progress fill that grows from empty to `progress` (0–1). */
export function ProgressBar({ progress, color, track, height = 8, style }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  const [width] = useState(() => new Animated.Value(reduced ? clamped : 0));
  useEffect(() => {
    if (reduced) {
      width.setValue(clamped);
      return undefined;
    }
    const animation = Animated.timing(width, { toValue: clamped, duration: 700, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [clamped, reduced, width]);
  return (
    <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </Animated.View>
  );
}

/** Reveals its content from left to right once (for stacked bars). */
export function GrowX({ children, style }) {
  const reduced = useReducedMotion();
  const [width] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return undefined;
    const animation = Animated.timing(width, { toValue: 1, duration: 750, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [reduced, width]);
  return (
    <Animated.View style={[style, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), overflow: 'hidden' }]}>
      {children}
    </Animated.View>
  );
}

/* ---------- Attention effects ---------- */

/** Gently breathes (scales up and down) while `active`. */
export function Pulse({ active = true, to = 1.08, duration = 900, children, style }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active || reduced) {
      scale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: to, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(scale, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduced, scale, to, duration]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Pops (springs from small to full size) each time `trigger` turns true. */
export function Pop({ trigger, children, style }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!trigger || reduced) return;
    scale.setValue(0.55);
    Animated.spring(scale, { toValue: 1, useNativeDriver: nativeDriver, speed: 18, bounciness: 14 }).start();
  }, [trigger, reduced, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
