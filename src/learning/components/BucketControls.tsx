import { useMemo, useState } from "react";
import { Check, Lock } from "lucide-react";
import {
  canTransitionVersioning,
  VERSIONING_STATES,
  versioningTooltip,
} from "../../engine/versioning";
import { useS3SimulatorStore, type Bucket, type VersioningState } from "../../store/s3SimulatorStore";
import { formatDateTime, wait, type FlashHandler } from "../types";

type BucketControlsProps = {
  buckets: Bucket[];
  selectedName: string;
  onSelect: (name: string) => void;
  onFlash: FlashHandler;
};

export function BucketControls({ buckets, selectedName, onSelect, onFlash }: BucketControlsProps) {
  const { setVersioningState } = useS3SimulatorStore();
  const [busyState, setBusyState] = useState<VersioningState | null>(null);
  const bucket = useMemo(
    () => buckets.find((candidate) => candidate.name === selectedName) ?? buckets[0],
    [buckets, selectedName],
  );

  if (!bucket) {
    return (
      <section className="learn-card">
        <div className="learn-card-body">
          <p className="learn-empty">No buckets exist. Create one above to start the simulation.</p>
        </div>
      </section>
    );
  }

  const changeVersioning = async (next: VersioningState) => {
    if (!canTransitionVersioning(bucket.versioning, next)) {
      onFlash({
        kind: "warning",
        title: "Versioning transition blocked",
        message: versioningTooltip(bucket.versioning, next),
      });
      return;
    }
    setBusyState(next);
    await wait(260);
    const result = setVersioningState(bucket.name, next);
    setBusyState(null);
    if (result) {
      onFlash({ kind: "error", title: result.code, message: result.message });
      return;
    }
    onFlash({
      kind: "success",
      title: "Versioning updated",
      message: `${bucket.name} is now ${next}. Existing versions are always retained.`,
    });
  };

  return (
    <section className="learn-card">
      <header className="learn-card-header">
        <div>
          <h2>Bucket configuration</h2>
          <p>Select a bucket, then change the versioning state.</p>
        </div>
      </header>
      <div className="learn-card-body">
        <div className="learn-bucket-row">
          <label className="learn-field">
            <span>Bucket</span>
            <select
              data-tour="bucket-selector"
              value={bucket.name}
              onChange={(event) => onSelect(event.target.value)}
            >
              {buckets.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <div className="learn-bucket-meta">
            <span>ARN</span>
            <code>arn:aws:s3:::{bucket.name}</code>
            <span>Region</span>
            <code>{bucket.region}</code>
            <span>Created</span>
            <code>{formatDateTime(bucket.createdAt)}</code>
            <span>Objects</span>
            <code>
              {bucket.objects.filter((object) => !object.isFolder).length} ·{" "}
              {bucket.objects.filter((object) => !object.isFolder && object.deleteMarker).length} delete markers
            </code>
          </div>
        </div>

        <div className="learn-versioning" data-tour="versioning-toggle">
          <div className="learn-versioning-head">
            <div>
              <h3>Bucket versioning</h3>
              <p>
                Unversioned → Enabled → Suspended. Once a bucket has been versioned it can never return to
                Unversioned.
              </p>
            </div>
            <span className={`learn-state learn-state-${bucket.versioning.toLowerCase()}`}>
              {bucket.versioning}
            </span>
          </div>
          <div className="learn-versioning-actions">
            {VERSIONING_STATES.map((state) => {
              const enabled = canTransitionVersioning(bucket.versioning, state);
              const isCurrent = bucket.versioning === state;
              return (
                <button
                  type="button"
                  key={state}
                  className={isCurrent ? "learn-state-button active" : "learn-state-button"}
                  disabled={!enabled || isCurrent || busyState !== null}
                  title={versioningTooltip(bucket.versioning, state)}
                  onClick={() => void changeVersioning(state)}
                >
                  {isCurrent ? <Check size={14} /> : !enabled ? <Lock size={14} /> : null}
                  {busyState === state ? `Setting ${state}...` : state}
                </button>
              );
            })}
          </div>
          <p className="learn-note">
            Suspending stops new versions but keeps every existing version and delete marker. Objects
            uploaded while suspended use the version ID <code>null</code>.
          </p>
        </div>
      </div>
    </section>
  );
}
