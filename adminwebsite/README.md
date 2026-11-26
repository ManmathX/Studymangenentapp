# Exam Admin

Admin portal for the Study Planner's exam catalogue: categories, school boards and competitive
exams (JEE, NEET, UPSC…), and each exam's versioned syllabus: subjects, units, chapters, topics
and subtopics. Students pick from what is published here during setup. How it works:
[docs/exam-catalogue.md](../docs/exam-catalogue.md).

| Page | |
| --- | --- |
| Dashboard | Totals of boards, exams, subjects, chapters, topics, drafts and published syllabi, by category, status and year |
| Exams | Search and filter, drag to set the order, switch exams on and off, add an exam, or add a state board in one step (classes 6–12 filled in, syllabus optionally copied from CBSE or another published board) |
| Exam | Details, and its syllabus versions: open, copy, publish, unpublish, delete |
| Syllabus | The editor: subjects by level, a drag-and-drop tree of units, chapters, topics and subtopics, details (importance, weightage, marks, priority, class, book), paste an outline, import and export CSV/JSON |
| Categories | Add, rename, hide and order categories |
| Team | Admins give accounts the editor or admin role |

```bash
cp .env.example .env.local   # VITE_API_URL: the API, default http://localhost:4000
npm ci
npm run dev                  # http://localhost:5173
```

- Sign in with an **admin** or **editor** account (`npm run create-admin` in `backend/`). Editors can't publish, delete or manage the team. Other accounts are turned away.
- The API must list this site's origin in `CORS_ORIGINS`.
- `npm run lint` checks the code; `npm run build` writes `dist/`. Serve it with unknown paths falling back to `index.html`.

Only drafts are edited; publishing one makes it what new students get. Students already using the app keep their own copy of the chapters.
