# Exam catalogue

How boards, competitive exams and their syllabi work: the model, the admin workflow, the API, import and export formats, and how older data and app builds are kept working.

Code: `backend/src/modules/syllabus/`. Admin pages: `adminwebsite/src/pages/`. App: `frontend/src/screens/onboarding/ExamStep.js`.

## Model

```
Category ─┬─ Exam ─┬─ Syllabus version (academic year, draft | published | archived)
          │        │    └─ Subject (at a level, or none) ─ Unit? ─ Chapter ─ Topic? ─ Subtopic?
          │        └─ Logo (optional image)
```

| Thing | What it holds |
| --- | --- |
| **Category** | How students browse: School Boards, Engineering Entrance, Medical Entrance, University Entrance, Government Exams, Olympiads, Other Exams. Admins add, rename, hide and reorder them. `group` is `board` (school boards) or `exam`; the dashboard counts boards by it. |
| **Exam** | A school board or a competitive exam: name, short name, permanent `code`, category, description, colour, logo, conducting body, region and state, eligibility, target classes, structure, languages, active flag, display order, and free-form settings (up to 30 key/value pairs). |
| **Structure** | Which optional parts of the hierarchy the exam uses and what they are called. Levels (`Class 6`…`Class 12`, `Prelims`/`Mains`, or none), units (`Unit`, `Section`, `Book`…), topics, subtopics. A level with a `grade` is a school class. |
| **Syllabus version** | One exam's syllabus for an academic year (`2026-27`, or `2027` for exams held once a year), numbered v1, v2… per year. |
| **Subject** | One subject at one level of a version, with its whole tree embedded. Saved as a unit, guarded by a `revision` number. |

Subjects and chapters always exist, because the app's planner schedules chapters of subjects. Everything else is optional per exam:

| Exam | Levels | Units | Example path |
| --- | --- | --- | --- |
| CBSE | Class 6–12 | no | CBSE → Class 10 → Science → Chapter → Topic |
| JEE Main | none | Unit | JEE Main → Physics → Mechanics → Kinematics → Projectile motion |
| NEET UG | none | Unit | NEET UG → Biology → Botany → Cell: The Unit of Life → Topic |
| UPSC CSE | Prelims, Mains | Section | UPSC → Prelims → General Studies → History → Modern India → Topic → Subtopic |

Chapter details: difficulty (1–3, used by the planner), book, important, weightage (%), marks, priority (high/medium/low), and the school class it is taught in (for exams without class levels, e.g. 11 or 12 for JEE). Topics have important, weightage, marks and priority; subtopics have important.

Limits: 40 subjects per level, 40 units, 150 chapters and 4,000 items per subject, 80 topics per chapter, 50 subtopics per topic.

## Lifecycle

1. **Draft.** Only drafts can be edited. A new exam gets an empty first draft. "New draft" starts empty or copies any version of any exam (and, between exams with different levels, a chosen level into a chosen level).
2. **Publish.** Makes the version the one new students get. The exam's previously published version is archived in the same transaction; the database also refuses two published versions of one exam. Publishing needs at least one subject with chapters.
3. **Change a published syllabus.** "Start a new draft from this", edit, publish. Archived versions can be published again or deleted.
4. **Unpublish** takes the published version back to draft. Until another version is published, new students can't pick the exam.

Students already set up keep their own copy on their phone, so publishing only affects students who set up afterwards.

**What students see.** Only active exams in active categories that have a published syllabus with chapters, and only the levels that have chapters. Nothing is listed as "coming soon".

## Roles

| Role | Can |
| --- | --- |
| `student` | Use the app. No admin access. |
| `editor` | Read everything in the portal; create and edit exams and categories; edit drafts (subjects, trees, import, copy, duplicate). |
| `admin` | Everything an editor can, plus publish and unpublish, delete exams, categories and versions, manage roles (Team page) and read the audit log. |

Roles map to permissions in `backend/src/common/http/permissions.ts`; routes ask for a permission (`catalog:read`, `catalog:write`, `catalog:publish`, `users:manage`, `audit:read`). The user object returned at sign-in lists the account's permissions, and the portal hides what the account can't do. Create staff accounts with `ADMIN_EMAIL=… ADMIN_PASSWORD=… [ADMIN_ROLE=editor] npm run create-admin` in `backend/`, or change roles on the Team page.

Every admin change is written to the audit log (`admin.exam_changed`, `admin.syllabus_changed`, with an `op`).

## API

Swagger UI at `/docs` documents every endpoint and its schema.

**Students** (signed in):

| Endpoint | |
| --- | --- |
| `GET /api/v1/syllabus/categories` | Active categories with the number of exams students can pick |
| `GET /api/v1/syllabus/exams?category=&q=&page=&limit=` | Exams students can pick, in display order |
| `GET /api/v1/syllabus/exams/:code` | One exam: eligibility, levels, published version |
| `GET /api/v1/syllabus/exams/:code/subjects?level=` | The published syllabus at a level: subjects, chapters (keyed `<subject>-<n>`, with unit, details and topics) |
| `GET /api/v1/syllabus/exams/:code/logo` | The logo image (public; cached for a year, the URL carries a content hash) |
| `GET /api/v1/syllabus/boards`, `/classes?board=`, `/:cls?board=` | Unchanged endpoints for app builds from before exams. They list school-board exams with classes 6–12 only, in the old shapes |

**Admin portal**: `/api/v1/admin/dashboard`, `/admin/exam-categories`, `/admin/exams`, `/admin/exams/:code/syllabi`, `/admin/syllabi/:id` (with `/publish`, `/unpublish`, `/duplicate`, `/import`, `/export`, `/subjects`, `/subjects/order`, `/levels/:level/copy`), `/admin/syllabus-subjects/:id`, `/admin/exams/standard` (load the standard CBSE and ICSE syllabus into drafts). Admin routes accept bodies up to 2 MB; everything else stays at 100 kB.

Lists of exams are small, so the student list is cached in the server's memory for 30 seconds (cleared on admin changes in that process). Published syllabi can't change, so their payloads are cached by version until evicted.

## Import and export

Export from the syllabus page as **CSV** (whole syllabus or one level) or **JSON** (lossless). Import either back into a draft. Every import is previewed first (a dry run that reports what would be added and updated, or each problem with its row number), then applied.

- **Merge** (default) matches subjects, units, chapters, topics and subtopics by name (ignoring case), updates what the file sets, adds what is new, and never removes anything. From CSV, only the columns a row fills in overwrite existing details.
- **Replace** replaces every subject at the levels the file mentions with the file's subjects. Other levels are left alone.

### CSV

One row per unit, chapter, topic or subtopic. The deepest name column a row fills in says which item it is; its other columns set that item's details. Parents are created from the names on the way down. Only `subject` is required.

```csv
level,subject,unit,chapter,topic,subtopic,difficulty,weightage,marks,priority,important,grade,book
,Physics,Mechanics,,,,,30,,,,,
,Physics,Mechanics,Kinematics,,,2,8,,high,yes,11,
,Physics,Mechanics,Kinematics,Projectile motion,,,,,,yes,,
,Physics,Mechanics,Kinematics,Projectile motion,Range,,,,,,,
,Physics,Mechanics,"Laws of Motion, Friction",,,hard,,,,,11,
```

- `level`: a level key or name (`10`, `Class 10`, `prelims`). Leave empty for exams without levels.
- `difficulty`: 1–3 or easy/medium/hard (chapters only). `weightage`: 0–100 (a trailing `%` is fine). `marks`: 0–1000. `priority`: high/medium/low. `important`: yes/no.
- `grade`: class 1–12 (chapters). `book`: chapters only.
- Unknown columns and levels are reported, and nothing is written until every row is valid.

### JSON

The export file: `{ "format": "study-planner-syllabus", "exam", "academicYear", …, "subjects": [ { "level", "subjectId", "name", "color", "units": [ { "name", "chapters": [ { "name", "difficulty", "topics": [ { "name", "subtopics": [ … ] } ] } ] } ] } ] }`. Only `subjects` is read on import.

## Logos

PNG, JPEG or WebP, at most 200 kB, checked by their first bytes (SVG is refused: phones can't show it and it can carry scripts). Stored in MongoDB (`catalog_exam_logos`). Without a logo, the portal and the app show a coloured badge with the exam's short name.

## Upgrading an existing database

The first catalogue request after deploying runs a one-time setup, in one transaction, recorded in `catalog_migrations`:

1. Adds the default categories.
2. If the database has boards from the board-only catalogue (`boards`, `catalogsubjects`), copies each board into an exam in School Boards (classes 6–12, the board's national/state kind as its region) and its subjects into a **published** syllabus for the current academic year. On a fresh database it loads the standard CBSE and ICSE syllabus instead.
3. Adds JEE Main, JEE Advanced, NEET UG, CUET UG, UPSC CSE, NDA, NSO and IMO with their conducting body, eligibility, languages and subjects, each with an empty draft. Students don't see them until an admin fills in a syllabus and publishes it.
4. A second step (`exam-catalogue-v2-more-boards`) adds NIOS and the state boards: Andhra Pradesh, Assam, Bihar, Chhattisgarh, Goa, Gujarat, Haryana, Himachal Pradesh, Jammu and Kashmir, Jharkhand, Karnataka, Kerala, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Punjab, Rajasthan, Tamil Nadu, Telangana, Tripura, Uttar Pradesh, Uttarakhand and West Bengal. Each gets classes 6–12 (NIOS: Secondary and Senior Secondary), its conducting bodies and languages, and an empty draft. A board the catalogue already has, by code, state name, short name or a common alias such as "UP Board", is skipped. States whose schools follow CBSE (Arunachal Pradesh, Sikkim, most union territories) aren't listed. To make one available, open its draft, add subjects or copy them from CBSE where the board uses NCERT books, and publish.

Admins add any other board with **Exams → Add state board**: the form starts in School Boards with region State and classes 6–12, the code defaults to the state (`sikkim`) when that is free, and the first draft can start from a published board's syllabus, copied class by class.

The legacy `boards` and `catalogsubjects` collections are left as they were, so the previous version can be rolled back to. App builds that call `/syllabus/boards`, `/classes` and `/:cls` get exactly the responses they got before; boards added later appear there once they are published (checked by copying a database with a state board, an edited CBSE class and a copied class, and comparing every response).

The catalogue's collections are all named `catalog_*` (`catalog_exam_categories`, `catalog_exams`, `catalog_exam_logos`, `catalog_syllabus_versions`, `catalog_syllabus_subjects`, `catalog_migrations`), because older databases still hold the server-side planner's `exams`, `chapters`… collections, which `npm run drop-planner-data` deletes.

## On the phone

The app's first setup step lists categories and exams from the server, with search. After the exam, it asks for the class or stage when the exam has levels. The syllabus is downloaded once at setup. Each chapter keeps its unit, importance, weightage, marks, class and topics, which show in the chapter list and on the chapter's page; the planner schedules chapters as before. The profile stores the exam code (as `board`), its name, the level and the class (`cls`, null for exams without classes). Plans made before exams keep working unchanged.
