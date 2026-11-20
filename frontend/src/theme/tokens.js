/** Design tokens. Colours follow the prototype's iOS-style palette, in light and dark variants. */
export const palette = {
  light: {
    background: '#F2F2F7',
    card: '#FFFFFF',
    text: '#000000',
    textSecondary: '#6E6E73',
    textTertiary: '#8E8E93',
    separator: '#E5E5EA',
    fill: '#E9E9EE',
    fillStrong: '#D1D1D6',
    tint: '#007AFF',
    tintInk: '#0062CC',
    success: '#34C759',
    successInk: '#248A3D',
    warning: '#FF9500',
    warningInk: '#C93400',
    danger: '#FF3B30',
    rest: '#FFCC00',
    overlay: 'rgba(0,0,0,0.35)',
    onTint: '#FFFFFF',
  },
  dark: {
    background: '#000000',
    card: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#AEAEB2',
    textTertiary: '#8E8E93',
    separator: '#38383A',
    fill: '#2C2C2E',
    fillStrong: '#48484A',
    tint: '#0A84FF',
    tintInk: '#409CFF',
    success: '#30D158',
    successInk: '#30D158',
    warning: '#FF9F0A',
    warningInk: '#FF9F0A',
    danger: '#FF453A',
    rest: '#FFD60A',
    overlay: 'rgba(0,0,0,0.6)',
    onTint: '#FFFFFF',
  },
};

export const subjects = {
  maths: { name: 'Maths', color: '#007AFF' },
  science: { name: 'Science', color: '#34C759' },
  sst: { name: 'Social Science', color: '#FF9500' },
  english: { name: 'English', color: '#AF52DE' },
  hindi: { name: 'Hindi', color: '#FF2D55' },
};

export const SUBJECT_IDS = Object.keys(subjects);

export const chapterStatus = {
  not: { label: 'Not started', color: null },
  learning: { label: 'Learning', color: '#FF9500' },
  revised: { label: 'Revised', color: '#007AFF' },
  mastered: { label: 'Mastered', color: '#34C759' },
};

export const CHAPTER_STATUS_ORDER = ['not', 'learning', 'revised', 'mastered'];

export const rings = { tasks: '#FA114F', focus: '#34C759', week: '#00B4D8' };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700', letterSpacing: 0.3 },
  title: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16 },
  callout: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
};

export const layout = { maxContentWidth: 640, minTouch: 44 };
