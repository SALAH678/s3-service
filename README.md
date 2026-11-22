# S3 Learning Simulator

A front-end-only educational reproduction of Amazon S3 and the AWS S3 console for AWS Cloud Club events. It teaches buckets, versioning, storage classes, lifecycle rules, and cost with a virtual clock. No AWS account, credentials, backend, or real AWS resources are required.

The original AWS console simulator remains available at `/console/buckets`. The guided learning simulator is at **`/console/learn`** (also linked from the landing page and sidebar).

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 (AWS console styling is also provided with plain CSS variables)
- Zustand store with `persist` middleware for localStorage
- IndexedDB (`idb`) for uploaded file blobs
- Recharts for cost charts
- Lucide icons and CodeMirror for JSON editing in the console views

## Learning simulator features

1. **Create bucket**
   - Live validation for 3-63 characters, lowercase letters/numbers/hyphens, no underscores, no IP-shaped names, and simulator-wide uniqueness.
   - AWS-style error codes: `InvalidBucketName`, `BucketAlreadyExists`, `BucketNotEmpty`, `NoSuchBucket`, `NoSuchKey`, `InvalidObjectState`.
2. **Versioning**
   - `Unversioned -> Enabled -> Suspended` state machine.
   - Invalid transitions are disabled with an explanatory tooltip. A bucket can never return to `Unversioned`.
3. **Object browser**
   - Prefix navigation with breadcrumbs, search, create folder, show-versions switch, and AWS-style columns.
4. **Upload dialog**
   - Simulated object size slider or a real file, storage class, user metadata, and object tags.
5. **Version timeline**
   - Ordered versions and delete markers, current-version marker, restore-as-a-copy, and permanent delete by version ID.
   - A plain delete in a versioned bucket adds a delete marker; removing the marker restores the object.
6. **Storage class picker**
   - Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Glacier Instant Retrieval, Glacier Flexible Retrieval, and Glacier Deep Archive.
   - Shows minimum storage duration, minimum billable object size, price per GB-month, retrieval fee, estimated monthly cost, and early-deletion warnings.
7. **Virtual clock**
   - `+1 day`, `+30 days`, `+90 days`, and reset.
   - Runs lifecycle transitions, expirations, noncurrent actions, multipart cleanup, and cost accrual day by day.
8. **Cost meter and chart**
   - Running total, storage cost, early-deletion charges, and a stacked Recharts chart of cost by storage class over simulated time.
9. **CLI/JSON panel**
   - Every simulator action records the equivalent `aws s3api ...` command and a realistic JSON response with Copy buttons.
10. **Lifecycle builder**
    - Rule name, prefix/tag/size filters, transitions, expiration, noncurrent transitions/expiration, and abort-incomplete-multipart settings.
    - Visual day 0 / 30 / 90 / 365 timeline.
    - Real S3 validation messages, including minimum transition days, Glacier ordering, expiration ordering, duplicate transition days, and minimum object-size warnings.
11. **Scenario player**
    - "Create a bucket", "Enable versioning and recover a deleted file", "Cut costs with a lifecycle rule", and "Why early deletion costs money".
    - Back/Next controls and `data-tour` highlighting of the relevant UI.
12. **Save, load, reset**
    - Reset to the seeded demo state, export the full simulator state as JSON, and import it back.

## Existing console simulator

The original console experience still works and includes bucket creation, policies, CORS, encryption, access points, replication, pricing, IAM simulation, an AWS CLI terminal, tutorials, and JSON export/import.

## Run locally

```powershell
npm install
npm run dev
```

Open:

- `http://localhost:5173/` — landing page
- `http://localhost:5173/console/learn` — learning simulator
- `http://localhost:5173/console/buckets` — AWS console simulator

## Validation

```powershell
npm test
npm run lint
npm run build
npm run preview
```

## Docker deployment

```powershell
docker compose up --build -d
```

The static site is available at `http://localhost:8080`.

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, AWS theme, routing, seed data | Complete |
| 2 | Bucket creation, validation, object browser, folders, uploads | Complete |
| 3 | Versioning state machine, version timeline, delete markers, restore | Complete |
| 4 | Storage classes, early-deletion rules, virtual clock, cost meter/chart | Complete |
| 5 | Lifecycle builder, validation, visual timeline, simulation engine | Complete |
| 6 | CLI/JSON action panel | Complete |
| 7 | Guided scenario player and highlights | Complete |
| 8 | Reset, export/import, README, presenter script | Complete |

## Persistence

- Bucket/object metadata, versions, lifecycle rules, clock, cost history, and activity are persisted in `localStorage`.
- Uploaded file blobs are stored in IndexedDB. Simulated objects without a real file need no blob.
- "Reset simulator" restores the seeded `cloud-club-demo` and `cloud-club-archive` buckets and clears IndexedDB blobs.

See [PRESENTER_SCRIPT.md](./PRESENTER_SCRIPT.md) for a short demo script.
