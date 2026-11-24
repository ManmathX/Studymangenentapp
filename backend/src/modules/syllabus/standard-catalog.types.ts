/** A chapter name, optionally with its difficulty (1 easy, 2 medium (default), 3 hard). */
export type Chapter = string | readonly [name: string, difficulty: 1 | 2 | 3];

/** A textbook (e.g. "Ganita Prakash – Part 1") and its chapters in book order. */
export interface StandardBook {
  book: string;
  chapters: readonly Chapter[];
}

/**
 * One subject of the standard syllabus. Subjects with prescribed textbooks list `books`;
 * ICSE/ISC subjects, which follow a syllabus rather than one textbook, list `chapters`.
 */
export type StandardSubject = { id: string; name: string } & (
  | { books: readonly StandardBook[]; chapters?: never }
  | { chapters: readonly Chapter[]; books?: never }
);
