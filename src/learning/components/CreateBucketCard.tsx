import { useState, type FormEvent } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { validateBucketName } from "../../engine/buckets";
import { useS3SimulatorStore, type VersioningState } from "../../store/s3SimulatorStore";
import { ERROR_CODE_REFERENCE, REGIONS, wait, type FlashHandler } from "../types";

export function CreateBucketCard({
  onFlash,
  onCreated,
}: {
  onFlash: FlashHandler;
  onCreated?: (name: string) => void;
}) {
  const { buckets, createLearningBucket } = useS3SimulatorStore();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [versioning, setVersioning] = useState<VersioningState>("Unversioned");
  const [blockPublicAccess, setBlockPublicAccess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const trimmed = name.trim();
  const liveError = trimmed ? validateBucketName(trimmed, buckets.map((bucket) => bucket.name)) : null;
  const liveCode = liveError
    ? liveError.includes("already exists")
      ? "BucketAlreadyExists"
      : "InvalidBucketName"
    : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    await wait(320);
    const result = createLearningBucket({
      name: trimmed,
      region,
      versioning,
      blockPublicAccess,
    });
    setBusy(false);
    if (result) {
      setError(result);
      onFlash({ kind: "error", title: result.code, message: result.message });
      return;
    }
    onFlash({
      kind: "success",
      title: "Bucket created",
      message: `${trimmed} was created in ${region}. The CLI/JSON panel shows the create-bucket response.`,
    });
    onCreated?.(trimmed);
    setName("");
  };

  return (
    <section className="learn-card" data-tour="create-bucket">
      <header className="learn-card-header">
        <div>
          <h2>Create bucket</h2>
          <p>Names share a global namespace and must follow the S3 naming rules.</p>
        </div>
        <Plus size={20} />
      </header>
      <div className="learn-card-body">
        <form onSubmit={submit} className="learn-form">
          <div className="learn-form-grid">
            <label className="learn-field">
              <span>
                Bucket name <b className="learn-required">*</b>
              </span>
              <input
                data-tour="bucket-name-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="cloud-club-lab-01"
                autoComplete="off"
                spellCheck={false}
              />
              <small>3-63 characters, lowercase letters, numbers and hyphens. No underscores.</small>
            </label>
            <label className="learn-field">
              <span>AWS Region</span>
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                {REGIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} · {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {liveError && (
            <div className="learn-error-panel" role="alert">
              <span className="learn-error-code">{liveCode}</span>
              <p>{liveError}</p>
            </div>
          )}

          <div className="learn-settings" data-tour="bucket-settings">
            <label className="learn-field">
              <span>Initial versioning</span>
              <select
                value={versioning}
                onChange={(event) => setVersioning(event.target.value as VersioningState)}
              >
                <option value="Unversioned">Unversioned</option>
                <option value="Enabled">Enabled</option>
              </select>
            </label>
            <label className="learn-check">
              <input
                type="checkbox"
                checked={blockPublicAccess}
                onChange={(event) => setBlockPublicAccess(event.target.checked)}
              />
              <span>
                <strong>Block all public access</strong>
                <small>Recommended. Keeps this learning bucket private.</small>
              </span>
            </label>
            <div className="learn-security-note">
              <ShieldCheck size={16} />
              <span>Bucket owner enforced ownership · SSE-S3 encryption</span>
            </div>
          </div>

          {error && (
            <div className="learn-error-panel" role="alert">
              <span className="learn-error-code">{error.code}</span>
              <p>{error.message}</p>
            </div>
          )}

          <div className="learn-actions">
            <button type="submit" className="learn-btn learn-btn-primary" disabled={busy || Boolean(liveError)}>
              {busy ? "Creating bucket..." : "Create bucket"}
            </button>
            <button
              type="button"
              className="learn-btn"
              onClick={() => {
                setName("");
                setError(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <details className="learn-code-reference">
          <summary>API error codes used by this simulator</summary>
          <ul>
            {ERROR_CODE_REFERENCE.map((entry) => (
              <li key={entry.code}>
                <code>{entry.code}</code>
                <span>{entry.description}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
