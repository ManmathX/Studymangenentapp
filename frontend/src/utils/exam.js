/**
 * How a student's exam reads in headings: "Class 10, CBSE", "JEE Main", "Prelims, UPSC Civil
 * Services". Plans from before exams only have a board and a class, and read as before.
 */
export function examLabel({ boardName, board, levelName, cls } = {}) {
  const exam = boardName ?? board ?? '';
  if (levelName) return `${levelName}, ${exam}`;
  if (cls) return `Class ${cls}, ${exam}`;
  return exam;
}

/** Folds case and accents so "neet" finds "NEET UG". */
export const fold = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Exams whose name, short name, code, description, category or state contain the search. */
export function searchExams(exams, query, category) {
  const needle = fold(query.trim());
  return exams.filter(
    (exam) => (!category || exam.category === category) && (!needle || [exam.name, exam.shortName, exam.code, exam.description, exam.categoryName, exam.state].some((field) => fold(field).includes(needle))),
  );
}
