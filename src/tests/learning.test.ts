import { describe, expect, it, vi } from "vitest";
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
import { useS3SimulatorStore } from "../store/s3SimulatorStore";

vi.mock("../storage/simulationDb", () => ({
  clearBucketBlobs: vi.fn(() => Promise.resolve()),
  clearObjectBlobs: vi.fn(() => Promise.resolve()),
  deleteAllObjectVersionBlobs: vi.fn(() => Promise.resolve()),
  deleteObjectBlob: vi.fn(() => Promise.resolve()),
  deleteObjectVersionBlob: vi.fn(() => Promise.resolve()),
  loadObjectBlob: vi.fn(() => Promise.resolve(undefined)),
  loadObjectVersionBlob: vi.fn(() => Promise.resolve(undefined)),
  saveObjectBlob: vi.fn(() => Promise.resolve()),
  saveObjectVersionBlob: vi.fn(() => Promise.resolve()),
}));

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

describe("CLI version listing history", () => {
  it("records one listing with the selected bucket and key", () => {
    useS3SimulatorStore.getState().reset();
    useS3SimulatorStore.getState().recordListObjectVersions("cloud-club-demo", "images/event.jpg");

    const history = useS3SimulatorStore.getState().cliHistory;
    expect(history).toHaveLength(1);
    expect(history[0].command).toBe(
      "aws s3api list-object-versions --bucket cloud-club-demo --prefix images/event.jpg",
    );
    const response = JSON.parse(history[0].jsonResponse) as {
      Name: string;
      Prefix: string;
      Versions: Array<{ Key: string }>;
      DeleteMarkers: Array<{ Key: string }>;
    };
    expect(response.Name).toBe("cloud-club-demo");
    expect(response.Prefix).toBe("images/event.jpg");
    expect(response.Versions).toHaveLength(3);
    expect([...response.Versions, ...response.DeleteMarkers].every((version) => version.Key === "images/event.jpg")).toBe(true);
  });

  it("does not add a listing without a selection", () => {
    useS3SimulatorStore.getState().reset();

    expect(useS3SimulatorStore.getState().cliHistory).toEqual([]);
  });

  it("clears the listing when the simulator is reset", () => {
    useS3SimulatorStore.getState().recordListObjectVersions("cloud-club-demo", "images/event.jpg");
    expect(useS3SimulatorStore.getState().cliHistory).toHaveLength(1);

    useS3SimulatorStore.getState().reset();

    expect(useS3SimulatorStore.getState().cliHistory).toEqual([]);
  });
});

describe("lifecycle validation", () => {
  it("rejects Standard-IA before 30 days", () => {
    const issues = validateLifecycleRule({
      name: "too-fast",
      transitions: [
        { days: 10, storageClass: "STANDARD_IA" },
        { days: 90, storageClass: "GLACIER" },
      ],
    });
    expect(issues).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "InvalidArgument",
        message: expect.stringContaining("Standard-IA requires at least 30 days"),
      }),
    ]);
  });

  it("rejects transitions entered out of order and names both transitions", () => {
    const issues = validateLifecycleRule({
      name: "out-of-order",
      transitions: [
        { days: 90, storageClass: "STANDARD_IA" },
        { days: 30, storageClass: "GLACIER" },
      ],
    });

    expect(issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.code === "InvalidArgument" &&
        issue.message === "Transition 2 (day 30) must be later than transition 1 (day 90).",
    )).toBe(true);
  });

  it("rejects transitions entered on the same day", () => {
    const issues = validateLifecycleRule({
      name: "same-day",
      transitions: [
        { days: 30, storageClass: "STANDARD_IA" },
        { days: 30, storageClass: "GLACIER" },
      ],
    });

    expect(issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.code === "InvalidArgument" &&
        issue.message === "Transition 2 (day 30) must be later than transition 1 (day 30).",
    )).toBe(true);
  });

  it("accepts transitions entered in forward order", () => {
    const issues = validateLifecycleRule({
      name: "forward-order",
      transitions: [
        { days: 30, storageClass: "STANDARD_IA" },
        { days: 90, storageClass: "GLACIER" },
      ],
    });

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("accepts the plan lifecycle scenario", () => {
    const issues = validateLifecycleRule({
      name: "archive-images",
      prefix: "images/",
      transitions: [
        { days: 30, storageClass: "STANDARD_IA" },
        { days: 90, storageClass: "GLACIER" },
      ],
      expirationDays: 365,
    });

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("requires expiration after the last transition", () => {
    const issues = validateLifecycleRule({
      name: "bad-expiry",
      transitions: [{ days: 30, storageClass: "STANDARD_IA" }],
      expirationDays: 30,
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("Expiration"))).toBe(true);
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
