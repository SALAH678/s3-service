import { describe, expect, it } from "vitest";
import { estimateEarlyDeletionCharge, estimateMonthlyStorageCost } from "../engine/storageClasses";
import {
  validateLifecycleRule,
  validateLifecycleRules,
} from "../engine/lifecycleRules";
import { buildVersionTimeline } from "../engine/versionModel";
import {
  generateEtag,
  generateVersionId,
  validateVersioningTransition,
  versionIdForNewObject,
} from "../engine/versioning";
import { emptyCostByClass, monthlyCostByClass, sumCostByClass } from "../engine/cost";

describe("versioning state machine", () => {
  it("allows Unversioned -> Enabled -> Suspended", () => {
    expect(validateVersioningTransition("Unversioned", "Enabled")).toBeNull();
    expect(validateVersioningTransition("Enabled", "Suspended")).toBeNull();
    expect(validateVersioningTransition("Suspended", "Enabled")).toBeNull();
  });

  it("never allows a return to Unversioned", () => {
    expect(validateVersioningTransition("Enabled", "Unversioned")?.code).toBe("InvalidBucketState");
    expect(validateVersioningTransition("Suspended", "Unversioned")?.code).toBe("InvalidBucketState");
  });

  it("blocks Suspended before Enabled", () => {
    expect(validateVersioningTransition("Unversioned", "Suspended")?.code).toBe("InvalidBucketState");
  });

  it("uses an opaque version id only when versioning is enabled", () => {
    expect(versionIdForNewObject("Enabled")).not.toBe("null");
    expect(versionIdForNewObject("Suspended")).toBe("null");
    expect(versionIdForNewObject("Unversioned")).toBe("null");
  });

  it("generates realistic ETags and version ids", () => {
    expect(generateEtag(1)).toMatch(/^"[a-f0-9]{32}"$/);
    expect(generateEtag(3)).toMatch(/^"[a-f0-9]{32}-3"$/);
    expect(generateVersionId()).toHaveLength(32);
  });
});

describe("version timeline", () => {
  it("orders old versions, the current version, and delete markers", () => {
    const timeline = buildVersionTimeline({
      key: "notes.txt",
      versionId: "marker",
      size: 0,
      type: "application/octet-stream",
      createdAt: "2026-11-20T00:00:00.000Z",
      storageClass: "STANDARD",
      deleteMarker: true,
      versions: [
        {
          versionId: "v1",
          size: 10,
          type: "text/plain",
          createdAt: "2026-11-18T00:00:00.000Z",
          storageClass: "STANDARD",
          deleteMarker: false,
        },
        {
          versionId: "v2",
          size: 20,
          type: "text/plain",
          createdAt: "2026-11-19T00:00:00.000Z",
          storageClass: "STANDARD",
          deleteMarker: false,
        },
      ],
    });
    expect(timeline.map((entry) => entry.versionId)).toEqual(["v1", "v2", "marker"]);
    expect(timeline[2].deleteMarker).toBe(true);
    expect(timeline[2].isCurrent).toBe(true);
  });
});

describe("lifecycle validation", () => {
  it("rejects Standard-IA before 30 days", () => {
    const issues = validateLifecycleRule({
      name: "too-fast",
      transitions: [{ days: 10, storageClass: "STANDARD_IA" }],
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.code === "InvalidArgument")).toBe(true);
  });

  it("requires expiration after the last transition", () => {
    const issues = validateLifecycleRule({
      name: "bad-expiry",
      transitions: [{ days: 30, storageClass: "STANDARD_IA" }],
      expirationDays: 30,
    });
    expect(issues.some((issue) => issue.message.includes("Expiration"))).toBe(true);
  });

  it("warns when Glacier comes before Standard-IA", () => {
    const issues = validateLifecycleRule({
      name: "archive",
      transitions: [
        { days: 30, storageClass: "GLACIER" },
        { days: 90, storageClass: "STANDARD_IA" },
      ],
    });
    expect(issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("warns about small objects for classes with a minimum billable size", () => {
    const issues = validateLifecycleRules(
      [
        {
          id: "rule-1",
          name: "tiny",
          transitions: [{ days: 30, storageClass: "STANDARD_IA" }],
        },
      ],
      [{ key: "tiny.txt", size: 1024 }],
    );
    expect(issues.some((issue) => issue.code === "ObjectSizeWarning")).toBe(true);
  });
});

describe("cost estimates", () => {
  it("bills the minimum object size", () => {
    expect(estimateMonthlyStorageCost(1024, "STANDARD_IA")).toBeCloseTo(
      (128 * 1024 * 0.0125) / (1024 * 1024 * 1024),
      12,
    );
  });

  it("charges early deletion for the remaining minimum duration", () => {
    const charge = estimateEarlyDeletionCharge(1024 * 1024, "STANDARD_IA", 10);
    expect(charge).toBeGreaterThan(0);
    expect(estimateEarlyDeletionCharge(1024 * 1024, "STANDARD_IA", 30)).toBe(0);
  });

  it("sums cost by storage class", () => {
    const costs = monthlyCostByClass([
      { size: 1024 * 1024 * 1024, storageClass: "STANDARD" },
      { size: 1024 * 1024 * 1024, storageClass: "DEEP_ARCHIVE" },
    ]);
    expect(sumCostByClass(costs)).toBeCloseTo(0.023 + 0.00099, 6);
    expect(sumCostByClass(emptyCostByClass())).toBe(0);
  });
});
