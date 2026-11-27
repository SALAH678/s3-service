# S3 Learning Simulator — Presenter Script

A short live demo for an AWS Cloud Club event. Target length: 25 minutes.

## 25-minute run of show

| Time | Segment | Main message | Script section(s) |
| --- | --- | --- | --- |
| 0-2 | Welcome and mental model | S3 stores objects in buckets; the console is an API UI | Welcome and context |
| 2-5 | Create bucket | Names are global, unique, and validated | Create a bucket |
| 5-8 | Objects and prefixes | S3 is flat; folders are simulated by key prefixes | Objects, keys, and prefixes |
| 8-14 | Versioning and recovery | Delete is not always deletion | Versioning and recovery |
| 14-18 | Storage classes | Cheap storage has conditions | Storage classes and early deletion |
| 18-23 | Lifecycle and clock | Rules automate cost over time | Lifecycle rule and virtual clock |
| 23-25 | CLI panel and recap | Every click maps to an API call | CLI panel and recap |

## 0. Before the room arrives

1. Run `npm install` and `npm run dev`.
2. Open `http://localhost:5173/console/learn`.
3. Confirm the seeded `cloud-club-demo` bucket is visible.
4. Click **Reset simulator** so every run starts from the same state.
5. Keep the browser at about 90% zoom so the object table and the cost/CLI rail are both visible.
6. Confirm these are visible:
   - Left: create bucket, object browser, version timeline, lifecycle builder.
   - Right: cost meter, virtual clock, CLI/JSON panel.
7. Keep the page scrolled to the top before starting.

## 1. Welcome and context (0-2 min)

Route: `http://localhost:5173/console/learn`

> "S3 stores objects inside buckets. An object is data plus metadata, and its name is called a key. This simulator is browser-only, so we can break things without creating a real AWS bill. The simulator never calls AWS."

Point out the two columns:

- Left: buckets, objects, versions, storage classes, lifecycle.
- Right: virtual clock, cost meter, and AWS CLI/JSON examples for recorded actions. The simulator never calls AWS.

## 2. Create a bucket (2-5 min)

1. In **Create bucket**, type `My_Bucket`.
   - Show the red `InvalidBucketName` panel: underscores are rejected.
2. Type `cloud-club-demo`.
   - Show `BucketAlreadyExists` because names are unique.
3. Type `cloud-club-lab-01` and keep **Unversioned**.
4. Choose a Region and click **Create bucket**.
5. Point at the CLI/JSON panel:
   - `aws s3api create-bucket --bucket cloud-club-lab-01 ...`
   - The `Location` and `BucketArn` response.

Teaching points:

- Names are 3-63 characters, lowercase, numbers and hyphens.
- No underscores and no IP-shaped names.
- Bucket names share a global namespace.
- Bucket data lives in a Region.

> "The friendly form still enforces the same rules as the API."

## 3. Objects, keys, and prefixes (5-8 min)

1. Select `cloud-club-demo`.
2. Show `images/event.jpg`, `documents/s3-guide.pdf`, and `data/users.json`.
3. Click the `images` folder and show the breadcrumb.
4. Return to the bucket root with the breadcrumb, then create `labs` inside the current prefix. Creating it inside `images/` produces `images/labs/`.
5. Upload:
   - Key: `labs/notes.txt`
   - Size: 10 MB simulated
   - Storage class: Standard

Teaching points:

- S3 has no real folders.
- `images/event.jpg` is one flat key.
- Prefixes simulate folders in the console.
- Object metadata and tags belong to the object, not the bucket.

## 4. Versioning and recovery (8-14 min)

This is the most important segment. Do not rush it.

1. Select `cloud-club-demo` in **Bucket configuration**.
2. Show the three states. Hover **Unversioned** and **Suspended**.
   - Explain: `Unversioned -> Enabled -> Suspended`, never back to Unversioned.
3. Upload an object:
   - **Upload** -> keep *Simulated size*, key `labs/notes.txt`, 10 MB, Standard.
   - Upload the same key again with a different size.
4. Open **Objects and versions**, click `labs/notes.txt`.
   - In **Version timeline**, show v1, v2, and the current version.
5. Click **Delete** on the object.
   - Explain the delete marker: a normal listing hides the key, but every version is billable.
6. In the timeline, click **Delete version** on the delete marker.
   - The object becomes visible again.
7. Optionally click **Restore** on v1.
   - Explain that restore copies the old version as a new current version; it does not move the old one.

## 5. Storage classes and early deletion (14-18 min)

1. In **Storage class picker**, select `cloud-club-demo` and a seeded object such as `images/event.jpg`.
2. Click **Glacier Deep Archive**.
   - Show the 180-day minimum storage duration, 40 KB minimum billable size (In real S3 this is closer to roughly 40 KB of per-object overhead for the Glacier classes; check the current AWS pricing page before presenting.), retrieval fee, and estimated monthly cost.
3. Click **Apply storage class**.
   - Show the early-deletion warning if the object has not completed the previous class minimum.
4. Open the **CLI/JSON** panel and show the `copy-object` request used to change class.

Presenter note: To show a non-zero early-deletion amount, in `cloud-club-demo` click **Upload**, keep *Simulated size* at 10 MB, enter `labs/early-demo.bin`, choose Standard-IA, and upload. Open `labs`, select the object, choose **Deep Archive** in the **Storage class picker**, then click **Apply storage class**.

> "Cheap archive storage is only cheap if the object stays there long enough. That is the whole lesson."

## 6. Lifecycle rule and virtual clock (18-23 min)

1. In **Lifecycle builder**, set:
   - Name: `archive-images`
   - Prefix: `images/`
   - Transition day 30 -> Standard-IA
   - Add transition day 90 -> Glacier Flexible Retrieval
   - Expiration day 365
2. Point at **Validation messages**:
   - Standard-IA needs at least 30 days.
   - Transitions must move forward in time.
   - Expiration must come after the last transition.
3. Change the first transition to day 10 and show the blocking error. Change it back to 30.
4. Show the **Visual timeline** cards for day 0 / 30 / 90 / 365.
5. Click **Save lifecycle rule**.
6. In **Virtual clock**, click **+30 days**, then **+90 days**.
   - Watch the lifecycle activity log and the object storage class in the browser.
7. Show the **Cost by storage class** chart bending as objects move.

Teaching points:

- Lifecycle rules are automation, not one-off actions.
- Filters matter: `images/` only affects that prefix.
- Time is the missing dimension in most S3 explanations.

Ask:

> "Why not move everything to Deep Archive on day 0?"

Expected answers: retrieval time, early-deletion charges, minimum duration, minimum object size, unknown access patterns.

## 7. CLI panel and recap (23-25 min)

Open the **CLI/JSON** panel and show recent actions:

- `create-bucket`
- `put-bucket-versioning`
- `put-object`
- `delete-object`
- `list-object-versions`
- `put-bucket-lifecycle-configuration`

> "In AWS, the console is a UI for S3 APIs that the CLI and SDKs can also call. This simulator shows an equivalent CLI command and JSON response for recorded actions; it never calls AWS."

Close with three recap questions:

1. What does delete mean in a versioned bucket?
   - It adds a delete marker, hiding the current object from normal listings.
   - Older versions remain stored and billed until permanently deleted or removed by a noncurrent-version expiration rule.
2. Why can archive storage cost more than expected?
   - Retrieval can take hours and may have a fee.
   - Minimum storage durations and minimum billable object sizes can add charges.
   - Early deletion and unknown access patterns can reduce or erase the expected savings.
3. What does a lifecycle rule automate?
   - It transitions matching objects between storage classes after specified days.
   - It can expire current objects and separately manage noncurrent versions.
   - Prefix, tag, and size filters determine which objects the rule affects.

Then click **Reset simulator** for the next group.

## Optional: Guided scenarios (only if time remains; outside the 25-minute session)

1. Scroll to **Guided scenarios** and start **Why early deletion costs money**.
2. Use **Next** and **Show me** to highlight the storage-class details and cost meter.
3. Exit the scenario.

> "The scenarios are the same simulator with a tour layer. Attendees can replay them after the talk."

## Optional: Save and load (take-home; outside the 25-minute session)

1. Click **Export JSON** to show the downloadable state file.
2. Mention that **Import JSON** restores an exported lab, so attendees can continue at home.

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

## Closing line

> "S3 is simple to start and subtle to operate. Versioning changes what delete means. Storage classes change what time costs. Lifecycle rules connect the two. This simulator lets you feel all three without creating a bill."

## Audience questions to ask

1. **What happens if I upload the same key twice in a versioned bucket?** A new version is created, the old one is kept, and the newest version becomes current. All stored versions take storage and are billed.
2. **If I delete the object, is the data gone?** In a versioned bucket, a delete marker hides the object while its versions remain stored and billable until permanently deleted. In an unversioned bucket, the object is deleted.
3. **Why not put everything in Deep Archive?** Retrieval can take hours and has a fee, and the 180-day minimum can cause early-deletion charges. Small objects have a 40 KB minimum billable size (In real S3 this is closer to roughly 40 KB of per-object overhead for the Glacier classes; check the current AWS pricing page before presenting.), and future access patterns are often unknown.
4. **What does expiration do in a versioned bucket?** Real S3 adds a delete marker when a current version expires; older versions remain until a noncurrent-version expiration rule removes them. The simulator does the same: expiration adds a marker, and a separate noncurrent expiration setting is needed to remove old versions.
5. **Which part of this is the console, and which is the API?** In AWS, the console is a UI for S3 APIs that the CLI and SDKs can also call. This simulator only displays equivalent CLI commands and JSON responses; it does not call AWS.

## Presenter notes: simulator vs. plan wording

- **Versioning states:** `cloud-club-demo` starts **Enabled**, so it cannot show the first **Unversioned -> Enabled** move. Show the three state buttons and disabled **Unversioned** tooltip; optionally use a new bucket such as `cloud-club-lab-01` from segment 2 to show the full sequence.
- **Lifecycle Add transition:** Adding a transition after the default day-30 Standard-IA row creates a valid day-90 Glacier Flexible Retrieval row. Changing its storage class moves the day forward as needed to meet that class's minimum.
- **CLI and bucket names:** The panel shows commands you could run against AWS; the simulator never calls AWS. It checks against buckets in its own state and its reserved-name list, not AWS's global namespace; AWS names are globally unique. The simulator accepts dots, as S3 does, though hyphens are recommended.
- **`list-object-versions`:** The displayed command uses `--prefix <key>`, which is a prefix match like real S3; another key beginning with the same text can also appear in its response.
- **Out-of-order lifecycle days:** The validator shows a blocking error naming the offending transition and disables Save. The visual timeline still displays milestones in day order, so it may differ from the order entered.

## Troubleshooting

- **Blank page after a code change:** run `npm run build`; the project is TypeScript-strict.
- **Old demo state looks wrong:** click **Reset simulator**; localStorage state is versioned and migrated, but a reset is the cleanest demo start.
- **Uploaded file missing after refresh:** file blobs live in IndexedDB; metadata lives in localStorage. Reset clears both.
- **Cost chart empty:** advance the clock at least once. The chart records one snapshot per simulated day.
- **Too much on screen:** use the guided scenarios and browser zoom.

## Optional take-home

Tell attendees to:

1. Open `/console/learn`.
2. Complete all four guided scenarios.
3. Export the simulator JSON.
4. Create one lifecycle rule and explain why each day value was chosen.
