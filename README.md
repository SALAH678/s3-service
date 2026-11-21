# S3 Simulator

S3 Simulator is a frontend-only educational reproduction of the Amazon S3 Management Console for AWS Cloud Club events. It uses React, TypeScript, Vite, Zustand, IndexedDB, CodeMirror, Lucide icons, Recharts, and Tailwind-compatible AWS styling.

No AWS account, credentials, REST API, backend, or real AWS resources are required.

## Implemented features

- AWS-style landing page and S3 console layout
- General purpose, directory, and table bucket views
- Bucket creation wizard and realistic name validation
- Bucket and object search, selection, ARNs, deletion, and folder navigation
- IndexedDB-backed file uploads and downloads
- Object properties, version indicators, storage classes, and activity logs
- Bucket versioning, SSE-S3/SSE-KMS/DSSE-KMS, KMS key selection, and Bucket Key
- Bucket policies and CORS editors with JSON validation
- Block Public Access warnings and Object Ownership controls
- Lifecycle rule creation and object transition controls
- Replication rule creation and simulated execution
- Recharts storage and object-count metrics
- AWS CLI terminal
- Pricing calculator
- IAM policy evaluation simulator
- Guided event tutorials
- JSON export/import
- Responsive desktop, tablet, and mobile layouts

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Use `http://localhost:5173/console/buckets` for the console.

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

## Demo script

1. Open the landing page and select **Get started**.
2. Create `cloud-club-demo-<initials>` in `US East (N. Virginia)`.
3. Upload an image or JSON file and open it in the object properties drawer.
4. Enable versioning, then upload the same key again to demonstrate version behavior.
5. Open Permissions, disable public access protection only after reviewing the warning, and save a public-read policy.
6. Open Management and create a lifecycle rule for the `images/` prefix.
7. Create a replication rule to the archive bucket and run replication.
8. Open CLI and run `aws s3 ls`, `aws s3 mb s3://cloud-club-cli`, and `aws s3 ls s3://cloud-club-cli`.
9. Open Pricing, IAM simulator, or Tutorials for audience questions.
10. Reset the simulator from the top navigation.

## Screenshots

Add workshop screenshots to `docs/screenshots/` and replace this section with those images before publishing.
