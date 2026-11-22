import { useMemo, useState, type FormEvent } from "react";
import { FileUp, UploadCloud } from "lucide-react";
import { formatBytes } from "../../engine/storageClasses";
import { parseJsonRecord } from "../model";
import { useS3SimulatorStore, type Bucket, type StorageClass } from "../../store/s3SimulatorStore";
import { inferContentType, wait, type FlashHandler } from "../types";
import { Modal } from "./Modal";
import { StorageClassPicker } from "./StorageClassPicker";

type UploadDialogProps = {
  bucket: Bucket;
  prefix: string;
  onClose: () => void;
  onFlash: FlashHandler;
};

const MB = 1024 * 1024;

export function UploadDialog({ bucket, prefix, onClose, onFlash }: UploadDialogProps) {
  const { uploadLearningObject } = useS3SimulatorStore();
  const [mode, setMode] = useState<"simulated" | "file">("simulated");
  const [key, setKey] = useState(prefix);
  const [sizeMb, setSizeMb] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [storageClass, setStorageClass] = useState<StorageClass>("STANDARD");
  const [metadataText, setMetadataText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const simulatedSize = sizeMb * MB;
  const objectSize = mode === "file" && file ? file.size : simulatedSize;
  const metadata = useMemo(() => parseJsonRecord(metadataText, "Metadata"), [metadataText]);
  const tags = useMemo(() => parseJsonRecord(tagsText, "Tags"), [tagsText]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const finalKey = key.trim().replace(/^\/+/, "");
    if (!finalKey) {
      setError("NoSuchKey: Provide an object key before uploading.");
      return;
    }
    if (mode === "file" && !file) {
      setError("Choose a file, or switch to a simulated object size.");
      return;
    }
    if (metadata.error || tags.error) {
      setError(metadata.error ?? tags.error ?? "Invalid JSON.");
      return;
    }
    setError("");
    setBusy(true);
    await wait(420);
    await uploadLearningObject({
      bucketName: bucket.name,
      key: finalKey,
      size: objectSize,
      type: mode === "file" && file ? file.type || inferContentType(finalKey) : inferContentType(finalKey),
      storageClass,
      metadata: metadata.value,
      tags: tags.value,
      blob: mode === "file" && file ? file : undefined,
    });
    setBusy(false);
    onFlash({
      kind: "success",
      title: "Upload complete",
      message: `${finalKey} (${formatBytes(objectSize)}) was stored in ${bucket.name} using ${storageClass}.`,
    });
    onClose();
  };

  return (
    <Modal
      title="Upload object"
      subtitle={`${bucket.name} · ${bucket.versioning === "Unversioned" ? "unversioned" : bucket.versioning.toLowerCase()}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="learn-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="upload-object-form"
            className="learn-btn learn-btn-primary"
            disabled={busy}
          >
            {busy ? "Uploading..." : "Upload"}
          </button>
        </>
      }
    >
      <form id="upload-object-form" className="learn-form" onSubmit={submit}>
        <div className="learn-toggle-row">
          <div className="learn-segmented" role="group" aria-label="Upload source">
            <button
              type="button"
              className={mode === "simulated" ? "active" : ""}
              onClick={() => setMode("simulated")}
            >
              Simulated size
            </button>
            <button type="button" className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>
              Real file
            </button>
          </div>
          <span className="learn-chip">{formatBytes(objectSize)}</span>
        </div>

        <label className="learn-field">
          <span>
            Object key <b className="learn-required">*</b>
          </span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={`${prefix}notes.txt`}
            spellCheck={false}
          />
        </label>

        {mode === "simulated" ? (
          <div className="learn-field">
            <span>
              Object size <b>{sizeMb} MB</b>
            </span>
            <input
              type="range"
              min={1}
              max={5120}
              step={1}
              value={sizeMb}
              onChange={(event) => setSizeMb(Number(event.target.value))}
            />
            <div className="learn-slider-labels">
              <span>1 MB</span>
              <span>5 GB</span>
            </div>
          </div>
        ) : (
          <label className="learn-dropzone">
            <UploadCloud size={24} />
            <strong>{file ? file.name : "Choose a file"}</strong>
            <small>{file ? `${formatBytes(file.size)} · ${file.type || "unknown type"}` : "The file stays in this browser only."}</small>
            <input
              type="file"
              hidden
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) {
                  setKey((current) => {
                    const trimmed = current.trim();
                    return !trimmed || trimmed === prefix ? `${prefix}${selected.name}` : current;
                  });
                }
              }}
            />
            <FileUp size={16} />
          </label>
        )}

        <StorageClassPicker value={storageClass} onChange={setStorageClass} objectSize={objectSize} />

        <div className="learn-form-grid">
          <label className="learn-field">
            <span>User metadata (JSON)</span>
            <textarea
              rows={3}
              value={metadataText}
              onChange={(event) => setMetadataText(event.target.value)}
              placeholder='{"owner":"cloud-club"}'
              className="learn-code-input"
            />
            {metadata.error && <small className="learn-inline-error">{metadata.error}</small>}
          </label>
          <label className="learn-field">
            <span>Object tags (JSON)</span>
            <textarea
              rows={3}
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder='{"Category":"Images"}'
              className="learn-code-input"
            />
            {tags.error && <small className="learn-inline-error">{tags.error}</small>}
          </label>
        </div>

        {error && <div className="learn-error-panel">{error}</div>}
      </form>
    </Modal>
  );
}
