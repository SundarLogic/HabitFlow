/**
 * Choices offered by the habit form, and the one-click starter templates.
 *
 * Icons are stored by NAME (habits.icon, a string), so the backend never depends on the icon
 * library. HABIT_ICONS maps a name to a lucide-react component; unknown names fall back to a
 * neutral icon (see HabitIcon.jsx).
 */
import {
  Apple,
  Bike,
  BookOpen,
  Droplet,
  Dumbbell,
  Footprints,
  Heart,
  Leaf,
  Moon,
  Music,
  PenLine,
  Phone,
  Sun,
} from 'lucide-react';

/** ISO weekdays (1 = Monday ... 7 = Sunday) with short and long labels. */
export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 7, short: 'Sun', long: 'Sunday' },
];

/** Colour swatches (#RRGGBB, the format the API accepts), each with a name for screen readers. */
export const HABIT_COLORS = [
  { value: '#4F46E5', name: 'Indigo' },
  { value: '#0EA5E9', name: 'Sky' },
  { value: '#10B981', name: 'Emerald' },
  { value: '#84CC16', name: 'Lime' },
  { value: '#F59E0B', name: 'Amber' },
  { value: '#F97316', name: 'Orange' },
  { value: '#EC4899', name: 'Pink' },
  { value: '#8B5CF6', name: 'Violet' },
];

export const HABIT_ICONS = {
  droplet: { icon: Droplet, name: 'Water drop' },
  dumbbell: { icon: Dumbbell, name: 'Dumbbell' },
  book: { icon: BookOpen, name: 'Book' },
  leaf: { icon: Leaf, name: 'Leaf' },
  running: { icon: Footprints, name: 'Running' },
  bike: { icon: Bike, name: 'Bike' },
  moon: { icon: Moon, name: 'Moon' },
  sun: { icon: Sun, name: 'Sun' },
  apple: { icon: Apple, name: 'Apple' },
  heart: { icon: Heart, name: 'Heart' },
  music: { icon: Music, name: 'Music' },
  pen: { icon: PenLine, name: 'Pen' },
  phone: { icon: Phone, name: 'Phone' },
};

/** One-click starters for new users (PRD: first habit in seconds). */
export const HABIT_TEMPLATES = [
  {
    key: 'water',
    label: 'Drink water',
    hint: 'Daily',
    habit: {
      name: 'Drink water',
      category: 'Health',
      color: '#0EA5E9',
      icon: 'droplet',
      frequencyType: 'daily',
    },
  },
  {
    key: 'exercise',
    label: 'Exercise',
    hint: '3× per week',
    habit: {
      name: 'Exercise',
      category: 'Fitness',
      color: '#F97316',
      icon: 'dumbbell',
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
    },
  },
  {
    key: 'read',
    label: 'Read',
    hint: 'Weekdays',
    habit: {
      name: 'Read',
      category: 'Learning',
      color: '#8B5CF6',
      icon: 'book',
      frequencyType: 'weekdays',
      weekdays: [1, 2, 3, 4, 5],
    },
  },
  {
    key: 'meditate',
    label: 'Meditate',
    hint: 'Daily',
    habit: {
      name: 'Meditate',
      category: 'Mindfulness',
      color: '#10B981',
      icon: 'leaf',
      frequencyType: 'daily',
    },
  },
];

/** API limit: reminders per habit. */
export const MAX_REMINDERS = 5;
