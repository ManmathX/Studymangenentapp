import { describe, expect, it } from 'vitest';
import {
  academicYearOf,
  isValidAcademicYear,
  type UnitNode,
} from '../../src/modules/syllabus/catalog.types.js';
import { CatalogCache } from '../../src/modules/syllabus/catalog-cache.js';
import { sniffImage } from '../../src/modules/syllabus/exam.service.js';
import { parseCsv, toCsv } from '../../src/modules/syllabus/syllabus-csv.js';
import {
  cleanUnits,
  countNodes,
  flattenChapters,
  mergeStandardUnits,
  mergeUnits,
  treeProblems,
  zeroCounts,
} from '../../src/modules/syllabus/syllabus-tree.js';

const chapter = (name: string, extra: object = {}) => ({
  name,
  difficulty: 2 as const,
  important: false,
  topics: [],
  ...extra,
});

describe('academic years', () => {
  it('start in April', () => {
    expect(academicYearOf(new Date('2026-03-31T12:00:00Z'))).toBe('2025-26');
    expect(academicYearOf(new Date('2026-04-01T12:00:00Z'))).toBe('2026-27');
    expect(academicYearOf(new Date('2099-12-01T12:00:00Z'))).toBe('2099-00');
  });

  it('name consecutive years', () => {
    expect(isValidAcademicYear('2026-27')).toBe(true);
    expect(isValidAcademicYear('2027')).toBe(true);
    expect(isValidAcademicYear('2026-28')).toBe(false);
    expect(isValidAcademicYear('26-27')).toBe(false);
  });
});

describe('syllabus trees', () => {
  it('drop cleared fields and empty unnamed units, and count nodes', () => {
    const units = cleanUnits([
      { name: '  ', chapters: [] },
      {
        name: ' Mechanics ',
        weightage: null,
        chapters: [
          {
            name: ' Kinematics ',
            book: '',
            priority: null,
            topics: [{ name: 'Projectile', subtopics: [{ name: 'Range', important: true }] }],
          },
        ],
      },
      { name: 'Empty unit' },
    ]);
    expect(units).toEqual([
      {
        name: 'Mechanics',
        chapters: [
          {
            name: 'Kinematics',
            difficulty: 2,
            important: false,
            topics: [
              {
                name: 'Projectile',
                important: false,
                subtopics: [{ name: 'Range', important: true }],
              },
            ],
          },
        ],
      },
      { name: 'Empty unit', chapters: [] },
    ]);
    expect(countNodes(units)).toEqual({ units: 2, chapters: 1, topics: 1, subtopics: 1 });
  });

  it('key chapters by their place in the subject, across units', () => {
    const units: UnitNode[] = [
      { name: '', chapters: [chapter('A')] },
      { name: 'Optics', chapters: [chapter('B', { book: 'Part 2' })] },
    ];
    expect(flattenChapters('physics', units)).toEqual([
      { key: 'physics-1', name: 'A', difficulty: 2, important: false, topics: [] },
      {
        key: 'physics-2',
        name: 'B',
        difficulty: 2,
        important: false,
        book: 'Part 2',
        unit: 'Optics',
        topics: [],
      },
    ]);
  });

  it('report limits across the tree', () => {
    const many = Array.from({ length: 151 }, (_, i) => chapter(`C${i}`));
    expect(treeProblems('Physics', [{ name: '', chapters: many }])).toContain(
      'Physics: at most 150 chapters',
    );
    expect(treeProblems('Physics', [{ name: 'U', chapters: [chapter('A')] }])).toEqual([]);
  });

  it('merge by name without removing anything', () => {
    const stats = { added: zeroCounts(), updated: zeroCounts() };
    const merged = mergeUnits(
      [{ name: 'Mechanics', chapters: [chapter('Kinematics', { weightage: 8 })] }],
      [
        {
          name: 'mechanics',
          chapters: [
            chapter('KINEMATICS', {
              difficulty: 3,
              topics: [{ name: 'Graphs', important: true, subtopics: [] }],
            }),
            chapter('Work'),
          ],
        },
      ],
      stats,
    );
    expect(merged[0]!.chapters.map((c) => [c.name, c.difficulty, c.weightage])).toEqual([
      ['Kinematics', 3, 8],
      ['Work', 2, undefined],
    ]);
    expect(stats).toEqual({
      added: { units: 0, chapters: 1, topics: 1, subtopics: 0 },
      updated: { units: 0, chapters: 1, topics: 0, subtopics: 0 },
    });
  });

  it('fill in a standard chapter list in the unnamed unit only', () => {
    const units: UnitNode[] = [
      { name: 'Extra', chapters: [chapter('Mine')] },
      { name: '', chapters: [chapter('Two')] },
    ];
    const merged = mergeStandardUnits(units, [
      chapter('One', { book: 'B' }),
      chapter('Two', { book: 'B' }),
    ]);
    expect(merged!.map((u) => [u.name, u.chapters.map((c) => c.name)])).toEqual([
      ['Extra', ['Mine']],
      ['', ['One', 'Two']],
    ]);
    expect(
      mergeStandardUnits(merged!, [chapter('One', { book: 'B' }), chapter('Two', { book: 'B' })]),
    ).toBeNull();
  });
});

describe('CSV', () => {
  it('reads quotes, escaped quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿a,"b,c","say ""hi"""\r\n1,,3\n"multi\nline",x')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '', '3'],
      ['multi\nline', 'x'],
    ]);
  });

  it('writes what it reads', () => {
    const rows = [
      ['subject', 'chapter'],
      ['Physics', 'Laws of Motion, Friction'],
      ['Hindi', 'दो "बैलों" की कथा'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('logo images', () => {
  it('are recognised by their first bytes', () => {
    expect(sniffImage(Buffer.from('89504e470d0a1a0a0000', 'hex'))).toBe('image/png');
    expect(sniffImage(Buffer.from('ffd8ffe000104a46', 'hex'))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii'))).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe('catalogue cache', () => {
  it('keeps lists for a while and syllabi until evicted', async () => {
    let now = 0;
    const cache = new CatalogCache(1000, 2, () => now);
    let loads = 0;
    const load = () => Promise.resolve(++loads);
    expect(await cache.list('a', load)).toBe(1);
    expect(await cache.list('a', load)).toBe(1);
    now = 1001;
    expect(await cache.list('a', load)).toBe(2);
    cache.invalidate();
    expect(await cache.list('a', load)).toBe(3);

    await cache.syllabus('x', load);
    await cache.syllabus('y', load);
    await cache.syllabus('x', load); // x is now the most recent
    await cache.syllabus('z', load); // evicts y
    const before = loads;
    await cache.syllabus('x', load);
    await cache.syllabus('y', load);
    expect(loads).toBe(before + 1);
  });
});
