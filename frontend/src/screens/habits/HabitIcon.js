import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Line icons for routine habits, drawn on a 24-unit grid in the same style as the app's Icon set
 * (2-unit strokes, round ends). Kept with the habits screens because nothing else uses them.
 */
const dot = (cx, cy) => <Circle cx={cx} cy={cy} r="0.6" />;

export const HABIT_ICONS = {
  // Sports
  waves: <Path d="M2 7c1.5 0 2.5-1.5 4-1.5s2.5 1.5 4 1.5 2.5-1.5 4-1.5 2.5 1.5 4 1.5 2.5-1.5 4-1.5M2 12.5c1.5 0 2.5-1.5 4-1.5s2.5 1.5 4 1.5 2.5-1.5 4-1.5 2.5 1.5 4 1.5 2.5-1.5 4-1.5M2 18c1.5 0 2.5-1.5 4-1.5s2.5 1.5 4 1.5 2.5-1.5 4-1.5 2.5 1.5 4 1.5 2.5-1.5 4-1.5" />,
  bat: (
    <>
      <Path d="M14.5 6.5l3 3-9 9a2.12 2.12 0 0 1-3-3z" />
      <Path d="M16 8l3.5-3.5" />
      <Circle cx="6.5" cy="6.5" r="2" />
    </>
  ),
  soccer: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M12 8.6l3.2 2.3-1.2 3.8h-4l-1.2-3.8zM12 8.6V2.5M15.2 10.9l5.6-1.8M14 14.7l3.5 4.8M10 14.7l-3.5 4.8M8.8 10.9L3.2 9.1" />
    </>
  ),
  ball: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M12 2.5v19M2.5 12h19M5.6 5.2c2.6 3.8 2.6 9.8 0 13.6M18.4 5.2c-2.6 3.8-2.6 9.8 0 13.6" />
    </>
  ),
  racket: (
    <>
      <Circle cx="14.5" cy="9.5" r="6" />
      <Path d="M10.3 13.7L3.5 20.5M9 9.5h11M14.5 4v11" />
    </>
  ),
  volleyball: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M12 12c-1-4.5-.3-7.4 2-9.2M12 12c4.6-1.5 7.4-.5 9.2 1.7M12 12c-3.6 3.1-6.7 3.6-9.4 2.9" />
    </>
  ),
  shuttlecock: <Path d="M6 3.5l3 10h6l3-10M10.5 3.5l.5 10M13.5 3.5l-.5 10M9 13.5V15a3 3 0 0 0 6 0v-1.5" />,
  paddle: (
    <>
      <Circle cx="10" cy="10" r="6.5" />
      <Path d="M14.6 13.2l5.2 5.2a1.3 1.3 0 0 1-1.8 1.8l-5.2-5.2" />
      <Circle cx="19.5" cy="5" r="1.6" />
    </>
  ),
  stopwatch: (
    <>
      <Circle cx="12" cy="13.5" r="7.5" />
      <Path d="M12 13.5V10M10 2.5h4M12 2.5V6M18.3 7.2l1.5-1.5" />
    </>
  ),
  trophy: <Path d="M8 3.5h8v5.5a4 4 0 0 1-8 0zM8 5.5H5.5A2.5 2.5 0 0 0 8 9.5M16 5.5h2.5A2.5 2.5 0 0 1 16 9.5M12 13v4M8.5 20.5h7M9.5 17h5v3.5" />,
  medal: (
    <>
      <Path d="M8 2.5l3 6.5M16 2.5L13 9" />
      <Circle cx="12" cy="15" r="6" />
      <Circle cx="12" cy="15" r="2.2" />
    </>
  ),
  skate: (
    <>
      <Path d="M5 3.5h5V11h6.5a3.5 3.5 0 0 1 3.5 3.5V16H5z" />
      <Circle cx="8" cy="19.5" r="1.8" />
      <Circle cx="17" cy="19.5" r="1.8" />
    </>
  ),
  // Fitness
  dumbbell: (
    <>
      <Rect x="2" y="9" width="2.5" height="6" rx="1" />
      <Rect x="5" y="6.5" width="3" height="11" rx="1" />
      <Rect x="16" y="6.5" width="3" height="11" rx="1" />
      <Rect x="19.5" y="9" width="2.5" height="6" rx="1" />
      <Path d="M8 12h8" />
    </>
  ),
  footprints: <Path d="M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0zM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0zM16 17h4M4 13h4" />,
  shoe: <Path d="M2.5 18h19v-1.6c0-1.5-1-2.8-2.4-3.2l-4.3-1.3a2.5 2.5 0 0 1-1.8-2.4V7.5L9.5 9.2 7.8 7.5C6.5 9.3 4.7 10.3 2.5 10.3zM10.4 12.4l1.4-1.1M12.6 13.6l1.4-1.1" />,
  stretch: (
    <>
      <Circle cx="12" cy="4.2" r="2" />
      <Path d="M12 7.2v6.8M6 4.8l6 4.2 6-4.2M12 14l-3.5 6.5M12 14l3.5 6.5" />
    </>
  ),
  bike: (
    <>
      <Circle cx="5.5" cy="17" r="3.5" />
      <Circle cx="18.5" cy="17" r="3.5" />
      <Circle cx="15" cy="5" r="1" />
      <Path d="M12 17v-3.5l-3-3 4-3 2 3h2.5" />
    </>
  ),
  lotus: <Path d="M12 5c2 2.2 3 4.5 3 7s-1 4.8-3 7c-2-2.2-3-4.5-3-7s1-4.8 3-7zM12 19c-4 0-8-2.5-9-7 2.2-.3 4.5.2 6.4 1.4M12 19c4 0 8-2.5 9-7-2.2-.3-4.5.2-6.4 1.4" />,
  pulse: <Path d="M2.5 12h4l2.5-6.5 5 13 2.5-6.5h5" />,
  rope: (
    <>
      <Rect x="3" y="3" width="3" height="6.5" rx="1.5" />
      <Rect x="18" y="3" width="3" height="6.5" rx="1.5" />
      <Path d="M4.5 9.5c0 7 3.4 11 7.5 11s7.5-4 7.5-11" />
    </>
  ),
  // Arts and music
  dance: (
    <>
      <Circle cx="13.5" cy="4.5" r="2" />
      <Path d="M12.8 8l-1.6 6.2M6.5 7.5l6.3 1.2 4.7-3.2M11.2 14.2L7.5 20.5M11.2 14.2l4.3 2.3.8 4" />
    </>
  ),
  music: (
    <>
      <Path d="M9 18V5.5l11-2V16" />
      <Circle cx="6" cy="18" r="3" />
      <Circle cx="17" cy="16" r="3" />
    </>
  ),
  mic: (
    <>
      <Rect x="9" y="2.5" width="6" height="11" rx="3" />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5M8.5 21h7" />
    </>
  ),
  palette: (
    <>
      <Path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      {dot(7.5, 11)}
      {dot(10, 7)}
      {dot(15, 7)}
    </>
  ),
  pencil: (
    <>
      <Path d="M16.5 3.5l4 4L8 20H4v-4z" />
      <Path d="M14 6l4 4" />
    </>
  ),
  scissors: (
    <>
      <Circle cx="6" cy="6" r="3" />
      <Circle cx="6" cy="18" r="3" />
      <Path d="M8.1 8.1L20 20M14.5 9.5L20 4M8.1 15.9l3.4-3.4" />
    </>
  ),
  camera: (
    <>
      <Path d="M4 7.5h3l2-2.5h6l2 2.5h3A1.5 1.5 0 0 1 21.5 9v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z" />
      <Circle cx="12" cy="13" r="3.5" />
    </>
  ),
  notebook: (
    <>
      <Rect x="5" y="3" width="14" height="18" rx="2" />
      <Path d="M9 3v18M12.5 8h3M12.5 12h3" />
    </>
  ),
  // Learning
  chat: <Path d="M4 4.5h10.5A1.5 1.5 0 0 1 16 6v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5zM19 9h1a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18h-1.5v3L15 18h-4a1.5 1.5 0 0 1-1.5-1.5v-.5" />,
  flask: <Path d="M9.5 3h5M10.5 3v5.5L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 8.5V3M7.5 15h9" />,
  book: <Path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20" />,
  bulb: <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />,
  code: <Path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  pawn: (
    <>
      <Circle cx="12" cy="6.5" r="2.5" />
      <Path d="M9.5 11h5M10.5 11L9 17.5h6L13.5 11M7 20.5h10l-1-3H8z" />
    </>
  ),
  globe: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z" />
    </>
  ),
  calculator: (
    <>
      <Rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <Rect x="8" y="5.5" width="8" height="3.5" rx="0.8" />
      {dot(8.5, 13)}
      {dot(12, 13)}
      {dot(15.5, 13)}
      {dot(8.5, 17)}
      {dot(12, 17)}
      {dot(15.5, 17)}
    </>
  ),
  // Study
  'list-check': <Path d="M3.5 6.5L5 8l3-3M3.5 12.5L5 14l3-3M3.5 18.5L5 20l3-3M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5" />,
  backpack: (
    <>
      <Path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <Rect x="5" y="6" width="14" height="15" rx="3.5" />
      <Path d="M5 11.5h14M8.5 21v-4a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4" />
    </>
  ),
  repeat: <Path d="M17 2.5l3 3-3 3M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3M20 12.5v1a5 5 0 0 1-5 5H4" />,
  'check-circle': (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M8 12.3l2.7 2.7L16 9.5" />
    </>
  ),
  calendar: (
    <>
      <Rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <Path d="M3.5 10h17M8.5 3v4M15.5 3v4M10 15h4M12 13v4" />
    </>
  ),
  target: (
    <>
      <Circle cx="12" cy="12" r="9.5" />
      <Circle cx="12" cy="12" r="5.5" />
      <Circle cx="12" cy="12" r="1.5" />
    </>
  ),
  notes: <Path d="M6 3.5h9l3.5 3.5v13.5H6zM9 11h6.5M9 15h6.5M9 7h3" />,
  // Wellbeing
  drop: <Path d="M12 3c3.5 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.8 6-11z" />,
  moon: <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  'phone-off': (
    <>
      <Rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <Path d="M11 18.5h2M3 3l18 18" />
    </>
  ),
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  heart: <Path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  apple: <Path d="M12 7.5c-1.5-1-5.5-1.5-6.8 2.3-1.2 3.6 1 9.7 3.8 10.7 1.2.4 2-.4 3-.4s1.8.8 3 .4c2.8-1 5-7.1 3.8-10.7C17.5 6 13.5 6.5 12 7.5zM12 7.5c0-2 1-3.5 3-4.5" />,
  // Home and life
  bed: (
    <>
      <Path d="M3 5.5V20M3 16.5h18V20M21 16.5v-4a2 2 0 0 0-2-2h-8v6" />
      <Circle cx="7" cy="12.5" r="2" />
    </>
  ),
  sparkles: <Path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9zM18.5 15l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7z" />,
  home: <Path d="M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5" />,
  pot: <Path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9.5 6.5c0-1 .8-1.5.8-2.5M14 6.5c0-1 .8-1.5.8-2.5" />,
  leaf: <Path d="M5 19c0-8 5-13.5 15-14 .5 10-5 15-12.5 14.5M5 19l7-7" />,
  coin: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M8.5 7.5h7M8.5 10.5h7M11 7.5a3 3 0 0 1 0 6H8.5l5.5 4.5" />
    </>
  ),
  star: <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
};

export const HabitIcon = memo(function HabitIcon({ name, size = 22, color = '#000', strokeWidth = 1.9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {HABIT_ICONS[name] ?? HABIT_ICONS.star}
    </Svg>
  );
});

/** A habit icon on a soft rounded-square tile in its category colour; `solid` fills the tile. */
export const IconTile = memo(function IconTile({ icon, color, size = 36, solid = false }) {
  // Dark cards need a stronger wash for the icon colour to read.
  const { scheme } = useTheme();
  const wash = `${color}${scheme === 'dark' ? '38' : '1F'}`;
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: solid ? color : wash, alignItems: 'center', justifyContent: 'center' }}>
      <HabitIcon name={icon} size={Math.round(size * 0.56)} color={solid ? '#fff' : color} />
    </View>
  );
});
