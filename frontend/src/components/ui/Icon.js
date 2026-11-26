import { memo } from 'react';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

const shapes = {
  check: <Polyline points="5 12.5 10 17 19 7" />,
  chevron: <Polyline points="9 6 15 12 9 18" />,
  back: <Polyline points="15 6 9 12 15 18" />,
  up: <Polyline points="6 15 12 9 18 15" />,
  down: <Polyline points="6 9 12 15 18 9" />,
  plus: (
    <>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </>
  ),
  spark: <Path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  play: <Path d="M8 5.5v13l10-6.5z" />,
  pause: (
    <>
      <Rect x="6.5" y="5" width="4" height="14" rx="1.3" />
      <Rect x="13.5" y="5" width="4" height="14" rx="1.3" />
    </>
  ),
  stop: <Rect x="6" y="6" width="12" height="12" rx="2.5" />,
  close: <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  coffee: (
    <>
      <Path d="M4.5 9h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <Path d="M15.5 10.5h1.25a2.5 2.5 0 0 1 0 5H15" />
      <Path d="M8 3.5v2.5M12 3.5v2.5" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  moon: <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  warn: (
    <>
      <Path d="M12 4l9 16H3z" />
      <Path d="M12 10v4" />
      <Path d="M12 17.5v.01" />
    </>
  ),
  today: (
    <>
      <Rect x="4" y="5" width="16" height="15" rx="3" />
      <Path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  plan: (
    <>
      <Path d="M5 6h14M5 12h14M5 18h9" />
    </>
  ),
  progress: (
    <>
      <Path d="M5 19V11M12 19V5M19 19v-6" />
    </>
  ),
  habits: <Path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-7.5z" />,
  homework: (
    <>
      <Path d="M6 4h9l3 3v13H6z" />
      <Path d="M9 11h6M9 15h6" />
    </>
  ),
  shield: <Path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />,
  logout: (
    <>
      <Path d="M15 4h4v16h-4" />
      <Path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  dot: <Circle cx="12" cy="12" r="4" />,
  trash: (
    <>
      <Path d="M4 7h16M10 11v6M14 11v6" />
      <Path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  key: (
    <>
      <Circle cx="8" cy="15" r="4" />
      <Path d="M11 12l8-8M16 7l3 3" />
    </>
  ),
  pencil: (
    <>
      <Path d="M16.5 3.5l4 4L8 20H4v-4z" />
      <Path d="M14 6l4 4" />
    </>
  ),
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
};

const filled = new Set(['play', 'pause', 'stop', 'spark', 'dot']);

function IconBase({ name, size = 22, color = '#000', strokeWidth = 2 }) {
  const isFilled = filled.has(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? color : 'none'}
      stroke={color}
      strokeWidth={isFilled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {shapes[name]}
    </Svg>
  );
}

export const Icon = memo(IconBase);
