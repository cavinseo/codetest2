# Kano QFD Web App

Kano survey, customer requirements, QFD worksheets, sales estimates, funding plans, and related product planning data are managed in a Next.js application backed by Prisma and PostgreSQL.

## Tech Stack

- Next.js 15
- React 19
- Prisma 6
- PostgreSQL 16
- Vitest
- ESLint
- Tailwind CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Prepare the local database:

```bash
npx prisma migrate deploy
npx prisma generate
```

Start the development server:

```bash
npm run dev
```

The app runs on `http://localhost:3000` by default. If that port is already in use, Next.js will choose another available port.

## Quality Checks

Run focused and full checks before sharing changes:

```bash
npm run test
npm run lint
npm run build
```

Validate Prisma schema and migration status:

```bash
npx prisma validate
npx prisma migrate status
```

## Local Data Handling

`prisma/dev.db` is the pre-migration local SQLite database. It is no longer used by the app but still contains private test data, so it stays untracked. It can contain private test data, business ideas, customer requirements, survey responses, or imported workbook contents.

Do not commit local database files. The repository ignores:

```gitignore
prisma/dev.db
prisma/dev.db-*
*.sqlite
*.sqlite3
```

If a local database has already been tracked by Git, keep the file locally but remove it from Git tracking:

```bash
git rm --cached -- prisma/dev.db
```

If a database containing private data was pushed to a remote repository, remove it from Git history before sharing the repository externally.

## Workbook Imports

Workbook import flows support preview and apply modes. Prefer preview first, then apply only the intended sheets. Existing import history is recorded in the database through `migration_histories`, but the local database itself remains private and untracked.

## Notes

- Keep generated build output such as `.next/` out of version control.
- Keep `.env*` files local.
- Treat test emails, imported survey responses, and business planning examples as private development data unless explicitly sanitized.
