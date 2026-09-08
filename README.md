# Document Management System

Cloud-based DMS: auth, folders, S3-backed file storage with version history,
role-based access control + sharing, real-time presence/comments, audit
logging, search/tagging, a trash/restore view, and an admin console for user
management. See [Known limitations](#known-limitations) for what's
intentionally out of scope.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS — [frontend/](frontend/)
- **Backend**: Express + TypeScript + Prisma + Socket.IO — [backend/](backend/)
- **Database**: PostgreSQL (with native full-text search)
- **Object storage**: S3-compatible (MinIO locally, AWS S3 in production)
- **Local dev infra**: Docker Compose ([docker-compose.yml](docker-compose.yml)) running Postgres + MinIO — *or* a Docker-free local setup (see below), which is what's actually running on this machine right now.

## Prerequisites

- Node.js 20+
- Either Docker Desktop, **or** a locally installed PostgreSQL + the MinIO
  binary (no admin rights beyond running an .exe needed) — see
  [Local setup without Docker](#local-setup-without-docker). This repo was
  verified end-to-end using the Docker-free path since Docker wasn't
  available in the environment it was built in.

## Local setup (Docker)

1. **Start infra** (Postgres + MinIO, with the `dms-documents` bucket and CORS
   auto-created):

   ```
   docker compose up -d
   ```

   MinIO console: http://localhost:9001 (user `dms-minio` / password `dms-minio-secret`)

2. **Backend**:

   ```
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```

   Runs on http://localhost:4000 (HTTP API + Socket.IO on the same port).
   `npx prisma migrate dev` creates the schema in Postgres from
   [prisma/schema.prisma](backend/prisma/schema.prisma), including the
   `fullTextSearch` preview feature used for search — no Postgres extensions
   required, it's built on core `to_tsvector`/`to_tsquery`.

3. **Frontend**:

   ```
   cd frontend
   cp .env.local.example .env.local
   npm install
   npm run dev
   ```

   Runs on http://localhost:3000.

4. Open http://localhost:3000, register an account, create a folder, and
   upload a file. Uploads go straight from the browser to MinIO via a
   pre-signed URL — the file body never passes through the Express server.

## Local setup without Docker

This is the setup that was verified on the development machine:

1. **PostgreSQL**: install natively (e.g. the EDB Windows installer) instead
   of via Docker. Then create the app's role/database once:
   ```
   psql -h 127.0.0.1 -U postgres -c "CREATE ROLE dms LOGIN PASSWORD 'dms' CREATEDB;"
   psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE dms OWNER dms;"
   ```
   (`CREATEDB` is needed because `prisma migrate dev` creates a throwaway
   shadow database to diff against.)
2. **MinIO**: no install needed — it ships as a single binary. Download
   `minio.exe` from https://dl.min.io/server/minio/release/windows-amd64/minio.exe
   into `infra/minio/`, then run `infra\minio\start-minio.ps1`. That script
   sets a static single-key `MINIO_KMS_SECRET_KEY` so SSE-S3 (`AES256`)
   uploads work locally — MinIO's S3 API returns `NotImplemented` for
   `x-amz-server-side-encryption: AES256` without *some* KMS configured, even
   though real AWS S3 needs no such setup for SSE-S3. The `mc.exe` client
   (same download host, `client/mc/release/windows-amd64/mc.exe`) is only
   needed if you want to inspect the bucket by hand (`mc.exe ls local/dms-documents`).
   To create the `dms-documents` bucket itself and enable versioning on it
   (the `docker-compose.yml` `minio-init` service does this automatically in
   the Docker path), run `node backend/scripts/setup-minio.mjs` once against
   a running MinIO. Bucket-level CORS is not needed — this MinIO build already
   reflects the `Origin` header automatically per-request.
3. **Backend and frontend**: same as the Docker path (steps 2–4 above), just
   without `docker compose up -d` first.
4. Or use `start-demo.ps1` at the repo root to launch MinIO, the backend, and
   the frontend together in separate windows in one shot (Postgres runs as an
   always-on Windows service so it doesn't need starting).

## How the upload flow works

1. Frontend asks the backend for a pre-signed `PUT` URL:
   `POST /api/documents/presign-upload`.
2. Browser uploads the file directly to S3/MinIO with that URL.
3. Frontend tells the backend the upload finished: `POST /api/documents`,
   which records the document + its first `DocumentVersion` row.
4. Downloads work the same way in reverse: `GET /api/documents/:id/download-url`
   returns a short-lived pre-signed `GET` URL.

Two things had to be fixed to make this actually work end-to-end against S3/MinIO
(found by testing the real upload flow with `curl`, not just typechecking):

- **`requestChecksumCalculation`/`responseChecksumValidation` must be
  `"WHEN_REQUIRED"`** on the `S3Client` (`backend/src/lib/s3.ts`). The AWS SDK
  v3's newer default (`WHEN_SUPPORTED`) silently adds an `x-amz-checksum-*`
  query parameter to presigned URLs; a plain browser `fetch()` PUT never sends
  a matching header, so S3/MinIO rejects the upload as "headers present which
  were not signed." Frontend code was never wrong here — this is a backend
  signing-config issue.
- **The frontend's upload `fetch()` must send `x-amz-server-side-encryption:
  AES256`** (`frontend/src/lib/api.ts`, `uploadToPresignedUrl`) because the
  presigned URL includes `ServerSideEncryption: AES256` as a signed parameter.
  Any header the backend signs into the URL, the client's actual PUT request
  must also send verbatim, or S3/MinIO rejects it the same way.

Buckets are never public. Every object read/write goes through a time-limited
signed URL, and objects are written with `ServerSideEncryption: AES256` (S3
SSE), matching the spec's "signed URLs, not public buckets" and "encryption at
rest" requirements. TLS covers data in transit once deployed behind HTTPS
(`app.set("trust proxy", 1)` is enabled in production for correct `req.ip`/
`req.secure` behind a load balancer).

## Auth model

Custom JWT auth (not NextAuth): short-lived access token (15m) returned in the
response body and kept in memory on the client; a long-lived refresh token
(30d) in an `httpOnly` cookie scoped to `/api/auth`, rotated on every refresh
and revocable server-side (`refresh_tokens` table). The frontend transparently
refreshes the access token on a 401 via `frontend/src/lib/api.ts`.

Every user carries a **system role** (`USER` or `ADMIN`, on the `User` row and
embedded in the access token) that's distinct from the per-resource roles
below. The first account to register on an empty database is made `ADMIN`
automatically; thereafter admins are managed from the admin console (or the
`npm run set-admin -- <email>` CLI in `backend/`). Deactivated accounts
(`deactivatedAt`) are blocked at login and refresh, and have all refresh
tokens revoked on deactivation. See [Admin console](#admin-console).

**Password management.** A logged-in user can change their own password from
the drive header ("Password" button → verify current password, set a new one:
`POST /api/auth/change-password`). Admins can reset any user's password from the
admin console: the server generates a strong temporary password and returns it
once for the admin to relay out-of-band, or the admin can supply an explicit one
(`PATCH /api/admin/users/:id/password`). Either path revokes all of the target
user's refresh tokens so old sessions end immediately, and both actions are
audit-logged (`PASSWORD_CHANGE` / `PASSWORD_RESET`). There's no self-service
email-based "forgot password" reset — that needs email/SMTP delivery, which
isn't wired up (see [Known limitations](#known-limitations)).

## Access control

`permissions` table grants a `VIEWER < COMMENTER < EDITOR < OWNER` role on a
folder or document to a specific user. A folder's role is inherited by its
subfolders and documents unless a more specific grant overrides it (see
`backend/src/services/permission.service.ts`). The resource owner always has
`OWNER`. Sharing is exposed in the UI via the "Share" action on a document.

## Version history

Every upload — the first one or a replacement — creates an immutable
`DocumentVersion` row (`documentId`, `versionNumber`, `s3Key`, `size`,
`mimeType`, `createdBy`, `createdAt`); `Document.currentVersionId` always
points at the latest one. From a document's detail page (`/drive/documents/:id`,
Versions tab) you can upload a new version, download any prior version, and
select two versions to diff — for text-based files (`text/*`,
`application/json`, `application/xml`) the diff is computed client-side with
the `diff` package after fetching each version's raw text through a
pre-signed URL; binary formats can be downloaded and compared manually but
aren't diffed inline.

## Real-time collaboration

Socket.IO, authenticated with the same JWT access token (`socket.handshake.auth.token`),
one room per document (`document:{id}`, joined only if the socket's user has
at least `VIEWER` access — checked server-side in `backend/src/realtime/socket.ts`).
Two things are real-time:

- **Presence**: who currently has the document's detail page open, shown as
  avatar initials on the Comments tab, broadcast on join/leave/disconnect.
- **Comments & @mentions**: posting a comment persists via REST
  (`POST /api/documents/:id/comments`) and is then broadcast to everyone in
  the room; `@name` tokens are visually highlighted and recorded in the audit
  log's metadata, and now also generate in-app notifications (see
  [Notifications](#notifications)).

Full CRDT-based simultaneous text editing (Yjs) was scoped out — see
[Known limitations](#known-limitations).

## Notifications

In-app notifications, delivered live over the same Socket.IO connection via a
per-user room (`user:{id}`, joined server-side on authenticated connect) and
also fetched on page load. A bell with an unread badge lives in the drive
header (`frontend/src/components/NotificationBell.tsx`); clicking a
notification marks it read and opens the target document/folder. Four events
notify the affected user (never yourself):

- **Shared with me** — someone grants you access to a document or folder.
- **Access removed** — someone revokes your access.
- **@mentioned** — an `@localpart` in a comment resolves to your account
  (matched against your email's local-part, and only if you can already see the
  document — see `resolveMentionedUsers` in
  `backend/src/services/comment.service.ts`).
- **Comment on my document** — someone comments on a document you own (skipped
  if you were already @mentioned in that comment).

Notifications live in their own `notifications` table (recipient, type,
message, optional resource link, `readAt`), distinct from the resource-keyed
audit log. Creation is best-effort and never breaks the triggering request
(`backend/src/services/notification.service.ts`), mirroring the audit-log
pattern. Endpoints: `GET /api/notifications`, `POST /api/notifications/:id/read`,
`POST /api/notifications/read-all`. There's still no email/push delivery — see
[Known limitations](#known-limitations).

## Trash & restore

Deletes are soft (`deletedAt`), and a per-user **Trash** view (`/drive/trash`)
lists the caller's deleted folders and documents with a per-item Restore
action (`POST /api/folders/:id/restore`, `POST /api/documents/:id/restore`,
`GET /api/folders/trash`, `GET /api/documents/trash`). Restore is owner-only.
If an item's original parent folder is still deleted, restoring detaches the
item to the drive root rather than resurrecting the whole ancestor chain.

## Audit logs

Every login/logout/register, and every create/view/download/update/delete/
share/unshare/comment/upload-version on a document or folder, writes an
`audit_logs` row (actor, action, resource, IP address, JSON metadata,
timestamp). Viewable per-document/-folder by an `EDITOR` or the owner via the
Activity tab (`GET /api/documents/:id/audit-log`, `GET /api/folders/:id/audit-log`).
Admins additionally get a system-wide audit view (see
[Admin console](#admin-console)). Audit writes are best-effort and never fail
the primary request (see `backend/src/services/audit.service.ts`).

## Admin console

Users with the `ADMIN` system role get an admin area (`/admin`, linked from the
header) behind an `authenticate` + `requireAdmin` guard — `requireAdmin`
re-checks the database on every request, so a demoted or deactivated admin
loses access immediately rather than within the token window. It provides:

- **User management** (`GET /api/admin/users`): search by name/email, filter by
  status (all/active/deactivated), see each user's owned-document/-folder
  counts, and promote/revoke admin (`PATCH /api/admin/users/:id/role`) or
  deactivate/reactivate accounts (`PATCH /api/admin/users/:id/activation`).
  Guard rails prevent demoting or deactivating yourself and removing the last
  active admin. Role and activation changes are audit-logged
  (`PROMOTE`/`DEMOTE`/`DEACTIVATE`/`REACTIVATE`).
- **Global audit log** (`GET /api/admin/audit-log`): the system-wide activity
  feed with an action filter, not scoped to a single resource.

## Search & tagging

`GET /api/documents` accepts `q`, `tag`, `ownerId`, `mimeType` (prefix match,
e.g. `image/`), `updatedAfter`, `updatedBefore`, and `folderId`. `q` runs
Postgres full-text search (`to_tsvector`/`to_tsquery` via Prisma's
`fullTextSearch` preview feature, prefix-matched per word) across the
document name **and** extracted text content. Content extraction only runs
for text-ish uploads (`text/*`, `application/json`, `application/xml`, capped
at 200KB) — PDFs, Office docs, and images aren't parsed, matching the spec's
own phased plan ("PostgreSQL full-text search initially; Elasticsearch if
scale requires it"). Any search/filter criteria broadens the result set to
every folder the user can see; plain browsing with no filters stays scoped to
the current folder, like a normal file explorer.

## Known limitations

Intentionally out of scope for now:

- **CRDT co-editing** (Yjs simultaneous multi-user text editing) — presence
  and comments are real-time, but concurrent edits to the same file aren't
  merged live. Uploading a new version always replaces the current one
  (last-write-wins); there's no lock-on-edit or version branching.
- **Content extraction for binary formats** (PDF/Office/image OCR) — search
  only indexes plain-text file content, not binary document text.
- **Shareable links** with expiration/password (only user-to-user sharing via
  the Share dialog exists; no public/anonymous link generation).
- **OAuth** (Google/Microsoft) — email/password only.
- **Self-service "forgot password" email reset** — users who are still logged
  in can change their password, and admins can reset anyone's (see
  [Auth model](#auth-model)), but a fully locked-out user recovering via an
  emailed reset link needs email/SMTP delivery, which isn't set up.
- **Email/push notification delivery** — in-app notifications exist (bell +
  live updates for shares, mentions, and comments; see
  [Notifications](#notifications)), but nothing is delivered outside the app
  via email or push.

## Production notes

- Set real `DATABASE_URL`, `S3_*`, and long random `JWT_*_SECRET` values via
  environment variables — never commit `.env`.
- Point `S3_ENDPOINT` at AWS S3 (or omit the MinIO-only `S3_FORCE_PATH_STYLE`)
  and use an IAM user/role scoped to the one bucket.
- Enable S3 bucket versioning and automated PostgreSQL backups (per the spec's
  non-functional requirements) — not configurable from this repo, they're
  infra-level settings on the real bucket/database.
- For search performance at scale, add a GIN index on `to_tsvector('english',
  name || ' ' || coalesce("extractedText", ''))` — Prisma's `search` filter
  works without one, but a sequential scan won't hold up on a large table.
- The API is stateless for HTTP (JWT + Postgres), but Socket.IO presence is
  currently held in-process (`backend/src/realtime/socket.ts`), so running
  multiple backend instances behind a load balancer needs the Socket.IO Redis
  adapter for presence/broadcast to work across instances — not wired up here.
