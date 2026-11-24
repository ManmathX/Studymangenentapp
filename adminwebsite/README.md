# Syllabus Admin

Admin portal for the Study Planner: boards (CBSE, ICSE, state boards), and for each class its
subjects, chapter lists and chapter difficulty. Students pick from this catalogue during setup.

```bash
cp .env.example .env.local   # VITE_API_URL: the API, default http://localhost:4000
npm ci
npm run dev                  # http://localhost:5173
```

- Sign in with an **admin** account (`npm run create-admin` in `backend/`). Other accounts are turned away.
- The API must list this site's origin in `CORS_ORIGINS`.
- `npm run lint` checks the code; `npm run build` writes `dist/`. Serve it with unknown paths falling back to `index.html`.

Edits apply to students who set up afterwards. Students already using the app keep their own copy of the chapters.
