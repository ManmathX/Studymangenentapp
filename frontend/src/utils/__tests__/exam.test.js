import { examLabel, searchExams } from '../exam';

describe('exam labels', () => {
  it('read naturally for boards, exams and plans from before exams', () => {
    expect(examLabel({ boardName: 'CBSE', levelName: 'Class 10', cls: 10 })).toBe('Class 10, CBSE');
    expect(examLabel({ boardName: 'JEE Main', cls: null })).toBe('JEE Main');
    expect(examLabel({ boardName: 'UPSC Civil Services', levelName: 'Prelims' })).toBe('Prelims, UPSC Civil Services');
    // A plan made before exams: only a board code, name and class.
    expect(examLabel({ board: 'icse', boardName: 'ICSE', cls: 9 })).toBe('Class 9, ICSE');
    expect(examLabel({ board: 'odisha', cls: 8 })).toBe('Class 8, odisha');
  });
});

describe('exam search', () => {
  const exams = [
    { code: 'cbse', name: 'CBSE', shortName: 'CBSE', description: 'NCERT', category: 'school-boards', categoryName: 'School Boards', state: '' },
    { code: 'odisha', name: 'Odisha Board (BSE)', shortName: 'ODISHA', description: '', category: 'school-boards', categoryName: 'School Boards', state: 'Oḍiśā' },
    { code: 'neet-ug', name: 'NEET UG', shortName: 'NEET', description: 'Medical colleges', category: 'medical', categoryName: 'Medical Entrance', state: '' },
  ];
  it('matches names, codes, descriptions, categories and states, ignoring case and accents', () => {
    expect(searchExams(exams, 'neet', null).map((e) => e.code)).toEqual(['neet-ug']);
    expect(searchExams(exams, 'medical', null).map((e) => e.code)).toEqual(['neet-ug']);
    expect(searchExams(exams, 'odisa', null).map((e) => e.code)).toEqual(['odisha']);
    expect(searchExams(exams, ' ', 'school-boards').map((e) => e.code)).toEqual(['cbse', 'odisha']);
    expect(searchExams(exams, 'cbse', 'medical')).toEqual([]);
  });
});
