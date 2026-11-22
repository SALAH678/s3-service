# S3 Learning Simulator — Presenter Script

A short live demo for an AWS Cloud Club event. Target length: 10-12 minutes.

## 0. Before the room arrives

1. Run `npm install` and `npm run dev`.
2. Open `http://localhost:5173/console/learn`.
3. Confirm the seeded `cloud-club-demo` bucket is visible.
4. Click **Reset simulator** so every run starts from the same state.
5. Keep the browser at about 90% zoom so the object table and the cost/CLI rail are both visible.

## 1. Welcome and context (1 minute)

> "This is a browser-only S3 simulator. There is no AWS account and no backend. Every bucket, object, version, lifecycle rule, and cost number lives in this tab. We will use it to see why versioning and lifecycle rules exist, not just what the buttons are called."

Point out the two columns:

- Left: buckets, objects, versions, storage classes, lifecycle.
- Right: virtual clock, cost meter, and the real AWS CLI/JSON call for each action.

## 2. Create a bucket (2 minutes)

1. In **Create bucket**, type `My_Bucket`.
   - Show the red `InvalidBucketName` panel: underscores are rejected.
2. Type `cloud-club-demo`.
   - Show `BucketAlreadyExists` because names are unique.
3. Type `cloud-club-lab-01`, keep **Unversioned**, and click **Create bucket**.
4. Point at the CLI/JSON panel:
   - `aws s3api create-bucket --bucket cloud-club-lab-01 ...`
   - The `Location` and `BucketArn` response.

> "The form validates locally, but the error codes match the real S3 API so the learning transfers."

## 3. Versioning and recovery (3 minutes)

1. Select `cloud-club-demo` in **Bucket configuration**.
2. Show the three states. Hover **Unversioned** and **Suspended**.
   - Explain: `Unversioned -> Enabled -> Suspended`, never back to Unversioned.
3. Upload an object:
   - **Upload** -> keep *Simulated size*, key `notes/today.txt`, 10 MB, Standard.
   - Upload the same key again with a different size.
4. Open **Objects and versions**, click `notes/today.txt`.
   - In **Version timeline**, show v1, v2, and the current version.
5. Click **Delete** on the object.
   - Explain the delete marker: a normal listing hides the key, but every version is billable.
6. In the timeline, click **Delete version** on the delete marker.
   - The object becomes visible again.
7. Optionally click **Restore** on v1.
   - Explain that restore copies the old version as a new current version; it does not move the old one.

## 4. Storage classes and early deletion (2 minutes)

1. In **Storage class picker**, select `cloud-club-demo` and a seeded object such as `images/event.jpg`.
2. Click **Glacier Deep Archive**.
   - Show the 180-day minimum storage duration, 40 KB minimum billable size, retrieval fee, and estimated monthly cost.
3. Click **Apply storage class**.
   - Show the early-deletion warning if the object has not completed the previous class minimum.
4. Open the **CLI/JSON** panel and show the `copy-object` request used to change class.

> "Cheap archive storage is only cheap if the object stays there long enough. That is the whole lesson."

## 5. Lifecycle rule and virtual clock (3 minutes)

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

## 6. Guided scenarios (1 minute)

1. Scroll to **Guided scenarios** and start **Why early deletion costs money**.
2. Use **Next** and **Show me** to highlight the storage-class details and cost meter.
3. Exit the scenario.

> "The scenarios are the same simulator with a tour layer. Attendees can replay them after the talk."

## 7. Save, load, and reset (30 seconds)

1. Click **Export JSON** to show the downloadable state file.
2. Click **Reset simulator** to restore the seeded demo buckets.
3. Mention that **Import JSON** restores an exported lab, so attendees can continue at home.

## Closing line

> "S3 is simple to start and subtle to operate. Versioning changes what delete means. Storage classes change what time costs. Lifecycle rules connect the two. This simulator lets you feel all three without creating a bill."

## Troubleshooting

- **Blank page after a code change:** run `npm run build`; the project is TypeScript-strict.
- **Old demo state looks wrong:** click **Reset simulator**; localStorage state is versioned and migrated, but a reset is the cleanest demo start.
- **Uploaded file missing after refresh:** file blobs live in IndexedDB; metadata lives in localStorage. Reset clears both.
- **Cost chart empty:** advance the clock at least once. The chart records one snapshot per simulated day.
