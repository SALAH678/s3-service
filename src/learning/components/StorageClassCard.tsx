import { useState } from "react";
import { Layers } from "lucide-react";
import { formatBytes } from "../../engine/storageClasses";
import { useS3SimulatorStore, type Bucket, type S3Object, type StorageClass } from "../../store/s3SimulatorStore";
import { formatDateTime, wait, type FlashHandler } from "../types";
import { StorageClassPicker } from "./StorageClassPicker";

type StorageClassCardProps = {
  bucket: Bucket;
  object?: S3Object;
  ageInClassDays: number;
  onFlash: FlashHandler;
};

type Selection = {
  key: string;
  base: StorageClass;
  value: StorageClass;
};

export function StorageClassCard({ bucket, object, ageInClassDays, onFlash }: StorageClassCardProps) {
  const { changeObjectStorageClass } = useS3SimulatorStore();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedClass =
    selection && selection.key === object?.key && selection.base === object?.storageClass
      ? selection.value
      : object?.storageClass ?? "STANDARD";

  const size = object?.size ?? 128 * 1024 * 1024;
  const changed = Boolean(object) && selectedClass !== object?.storageClass;

  const apply = async () => {
    if (!object) return;
    setBusy(true);
    await wait(320);
    const result = await changeObjectStorageClass(bucket.name, object.key, selectedClass);
    setBusy(false);
    onFlash({
      kind: result.warning ? "warning" : "success",
      title: result.warning ? "Storage class changed with a warning" : "Storage class changed",
      message:
        result.warning ??
        `${object.key} now uses ${selectedClass}. The CLI panel shows the copy-object request.`,
    });
  };

  return (
    <section className="learn-card" data-tour="storage-class-card">
      <header className="learn-card-header">
        <div>
          <h2>Storage class picker</h2>
          <p>
            {object ? (
              <>
                <code>{object.key}</code> · {formatBytes(object.size)} · last modified{" "}
                {formatDateTime(object.createdAt)}
              </>
            ) : (
              "Select an object in the browser to change its storage class. This preview uses a 128 MB example."
            )}
          </p>
        </div>
        <Layers size={20} />
      </header>
      <div className="learn-card-body">
        <StorageClassPicker
          value={selectedClass}
          onChange={(value) => {
            if (!object) return;
            setSelection({ key: object.key, base: object.storageClass, value });
          }}
          objectSize={size}
          currentClass={object?.storageClass}
          ageInClassDays={ageInClassDays}
          disabled={!object || Boolean(object.deleteMarker)}
        />
        <div className="learn-actions">
          <button
            type="button"
            className="learn-btn learn-btn-primary"
            disabled={!object || !changed || busy || Boolean(object?.deleteMarker)}
            onClick={() => void apply()}
          >
            {busy ? "Changing class..." : "Apply storage class"}
          </button>
          {object?.deleteMarker && (
            <span className="learn-note learn-note-warning">
              InvalidObjectState: a delete marker has no storage class.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
