/**
 * Design tokens. A bright, friendly palette for school students (Class 6–12), in light and dark
 * variants. `*Soft` colours are tinted backgrounds for chips, banners and icon tiles.
 */
export const palette = {
  light: {
    background: '#F3F4FA',
    card: '#FFFFFF',
    text: '#16172B',
    textSecondary: '#5C607A',
    textTertiary: '#9397AE',
    separator: '#E7E8F1',
    fill: '#EEEFF7',
    fillStrong: '#D4D6E4',
    tint: '#5B4CF0',
    tintInk: '#4436D1',
    tintSoft: 'rgba(91,76,240,0.11)',
    success: '#22C55E',
    successInk: '#15803D',
    successSoft: 'rgba(34,197,94,0.13)',
    warning: '#FF9500',
    warningInk: '#C2410C',
    warningSoft: 'rgba(255,149,0,0.14)',
    danger: '#F43F5E',
    dangerSoft: 'rgba(244,63,94,0.12)',
    rest: '#FFCC00',
    streak: '#FF6B2C',
    overlay: 'rgba(0,0,0,0.35)',
    onTint: '#FFFFFF',
    hero: ['#5B4CF0', '#8B5CF6', '#C026D3'],
    shadow: '0px 3px 12px rgba(30,32,80,0.07)',
  },
  dark: {
    background: '#000000',
    card: '#0E0E11',
    text: '#F4F4F5',
    textSecondary: '#A1A1AA',
    textTertiary: '#71717A',
    separator: '#1C1C21',
    fill: '#17171B',
    fillStrong: '#2C2C33',
    tint: '#8B80FF',
    tintInk: '#A59CFF',
    tintSoft: 'rgba(139,128,255,0.17)',
    success: '#34D399',
    successInk: '#34D399',
    successSoft: 'rgba(52,211,153,0.16)',
    warning: '#FFA42E',
    warningInk: '#FFB054',
    warningSoft: 'rgba(255,164,46,0.17)',
    danger: '#FB7185',
    dangerSoft: 'rgba(251,113,133,0.16)',
    rest: '#FFD60A',
    streak: '#FF8A4C',
    overlay: 'rgba(0,0,0,0.7)',
    onTint: '#FFFFFF',
    hero: ['#3A2FB8', '#5E37C4', '#86198F'],
    shadow: 'none',
  },
};

export const subjects = {
  maths: { name: 'Maths', color: '#3B82F6' },
  science: { name: 'Science', color: '#22C55E' },
  sst: { name: 'Social Science', color: '#FF9500' },
  english: { name: 'English', color: '#A855F7' },
  hindi: { name: 'Hindi', color: '#F43F5E' },
};

export const SUBJECT_IDS = Object.keys(subjects);

/**
 * The stages a chapter moves through, in order. `learning` is the stored key for "Studied" (kept so
 * saved data still loads). `short` fits the five-way picker; `meaning` is shown in the colour key.
 */
export const chapterStatus = {
  not: { label: 'Not started', short: 'Not yet', color: null, meaning: 'Not opened yet' },
  learning: { label: 'Studied', short: 'Studied', color: '#F59E0B', meaning: 'Read it and made notes' },
  practiced: { label: 'Practiced', short: 'Practiced', color: '#A855F7', meaning: 'Did the exercises and questions' },
  revised: { label: 'Revised', short: 'Revised', color: '#3B82F6', meaning: 'Went over it again later' },
  mastered: { label: 'Mastered', short: 'Mastered', color: '#22C55E', meaning: 'Confident for the test' },
};

export const CHAPTER_STATUS_ORDER = ['not', 'learning', 'practiced', 'revised', 'mastered'];

export const rings = { tasks: '#F43F5E', focus: '#22C55E', week: '#06B6D4' };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 14, xl: 18, xxl: 24 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };

export const type = {
  largeTitle: { fontSize: 30, fontWeight: '800', letterSpacing: 0.2 },
  title: { fontSize: 21, fontWeight: '800' },
  headline: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15 },
  callout: { fontSize: 14 },
  footnote: { fontSize: 12.5 },
  caption: { fontSize: 11.5 },
};

export const layout = { maxContentWidth: 640, minTouch: 44 };
