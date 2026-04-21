import { PlanoraEventType } from '@/types/event';

export interface EventCategoryOption {
  type: PlanoraEventType;
  label: string;
  color: string;
  description?: string;
}

export const EVENT_CATEGORIES_STORAGE_KEY = 'planora-event-categories';

export const DEFAULT_EVENT_CATEGORY_OPTIONS: EventCategoryOption[] = [
  { type: 'personal', label: 'Personal', color: '#3b82f6', description: 'Personal plans and errands' },
  { type: 'work', label: 'Work', color: '#f97316', description: 'Work and collaboration events' },
  { type: 'important', label: 'Important', color: '#ef4444', description: 'Urgent or critical events' },
  { type: 'team', label: 'Team', color: '#8b5cf6', description: 'Collaboration and team planning' },
  { type: 'interests', label: 'Interests', color: '#22c55e', description: 'Interests and free-time activities' },
];

const PREFERRED_CATEGORY_ORDER: PlanoraEventType[] = ['personal', 'work', 'important', 'team', 'interests'];

const LEGACY_COLOR_FALLBACKS: EventCategoryOption[] = [
  { type: 'general', label: 'General', color: '#6366f1' },
  { type: 'health', label: 'Health', color: '#14b8a6' },
  { type: 'hobby', label: 'Hobbies', color: '#22c55e' },
];

export function sanitizeCategoryColor(value: unknown) {
  if (typeof value !== 'string') return '#6366f1';
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return '#6366f1';
  return trimmed.toLowerCase();
}

export function normalizeEventType(value: unknown): PlanoraEventType {
  if (typeof value !== 'string') return 'personal';
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (normalized || 'personal') as PlanoraEventType;
}

function sortCategoriesByPreferredOrder(categories: EventCategoryOption[]): EventCategoryOption[] {
  const rank = new Map(PREFERRED_CATEGORY_ORDER.map((type, index) => [type, index]));
  return [...categories].sort((a, b) => {
    const aRank = rank.get(a.type as PlanoraEventType);
    const bRank = rank.get(b.type as PlanoraEventType);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return a.label.localeCompare(b.label);
  });
}

function sanitizeCategoryOption(input: Partial<EventCategoryOption> | null | undefined): EventCategoryOption | null {
  if (!input) return null;
  const type = normalizeEventType(input.type);
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label) return null;
  return {
    type,
    label,
    color: sanitizeCategoryColor(input.color),
    description: typeof input.description === 'string' ? input.description : undefined,
  };
}

export function getDefaultEventCategories() {
  return DEFAULT_EVENT_CATEGORY_OPTIONS.map((category) => ({ ...category }));
}

export function sanitizeEventCategories(raw: unknown): EventCategoryOption[] {
  if (!Array.isArray(raw)) return getDefaultEventCategories();

  const seen = new Set<string>();
  const cleaned: EventCategoryOption[] = [];

  for (const item of raw) {
    const next = sanitizeCategoryOption(item as Partial<EventCategoryOption>);
    if (!next || seen.has(next.type)) continue;
    seen.add(next.type);
    cleaned.push(next);
  }

  return cleaned.length > 0 ? sortCategoriesByPreferredOrder(cleaned) : getDefaultEventCategories();
}

export function loadUserEventCategories(): EventCategoryOption[] {
  if (typeof window === 'undefined') return getDefaultEventCategories();
  try {
    const raw = window.localStorage.getItem(EVENT_CATEGORIES_STORAGE_KEY);
    if (!raw) return getDefaultEventCategories();
    return sanitizeEventCategories(JSON.parse(raw));
  } catch {
    return getDefaultEventCategories();
  }
}

export function saveUserEventCategories(categories: EventCategoryOption[]) {
  if (typeof window === 'undefined') return;
  const cleaned = sanitizeEventCategories(categories);
  window.localStorage.setItem(EVENT_CATEGORIES_STORAGE_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new Event('planora-event-categories-changed'));
}

export function resolveEventCategory(
  type: unknown,
  color?: string | null,
  categories: EventCategoryOption[] = getDefaultEventCategories()
): EventCategoryOption {
  const normalizedType = normalizeEventType(type);
  const fromType = categories.find((category) => category.type === normalizedType);
  if (fromType) return fromType;

  if (typeof color === 'string') {
    const colorLower = color.toLowerCase();
    const fromColor = categories.find((category) => category.color.toLowerCase() === colorLower)
      || LEGACY_COLOR_FALLBACKS.find((category) => category.color.toLowerCase() === colorLower);
    if (fromColor) return fromColor;
  }

  return categories[0] || getDefaultEventCategories()[0];
}
