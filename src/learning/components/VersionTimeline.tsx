import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { classShortLabel, formatBytes } from "../../engine/storageClasses";
import { buildVersionTimeline, type TimelineEntry } from "../../engine/versionModel";
import { useS3SimulatorStore, type Bucket, type S3Object } from "../../store/s3SimulatorStore";
import { formatDateTime, wait, type FlashHandler } from "../types";
import { Modal } from "./Modal";

type VersionTimelineProps = {
  bucket: Bucket;
  object: S3Object;
  onFlash: FlashHandler;
};

export function VersionTimeline({ bucket, object, onFlash }: VersionTimelineProps) {
  const { restoreVersionAsCopy, deleteVersionPermanent } = useS3SimulatorStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<TimelineEntry | null>(null);
  const timeline = buildVersionTimeline(object);
  const hiddenByMarker = Boolean(object.deleteMarker);

  const restore = async (entry: TimelineEntry) => {
    setBusyId(entry.versionId);
    await wait(300);
    await restoreVersionAsCopy(bucket.name, object.key, entry.versionId);
    setBusyId(null);
    onFlash({
      kind: "success",
      title: "Version restored as a copy",
      message: `${object.key} now has a new current version copied from ${entry.versionId}. The old version is still retained.`,
    });
  };

  const removeVersion = async (entry: TimelineEntry) => {
    setBusyId(entry.versionId);
    await wait(300);
    await deleteVersionPermanent(bucket.name, object.key, entry.versionId);
    setBusyId(null);
    setConfirmVersion(null);
    onFlash({
      kind: entry.deleteMarker ? "success" : "warning",
      title: entry.deleteMarker ? "Delete marker removed" : "Version permanently deleted",
      message: entry.deleteMarker
        ? `${object.key} is visible again because its latest delete marker was removed.`
        : `Version ${entry.versionId} was permanently deleted. This action cannot be undone.`,
    });
  };

  return (
    <section className="learn-card" data-tour="version-timeline">
      <header className="learn-card-header">
        <div>
          <h2>Version timeline</h2>
          <p>
            <code>{object.key}</code> in {bucket.name}
          </p>
        </div>
        <History size={20} />
      </header>
      <div className="learn-card-body">
        {hiddenByMarker && (
          <div className="learn-note learn-note-warning">
            The current version is a delete marker, so a normal listing hides this key. Restore an older
            version, or delete the marker to make the previous version current again.
          </div>
        )}

        <ol className="learn-version-timeline">
          {timeline.map((entry) => (
            <li key={entry.versionId} className={entry.isCurrent ? "current" : ""}>
              <span className={entry.deleteMarker ? "learn-timeline-dot marker" : "learn-timeline-dot"} />
              <div className="learn-version-item">
                <div className="learn-version-head">
                  <div>
                    <strong>{entry.label}</strong>
                    {entry.isCurrent && <span className="learn-badge learn-badge-blue">Current</span>}
                    {entry.deleteMarker && (
                      <span className="learn-badge learn-badge-warning">Delete marker</span>
                    )}
                  </div>
                  <span className="learn-muted">{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="learn-version-meta">
                  <span>
                    Version ID <code>{entry.versionId}</code>
                  </span>
                  <span>Size {entry.deleteMarker ? "—" : formatBytes(entry.size)}</span>
                  <span>Class {entry.deleteMarker ? "—" : classShortLabel(entry.storageClass)}</span>
                  {!entry.deleteMarker && <span>ETag {entry.etag}</span>}
                </div>
                <div className="learn-actions">
                  <button
                    type="button"
                    className="learn-btn learn-btn-small"
                    disabled={entry.isCurrent || entry.deleteMarker || busyId !== null}
                    onClick={() => void restore(entry)}
                    title={
                      entry.isCurrent
                        ? "This version is already current."
                        : entry.deleteMarker
                          ? "A delete marker has no data to restore."
                          : "Copy this version as a new current version."
                    }
                  >
                    <RotateCcw size={14} />
                    {busyId === entry.versionId ? "Working..." : "Restore"}
                  </button>
                  <button
                    type="button"
                    className="learn-btn learn-btn-small learn-btn-danger"
                    disabled={busyId !== null}
                    onClick={() => setConfirmVersion(entry)}
                  >
                    <Trash2 size={14} />
                    Delete version
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {confirmVersion && (
        <Modal
          title={confirmVersion.deleteMarker ? "Delete delete marker" : "Permanently delete version"}
          subtitle={`s3://${bucket.name}/${object.key}`}
          onClose={() => setConfirmVersion(null)}
          footer={
            <>
              <button type="button" className="learn-btn" onClick={() => setConfirmVersion(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="learn-btn learn-btn-danger"
                onClick={() => void removeVersion(confirmVersion)}
                disabled={busyId !== null}
              >
                {busyId ? "Deleting..." : "Delete version"}
              </button>
            </>
          }
        >
          <p className="learn-note">
            Version ID <code>{confirmVersion.versionId}</code> will be permanently removed. This operation
            cannot be undone.
          </p>
          {confirmVersion.deleteMarker && (
            <p className="learn-note learn-note-warning">
              Removing this delete marker makes the previous version visible again.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
