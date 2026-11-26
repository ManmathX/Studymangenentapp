/**
 * Pure helpers for syllabus trees (subject → units → chapters → topics → subtopics). No I/O,
 * so they are unit tested on their own.
 */
import {
  LIMITS,
  type ChapterNode,
  type NodeCounts,
  type Priority,
  type SubtopicNode,
  type TopicNode,
  type UnitNode,
} from './catalog.types.js';

/* ---------- Normalising input ---------- */

/** Input as the API accepts it: optional fields may be null (cleared in the editor). */
export interface SubtopicInput {
  name: string;
  important?: boolean | null;
}
export interface TopicInput {
  name: string;
  important?: boolean | null;
  weightage?: number | null;
  marks?: number | null;
  priority?: Priority | null;
  subtopics?: SubtopicInput[] | null;
}
export interface ChapterInput {
  name: string;
  difficulty?: 1 | 2 | 3 | null;
  book?: string | null;
  important?: boolean | null;
  weightage?: number | null;
  marks?: number | null;
  priority?: Priority | null;
  grade?: number | null;
  topics?: TopicInput[] | null;
}
export interface UnitInput {
  name?: string | null;
  weightage?: number | null;
  marks?: number | null;
  chapters?: ChapterInput[] | null;
}

/** Copies `value` into `target[key]` only when it is set, so absent fields stay absent. */
function put<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | null | undefined,
) {
  if (value !== null && value !== undefined && value !== '') target[key] = value;
}

const cleanText = (text: string | null | undefined) => (text ?? '').trim();

export function cleanSubtopic(input: SubtopicInput): SubtopicNode {
  return { name: cleanText(input.name), important: Boolean(input.important) };
}

export function cleanTopic(input: TopicInput): TopicNode {
  const topic: TopicNode = {
    name: cleanText(input.name),
    important: Boolean(input.important),
    subtopics: (input.subtopics ?? []).map(cleanSubtopic),
  };
  put(topic, 'weightage', input.weightage);
  put(topic, 'marks', input.marks);
  put(topic, 'priority', input.priority);
  return topic;
}

export function cleanChapter(input: ChapterInput): ChapterNode {
  const chapter: ChapterNode = {
    name: cleanText(input.name),
    difficulty: input.difficulty ?? 2,
    important: Boolean(input.important),
    topics: (input.topics ?? []).map(cleanTopic),
  };
  put(chapter, 'book', input.book?.trim());
  put(chapter, 'weightage', input.weightage);
  put(chapter, 'marks', input.marks);
  put(chapter, 'priority', input.priority);
  put(chapter, 'grade', input.grade);
  return chapter;
}

export function cleanUnit(input: UnitInput): UnitNode {
  const unit: UnitNode = {
    name: cleanText(input.name),
    chapters: (input.chapters ?? []).map(cleanChapter),
  };
  put(unit, 'weightage', input.weightage);
  put(unit, 'marks', input.marks);
  return unit;
}

/**
 * Normalises a subject's units: trims names, drops cleared optional fields, and removes empty
 * unnamed units (an exam without units keeps its chapters in one unnamed unit).
 */
export function cleanUnits(units: UnitInput[]): UnitNode[] {
  return units.map(cleanUnit).filter((unit) => unit.name || unit.chapters.length > 0);
}

/** Lean documents from MongoDB may lack defaulted fields; this fills them in. */
export function normaliseStoredUnits(units: unknown): UnitNode[] {
  return Array.isArray(units) ? cleanUnits(units as UnitInput[]) : [];
}

/* ---------- Counting and limits ---------- */

export function countNodes(units: UnitNode[]): NodeCounts {
  const counts: NodeCounts = { units: 0, chapters: 0, topics: 0, subtopics: 0 };
  for (const unit of units) {
    if (unit.name) counts.units += 1;
    for (const chapter of unit.chapters) {
      counts.chapters += 1;
      for (const topic of chapter.topics) {
        counts.topics += 1;
        counts.subtopics += topic.subtopics.length;
      }
    }
  }
  return counts;
}

export const totalNodes = (counts: NodeCounts) =>
  counts.units + counts.chapters + counts.topics + counts.subtopics;

/**
 * Problems that schema validation can't see (totals across the tree). Returns readable
 * messages; empty when the tree is fine.
 */
export function treeProblems(subjectName: string, units: UnitNode[]): string[] {
  const problems: string[] = [];
  const counts = countNodes(units);
  if (units.length > LIMITS.unitsPerSubject)
    problems.push(`${subjectName}: at most ${LIMITS.unitsPerSubject} units`);
  if (counts.chapters > LIMITS.chaptersPerSubject)
    problems.push(`${subjectName}: at most ${LIMITS.chaptersPerSubject} chapters`);
  if (totalNodes(counts) > LIMITS.nodesPerSubject)
    problems.push(
      `${subjectName}: at most ${LIMITS.nodesPerSubject} units, chapters, topics and subtopics in all`,
    );
  units.forEach((unit) => {
    if (unit.chapters.length > LIMITS.chaptersPerSubject)
      problems.push(`${subjectName}: unit "${unit.name}" has too many chapters`);
    for (const chapter of unit.chapters) {
      if (chapter.topics.length > LIMITS.topicsPerChapter)
        problems.push(`${chapter.name}: at most ${LIMITS.topicsPerChapter} topics`);
      for (const topic of chapter.topics) {
        if (topic.subtopics.length > LIMITS.subtopicsPerTopic)
          problems.push(`${topic.name}: at most ${LIMITS.subtopicsPerTopic} subtopics`);
      }
    }
  });
  return problems;
}

/* ---------- What students download ---------- */

export interface StudentTopic {
  name: string;
  important: boolean;
  weightage?: number;
  marks?: number;
  priority?: Priority;
  subtopics: SubtopicNode[];
}

export interface StudentChapter {
  /** `<subjectId>-<n>`, 1-based over the subject's chapters in order. Phones key progress by it. */
  key: string;
  name: string;
  difficulty: 1 | 2 | 3;
  book?: string;
  unit?: string;
  important: boolean;
  weightage?: number;
  marks?: number;
  priority?: Priority;
  grade?: number;
  topics: StudentTopic[];
}

/** Every chapter of a subject in order, with the key rule the app has always used. */
export function flattenChapters(subjectId: string, units: UnitNode[]): StudentChapter[] {
  let n = 0;
  return units.flatMap((unit) =>
    unit.chapters.map((chapter) => {
      n += 1;
      const { topics, ...rest } = chapter;
      return {
        key: `${subjectId}-${n}`,
        ...rest,
        ...(unit.name ? { unit: unit.name } : {}),
        topics: topics.map((topic) => ({ ...topic, subtopics: [...topic.subtopics] })),
      };
    }),
  );
}

/* ---------- Merging ---------- */

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Brings an existing chapter list in line with a standard list without losing admin work:
 * chapters the standard list knows get its book name (if they have none), missing standard
 * chapters are added, and chapters are grouped by book in standard order. Chapters an admin
 * added stay, after the standard ones of their book. Returns null if nothing changes.
 */
export function mergeStandardChapters(
  current: ChapterNode[],
  standard: ChapterNode[],
): ChapterNode[] | null {
  const used = new Set<number>();
  const result: ChapterNode[] = [];
  for (const chapter of standard) {
    const index = current.findIndex(
      (have, i) =>
        !used.has(i) &&
        sameName(have.name, chapter.name) &&
        (!have.book || have.book === chapter.book),
    );
    if (index === -1) {
      result.push(chapter);
      continue;
    }
    used.add(index);
    const have = current[index]!;
    result.push(have.book || !chapter.book ? have : { ...have, book: chapter.book });
  }
  current.forEach((chapter, i) => {
    if (used.has(i)) return;
    const last = chapter.book ? result.findLastIndex((c) => c.book === chapter.book) : -1;
    if (last === -1) result.push(chapter);
    else result.splice(last + 1, 0, chapter);
  });
  const same =
    result.length === current.length &&
    result.every(
      (c, i) =>
        c.name === current[i]!.name &&
        c.difficulty === current[i]!.difficulty &&
        c.book === current[i]!.book,
    );
  return same || result.length > LIMITS.chaptersPerSubject ? null : result;
}

/** Applies `mergeStandardChapters` to the subject's unnamed unit, leaving named units alone. */
export function mergeStandardUnits(units: UnitNode[], standard: ChapterNode[]): UnitNode[] | null {
  const index = units.findIndex((unit) => !unit.name);
  const current = index === -1 ? [] : units[index]!.chapters;
  const merged = mergeStandardChapters(current, standard);
  if (!merged) return null;
  if (index === -1) return [{ name: '', chapters: merged }, ...units];
  return units.map((unit, i) => (i === index ? { ...unit, chapters: merged } : unit));
}

export interface MergeStats {
  added: NodeCounts;
  updated: NodeCounts;
}

export const zeroCounts = (): NodeCounts => ({ units: 0, chapters: 0, topics: 0, subtopics: 0 });

const ATTRIBUTES = [
  'difficulty',
  'book',
  'important',
  'weightage',
  'marks',
  'priority',
  'grade',
] as const;

/** Copies set attributes of `from` onto `into`; true when anything changed. */
function mergeAttributes(into: object, from: object, explicit: ReadonlySet<string> | null) {
  let changed = false;
  const target = into as Record<string, unknown>;
  const source = from as Record<string, unknown>;
  for (const key of ATTRIBUTES) {
    if (!(key in source)) continue;
    // CSV rows only carry the columns that were filled in; JSON carries every set field.
    if (explicit && !explicit.has(key)) continue;
    if (target[key] !== source[key]) {
      target[key] = source[key];
      changed = true;
    }
  }
  return changed;
}

/**
 * Merges imported units into a subject's units by name (case-insensitive): matching units,
 * chapters, topics and subtopics are updated, new ones are appended in import order, and
 * nothing is removed. `explicit` (from CSV) limits which attributes overwrite existing ones.
 */
export function mergeUnits(
  current: UnitNode[],
  incoming: UnitNode[],
  stats: MergeStats,
  explicitFor: (node: object) => ReadonlySet<string> | null = () => null,
): UnitNode[] {
  const units: UnitNode[] = structuredClone(current);
  for (const unitIn of incoming) {
    let unit = units.find((have) => sameName(have.name, unitIn.name));
    if (!unit) {
      unit = { name: unitIn.name, chapters: [] };
      units.push(unit);
      if (unitIn.name) stats.added.units += 1;
    }
    if (unitIn.name && mergeUnitAttributes(unit, unitIn, explicitFor(unitIn)))
      stats.updated.units += 1;
    for (const chapterIn of unitIn.chapters) {
      let chapter = unit.chapters.find((have) => sameName(have.name, chapterIn.name));
      if (!chapter) {
        chapter = { ...structuredClone(chapterIn), topics: [] };
        unit.chapters.push(chapter);
        stats.added.chapters += 1;
      } else if (mergeAttributes(chapter, chapterIn, explicitFor(chapterIn))) {
        stats.updated.chapters += 1;
      }
      for (const topicIn of chapterIn.topics) {
        let topic = chapter.topics.find((have) => sameName(have.name, topicIn.name));
        if (!topic) {
          topic = { ...structuredClone(topicIn), subtopics: [] };
          chapter.topics.push(topic);
          stats.added.topics += 1;
        } else if (mergeAttributes(topic, topicIn, explicitFor(topicIn))) {
          stats.updated.topics += 1;
        }
        for (const subIn of topicIn.subtopics) {
          const sub = topic.subtopics.find((have) => sameName(have.name, subIn.name));
          if (!sub) {
            topic.subtopics.push({ ...subIn });
            stats.added.subtopics += 1;
          } else if (mergeAttributes(sub, subIn, explicitFor(subIn))) {
            stats.updated.subtopics += 1;
          }
        }
      }
    }
  }
  return units;
}

function mergeUnitAttributes(
  into: UnitNode,
  from: UnitNode,
  explicit: ReadonlySet<string> | null,
): boolean {
  let changed = false;
  for (const key of ['weightage', 'marks'] as const) {
    if (from[key] === undefined || (explicit && !explicit.has(key))) continue;
    if (into[key] !== from[key]) {
      (into as unknown as Record<string, unknown>)[key] = from[key];
      changed = true;
    }
  }
  return changed;
}
