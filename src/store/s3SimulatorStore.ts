import { create } from "zustand";
import { persist } from "zustand/middleware";
import { validateBucketName } from "../engine/buckets";
import { calculateParts } from "../engine/multipart";
import {
  generateEtag,
  generateVersionId,
  validateVersioningTransition,
  versionIdForNewObject,
  bucketArn,
  objectArn,
  type VersioningState,
} from "../engine/versioning";
import {
  addCostByClass,
  emptyCostByClass,
  groupCostByClass,
  monthlyCostByClass,
  sumCostByClass,
  earlyDeletionCharge,
  type CostByClass,
} from "../engine/cost";
import { storedVersions } from "../engine/versionModel";
import {
  hasBlockingIssues,
  resolvedNoncurrentTransitions,
  ruleMatchesObject,
  targetClassAtAge,
  validateLifecycleRule,
  validateLifecycleRules,
  type LifecycleIssue,
} from "../engine/lifecycleRules";
import * as cli from "../engine/cliCommands";
import {
  clearBucketBlobs,
  clearObjectBlobs,
  deleteAllObjectVersionBlobs,
  deleteObjectBlob,
  deleteObjectVersionBlob,
  loadObjectBlob,
  loadObjectVersionBlob,
  saveObjectBlob,
  saveObjectVersionBlob,
} from "../storage/simulationDb";

export type { VersioningState };

export type StorageClass =
  | "STANDARD"
  | "INTELLIGENT_TIERING"
  | "STANDARD_IA"
  | "ONE_ZONE_IA"
  | "GLACIER_IR"
  | "GLACIER"
  | "DEEP_ARCHIVE"
  | "EXPRESS_ONE_ZONE"
  | "REDUCED_REDUNDANCY";

export type StorageClassInfo = {
  minDurationDays: number;
  minBillableSizeBytes: number;
  pricePerGBMonth: number;
  retrievalFeePerGB: number;
  earlyDeletionCharge: boolean;
  description: string;
};

export const STORAGE_CLASS_INFO: Record<StorageClass, StorageClassInfo> = {
  STANDARD: {
    minDurationDays: 0,
    minBillableSizeBytes: 0,
    pricePerGBMonth: 0.023,
    retrievalFeePerGB: 0,
    earlyDeletionCharge: false,
    description: "General purpose storage for frequently accessed data.",
  },
  INTELLIGENT_TIERING: {
    minDurationDays: 0,
    minBillableSizeBytes: 0,
    pricePerGBMonth: 0.025,
    retrievalFeePerGB: 0,
    earlyDeletionCharge: false,
    description: "Automatically moves objects between access tiers.",
  },
  STANDARD_IA: {
    minDurationDays: 30,
    minBillableSizeBytes: 128 * 1024,
    pricePerGBMonth: 0.0125,
    retrievalFeePerGB: 0.01,
    earlyDeletionCharge: true,
    description: "For infrequently accessed data with millisecond access.",
  },
  ONE_ZONE_IA: {
    minDurationDays: 30,
    minBillableSizeBytes: 128 * 1024,
    pricePerGBMonth: 0.01,
    retrievalFeePerGB: 0.01,
    earlyDeletionCharge: true,
    description: "For infrequently accessed data in a single AZ.",
  },
  GLACIER_IR: {
    minDurationDays: 90,
    minBillableSizeBytes: 128 * 1024,
    pricePerGBMonth: 0.004,
    retrievalFeePerGB: 0.01,
    earlyDeletionCharge: true,
    description: "Archive storage with instant retrieval.",
  },
  GLACIER: {
    minDurationDays: 90,
    minBillableSizeBytes: 40 * 1024,
    pricePerGBMonth: 0.004,
    retrievalFeePerGB: 0.05,
    earlyDeletionCharge: true,
    description: "Archive storage with flexible retrieval (minutes to hours).",
  },
  DEEP_ARCHIVE: {
    minDurationDays: 180,
    minBillableSizeBytes: 40 * 1024,
    pricePerGBMonth: 0.00099,
    retrievalFeePerGB: 0.05,
    earlyDeletionCharge: true,
    description: "Lowest cost archive storage (hours to retrieve).",
  },
  EXPRESS_ONE_ZONE: {
    minDurationDays: 0,
    minBillableSizeBytes: 0,
    pricePerGBMonth: 0.025,
    retrievalFeePerGB: 0,
    earlyDeletionCharge: false,
    description: "Millisecond access for performance-sensitive workloads.",
  },
  REDUCED_REDUNDANCY: {
    minDurationDays: 0,
    minBillableSizeBytes: 0,
    pricePerGBMonth: 0.024,
    retrievalFeePerGB: 0,
    earlyDeletionCharge: false,
    description: "Non-critical data with lower redundancy.",
  },
};

export type CostSnapshot = {
  day: number;
  standardCost: number;
  iaCost: number;
  glacierCost: number;
  deepArchiveCost: number;
  total: number;
  /** Cumulative cost per exact storage class, used by the learning chart. */
  classCosts?: Record<string, number>;
  /** Cumulative storage cost without early-deletion penalties. */
  accrued?: number;
  /** Cumulative early-deletion penalties. */
  earlyDeletion?: number;
};

export type LifecycleLogEntry = {
  id: string;
  day: number;
  bucket: string;
  key: string;
  type: "transition" | "expiration" | "noncurrent" | "multipart" | "penalty";
  message: string;
};

export type LearningScenarioState = {
  scenarioId: string | null;
  stepIndex: number;
};

export type OperationError = {
  code: string;
  message: string;
};

export type CliHistoryEntry = {
  id: string;
  command: string;
  jsonResponse: string;
  timestamp: string;
};

export type ScenarioStep = {
  id: string;
  title: string;
  explanation: string;
  highlightSelector: string;
  validate: (state: SimulatorState) => boolean;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  steps: ScenarioStep[];
};

export type ScenarioState = {
  activeScenarioId: string | null;
  currentStepIndex: number;
  completedStepIds: string[];
};

export type LifecycleValidationIssue = {
  ruleId: string;
  type: "error" | "warning" | "info";
  message: string;
};

export type ObjectVersion = {
  versionId: string;
  size: number;
  type: string;
  createdAt: string;
  storageClass: StorageClass;
  etag: string;
  parts: number;
  deleteMarker?: boolean;
  /** Virtual clock day on which the object was created. */
  createdDay?: number;
  /** Virtual clock day on which the current storage class was applied. */
  storageClassChangedDay?: number;
  /** Virtual clock day on which this version became noncurrent. */
  supersededDay?: number;
};

export type S3Object = {
  key: string;
  size: number;
  type: string;
  storageClass: StorageClass;
  createdAt: string;
  etag: string;
  parts: number;
  versionId: string;
  deleteMarker?: boolean;
  versions?: ObjectVersion[];
  metadata: Record<string, string>;
  tags: Record<string, string>;
  isFolder?: boolean;
  /** Virtual clock day on which the object was created. */
  createdDay?: number;
  /** Virtual clock day on which the current storage class was applied. */
  storageClassChangedDay?: number;
};

export type BucketMetrics = {
  getRequests: number;
  putRequests: number;
  deleteRequests: number;
};

export type LifecycleTransition = {
  days: number;
  storageClass: StorageClass;
};

export type LifecycleRule = {
  id: string;
  name: string;
  status: "Enabled" | "Disabled";
  prefix: string;
  /** Legacy fields kept so the original Management tab continues to work. */
  transitionDays: number;
  targetClass: StorageClass;
  /** Full learning-mode lifecycle configuration. */
  transitions?: LifecycleTransition[];
  filterTagKey?: string;
  filterTagValue?: string;
  filterSizeGreaterThan?: number;
  filterSizeLessThan?: number;
  expirationDays?: number;
  noncurrentTransitions?: LifecycleTransition[];
  noncurrentExpirationDays?: number;
  abortIncompleteMultipartDays?: number;
};

export type MultipartUpload = {
  id: string;
  key: string;
  initiatedDay: number;
  size: number;
};

export type Bucket = {
  name: string;
  region: string;
  createdAt: string;
  access: "Bucket and objects not public" | "Objects can be public" | "Public";
  blockPublicAccess: boolean;
  versioning: VersioningState;
  objectOwnership: "Bucket owner enforced" | "Bucket owner preferred" | "Object writer";
  encryption: "SSE-S3" | "SSE-KMS" | "DSSE-KMS";
  tags: Record<string, string>;
  objects: S3Object[];
  policy: string;
  cors: string;
  kmsKey: string;
  bucketKey: boolean;
  objectLock: boolean;
  websiteHosting: {
    enabled: boolean;
    indexDocument: string;
    errorDocument: string;
  };
  lifecycleRules: LifecycleRule[];
  replicationRules: Array<{
    id: string;
    name: string;
    status: "Enabled" | "Disabled";
    destination: string;
    mode: "CRR" | "SRR";
    prefix: string;
    replicateDeleteMarkers: boolean;
    statusLabel: "Pending" | "Replicated";
  }>;
  inventoryName: string;
  inventoryEnabled: boolean;
  simulatedDay: number;
  metrics: BucketMetrics;
  accessPoints: Array<{
    id: string;
    name: string;
    bucketName: string;
    network: "Internet" | "VPC";
    status: "Active";
  }>;
  multipartUploads?: MultipartUpload[];
};

type Activity = {
  id: string;
  action: string;
  resource: string;
  createdAt: string;
  status: "Success" | "Warning" | "Error";
};

export type CreateBucketInput = Pick<
  Bucket,
  "name" | "region" | "blockPublicAccess" | "versioning" | "objectOwnership" | "encryption"
>;

type SimulatorState = {
  buckets: Bucket[];
  activity: Activity[];
  region: string;
  cliHistory: CliHistoryEntry[];
  costHistory: CostSnapshot[];
  scenarioState: ScenarioState;
  lifecycleValidation: Record<string, LifecycleValidationIssue[]>;
  /** Global virtual clock used by the learning simulator. */
  clockDay: number;
  accruedCost: number;
  accruedByClass: CostByClass;
  earlyDeletionTotal: number;
  lifecycleLog: LifecycleLogEntry[];
  learningScenario: LearningScenarioState;
  createBucket: (input: CreateBucketInput) => string | null;
  deleteBucket: (name: string) => string | null;
  emptyBucket: (name: string) => string | null;
  uploadObject: (
    bucketName: string,
    key: string,
    size: number,
    type: string,
    blob?: Blob,
    metadata?: Record<string, string>,
    tags?: Record<string, string>,
    storageClass?: StorageClass,
  ) => Promise<void>;
  deleteObject: (bucketName: string, key: string) => Promise<void>;
  createFolder: (bucketName: string, prefix: string) => void;
  setRegion: (region: string) => void;
  updateBucket: (name: string, changes: Partial<Bucket>) => void;
  setLifecycleRules: (name: string, rules: Bucket["lifecycleRules"]) => void;
  setObjectStorageClass: (bucketName: string, key: string, storageClass: StorageClass) => void;
  setReplicationRules: (name: string, rules: Bucket["replicationRules"]) => void;
  runReplication: (name: string) => Promise<void>;
  advanceSimulatedTime: (name: string, days: number) => void;
  restoreObjectVersion: (bucketName: string, key: string, versionId: string) => Promise<void>;
  deleteObjectVersion: (bucketName: string, key: string, versionId: string) => Promise<void>;
  recordGetRequest: (bucketName: string) => void;
  createAccessPoint: (bucketName: string, name: string, network: "Internet" | "VPC") => void;
  deleteAccessPoint: (bucketName: string, accessPointId: string) => void;
  setAccessPoints: (bucketName: string, accessPoints: Bucket["accessPoints"]) => void;
  reset: () => void;
  logActivity: (action: string, resource: string, status?: Activity["status"]) => void;
  addCliCommand: (command: string, jsonResponse: string) => void;
  clearCliHistory: () => void;
  recordCostSnapshot: (day: number) => void;
  startScenario: (scenarioId: string) => void;
  nextScenarioStep: () => void;
  prevScenarioStep: () => void;
  completeScenario: () => void;
  validateLifecycleRules: (bucketName: string) => LifecycleValidationIssue[];

  /* ------------------------------------------------------------------ */
  /* Learning simulator actions (additive; original actions above remain) */
  /* ------------------------------------------------------------------ */
  createLearningBucket: (input: {
    name: string;
    region: string;
    versioning?: VersioningState;
    blockPublicAccess?: boolean;
  }) => OperationError | null;
  setVersioningState: (bucketName: string, next: VersioningState) => OperationError | null;
  uploadLearningObject: (input: {
    bucketName: string;
    key: string;
    size: number;
    type: string;
    storageClass: StorageClass;
    metadata?: Record<string, string>;
    tags?: Record<string, string>;
    blob?: Blob;
  }) => Promise<void>;
  deleteCurrentObject: (bucketName: string, key: string) => Promise<{ deleteMarker: boolean }>;
  deleteVersionPermanent: (bucketName: string, key: string, versionId: string) => Promise<void>;
  restoreVersionAsCopy: (bucketName: string, key: string, versionId: string) => Promise<void>;
  changeObjectStorageClass: (
    bucketName: string,
    key: string,
    storageClass: StorageClass,
  ) => Promise<{ warning: string | null }>;
  advanceClock: (days: number) => void;
  resetClock: () => void;
  saveLifecycleRule: (bucketName: string, rule: LifecycleRule) => LifecycleIssue[];
  deleteLifecycleRule: (bucketName: string, ruleId: string) => void;
  validateBucketLifecycle: (bucketName: string) => LifecycleIssue[];
  addMultipartUpload: (bucketName: string, key: string, size: number) => void;
  startLearningScenario: (scenarioId: string) => void;
  setLearningScenarioStep: (stepIndex: number) => void;
  exitLearningScenario: () => void;
  exportSimulatorState: () => string;
  importSimulatorState: (jsonText: string) => string | null;
};

const emptyMetrics = (): BucketMetrics => ({ getRequests: 0, putRequests: 0, deleteRequests: 0 });

const SIM_EPOCH_MS = Date.UTC(2026, 10, 22);
const DAY_MS = 24 * 60 * 60 * 1000;

export function clockTimestamp(day: number): string {
  return new Date(SIM_EPOCH_MS + Math.max(0, day) * DAY_MS).toISOString();
}

const nextDeleteMarkerId = () => generateVersionId();
const nextReplicationId = () => `rep-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

function createEtag(parts = 1) {
  return generateEtag(parts);
}

function toVersion(object: S3Object, supersededDay?: number): ObjectVersion {
  return {
    versionId: object.versionId,
    size: object.size,
    type: object.type,
    createdAt: object.createdAt,
    storageClass: object.storageClass,
    etag: object.etag,
    parts: object.parts,
    deleteMarker: object.deleteMarker,
    createdDay: object.createdDay ?? 0,
    storageClassChangedDay: object.storageClassChangedDay ?? object.createdDay ?? 0,
    supersededDay,
  };
}

function costEntriesForBuckets(buckets: Bucket[]) {
  return buckets.flatMap((bucket) =>
    storedVersions(bucket.objects).map((version) => ({
      size: version.size,
      storageClass: version.storageClass,
    })),
  );
}

function ageInClass(version: { createdDay?: number; storageClassChangedDay?: number }, day: number) {
  return Math.max(0, day - (version.storageClassChangedDay ?? version.createdDay ?? 0));
}

/**
 * Runs every enabled lifecycle rule for one simulated day. The function is
 * intentionally day-by-day so a +90 jump still fires a day-30 transition and a
 * day-60 expiration in the correct order.
 */
function applyLifecycleDay(
  buckets: Bucket[],
  day: number,
): { buckets: Bucket[]; penalties: number; events: LifecycleLogEntry[] } {
  let penalties = 0;
  const events: LifecycleLogEntry[] = [];

  const nextBuckets = buckets.map((bucket) => {
    const rules = bucket.lifecycleRules.filter((rule) => rule.status !== "Disabled");
    if (!rules.length) return bucket;

    const objects = bucket.objects.flatMap<S3Object>((object) => {
      if (object.isFolder) return [object];
      const matching = rules.filter((rule) => ruleMatchesObject(rule, object));
      if (!matching.length) return [object];

      let current: S3Object = { ...object };

      if (!current.deleteMarker) {
        const objectAge = Math.max(0, day - (current.createdDay ?? 0));
        for (const rule of matching) {
          const target = targetClassAtAge(rule, objectAge);
          if (!target || target === current.storageClass) continue;
          const penalty = earlyDeletionCharge(current.size, current.storageClass, ageInClass(current, day));
          if (penalty > 0) {
            penalties += penalty;
            events.push({
              id: crypto.randomUUID(),
              day,
              bucket: bucket.name,
              key: current.key,
              type: "penalty",
              message: `${current.key}: early deletion charge $${penalty.toFixed(4)} for leaving ${current.storageClass} before its minimum duration`,
            });
          }
          events.push({
            id: crypto.randomUUID(),
            day,
            bucket: bucket.name,
            key: current.key,
            type: "transition",
            message: `${current.key}: ${current.storageClass} → ${target} after ${objectAge} days`,
          });
          current = {
            ...current,
            storageClass: target as StorageClass,
            storageClassChangedDay: day,
          };
        }

        const expiringRule = matching.find(
          (rule) =>
            typeof rule.expirationDays === "number" && rule.expirationDays > 0 && objectAge >= rule.expirationDays,
        );
        if (expiringRule) {
          if (bucket.versioning === "Enabled") {
            const versions = [...(current.versions ?? []), toVersion(current, day)];
            events.push({
              id: crypto.randomUUID(),
              day,
              bucket: bucket.name,
              key: current.key,
              type: "expiration",
              message: `${current.key}: current version expired after ${objectAge} days; a delete marker was added`,
            });
            current = {
              ...current,
              deleteMarker: true,
              versionId: generateVersionId(),
              createdAt: clockTimestamp(day),
              createdDay: day,
              versions,
            };
          } else {
            penalties += earlyDeletionCharge(current.size, current.storageClass, ageInClass(current, day));
            events.push({
              id: crypto.randomUUID(),
              day,
              bucket: bucket.name,
              key: current.key,
              type: "expiration",
              message: `${current.key}: permanently expired after ${objectAge} days`,
            });
            return [];
          }
        }
      }

      const versions = (current.versions ?? []).flatMap<ObjectVersion>((version) => {
        if (version.deleteMarker) return [version];
        const noncurrentAge = Math.max(0, day - (version.supersededDay ?? version.createdDay ?? 0));
        let next = { ...version };

        for (const rule of matching) {
          for (const transition of resolvedNoncurrentTransitions(rule)) {
            if (noncurrentAge >= transition.days && next.storageClass !== transition.storageClass) {
              penalties += earlyDeletionCharge(next.size, next.storageClass, ageInClass(next, day));
              next = {
                ...next,
                storageClass: transition.storageClass as StorageClass,
                storageClassChangedDay: day,
              };
              events.push({
                id: crypto.randomUUID(),
                day,
                bucket: bucket.name,
                key: current.key,
                type: "noncurrent",
                message: `${current.key}: noncurrent version ${next.versionId} → ${transition.storageClass}`,
              });
            }
          }
        }

        const expired = matching.some(
          (rule) =>
            typeof rule.noncurrentExpirationDays === "number" &&
            rule.noncurrentExpirationDays > 0 &&
            noncurrentAge >= rule.noncurrentExpirationDays,
        );
        if (expired) {
          penalties += earlyDeletionCharge(next.size, next.storageClass, ageInClass(next, day));
          events.push({
            id: crypto.randomUUID(),
            day,
            bucket: bucket.name,
            key: current.key,
            type: "noncurrent",
            message: `${current.key}: noncurrent version ${next.versionId} expired after ${noncurrentAge} days`,
          });
          return [];
        }
        return [next];
      });

      return [{ ...current, versions }];
    });

    let multipartUploads = bucket.multipartUploads ?? [];
    const aborted = multipartUploads.filter((upload) =>
      rules.some(
        (rule) =>
          typeof rule.abortIncompleteMultipartDays === "number" &&
          rule.abortIncompleteMultipartDays > 0 &&
          (!rule.prefix || upload.key.startsWith(rule.prefix)) &&
          day - upload.initiatedDay >= rule.abortIncompleteMultipartDays,
      ),
    );
    if (aborted.length) {
      for (const upload of aborted) {
        events.push({
          id: crypto.randomUUID(),
          day,
          bucket: bucket.name,
          key: upload.key,
          type: "multipart",
          message: `${upload.key}: incomplete multipart upload aborted after ${day - upload.initiatedDay} days`,
        });
      }
      multipartUploads = multipartUploads.filter((upload) => !aborted.includes(upload));
    }

    return { ...bucket, objects, multipartUploads };
  });

  return { buckets: nextBuckets, penalties, events };
}

function normalizeObject(input: Partial<S3Object> & { key: string }): S3Object {
  return {
    ...input,
    key: input.key,
    size: input.size ?? 0,
    type: input.type ?? "application/octet-stream",
    storageClass: input.storageClass ?? "STANDARD",
    createdAt: input.createdAt ?? new Date().toISOString(),
    etag: input.etag ?? "",
    parts: input.parts ?? 1,
    versionId: input.versionId ?? "null",
    versions: (Array.isArray(input.versions) ? input.versions : []).map((version) => ({
      versionId: version.versionId ?? "null",
      size: version.size ?? 0,
      type: version.type ?? "application/octet-stream",
      createdAt: version.createdAt ?? new Date().toISOString(),
      storageClass: version.storageClass ?? "STANDARD",
      etag: version.etag ?? "",
      parts: version.parts ?? 1,
      deleteMarker: version.deleteMarker,
      createdDay: version.createdDay ?? 0,
      storageClassChangedDay: version.storageClassChangedDay ?? version.createdDay ?? 0,
      supersededDay: version.supersededDay,
    })),
    createdDay: input.createdDay ?? 0,
    storageClassChangedDay: input.storageClassChangedDay ?? input.createdDay ?? 0,
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {},
    tags: input.tags && typeof input.tags === "object" && !Array.isArray(input.tags) ? input.tags : {},
  };
}

function normalizeLifecycleRule(input: Partial<LifecycleRule> & { name?: string }, index: number): LifecycleRule {
  const transitions = Array.isArray(input.transitions)
    ? input.transitions.map((transition) => ({
        days: Number(transition.days) || 0,
        storageClass: transition.storageClass ?? "STANDARD_IA",
      }))
    : input.targetClass
      ? [{ days: input.transitionDays ?? 0, storageClass: input.targetClass }]
      : [];
  const first = transitions[0];
  return {
    id: input.id ?? `lc-${index}-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name ?? `Rule ${index + 1}`,
    status: input.status ?? "Enabled",
    prefix: input.prefix ?? "",
    transitionDays: input.transitionDays ?? first?.days ?? 0,
    targetClass: input.targetClass ?? first?.storageClass ?? "STANDARD_IA",
    transitions,
    filterTagKey: input.filterTagKey,
    filterTagValue: input.filterTagValue,
    filterSizeGreaterThan: input.filterSizeGreaterThan,
    filterSizeLessThan: input.filterSizeLessThan,
    expirationDays: input.expirationDays,
    noncurrentTransitions: Array.isArray(input.noncurrentTransitions)
      ? input.noncurrentTransitions.map((transition) => ({
          days: Number(transition.days) || 0,
          storageClass: transition.storageClass ?? "STANDARD_IA",
        }))
      : [],
    noncurrentExpirationDays: input.noncurrentExpirationDays,
    abortIncompleteMultipartDays: input.abortIncompleteMultipartDays,
  };
}

export function normalizeBucket(input: Partial<Bucket> & { name: string }): Bucket {
  const objects = (Array.isArray(input.objects) ? input.objects : []).map(normalizeObject);
  const uniqueObjects = [...new Map(objects.map((object) => [object.key, object])).values()];
  return {
    ...input,
    name: input.name,
    region: input.region ?? "us-east-1",
    createdAt: input.createdAt ?? new Date().toISOString(),
    access: input.access ?? "Bucket and objects not public",
    blockPublicAccess: input.blockPublicAccess ?? true,

    versioning: input.versioning ?? "Unversioned",
    objectOwnership: input.objectOwnership ?? "Bucket owner enforced",
    encryption: input.encryption ?? "SSE-S3",
    tags: input.tags && typeof input.tags === "object" && !Array.isArray(input.tags) ? input.tags : {},
    objects: uniqueObjects,
    policy: input.policy ?? "",
    cors: input.cors ?? "",
    kmsKey: input.kmsKey ?? "alias/aws/s3",
    bucketKey: input.bucketKey ?? true,
    objectLock: input.objectLock ?? false,
    websiteHosting: {
      enabled: input.websiteHosting?.enabled ?? false,
      indexDocument: input.websiteHosting?.indexDocument ?? "index.html",
      errorDocument: input.websiteHosting?.errorDocument ?? "error.html",
    },
    lifecycleRules: Array.isArray(input.lifecycleRules)
      ? input.lifecycleRules.map((rule, index) => normalizeLifecycleRule(rule, index))
      : [],
    replicationRules: Array.isArray(input.replicationRules) ? input.replicationRules : [],
    inventoryName: input.inventoryName ?? "",
    inventoryEnabled: input.inventoryEnabled ?? false,
    simulatedDay: input.simulatedDay ?? 0,
    accessPoints: Array.isArray(input.accessPoints) ? input.accessPoints : [],
    metrics: {
      getRequests: input.metrics?.getRequests ?? 0,
      putRequests: input.metrics?.putRequests ?? 0,
      deleteRequests: input.metrics?.deleteRequests ?? 0,
    },
  };
}

const seededBuckets: Bucket[] = [
  {
    name: "cloud-club-demo",
    region: "us-east-1",
    createdAt: "2026-11-15T09:30:00.000Z",
    access: "Bucket and objects not public",
    blockPublicAccess: true,
    versioning: "Enabled",
    objectOwnership: "Bucket owner enforced",
    encryption: "SSE-S3",
    tags: { Environment: "Demo", Event: "AWS Cloud Club" },
    policy: "",
    cors: "",
    kmsKey: "alias/aws/s3",
    bucketKey: true,
    objectLock: false,
    websiteHosting: { enabled: false, indexDocument: "index.html", errorDocument: "error.html" },
    lifecycleRules: [],
    replicationRules: [],
    inventoryName: "",
    inventoryEnabled: false,
    simulatedDay: 0,
    accessPoints: [],
    metrics: emptyMetrics(),
    objects: [
      {
        key: "images/event.jpg",
        size: 284000,
        type: "image/jpeg",
        storageClass: "STANDARD",
        createdAt: "2026-11-20T14:12:00.000Z",
        etag: '"4f5a2c8a76e8d41e6c01f4b3dd90a101"',
        parts: 1,
        versionId: "3HL4kqtJlcpXroDTDmJrmSpXd3dIbrHY",
        createdDay: 0,
        storageClassChangedDay: 0,
        versions: [
          {
            versionId: "2Gk3jpsIocXqnCSClIqmRoWb2cGasGXU",
            size: 201400,
            type: "image/jpeg",
            createdAt: "2026-11-16T10:04:00.000Z",
            storageClass: "STANDARD",
            etag: '"9a71dcbb2ad0b9c8f18f4a86b31f2c21"',
            parts: 1,
            createdDay: 0,
            storageClassChangedDay: 0,
          },
          {
            versionId: "1Fj2iorHnbWpmBRBkHplQnVa1bFZrFTT",
            size: 156800,
            type: "image/jpeg",
            createdAt: "2026-11-15T12:20:00.000Z",
            storageClass: "STANDARD",
            etag: '"7c60cab9a9c0e7b114f3c75b28e1b10d"',
            parts: 1,
            createdDay: 0,
            storageClassChangedDay: 0,
          },
        ],
        metadata: { "x-amz-meta-event": "cloud-club" },
        tags: { Category: "Images" },
      },
      {
        key: "documents/s3-guide.pdf",
        size: 1240000,
        type: "application/pdf",
        storageClass: "STANDARD_IA",
        createdAt: "2026-11-18T10:08:00.000Z",
        etag: '"7b91decb2ad0b9c8f18f4a86b31f2c20"',
        parts: 1,
        versionId: "null",
        versions: [],
        metadata: {},
        tags: {},
      },
      {
        key: "data/users.json",
        size: 12400,
        type: "application/json",
        storageClass: "STANDARD",
        createdAt: "2026-11-21T08:44:00.000Z",
        etag: '"a8e31c74dd1c9ad2a7b4d90c55c118a3"',
        parts: 1,
        versionId: "null",
        versions: [],
        metadata: {},
        tags: {},
      },
    ],
  },
  {
    name: "cloud-club-archive",
    region: "eu-west-3",
    createdAt: "2026-10-22T16:20:00.000Z",
    access: "Bucket and objects not public",
    blockPublicAccess: true,
    versioning: "Suspended",
    objectOwnership: "Bucket owner enforced",
    encryption: "SSE-KMS",
    tags: { Purpose: "Archive" },
    policy: "",
    cors: "",
    kmsKey: "alias/archive",
    bucketKey: true,
    objectLock: false,
    websiteHosting: { enabled: false, indexDocument: "index.html", errorDocument: "error.html" },
    lifecycleRules: [],
    replicationRules: [],
    inventoryName: "",
    inventoryEnabled: false,
    simulatedDay: 0,
    accessPoints: [],
    metrics: emptyMetrics(),
    objects: [
      {
        key: "archives/2026.zip",
        size: 18500000,
        type: "application/zip",
        storageClass: "GLACIER",
        createdAt: "2026-10-23T11:00:00.000Z",
        etag: '"1a7ce94de5b2ac42fe4c69c3a0d83b2e"',
        parts: 2,
        versionId: "null",
        versions: [],
        metadata: {},
        tags: {},
      },
    ],
  },
];

const SCENARIOS: Scenario[] = [
  {
    id: "create-bucket",
    title: "Create a bucket",
    description: "Learn how to create an S3 bucket with proper naming and settings.",
    steps: [
      {
        id: "step-1",
        title: "Navigate to Buckets",
        explanation: 'Start at the S3 console. Click "Create bucket" to begin.',
        highlightSelector: '[data-testid="create-bucket-btn"]',
        validate: (state) => state.buckets.length >= 1,
      },
      {
        id: "step-2",
        title: "Enter bucket name",
        explanation: "Bucket names must be 3-63 characters, lowercase, with hyphens only (no underscores).",
        highlightSelector: '[data-testid="bucket-name-input"]',
        validate: (state) => state.buckets.some((b) => b.name.length >= 3),
      },
    ],
  },
  {
    id: "enable-versioning",
    title: "Enable versioning and recover a deleted file",
    description: "Learn how versioning protects objects from accidental deletion.",
    steps: [
      {
        id: "step-1",
        title: "Enable versioning",
        explanation: "Go to the bucket Properties tab and enable versioning.",
        highlightSelector: '[data-testid="versioning-toggle"]',
        validate: (state) => state.buckets.some((b) => b.versioning === "Enabled"),
      },
      {
        id: "step-2",
        title: "Upload a file",
        explanation: "Upload an object to the versioned bucket.",
        highlightSelector: '[data-testid="upload-btn"]',
        validate: (state) => state.buckets.some((b) => b.objects.some((o) => !o.isFolder)),
      },
    ],
  },
  {
    id: "lifecycle-cost",
    title: "Cut costs with a lifecycle rule",
    description: "Learn how lifecycle rules transition objects to cheaper storage classes.",
    steps: [
      {
        id: "step-1",
        title: "Create a lifecycle rule",
        explanation: "Add a rule to transition objects to Standard-IA after 30 days.",
        highlightSelector: '[data-testid="lifecycle-create-btn"]',
        validate: (state) => state.buckets.some((b) => b.lifecycleRules.some((r) => r.status === "Enabled")),
      },
      {
        id: "step-2",
        title: "Advance time",
        explanation: "Advance the clock past the transition day to see the storage class change.",
        highlightSelector: '[data-testid="clock-btn-30"]',
        validate: (state) => state.buckets.some((b) => (b.simulatedDay ?? 0) >= 30),
      },
    ],
  },
  {
    id: "early-deletion",
    title: "Why early deletion costs money",
    description: "Learn about minimum storage duration charges for IA and Glacier classes.",
    steps: [
      {
        id: "step-1",
        title: "Check storage class info",
        explanation: "Review the storage class picker to see minimum durations and early deletion charges.",
        highlightSelector: '[data-testid="storage-class-picker"]',
        validate: () => true,
      },
    ],
  },
];

export const useS3SimulatorStore = create<SimulatorState>()(
  persist(
    (set, get) => ({
      buckets: seededBuckets.map((bucket) => normalizeBucket(bucket)),
      activity: [],
      cliHistory: [],
      costHistory: [],
      scenarioState: { activeScenarioId: null, currentStepIndex: 0, completedStepIds: [] },
      lifecycleValidation: {},
      clockDay: 0,
      accruedCost: 0,
      accruedByClass: emptyCostByClass(),
      earlyDeletionTotal: 0,
      lifecycleLog: [],
      learningScenario: { scenarioId: null, stepIndex: 0 },
      region: "us-east-1",
      createBucket: (input) => {
        const name = input.name.trim();
        const validationError = validateBucketName(
          name,
          get().buckets.map((bucket) => bucket.name),
        );
        if (validationError) {
          return validationError.startsWith("A bucket")
            ? `BucketAlreadyExists: ${validationError}`
            : `InvalidBucketName: ${validationError}`;
        }
        const bucket: Bucket = {
          ...input,
          name,
          createdAt: new Date().toISOString(),
          access: input.blockPublicAccess ? "Bucket and objects not public" : "Objects can be public",
          tags: {},
          objects: [],
          policy: "",
          cors: "",
          kmsKey: "alias/aws/s3",
          bucketKey: true,
          objectLock: false,
          websiteHosting: { enabled: false, indexDocument: "index.html", errorDocument: "error.html" },
          lifecycleRules: [],
          replicationRules: [],
          inventoryName: "",
          inventoryEnabled: false,
          simulatedDay: 0,
          accessPoints: [],
          metrics: emptyMetrics(),
        };
        set((state) => ({ buckets: [...state.buckets, bucket] }));
        get().logActivity("CreateBucket", `arn:aws:s3:::${bucket.name}`, "Success");
        return null;
      },
      deleteBucket: (name) => {
        const bucket = get().buckets.find((item) => item.name === name);
        if (!bucket) return "NoSuchBucket: The specified bucket does not exist.";
        if (bucket.objects.length) return "BucketNotEmpty: The bucket you tried to delete is not empty.";
        set((state) => ({ buckets: state.buckets.filter((item) => item.name !== name) }));
        void clearBucketBlobs(name);
        get().logActivity("DeleteBucket", `arn:aws:s3:::${name}`, "Success");
        return null;
      },
      emptyBucket: (name) => {
        const bucket = get().buckets.find((item) => item.name === name);
        if (!bucket) return "NoSuchBucket: The specified bucket does not exist.";
        set((state) => ({
          buckets: state.buckets.map((item) => (item.name === name ? { ...item, objects: [] } : item)),
        }));
        void clearBucketBlobs(name);
        get().logActivity("EmptyBucket", `arn:aws:s3:::${name}`, "Success");
        return null;
      },
      uploadObject: async (bucketName, key, size, type, blob, metadata, tags, storageClass = "STANDARD") => {
        const normalizedKey = key.trim().replace(/^\/+/, "");
        if (!normalizedKey) return;
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) return;
        const existing = bucket.objects.find((object) => object.key === normalizedKey);
        const versioningEnabled = bucket.versioning === "Enabled";
        const versionId = versionIdForNewObject(bucket.versioning);
        const versions = existing?.versions ? [...existing.versions] : [];
        const preserveExisting = existing && !existing.isFolder && (versioningEnabled || existing.versionId !== "null");
        if (existing && preserveExisting) {
          if (!existing.deleteMarker) {
            const currentBlob = await loadObjectBlob(bucketName, normalizedKey);
            if (currentBlob) {
              await saveObjectVersionBlob(bucketName, normalizedKey, existing.versionId, currentBlob);
            }
          }
          versions.push(toVersion(existing));
        }
        await saveObjectBlob(
          bucketName,
          normalizedKey,
          blob ??
            new Blob([`Simulated object content for ${normalizedKey}\n`], { type: type || "application/octet-stream" }),
        );
        const object: S3Object = {
          key: normalizedKey,
          size,
          type: type || "application/octet-stream",
          storageClass,
          createdAt: clockTimestamp(get().clockDay),
          etag: createEtag(calculateParts(size)),
          parts: calculateParts(size),
          versionId,
          versions,
          metadata: metadata ?? {},
          tags: tags ?? {},
          createdDay: get().clockDay,
          storageClassChangedDay: get().clockDay,
        };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  objects: [...item.objects.filter((candidate) => candidate.key !== normalizedKey), object],
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: (item.metrics?.putRequests ?? 0) + 1,
                    deleteRequests: item.metrics?.deleteRequests ?? 0,
                  },
                }
              : item,
          ),
        }));
        get().logActivity("PutObject", `arn:aws:s3:::${bucketName}/${normalizedKey}`, "Success");
      },
      deleteObject: async (bucketName, key) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const object = bucket?.objects.find((item) => item.key === key);
        if (!bucket || !object) return;
        if (bucket.versioning === "Enabled") {
          if (object.deleteMarker) return;
          const currentBlob = await loadObjectBlob(bucketName, key);
          if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob);

          const versions = [...(object.versions ?? []), toVersion(object, get().clockDay)];
          set((state) => ({
            buckets: state.buckets.map((item) =>
              item.name === bucketName
                ? {
                    ...item,
                    objects: item.objects.map((candidate) =>
                      candidate.key === key
                        ? { ...candidate, deleteMarker: true, versionId: nextDeleteMarkerId(), versions }
                        : candidate,
                    ),
                    metrics: {
                      getRequests: item.metrics?.getRequests ?? 0,
                      putRequests: item.metrics?.putRequests ?? 0,
                      deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                    },
                  }
                : item,
            ),
          }));
        } else {
          set((state) => ({
            buckets: state.buckets.map((item) =>
              item.name === bucketName
                ? {
                    ...item,
                    objects: item.objects.filter((candidate) => candidate.key !== key),
                    metrics: {
                      getRequests: item.metrics?.getRequests ?? 0,
                      putRequests: item.metrics?.putRequests ?? 0,
                      deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                    },
                  }
                : item,
            ),
          }));
          await deleteObjectBlob(bucketName, key);
          await Promise.all(
            (object.versions ?? []).map((version) => deleteObjectVersionBlob(bucketName, key, version.versionId)),
          );
          await deleteAllObjectVersionBlobs(bucketName, key);
        }
        get().logActivity("DeleteObject", `arn:aws:s3:::${bucketName}/${key}`, "Success");
      },
      createFolder: (bucketName, prefix) => {
        const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
        if (!normalized) return;
        const key = `${normalized}/`;
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket || bucket.objects.some((object) => object.key === key)) return;
        const object: S3Object = {
          key,
          size: 0,
          type: "folder",
          storageClass: "STANDARD",
          createdAt: clockTimestamp(get().clockDay),
          etag: "",
          parts: 0,
          versionId: versionIdForNewObject(bucket.versioning),
          versions: [],
          metadata: {},
          tags: {},
          isFolder: true,
          createdDay: get().clockDay,
          storageClassChangedDay: get().clockDay,
        };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  objects: [...item.objects, object],
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: (item.metrics?.putRequests ?? 0) + 1,
                    deleteRequests: item.metrics?.deleteRequests ?? 0,
                  },
                }
              : item,
          ),
        }));
        get().logActivity("CreateFolder", `arn:aws:s3:::${bucketName}/${key}`, "Success");
        const payload = cli.createFolderCommand(bucketName, key);
        get().addCliCommand(payload.command, payload.json);
      },
      setRegion: (region) => set({ region }),
      updateBucket: (name, changes) =>
        set((state) => ({
          buckets: state.buckets.map((bucket) => (bucket.name === name ? { ...bucket, ...changes } : bucket)),
        })),
      setLifecycleRules: (name, rules) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) =>
            bucket.name === name ? { ...bucket, lifecycleRules: rules } : bucket,
          ),
        }));
        get().logActivity("PutLifecycleConfiguration", `arn:aws:s3:::${name}`, "Success");
      },
      setObjectStorageClass: (bucketName, key, storageClass) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) =>
            bucket.name === bucketName
              ? {
                  ...bucket,
                  objects: bucket.objects.map((object) => (object.key === key ? { ...object, storageClass } : object)),
                }
              : bucket,
          ),
        }));
        get().logActivity("PutObjectStorageClass", `arn:aws:s3:::${bucketName}/${key}`, "Success");
      },
      setReplicationRules: (name, rules) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) =>
            bucket.name === name ? { ...bucket, replicationRules: rules } : bucket,
          ),
        }));
        get().logActivity("PutReplicationConfiguration", `arn:aws:s3:::${name}`, "Success");
      },
      createAccessPoint: (bucketName: string, name: string, network: "Internet" | "VPC") => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const accessPointName = name.trim();
        if (!bucket || !accessPointName || bucket.accessPoints.some((ap) => ap.name === accessPointName)) return;
        const accessPoint = {
          id: `ap-${crypto.randomUUID().slice(0, 8)}`,
          name: accessPointName,
          bucketName,
          network,
          status: "Active" as const,
        };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName ? { ...item, accessPoints: [...item.accessPoints, accessPoint] } : item,
          ),
        }));
        get().logActivity("CreateAccessPoint", `arn:aws:s3:::${bucketName}/accesspoint/${name}`, "Success");
      },
      deleteAccessPoint: (bucketName: string, accessPointId: string) => {
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? { ...item, accessPoints: item.accessPoints.filter((ap) => ap.id !== accessPointId) }
              : item,
          ),
        }));
        get().logActivity("DeleteAccessPoint", `arn:aws:s3:::${bucketName}/accesspoint/${accessPointId}`, "Success");
      },
      setAccessPoints: (bucketName: string, accessPoints: Bucket["accessPoints"]) => {
        set((state) => ({
          buckets: state.buckets.map((item) => (item.name === bucketName ? { ...item, accessPoints } : item)),
        }));
        get().logActivity("PutAccessPoint", `arn:aws:s3:::${bucketName}`, "Success");
      },
      runReplication: async (name) => {
        const source = get().buckets.find((bucket) => bucket.name === name);
        if (!source) return;
        const enabledRules = source.replicationRules.filter((rule) => rule.status === "Enabled");
        if (!enabledRules.length) return;
        const destinationCopies = new Map<string, S3Object[]>();
        const copiedKeys = new Map<string, Set<string>>();
        const replicatedRuleIds = new Set<string>();
        for (const rule of enabledRules) {
          const destination = get().buckets.find((bucket) => bucket.name === rule.destination);
          if (!destination || destination.name === source.name) continue;
          replicatedRuleIds.add(rule.id);
          const existingCopies = copiedKeys.get(destination.name) ?? new Set<string>();
          const copies = destinationCopies.get(destination.name) ?? [];
          for (const object of source.objects) {
            if (object.isFolder || object.deleteMarker) continue;
            if (rule.prefix && !object.key.startsWith(rule.prefix)) continue;
            if (existingCopies.has(object.key)) continue;
            const blob = await loadObjectBlob(source.name, object.key);
            await saveObjectBlob(
              destination.name,
              object.key,
              blob ?? new Blob([`Replicated object content for ${object.key}\n`], { type: object.type }),
            );
            copies.push({
              ...object,
              versionId: nextReplicationId(),
              versions: [],
              deleteMarker: false,
            });
            existingCopies.add(object.key);
          }
          copiedKeys.set(destination.name, existingCopies);
          destinationCopies.set(destination.name, copies);
        }
        if (!replicatedRuleIds.size) {
          get().logActivity("ReplicateObjects", `arn:aws:s3:::${name}`, "Warning");
          return;
        }
        set((state) => ({
          buckets: state.buckets.map((bucket) => {
            const copies = destinationCopies.get(bucket.name);
            const keys = copiedKeys.get(bucket.name);
            const updated = copies?.length
              ? {
                  ...bucket,
                  objects: [...bucket.objects.filter((object) => !keys?.has(object.key)), ...copies],
                }
              : bucket;
            if (bucket.name !== name) return updated;
            return {
              ...updated,
              replicationRules: updated.replicationRules.map((rule) =>
                replicatedRuleIds.has(rule.id) ? { ...rule, statusLabel: "Replicated" as const } : rule,
              ),
            };
          }),
        }));
        get().logActivity("ReplicateObjects", `arn:aws:s3:::${name}`, "Success");
      },
      advanceSimulatedTime: (name, days) => {
        const bucket = get().buckets.find((item) => item.name === name);
        if (!bucket) return;
        const nextDay = (bucket.simulatedDay ?? 0) + Math.max(0, days);
        const rules = bucket.lifecycleRules.filter((rule) => rule.status === "Enabled");
        const objects = bucket.objects.map((object) => {
          if (object.isFolder || object.deleteMarker) return object;
          const matchingRules = rules.filter(
            (rule) => (!rule.prefix || object.key.startsWith(rule.prefix)) && nextDay >= rule.transitionDays,
          );
          if (!matchingRules.length) return object;
          const targetClass = matchingRules.reduce((latest, rule) =>
            rule.transitionDays > latest.transitionDays ? rule : latest,
          ).targetClass;
          return object.storageClass === targetClass ? object : { ...object, storageClass: targetClass };
        });
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === name ? { ...item, simulatedDay: nextDay, objects } : item,
          ),
        }));
        get().logActivity("LifecycleTransition", `arn:aws:s3:::${name}`, "Success");
        get().recordCostSnapshot(nextDay);
      },
      restoreObjectVersion: async (bucketName, key, versionId) => {
        const object = get()
          .buckets.find((bucket) => bucket.name === bucketName)
          ?.objects.find((item) => item.key === key);
        const version = object?.versions?.find((item) => item.versionId === versionId);
        if (!object || !version || version.deleteMarker || object.versionId === versionId) return;
        const currentBlob = object.deleteMarker ? undefined : await loadObjectBlob(bucketName, key);
        const versionBlob = await loadObjectVersionBlob(bucketName, key, versionId);
        if (versionBlob) await saveObjectBlob(bucketName, key, versionBlob);
        if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob);
        await deleteObjectVersionBlob(bucketName, key, versionId);
        const versions = (object.versions ?? []).filter((item) => item.versionId !== versionId);
        if (!object.deleteMarker) versions.push(toVersion(object));
        set((state) => ({
          buckets: state.buckets.map((bucket) =>
            bucket.name === bucketName
              ? {
                  ...bucket,
                  objects: bucket.objects.map((item) =>
                    item.key === key
                      ? {
                          ...item,
                          size: version.size,
                          type: version.type,
                          createdAt: version.createdAt,
                          storageClass: version.storageClass,
                          etag: version.etag,
                          parts: version.parts,
                          versionId: version.versionId,
                          deleteMarker: false,
                          versions,
                        }
                      : item,
                  ),
                }
              : bucket,
          ),
        }));
        get().logActivity("RestoreObjectVersion", `arn:aws:s3:::${bucketName}/${key}`, "Success");
      },
      deleteObjectVersion: async (bucketName, key, versionId) => {
        const object = get()
          .buckets.find((bucket) => bucket.name === bucketName)
          ?.objects.find((item) => item.key === key);
        if (!object) return;
        if (object.versionId === versionId) {
          const remaining = (object.versions ?? []).filter((item) => item.versionId !== versionId);
          const next = [...remaining].reverse().find((item) => !item.deleteMarker);
          if (next) {
            const blob = await loadObjectVersionBlob(bucketName, key, next.versionId);
            await deleteObjectBlob(bucketName, key);
            if (blob) await saveObjectBlob(bucketName, key, blob);
            await deleteObjectVersionBlob(bucketName, key, next.versionId);
            set((state) => ({
              buckets: state.buckets.map((bucket) =>
                bucket.name === bucketName
                  ? {
                      ...bucket,
                      objects: bucket.objects.map((item) =>
                        item.key === key
                          ? {
                              ...item,
                              size: next.size,
                              type: next.type,
                              createdAt: next.createdAt,
                              storageClass: next.storageClass,
                              etag: next.etag,
                              parts: next.parts,
                              versionId: next.versionId,
                              deleteMarker: false,
                              versions: remaining.filter((candidate) => candidate.versionId !== next.versionId),
                            }
                          : item,
                      ),
                    }
                  : bucket,
              ),
            }));
          } else {
            set((state) => ({
              buckets: state.buckets.map((bucket) =>
                bucket.name === bucketName
                  ? { ...bucket, objects: bucket.objects.filter((item) => item.key !== key) }
                  : bucket,
              ),
            }));
            await deleteObjectBlob(bucketName, key);
            await Promise.all(remaining.map((version) => deleteObjectVersionBlob(bucketName, key, version.versionId)));
            await deleteAllObjectVersionBlobs(bucketName, key);
          }
        } else {
          set((state) => ({
            buckets: state.buckets.map((bucket) =>
              bucket.name === bucketName
                ? {
                    ...bucket,
                    objects: bucket.objects.map((item) =>
                      item.key === key
                        ? { ...item, versions: item.versions?.filter((version) => version.versionId !== versionId) }
                        : item,
                    ),
                  }
                : bucket,
            ),
          }));
          await deleteObjectVersionBlob(bucketName, key, versionId);
        }
        set((state) => ({
          buckets: state.buckets.map((bucket) =>
            bucket.name === bucketName
              ? {
                  ...bucket,
                  metrics: {
                    getRequests: bucket.metrics?.getRequests ?? 0,
                    putRequests: bucket.metrics?.putRequests ?? 0,
                    deleteRequests: (bucket.metrics?.deleteRequests ?? 0) + 1,
                  },
                }
              : bucket,
          ),
        }));
        get().logActivity("DeleteObjectVersion", `arn:aws:s3:::${bucketName}/${key}`, "Success");
      },
      recordGetRequest: (bucketName) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) return;
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  metrics: {
                    getRequests: (item.metrics?.getRequests ?? 0) + 1,
                    putRequests: item.metrics?.putRequests ?? 0,
                    deleteRequests: item.metrics?.deleteRequests ?? 0,
                  },
                }
              : item,
          ),
        }));
      },
      createLearningBucket: (input) => {
        const name = input.name.trim();
        const validation = validateBucketName(
          name,
          get().buckets.map((bucket) => bucket.name),
        );
        if (validation) {
          return {
            code: validation.includes("already exists") ? "BucketAlreadyExists" : "InvalidBucketName",
            message: validation,
          };
        }
        const bucket = normalizeBucket({
          name,
          region: input.region,
          versioning: input.versioning ?? "Unversioned",
          blockPublicAccess: input.blockPublicAccess ?? true,
          access: input.blockPublicAccess === false ? "Objects can be public" : "Bucket and objects not public",
          createdAt: new Date().toISOString(),
          objects: [],
        });
        set((state) => ({ buckets: [...state.buckets, bucket] }));
        const payload = cli.createBucketCommand({
          name,
          region: input.region,
          versioning: input.versioning ?? "Unversioned",
          blockPublicAccess: input.blockPublicAccess ?? true,
        });
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("CreateBucket", bucketArn(name), "Success");
        return null;
      },
      setVersioningState: (bucketName, next) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) {
          return { code: "NoSuchBucket", message: `The bucket ${bucketName} does not exist.` };
        }
        const error = validateVersioningTransition(bucket.versioning, next);
        if (error) return { code: error.code, message: error.message };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName ? { ...item, versioning: next } : item,
          ),
        }));
        const payload = cli.putBucketVersioningCommand(bucketName, next);
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("PutBucketVersioning", bucketArn(bucketName), "Success");
        return null;
      },
      uploadLearningObject: async (input) => {
        const key = input.key.trim().replace(/^\/+/, "");
        if (!key) return;
        const bucket = get().buckets.find((item) => item.name === input.bucketName);
        if (!bucket) return;

        const existing = bucket.objects.find((object) => object.key === key);
        const versioningEnabled = bucket.versioning === "Enabled";
        const versions = existing?.versions ? [...existing.versions] : [];
        const shouldPreserve = Boolean(
          existing && !existing.isFolder && (versioningEnabled || existing.versionId !== "null"),
        );
        if (existing && shouldPreserve) {
          if (!existing.deleteMarker) {
            const currentBlob = await loadObjectBlob(input.bucketName, key);
            if (currentBlob) {
              await saveObjectVersionBlob(input.bucketName, key, existing.versionId, currentBlob);
            }
          }
          versions.push(toVersion(existing, get().clockDay));
        }

        const type = input.type || "application/octet-stream";
        await saveObjectBlob(
          input.bucketName,
          key,
          input.blob ?? new Blob([`Simulated object content for ${key}\n`], { type }),
        );
        const versionId = versionIdForNewObject(bucket.versioning);
        const object: S3Object = {
          key,
          size: input.size,
          type,
          storageClass: input.storageClass,
          createdAt: clockTimestamp(get().clockDay),
          etag: createEtag(calculateParts(input.size)),
          parts: calculateParts(input.size),
          versionId,
          versions,
          metadata: input.metadata ?? {},
          tags: input.tags ?? {},
          createdDay: get().clockDay,
          storageClassChangedDay: get().clockDay,
        };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === input.bucketName
              ? {
                  ...item,
                  objects: [...item.objects.filter((candidate) => candidate.key !== key), object],
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: (item.metrics?.putRequests ?? 0) + 1,
                    deleteRequests: item.metrics?.deleteRequests ?? 0,
                  },
                }
              : item,
          ),
        }));
        const payload = cli.putObjectCommand({
          bucket: input.bucketName,
          key,
          size: input.size,
          storageClass: input.storageClass,
          contentType: type,
          metadata: input.metadata,
          tags: input.tags,
          versionId,
          etag: object.etag,
        });
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("PutObject", objectArn(input.bucketName, key), "Success");
      },
      deleteCurrentObject: async (bucketName, key) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const object = bucket?.objects.find((item) => item.key === key);
        if (!bucket || !object) return { deleteMarker: false };

        if (bucket.versioning !== "Unversioned") {
          if (object.deleteMarker) {
            const payload = cli.deleteObjectCommand(bucket, key);
            get().addCliCommand(payload.command, payload.json);
            return { deleteMarker: true };
          }
          const currentBlob = await loadObjectBlob(bucketName, key);
          if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob);

          const versions = [...(object.versions ?? [])];
          if (bucket.versioning === "Enabled" || object.versionId !== "null") {
            versions.push(toVersion(object, get().clockDay));
          }
          const markerId = nextDeleteMarkerId();
          set((state) => ({
            buckets: state.buckets.map((item) =>
              item.name === bucketName
                ? {
                    ...item,
                    objects: item.objects.map((candidate) =>
                      candidate.key === key
                        ? {
                            ...candidate,
                            size: 0,
                            type: "application/octet-stream",
                            etag: "",
                            parts: 0,
                            deleteMarker: true,
                            versionId: markerId,
                            versions,
                            metadata: {},
                            tags: {},
                            createdAt: clockTimestamp(get().clockDay),
                            createdDay: get().clockDay,
                            storageClassChangedDay: get().clockDay,
                          }
                        : candidate,
                    ),
                    metrics: {
                      getRequests: item.metrics?.getRequests ?? 0,
                      putRequests: item.metrics?.putRequests ?? 0,
                      deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                    },
                  }
                : item,
            ),
          }));
          const payload = cli.deleteObjectCommand(bucket, key, undefined, markerId);
          get().addCliCommand(payload.command, payload.json);
          get().logActivity("DeleteObject", objectArn(bucketName, key), "Success");
          return { deleteMarker: true };
        }

        const penalty = earlyDeletionCharge(object.size, object.storageClass, ageInClass(object, get().clockDay));
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  objects: item.objects.filter((candidate) => candidate.key !== key),
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: item.metrics?.putRequests ?? 0,
                    deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                  },
                }
              : item,
          ),
        }));
        await deleteObjectBlob(bucketName, key);
        await Promise.all(
          (object.versions ?? []).map((version) => deleteObjectVersionBlob(bucketName, key, version.versionId)),
        );
        await deleteAllObjectVersionBlobs(bucketName, key);
        const payload = cli.deleteObjectCommand(bucket, key);
        get().addCliCommand(payload.command, payload.json);
        if (penalty > 0) {
          set((state) => ({
            earlyDeletionTotal: state.earlyDeletionTotal + penalty,
            accruedCost: state.accruedCost + penalty,
          }));
          get().logActivity("EarlyDeletionCharge", objectArn(bucketName, key), "Warning");
        }
        get().logActivity("DeleteObject", objectArn(bucketName, key), "Success");
        return { deleteMarker: false };
      },
      deleteVersionPermanent: async (bucketName, key, versionId) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const object = bucket?.objects.find((item) => item.key === key);
        if (!bucket || !object) return;

        const isCurrent = object.versionId === versionId;
        const targetVersion = isCurrent
          ? toVersion(object)
          : object.versions?.find((version) => version.versionId === versionId);
        const penalty =
          targetVersion && !targetVersion.deleteMarker
            ? earlyDeletionCharge(targetVersion.size, targetVersion.storageClass, ageInClass(targetVersion, get().clockDay))
            : 0;

        if (isCurrent) {
          const remaining = (object.versions ?? []).filter((version) => version.versionId !== versionId);
          const next = remaining[remaining.length - 1];
          if (next) {
            const blob = next.deleteMarker
              ? undefined
              : await loadObjectVersionBlob(bucketName, key, next.versionId);
            await deleteObjectBlob(bucketName, key);
            if (blob) await saveObjectBlob(bucketName, key, blob);
            await deleteObjectVersionBlob(bucketName, key, next.versionId);
            set((state) => ({
              buckets: state.buckets.map((item) =>
                item.name === bucketName
                  ? {
                      ...item,
                      objects: item.objects.map((candidate) =>
                        candidate.key === key
                          ? {
                              ...candidate,
                              size: next.size,
                              type: next.type,
                              createdAt: next.createdAt,
                              storageClass: next.storageClass,
                              etag: next.etag,
                              parts: next.parts,
                              versionId: next.versionId,
                              deleteMarker: next.deleteMarker,
                              createdDay: next.createdDay ?? 0,
                              storageClassChangedDay: next.storageClassChangedDay ?? next.createdDay ?? 0,
                              versions: remaining.filter((version) => version.versionId !== next.versionId),
                              metadata: next.deleteMarker ? {} : candidate.metadata,
                              tags: next.deleteMarker ? {} : candidate.tags,
                            }
                          : candidate,
                      ),
                    }
                  : item,
              ),
            }));
          } else {
            set((state) => ({
              buckets: state.buckets.map((item) =>
                item.name === bucketName
                  ? { ...item, objects: item.objects.filter((candidate) => candidate.key !== key) }
                  : item,
              ),
            }));
            await deleteObjectBlob(bucketName, key);
            await deleteAllObjectVersionBlobs(bucketName, key);
          }
        } else {
          set((state) => ({
            buckets: state.buckets.map((item) =>
              item.name === bucketName
                ? {
                    ...item,
                    objects: item.objects.map((candidate) =>
                      candidate.key === key
                        ? {
                            ...candidate,
                            versions: candidate.versions?.filter((version) => version.versionId !== versionId),
                          }
                        : candidate,
                    ),
                  }
                : item,
            ),
          }));
          await deleteObjectVersionBlob(bucketName, key, versionId);
        }

        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: item.metrics?.putRequests ?? 0,
                    deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                  },
                }
              : item,
          ),
        }));
        if (penalty > 0) {
          set((state) => ({
            earlyDeletionTotal: state.earlyDeletionTotal + penalty,
            accruedCost: state.accruedCost + penalty,
          }));
          get().logActivity("EarlyDeletionCharge", objectArn(bucketName, key), "Warning");
        }
        const payload = cli.deleteObjectCommand(bucket, key, versionId);
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("DeleteObjectVersion", objectArn(bucketName, key), "Success");
      },
      restoreVersionAsCopy: async (bucketName, key, versionId) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const object = bucket?.objects.find((item) => item.key === key);
        const source = object?.versions?.find((version) => version.versionId === versionId);
        if (!bucket || !object || !source || source.deleteMarker) return;

        const versions = [...(object.versions ?? [])];
        if (bucket.versioning === "Enabled" || object.versionId !== "null") {
          if (!object.deleteMarker) {
            const currentBlob = await loadObjectBlob(bucketName, key);
            if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob);
          }
          versions.push(toVersion(object, get().clockDay));
        }
        const sourceBlob = await loadObjectVersionBlob(bucketName, key, versionId);
        if (sourceBlob) await saveObjectBlob(bucketName, key, sourceBlob);

        const versionIdForCopy = versionIdForNewObject(bucket.versioning);
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  objects: item.objects.map((candidate) =>
                    candidate.key === key
                      ? {
                          ...candidate,
                          size: source.size,
                          type: source.type,
                          createdAt: clockTimestamp(get().clockDay),
                          storageClass: source.storageClass,
                          etag: source.etag,
                          parts: source.parts,
                          versionId: versionIdForCopy,
                          deleteMarker: false,
                          versions,
                          createdDay: get().clockDay,
                          storageClassChangedDay: get().clockDay,
                        }
                      : candidate,
                  ),
                }
              : item,
          ),
        }));
        const payload = cli.restoreVersionCommand(bucket, key, versionId);
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("RestoreObjectVersion", objectArn(bucketName, key), "Success");
      },
      changeObjectStorageClass: async (bucketName, key, storageClass) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        const object = bucket?.objects.find((item) => item.key === key);
        if (!bucket || !object) return { warning: null };
        if (object.deleteMarker) {
          return { warning: "InvalidObjectState: A delete marker has no storage class. Remove the delete marker first." };
        }
        if (object.storageClass === storageClass) return { warning: null };

        const penalty = earlyDeletionCharge(
          object.size,
          object.storageClass,
          ageInClass(object, get().clockDay),
        );
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? {
                  ...item,
                  objects: item.objects.map((candidate) =>
                    candidate.key === key
                      ? { ...candidate, storageClass, storageClassChangedDay: get().clockDay }
                      : candidate,
                  ),
                }
              : item,
          ),
          ...(penalty > 0
            ? { earlyDeletionTotal: state.earlyDeletionTotal + penalty, accruedCost: state.accruedCost + penalty }
            : {}),
        }));
        const payload = cli.changeStorageClassCommand({
          bucket: bucketName,
          key,
          storageClass,
          versionId: object.versionId,
        });
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("PutObjectStorageClass", objectArn(bucketName, key), penalty > 0 ? "Warning" : "Success");
        return {
          warning:
            penalty > 0
              ? `Early deletion charge of $${penalty.toFixed(4)} applies because the object has not completed the minimum storage duration for ${object.storageClass}.`
              : null,
        };
      },
      advanceClock: (days) => {
        const step = Math.max(0, Math.floor(days));
        if (!step) return;

        let buckets = get().buckets;
        let day = get().clockDay;
        let byClass = get().accruedByClass ?? emptyCostByClass();
        let early = get().earlyDeletionTotal ?? 0;
        const history = [...get().costHistory];
        const events = [...get().lifecycleLog];

        if (!history.some((snapshot) => snapshot.day === day)) {
          const storageTotal = sumCostByClass(byClass);
          history.push({
            day,
            ...groupCostByClass(byClass),
            total: storageTotal + early,
            classCosts: { ...byClass },
            accrued: storageTotal,
            earlyDeletion: early,
          });
        }

        for (let index = 0; index < step; index += 1) {
          day += 1;
          const result = applyLifecycleDay(buckets, day);
          buckets = result.buckets;
          early += result.penalties;
          if (result.events.length) events.unshift(...result.events);

          const monthly = monthlyCostByClass(costEntriesForBuckets(buckets));
          const daily = emptyCostByClass();
          for (const storageClass of Object.keys(monthly) as Array<keyof typeof monthly>) {
            daily[storageClass] = monthly[storageClass] / 30;
          }
          byClass = addCostByClass(byClass, daily);
          const storageTotal = sumCostByClass(byClass);
          history.push({
            day,
            ...groupCostByClass(byClass),
            total: storageTotal + early,
            classCosts: { ...byClass },
            accrued: storageTotal,
            earlyDeletion: early,
          });
        }

        set({
          buckets: buckets.map((bucket) => ({ ...bucket, simulatedDay: day })),
          clockDay: day,
          accruedByClass: byClass,
          accruedCost: sumCostByClass(byClass) + early,
          earlyDeletionTotal: early,
          costHistory: history.sort((a, b) => a.day - b.day).slice(-500),
          lifecycleLog: events.slice(0, 200),
        });
        get().logActivity("AdvanceVirtualClock", `+${step} day(s)`, "Success");
      },
      resetClock: () => {
        set((state) => ({
          clockDay: 0,
          accruedCost: 0,
          accruedByClass: emptyCostByClass(),
          earlyDeletionTotal: 0,
          costHistory: [],
          lifecycleLog: [],
          buckets: state.buckets.map((bucket) => ({ ...bucket, simulatedDay: 0 })),
        }));
        get().logActivity("ResetVirtualClock", "clock", "Success");
      },
      saveLifecycleRule: (bucketName, rule) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) {
          return [{ severity: "error", code: "NoSuchBucket", message: `The bucket ${bucketName} does not exist.` }];
        }
        const normalized = normalizeLifecycleRule(rule, bucket.lifecycleRules.length);
        const others = bucket.lifecycleRules.filter((candidate) => candidate.id !== normalized.id);
        const issues = validateLifecycleRule(normalized, others, bucket.objects);
        const validation: LifecycleValidationIssue[] = issues.map((issue) => ({
          ruleId: issue.ruleId ?? normalized.id,
          type: issue.severity,
          message: issue.message,
        }));
        set((state) => ({
          lifecycleValidation: { ...state.lifecycleValidation, [bucketName]: validation },
        }));
        if (hasBlockingIssues(issues)) return issues;

        const rules = [...others, normalized];
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName ? { ...item, lifecycleRules: rules } : item,
          ),
        }));
        const payload = cli.putLifecycleCommand(bucketName, rules);
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("PutLifecycleConfiguration", bucketArn(bucketName), "Success");
        return issues;
      },
      deleteLifecycleRule: (bucketName, ruleId) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) return;
        const rules = bucket.lifecycleRules.filter((rule) => rule.id !== ruleId);
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName ? { ...item, lifecycleRules: rules } : item,
          ),
        }));
        const payload = rules.length
          ? cli.putLifecycleCommand(bucketName, rules)
          : cli.deleteLifecycleCommand(bucketName);
        get().addCliCommand(payload.command, payload.json);
        get().logActivity("DeleteLifecycleRule", bucketArn(bucketName), "Success");
      },
      validateBucketLifecycle: (bucketName) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) return [];
        const issues = validateLifecycleRules(bucket.lifecycleRules, bucket.objects);
        const validation: LifecycleValidationIssue[] = issues.map((issue) => ({
          ruleId: issue.ruleId ?? "",
          type: issue.severity,
          message: issue.message,
        }));
        set((state) => ({
          lifecycleValidation: { ...state.lifecycleValidation, [bucketName]: validation },
        }));
        const payload = cli.getLifecycleCommand(bucketName, bucket.lifecycleRules);
        get().addCliCommand(payload.command, payload.json);
        return issues;
      },
      addMultipartUpload: (bucketName, key, size) => {
        const bucket = get().buckets.find((item) => item.name === bucketName);
        if (!bucket) return;
        const upload: MultipartUpload = {
          id: generateVersionId().slice(0, 16),
          key,
          size,
          initiatedDay: get().clockDay,
        };
        set((state) => ({
          buckets: state.buckets.map((item) =>
            item.name === bucketName
              ? { ...item, multipartUploads: [...(item.multipartUploads ?? []), upload] }
              : item,
          ),
        }));
        get().addCliCommand(
          `aws s3api create-multipart-upload --bucket ${bucketName} --key "${key}"`,
          JSON.stringify(
            { Bucket: bucketName, Key: key, UploadId: upload.id, Initiated: clockTimestamp(get().clockDay) },
            null,
            2,
          ),
        );
        get().logActivity("CreateMultipartUpload", objectArn(bucketName, key), "Success");
      },
      startLearningScenario: (scenarioId) => set({ learningScenario: { scenarioId, stepIndex: 0 } }),
      setLearningScenarioStep: (stepIndex) =>
        set((state) => ({
          learningScenario: { ...state.learningScenario, stepIndex: Math.max(0, Math.floor(stepIndex)) },
        })),
      exitLearningScenario: () => set({ learningScenario: { scenarioId: null, stepIndex: 0 } }),
      exportSimulatorState: () => {
        const state = get();
        return JSON.stringify(
          {
            format: "s3-learning-simulator",
            version: 1,
            exportedAt: new Date().toISOString(),
            region: state.region,
            buckets: state.buckets,
            activity: state.activity,
            cliHistory: state.cliHistory,
            costHistory: state.costHistory,
            clockDay: state.clockDay,
            accruedCost: state.accruedCost,
            accruedByClass: state.accruedByClass,
            earlyDeletionTotal: state.earlyDeletionTotal,
            lifecycleLog: state.lifecycleLog,
          },
          null,
          2,
        );
      },
      importSimulatorState: (jsonText) => {
        try {
          const parsed = JSON.parse(jsonText) as Record<string, unknown>;
          const source =
            parsed.state && typeof parsed.state === "object"
              ? (parsed.state as Record<string, unknown>)
              : parsed;
          if (!Array.isArray(source.buckets)) {
            return "Imported JSON must contain a buckets array.";
          }
          const buckets = (source.buckets as Array<Partial<Bucket> & { name?: unknown }>)
            .filter((bucket) => Boolean(bucket && typeof bucket.name === "string" && bucket.name.length > 0))
            .map((bucket) => normalizeBucket(bucket as Partial<Bucket> & { name: string }));
          if (!buckets.length) return "Imported JSON does not contain any valid buckets.";

          const activity = Array.isArray(source.activity)
            ? (source.activity as Activity[]).map((event, index) => ({
                id: event.id ?? `imported-${index}`,
                action: event.action ?? "ImportedEvent",
                resource: event.resource ?? "",
                createdAt: event.createdAt ?? new Date().toISOString(),
                status: event.status ?? "Success",
              }))
            : [];
          const cliHistory = Array.isArray(source.cliHistory) ? (source.cliHistory as CliHistoryEntry[]) : [];
          const costHistory = Array.isArray(source.costHistory) ? (source.costHistory as CostSnapshot[]) : [];
          const lifecycleLog = Array.isArray(source.lifecycleLog)
            ? (source.lifecycleLog as LifecycleLogEntry[])
            : [];
          const clockDay =
            typeof source.clockDay === "number" && Number.isFinite(source.clockDay)
              ? Math.max(0, Math.floor(source.clockDay))
              : 0;

          set({
            buckets,
            activity,
            cliHistory,
            costHistory,
            lifecycleLog,
            clockDay,
            region: typeof source.region === "string" ? source.region : "us-east-1",
            accruedCost: typeof source.accruedCost === "number" ? source.accruedCost : 0,
            earlyDeletionTotal:
              typeof source.earlyDeletionTotal === "number" ? source.earlyDeletionTotal : 0,
            accruedByClass:
              source.accruedByClass && typeof source.accruedByClass === "object"
                ? ({ ...emptyCostByClass(), ...(source.accruedByClass as Partial<CostByClass>) } as CostByClass)
                : emptyCostByClass(),
            learningScenario: { scenarioId: null, stepIndex: 0 },
            scenarioState: { activeScenarioId: null, currentStepIndex: 0, completedStepIds: [] },
            lifecycleValidation: {},
          });
          void clearObjectBlobs();
          get().logActivity("ImportSimulatorState", "state", "Success");
          return null;
        } catch (error) {
          return error instanceof Error ? `Import failed: ${error.message}` : "Import failed.";
        }
      },
      reset: () => {
        void clearObjectBlobs();
        set({
          buckets: structuredClone(seededBuckets).map((bucket) => normalizeBucket(bucket)),
          activity: [],
          region: "us-east-1",
          cliHistory: [],
          costHistory: [],
          clockDay: 0,
          accruedCost: 0,
          accruedByClass: emptyCostByClass(),
          earlyDeletionTotal: 0,
          lifecycleLog: [],
          learningScenario: { scenarioId: null, stepIndex: 0 },
          scenarioState: { activeScenarioId: null, currentStepIndex: 0, completedStepIds: [] },
          lifecycleValidation: {},
        });
      },
      logActivity: (action, resource, status = "Success") =>
        set((state) => ({
          activity: [
            { id: crypto.randomUUID(), action, resource, createdAt: new Date().toISOString(), status },
            ...state.activity,
          ].slice(0, 100),
        })),
      addCliCommand: (command, jsonResponse) =>
        set((state) => ({
          cliHistory: [
            { id: crypto.randomUUID(), command, jsonResponse, timestamp: new Date().toISOString() },
            ...state.cliHistory,
          ].slice(0, 200),
        })),
      clearCliHistory: () => set({ cliHistory: [] }),
      recordCostSnapshot: (day) => {
        const buckets = get().buckets;
        const standardBytes = buckets.reduce(
          (sum, b) => sum + b.objects.filter((o) => o.storageClass === "STANDARD").reduce((s, o) => s + o.size, 0),
          0,
        );
        const iaBytes = buckets.reduce(
          (sum, b) =>
            sum +
            b.objects
              .filter((o) => o.storageClass === "STANDARD_IA" || o.storageClass === "ONE_ZONE_IA")
              .reduce((s, o) => s + o.size, 0),
          0,
        );
        const glacierBytes = buckets.reduce(
          (sum, b) =>
            sum +
            b.objects
              .filter(
                (o) =>
                  o.storageClass === "GLACIER" || o.storageClass === "GLACIER_IR" || o.storageClass === "DEEP_ARCHIVE",
              )
              .reduce((s, o) => s + o.size, 0),
          0,
        );
        const gb = 1024 * 1024 * 1024;
        const standardCost = (standardBytes / gb) * 0.023;
        const iaCost = (iaBytes / gb) * 0.0125;
        const glacierCost = (glacierBytes / gb) * 0.004;
        const deepArchiveCost =
          (buckets.reduce(
            (sum, b) =>
              sum + b.objects.filter((o) => o.storageClass === "DEEP_ARCHIVE").reduce((s, o) => s + o.size, 0),
            0,
          ) /
            gb) *
          0.00099;
        const total = standardCost + iaCost + glacierCost + deepArchiveCost;
        set((state) => ({
          costHistory: [
            ...state.costHistory.filter((s) => s.day !== day),
            { day, standardCost, iaCost, glacierCost, deepArchiveCost, total },
          ].sort((a, b) => a.day - b.day),
        }));
      },
      startScenario: (scenarioId) =>
        set({ scenarioState: { activeScenarioId: scenarioId, currentStepIndex: 0, completedStepIds: [] } }),
      nextScenarioStep: () =>
        set((state) => {
          const scenario = SCENARIOS.find((s) => s.id === state.scenarioState.activeScenarioId);
          if (!scenario) return state;
          const nextIndex = Math.min(state.scenarioState.currentStepIndex + 1, scenario.steps.length - 1);
          return {
            scenarioState: {
              ...state.scenarioState,
              currentStepIndex: nextIndex,
              completedStepIds: [
                ...state.scenarioState.completedStepIds,
                state.scenarioState.activeScenarioId! + "-" + state.scenarioState.currentStepIndex,
              ],
            },
          };
        }),
      prevScenarioStep: () =>
        set((state) => ({
          scenarioState: {
            ...state.scenarioState,
            currentStepIndex: Math.max(0, state.scenarioState.currentStepIndex - 1),
          },
        })),
      completeScenario: () =>
        set((state) => ({
          scenarioState: { ...state.scenarioState, activeScenarioId: null, currentStepIndex: 0, completedStepIds: [] },
        })),
      validateLifecycleRules: (bucketName) => {
        const bucket = get().buckets.find((b) => b.name === bucketName);
        if (!bucket) return [];
        const issues: LifecycleValidationIssue[] = [];
        const sortedRules = [...bucket.lifecycleRules].sort((a, b) => a.transitionDays - b.transitionDays);
        for (const rule of sortedRules) {
          if (rule.transitionDays < 30 && rule.targetClass === "STANDARD_IA") {
            issues.push({
              ruleId: rule.id,
              type: "error",
              message: "Standard-IA requires at least 30 days before transition.",
            });
          }
          if (rule.transitionDays < 90 && (rule.targetClass === "GLACIER_IR" || rule.targetClass === "GLACIER")) {
            issues.push({
              ruleId: rule.id,
              type: "error",
              message: "Glacier transition requires at least 90 days before transition.",
            });
          }
          if (rule.targetClass === "DEEP_ARCHIVE" && rule.transitionDays < 180) {
            issues.push({
              ruleId: rule.id,
              type: "error",
              message: "Deep Archive requires at least 180 days before transition.",
            });
          }
          if (rule.transitionDays > 0 && rule.targetClass === "STANDARD") {
            issues.push({
              ruleId: rule.id,
              type: "warning",
              message: "Transitioning to STANDARD from another class is not a typical lifecycle transition.",
            });
          }
          const minSize = STORAGE_CLASS_INFO[rule.targetClass].minBillableSizeBytes;
          if (minSize > 0) {
            issues.push({
              ruleId: rule.id,
              type: "info",
              message: `Objects transitioning to ${rule.targetClass} must be at least ${(minSize / 1024).toFixed(0)} KB.`,
            });
          }
        }
        for (let i = 1; i < sortedRules.length; i++) {
          if (sortedRules[i].transitionDays <= sortedRules[i - 1].transitionDays) {
            issues.push({
              ruleId: sortedRules[i].id,
              type: "error",
              message: "Transition days must be in ascending order across rules.",
            });
          }
        }
        set((state) => ({
          lifecycleValidation: { ...state.lifecycleValidation, [bucketName]: issues },
        }));
        return issues;
      },
    }),
    {
      name: "s3-simulator-state",
      version: 4,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<SimulatorState> | undefined;
        const buckets = Array.isArray(persisted?.buckets)
          ? persisted.buckets
              .filter((bucket): bucket is Bucket => Boolean(bucket && typeof bucket.name === "string"))
              .map((bucket) => normalizeBucket(bucket))
          : seededBuckets.map((bucket) => normalizeBucket(bucket));
        return {
          ...persisted,
          buckets,
          cliHistory: Array.isArray(persisted?.cliHistory) ? persisted.cliHistory : [],
          costHistory: Array.isArray(persisted?.costHistory) ? persisted.costHistory : [],
          scenarioState: persisted?.scenarioState ?? {
            activeScenarioId: null,
            currentStepIndex: 0,
            completedStepIds: [],
          },
          lifecycleValidation: persisted?.lifecycleValidation ?? {},
          clockDay: typeof persisted?.clockDay === "number" ? persisted.clockDay : 0,
          accruedCost: typeof persisted?.accruedCost === "number" ? persisted.accruedCost : 0,
          accruedByClass: persisted?.accruedByClass ?? emptyCostByClass(),
          earlyDeletionTotal:
            typeof persisted?.earlyDeletionTotal === "number" ? persisted.earlyDeletionTotal : 0,
          lifecycleLog: Array.isArray(persisted?.lifecycleLog) ? persisted.lifecycleLog : [],
          learningScenario: persisted?.learningScenario ?? { scenarioId: null, stepIndex: 0 },
        } as SimulatorState;
      },
    },
  ),
);
