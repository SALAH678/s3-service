export type ScenarioStep = {
  id: string
  title: string
  explanation: string
  hint?: string
  /** data-tour attribute of the element to highlight */
  target?: string
  /** Optional action label shown in the player */
  action?: string
}

export type Scenario = {
  id: string
  title: string
  description: string
  minutes: number
  level: 'Beginner' | 'Intermediate'
  steps: ScenarioStep[]
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'create-bucket',
    title: 'Create a bucket',
    description: 'Learn the naming rules and settings AWS applies before a bucket can be created.',
    minutes: 4,
    level: 'Beginner',
    steps: [
      {
        id: 'open-form',
        title: 'Open the create bucket form',
        explanation:
          'In the S3 console every bucket starts with a globally unique name and a Region. Open the form in the Objects & Versions tab to begin.',
        target: 'create-bucket',
        action: 'Open Create bucket',
      },
      {
        id: 'name-rules',
        title: 'Type a valid name',
        explanation:
          'Bucket names must be 3–63 characters, contain only lowercase letters, numbers and hyphens, cannot contain underscores, and cannot look like an IP address such as 192.168.0.1.',
        hint: 'Try "My_Bucket" first to see InvalidBucketName, then use "cloud-club-lab-01".',
        target: 'bucket-name-input',
      },
      {
        id: 'unique',
        title: 'Meet the uniqueness rule',
        explanation:
          'S3 bucket names share one global namespace. If another account already owns the name, the request fails with BucketAlreadyExists. The simulator enforces uniqueness inside its own state.',
        hint: 'Try the seeded name "cloud-club-demo" to trigger BucketAlreadyExists.',
        target: 'bucket-name-input',
      },
      {
        id: 'settings',
        title: 'Choose Region and protection',
        explanation:
          'Pick a Region close to your users. Block Public Access is enabled by default because public buckets are usually a mistake for learning labs.',
        target: 'bucket-settings',
      },
      {
        id: 'submit',
        title: 'Create and inspect the result',
        explanation:
          'The create request returns a Location and an ARN. The CLI/JSON panel on the right shows the equivalent aws s3api create-bucket command and response.',
        target: 'cli-panel',
      },
    ],
  },
  {
    id: 'versioning-recover',
    title: 'Enable versioning and recover a deleted file',
    description: 'See how versioning turns a destructive overwrite or delete into a recoverable event.',
    minutes: 7,
    level: 'Beginner',
    steps: [
      {
        id: 'select-bucket',
        title: 'Select a bucket',
        explanation:
          'Use the bucket selector in the Objects & Versions tab. The seeded cloud-club-demo bucket already has versioning enabled so you can experiment immediately.',
        target: 'bucket-selector',
      },
      {
        id: 'versioning-state',
        title: 'Understand the versioning state machine',
        explanation:
          'A new bucket starts Unversioned. It can move to Enabled, then to Suspended. Once versioned, it can never return to Unversioned — Suspended keeps existing versions but stops creating new ones.',
        target: 'versioning-toggle',
      },
      {
        id: 'upload-v1',
        title: 'Upload version 1',
        explanation:
          'Upload a file such as notes.txt. Because versioning is Enabled, S3 assigns an opaque VersionId instead of storing the object as version "null".',
        target: 'upload-button',
        action: 'Open Upload',
      },
      {
        id: 'upload-v2',
        title: 'Overwrite the same key',
        explanation:
          'Upload the same key again with different content. The old object is not destroyed; it becomes a noncurrent version in the version history.',
        target: 'upload-button',
      },
      {
        id: 'delete',
        title: 'Delete the object without --version-id',
        explanation:
          'In a versioned bucket a plain DELETE adds a delete marker. The object disappears from a normal listing, but every version is still stored and billable.',
        target: 'delete-object',
      },
      {
        id: 'timeline',
        title: 'Open the version timeline',
        explanation:
          'Select the key and look at the timeline: v1, v2 and the delete marker are ordered, and the current version is marked. Deleting the marker makes the previous version current again.',
        target: 'version-timeline',
        hint: 'Use Restore to copy an old version as a brand new current version.',
      },
    ],
  },
  {
    id: 'lifecycle-cost',
    title: 'Cut costs with a lifecycle rule',
    description: 'Move aging objects from Standard to cheaper classes automatically and watch the cost chart respond.',
    minutes: 9,
    level: 'Intermediate',
    steps: [
      {
        id: 'why',
        title: 'Start with the cost problem',
        explanation:
          'S3 Standard is the most expensive class. Data that is rarely read after 30 days should move to Standard-IA, then to Glacier, then eventually expire. Lifecycle rules automate that movement.',
        target: 'cost-meter',
      },
      {
        id: 'open-builder',
        title: 'Open the lifecycle builder',
        explanation:
          'The builder lets you filter by prefix, tag or object size. Filters matter: you usually do not want to archive every object in a bucket.',
        target: 'lifecycle-builder',
        action: 'Open Lifecycle tab',
      },
      {
        id: 'transitions',
        title: 'Add transitions',
        explanation:
          'Add a transition to Standard-IA after 30 days, then to Glacier Flexible Retrieval after 90 days, then to Deep Archive after 180 days. S3 requires transitions to move forward in time.',
        target: 'lifecycle-transitions',
      },
      {
        id: 'validation',
        title: 'Read the validation messages',
        explanation:
          'Standard-IA needs at least 30 days. Glacier must come after IA. Expiration must be after the last transition. Minimum object sizes can make a transition more expensive than expected.',
        target: 'lifecycle-validation',
      },
      {
        id: 'timeline',
        title: 'Inspect the day 0 / 30 / 90 / 365 timeline',
        explanation:
          'The visual timeline shows exactly which class an object should be in at each milestone and which actions happen on that day.',
        target: 'lifecycle-timeline',
      },
      {
        id: 'advance',
        title: 'Advance the virtual clock',
        explanation:
          'Advance 90 days. The simulator runs every enabled lifecycle rule, changes storage classes, creates delete markers for expired current versions, and accrues cost.',
        target: 'clock-controls',
      },
      {
        id: 'chart',
        title: 'Compare cost by class',
        explanation:
          'The Recharts chart stacks cumulative cost per storage class over simulated time. A successful lifecycle rule bends the Standard line down and the archive lines up.',
        target: 'cost-chart',
      },
    ],
  },
  {
    id: 'early-deletion',
    title: 'Why early deletion costs money',
    description: 'Discover the minimum storage duration charges hidden behind cheap archive classes.',
    minutes: 6,
    level: 'Intermediate',
    steps: [
      {
        id: 'pick-class',
        title: 'Open the storage class picker',
        explanation:
          'Open the picker for an object or an upload. Before you confirm, the picker shows minimum storage duration, minimum billable object size, retrieval fee and the estimated monthly cost.',
        target: 'storage-class-picker',
      },
      {
        id: 'compare',
        title: 'Compare Standard with Deep Archive',
        explanation:
          'Deep Archive is roughly 20× cheaper per GB-month than Standard, but it has a 180-day minimum storage duration and a 40 KB minimum billable size.',
        target: 'storage-class-details',
      },
      {
        id: 'small-object',
        title: 'Try a small object',
        explanation:
          'A 4 KB object is billed as 40 KB in Deep Archive. For tiny objects the minimum billable size can erase the price advantage.',
        target: 'storage-class-details',
      },
      {
        id: 'delete-early',
        title: 'Delete or transition too early',
        explanation:
          'Move an object to Standard-IA at day 0 and delete it at day 10. AWS bills the remaining 20 days of the 30-day minimum. The simulator adds that early-deletion charge to the cost meter.',
        target: 'delete-object',
        action: 'Delete the object',
      },
      {
        id: 'cost-result',
        title: 'Read the early deletion charge',
        explanation:
          'The cost meter separates accrued storage cost from early-deletion charges. This is why lifecycle rules and retention policies belong together.',
        target: 'cost-meter',
      },
    ],
  },
]

export function scenarioById(id: string | null): Scenario | undefined {
  return id ? SCENARIOS.find((scenario) => scenario.id === id) : undefined
}
