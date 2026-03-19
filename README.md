# NAC Attendance Management (Next.js + Postgres)

This is the migrated application from Django to Next.js, preserving:

- Username/password authentication with session cookie
- Department-scoped access control
- File upload and attendance processing
- File preview and leave detail summaries
- Staff CRUD
- Section CRUD
- Detailed attendance report download
- Monthly wages report download
- Section segregation ZIP report download

## Stack

- Next.js (App Router)
- Prisma 7 + PostgreSQL (`@prisma/adapter-pg`)
- TypeScript attendance/report processing (xlsx + exceljs)

## Environment

Create `.env` (or copy from `.env.example`):

```env
DATABASE_URL="postgresql://postgres:Testing@123@localhost:5432/admin_db?schema=public"
AUTH_SECRET="change-me"
APP_ORIGIN="http://localhost:3000"
```

## Install

```bash
npm install
npx prisma generate
```

## Seed users

```bash
npm run prisma:seed
```

Default credentials:

- `superadmin / superadmin123`
- `admin / admin123`
- `manager / manager123`
- `user / user123`

## Run

```bash
npm run dev
```

Open: `http://localhost:3000`

## Build verification

```bash
npm run build
```

## Media storage

- Uploaded files: `media/uploads`
- Processed/report files: `media/processed`

## Notes

- The original Django project has been removed from the repository root.
- Attendance parsing and report generation are implemented in Next.js server code.
