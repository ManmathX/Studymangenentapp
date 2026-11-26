import { HABIT_ICONS } from './HabitIcon';

/**
 * Ready-made habits students can add in one tap, grouped like the areas in habit apps. The list
 * follows what Indian school students most often do outside class (sport, debate and clubs, art,
 * music and dance), WHO's hour of daily activity for adolescents, and the planner's own study
 * steps. `part` is the time of day a habit usually belongs to; students can change it.
 */
export const HABIT_CATEGORIES = [
  {
    id: 'sports',
    label: 'Sports',
    color: '#34C759',
    items: [
      { name: 'Swimming', icon: 'waves', part: 'afternoon' },
      { name: 'Cricket', icon: 'bat', part: 'afternoon' },
      { name: 'Football', icon: 'soccer', part: 'afternoon' },
      { name: 'Basketball', icon: 'ball', part: 'afternoon' },
      { name: 'Badminton', icon: 'shuttlecock', part: 'afternoon' },
      { name: 'Tennis', icon: 'racket', part: 'afternoon' },
      { name: 'Table tennis', icon: 'paddle', part: 'afternoon' },
      { name: 'Volleyball', icon: 'volleyball', part: 'afternoon' },
      { name: 'Martial arts', icon: 'medal', part: 'afternoon' },
      { name: 'Athletics', icon: 'stopwatch', part: 'morning' },
      { name: 'Skating', icon: 'skate', part: 'afternoon' },
      { name: 'Kabaddi', icon: 'trophy', part: 'afternoon' },
    ],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    color: '#FF9500',
    items: [
      { name: 'Gym', icon: 'dumbbell', part: 'afternoon' },
      { name: 'Running', icon: 'shoe', part: 'morning' },
      { name: 'Walking', icon: 'footprints', part: 'evening' },
      { name: 'Cycling', icon: 'bike', part: 'afternoon' },
      { name: 'Yoga', icon: 'lotus', part: 'morning' },
      { name: 'Stretching', icon: 'stretch', part: 'morning' },
      { name: 'Skipping rope', icon: 'rope', part: 'afternoon' },
      { name: 'Home workout', icon: 'pulse', part: 'morning' },
    ],
  },
  {
    id: 'arts',
    label: 'Arts & music',
    color: '#AF52DE',
    items: [
      { name: 'Dancing', icon: 'dance', part: 'afternoon' },
      { name: 'Music practice', icon: 'music', part: 'afternoon' },
      { name: 'Singing', icon: 'mic', part: 'afternoon' },
      { name: 'Drawing', icon: 'pencil', part: 'afternoon' },
      { name: 'Painting', icon: 'palette', part: 'afternoon' },
      { name: 'Craft', icon: 'scissors', part: 'afternoon' },
      { name: 'Photography', icon: 'camera', part: 'afternoon' },
      { name: 'Creative writing', icon: 'notebook', part: 'evening' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning',
    color: '#007AFF',
    items: [
      { name: 'Debate practice', icon: 'chat', part: 'afternoon' },
      { name: 'Science experiment', icon: 'flask', part: 'afternoon' },
      { name: 'Reading for fun', icon: 'book', part: 'evening' },
      { name: 'Quiz practice', icon: 'bulb', part: 'evening' },
      { name: 'Coding', icon: 'code', part: 'afternoon' },
      { name: 'Chess', icon: 'pawn', part: 'afternoon' },
      { name: 'Learn a language', icon: 'globe', part: 'evening' },
      { name: 'Mental maths', icon: 'calculator', part: 'morning' },
    ],
  },
  {
    id: 'study',
    label: 'Study',
    color: '#5856D6',
    items: [
      { name: 'Look at today’s plan', icon: 'list-check', part: 'morning' },
      { name: 'Pack the bag from the checklist', icon: 'backpack', part: 'morning' },
      { name: 'Do one revision nudge', icon: 'repeat', part: 'morning' },
      { name: 'Read for 20 minutes', icon: 'book', part: 'evening' },
      { name: 'Maths practice', icon: 'calculator', part: 'evening' },
      { name: 'Review today’s notes', icon: 'notes', part: 'evening' },
      { name: 'Tick off what you finished', icon: 'check-circle', part: 'evening' },
      { name: 'Move anything that slipped', icon: 'calendar', part: 'evening' },
      { name: 'Pick tomorrow’s first task', icon: 'target', part: 'evening' },
      { name: 'Handwriting practice', icon: 'pencil', part: 'afternoon' },
    ],
  },
  {
    id: 'wellbeing',
    label: 'Wellbeing',
    color: '#30B0C7',
    items: [
      { name: 'Meditation', icon: 'lotus', part: 'morning' },
      { name: 'Drink water', icon: 'drop', part: 'morning' },
      { name: 'Healthy breakfast', icon: 'apple', part: 'morning' },
      { name: 'Time outdoors', icon: 'sun', part: 'afternoon' },
      { name: 'Journaling', icon: 'notebook', part: 'evening' },
      { name: 'Gratitude note', icon: 'heart', part: 'evening' },
      { name: 'Phone away by 22:00', icon: 'phone-off', part: 'evening' },
      { name: 'Sleep by 22:30', icon: 'moon', part: 'evening' },
    ],
  },
  {
    id: 'home',
    label: 'Home & life',
    color: '#FF2D55',
    items: [
      { name: 'Make your bed', icon: 'bed', part: 'morning' },
      { name: 'Tidy your desk', icon: 'sparkles', part: 'evening' },
      { name: 'Help at home', icon: 'home', part: 'evening' },
      { name: 'Cooking', icon: 'pot', part: 'evening' },
      { name: 'Water the plants', icon: 'leaf', part: 'morning' },
      { name: 'Volunteering', icon: 'heart', part: 'afternoon' },
      { name: 'Save pocket money', icon: 'coin', part: 'evening' },
    ],
  },
];

export const HABIT_LIBRARY = HABIT_CATEGORIES.flatMap((category) => category.items.map((item) => ({ ...item, category: category.id, color: category.color })));

/** Colour of an icon: the colour of the first category that uses it. Own icons default to the app tint. */
const ICON_COLOR = {};
for (const item of HABIT_LIBRARY) if (!ICON_COLOR[item.icon]) ICON_COLOR[item.icon] = item.color;
const DEFAULT_COLOR = '#8E8E93';

export const findIdea = (name) => {
  const key = (name ?? '').trim().toLowerCase();
  return key ? HABIT_LIBRARY.find((item) => item.name.toLowerCase() === key) : undefined;
};

/** Icon and colour to show for a habit (older habits may have no icon saved). */
export function habitLook(habit) {
  const icon = habit.icon && HABIT_ICONS[habit.icon] ? habit.icon : (findIdea(habit.name)?.icon ?? 'star');
  return { icon, color: ICON_COLOR[icon] ?? DEFAULT_COLOR };
}

export const colorOfIcon = (icon) => ICON_COLOR[icon] ?? DEFAULT_COLOR;
