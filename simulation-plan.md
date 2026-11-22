# S3 Learning Simulator — 25-Minute Session Plan

## Goal

Explain the core ideas of Amazon S3 through a live browser simulation:

- Buckets, objects, keys, and prefixes
- Bucket naming rules and AWS error codes
- Versioning, delete markers, and recovery
- Storage classes and cost trade-offs
- Early-deletion charges
- Lifecycle rules and virtual time
- The AWS CLI/API behind the console

Audience: beginners at an AWS Cloud Club event.

Route: `http://localhost:5173/console/learn`

---

## Before the session

1. Run `npm install` and `npm run dev`.
2. Open `/console/learn`.
3. Click **Reset simulator**.
4. Set browser zoom to about 90%.
5. Confirm these are visible:
   - Left: create bucket, object browser, version timeline, lifecycle builder.
   - Right: cost meter, virtual clock, CLI/JSON panel.
6. Keep the page at the top before starting.

---

## 25-minute run of show

| Time | Segment | Main message |
| --- | --- | --- |
| 0-2 | Welcome and mental model | S3 stores objects in buckets; the console is an API UI |
| 2-5 | Create bucket | Names are global, unique, and validated |
| 5-8 | Objects and prefixes | S3 is flat; folders are simulated by key prefixes |
| 8-14 | Versioning and recovery | Delete is not always deletion |
| 14-18 | Storage classes | Cheap storage has conditions |
| 18-23 | Lifecycle and clock | Rules automate cost over time |
| 23-25 | CLI panel and recap | Every click maps to an API call |

---

## 1. Welcome and mental model (0-2 min)

Say:

> "S3 stores objects inside buckets. An object is data plus metadata, and its name is called a key. This simulator is browser-only, so we can break things without creating a real AWS bill."

Point to the three main areas:

- **Left:** buckets, objects, versions, lifecycle rules.
- **Right:** virtual clock, cost meter, and the real AWS CLI/JSON call.

Do not explain every button. Set the mental model and move on.

---

## 2. Create a bucket and show validation (2-5 min)

1. In **Create bucket**, type `My_Bucket`.
   - Show `InvalidBucketName`.
2. Type `cloud-club-demo`.
   - Show `BucketAlreadyExists`.
3. Type `cloud-club-lab-01`.
4. Choose a region and click **Create bucket**.

Teaching points:

- Names are 3-63 characters, lowercase, numbers and hyphens.
- No underscores and no IP-shaped names.
- Bucket names share a global namespace.
- Bucket data lives in a Region.
- The CLI panel shows `aws s3api create-bucket ...`.

Say:

> "The friendly form still enforces the same rules as the API."

---

## 3. Objects, keys, and prefixes (5-8 min)

1. Select `cloud-club-demo`.
2. Show `images/event.jpg`, `documents/s3-guide.pdf`, and `data/users.json`.
3. Click the `images` folder and show the breadcrumb.
4. Create `labs` inside the current prefix.
5. Upload:
   - Key: `labs/notes.txt`
   - Size: 10 MB simulated
   - Storage class: Standard

Teaching points:

- S3 has no real folders.
- `images/event.jpg` is one flat key.
- Prefixes simulate folders in the console.
- Object metadata and tags belong to the object, not the bucket.

---

## 4. Versioning and recovery (8-14 min)

This is the most important segment. Do not rush it.

1. Stay on `cloud-club-demo`, which is **Enabled**.
2. Show the versioning states:
   - Unversioned -> Enabled -> Suspended.
3. Hover the disabled **Unversioned** button.
   - Explain that a versioned bucket cannot return to Unversioned.
4. Upload `labs/notes.txt` again with a different size.
5. Click `labs/notes.txt`.
6. In **Version timeline**, show:
   - v1
   - v2
   - current version
7. Click **Delete** in the object browser.
8. Explain the delete marker:
   - The object disappears from a normal listing.
   - No data was destroyed.
   - All versions are still stored and billable.
9. In the timeline, delete the delete marker.
10. Show that the object is visible again.
11. Optionally click **Restore** on v1.
    - Explain that restore copies the old version as a new current version.

Ask:

> "If the bucket is versioned and I delete the object, am I still paying for storage?"

Answer: yes, until the versions expire or are permanently deleted.

---

## 5. Storage classes and early deletion (14-18 min)

1. In **Storage class picker**, select `images/event.jpg`.
2. Click **Glacier Deep Archive**.
3. Point out:
   - Minimum storage duration: 180 days.
   - Minimum billable object size: 40 KB.
   - Price per GB-month.
   - Retrieval fee.
   - Retrieval time.
   - Estimated monthly cost.
4. Click **Apply storage class**.
5. Read the early-deletion warning if one appears.

Teaching points:

- Cheaper storage is not free storage.
- Archive classes are cheap per GB but slow to retrieve.
- Small objects are billed at a minimum size.
- Leaving a class before its minimum duration can trigger a charge.

Say:

> "Standard is flexible. Deep Archive is cheap only if you leave the object alone for a long time."

---

## 6. Lifecycle rules and virtual clock (18-23 min)

1. In **Lifecycle builder**, create:
   - Name: `archive-images`
   - Prefix: `images/`
   - Transition day 30 -> Standard-IA
   - Add transition day 90 -> Glacier Flexible Retrieval
   - Expiration day 365
2. Show **Validation messages**.
3. Change the first transition to day 10.
   - Show the blocking error for Standard-IA.
4. Change it back to 30.
5. Show the **Visual timeline** for day 0 / 30 / 90 / 365.
6. Save the rule.
7. In **Virtual clock**, click **+30 days**.
8. Then click **+90 days**.
9. Watch:
   - Object storage class changes.
   - Lifecycle activity log.
   - Cost chart movement.

Teaching points:

- Lifecycle rules are automation, not one-off actions.
- Filters matter: `images/` only affects that prefix.
- Transitions must move forward in time.
- Expiration must come after the last transition.
- Time is the missing dimension in most S3 explanations.

Ask:

> "Why not move everything to Deep Archive on day 0?"

Expected answers: retrieval time, early-deletion charges, minimum duration, minimum object size, unknown access patterns.

---

## 7. CLI panel and recap (23-25 min)

Open the **CLI/JSON panel** and show recent actions:

- `create-bucket`
- `put-bucket-versioning`
- `put-object`
- `delete-object`
- `list-object-versions`
- `put-bucket-lifecycle-configuration`

Say:

> "Every click produced one of these API calls. The console is a convenience layer; automation uses the same API."

Close with three recap questions:

1. What does delete mean in a versioned bucket?
2. Why can archive storage cost more than expected?
3. What does a lifecycle rule automate?

Then click **Reset simulator** for the next group.

---

## If you are running late

Cut in this order:

1. Skip the folder creation step.
2. Skip the manual storage-class change; only show the picker details.
3. Skip the deliberate lifecycle validation error.
4. Use **+90 days** once instead of +30 then +90.
5. Leave the CLI panel as a quick 30-second highlight.

Do not cut:

- Versioning and delete-marker recovery.
- Storage-class early-deletion explanation.
- Lifecycle transitions plus the clock.

---

## Audience questions to ask

1. "What happens if I upload the same key twice in a versioned bucket?"
2. "If I delete the object, is the data gone?"
3. "Why not put everything in Deep Archive?"
4. "What does expiration do in a versioned bucket?"
5. "Which part of this is the console, and which part is the API?"

---

## Troubleshooting

- **Wrong starting state:** click **Reset simulator**.
- **Cost chart is empty:** advance the virtual clock.
- **Object missing after refresh:** file blobs live in IndexedDB; metadata lives in localStorage.
- **Too much on screen:** use the guided scenarios and browser zoom.
- **Build error after editing code:** run `npm run build`.

---

## Optional take-home

Tell attendees to:

1. Open `/console/learn`.
2. Complete all four guided scenarios.
3. Export the simulator JSON.
4. Create one lifecycle rule and explain why each day value was chosen.
