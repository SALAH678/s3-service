import { useMemo, useState } from "react";
import { Folder, FolderPlus, Trash2, Upload } from "lucide-react";
import { classShortLabel, formatBytes } from "../../engine/storageClasses";
import { buildVersionTimeline } from "../../engine/versionModel";
import { buildBrowserEntries, folderBreadcrumbs } from "../model";
import { useS3SimulatorStore, type Bucket, type S3Object } from "../../store/s3SimulatorStore";
import { formatDateTime, type FlashHandler } from "../types";
import { Modal } from "./Modal";
import { UploadDialog } from "./UploadDialog";

type ObjectBrowserProps = {
  bucket: Bucket;
  prefix: string;
  onPrefixChange: (prefix: string) => void;
  showVersions: boolean;
  onShowVersionsChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedKey: string;
  onSelectKey: (key: string) => void;
  onFlash: FlashHandler;
};

type BrowserRow = {
  rowId: string;
  key: string;
  name: string;
  isFolder: boolean;
  versionId: string;
  size: number;
  storageClass: string;
  lastModified: string;
  type: string;
  deleteMarker: boolean;
  isCurrent: boolean;
  object?: S3Object;
};

export function ObjectBrowser({
  bucket,
  prefix,
  onPrefixChange,
  showVersions,
  onShowVersionsChange,
  search,
  onSearchChange,
  selectedKey,
  onSelectKey,
  onFlash,
}: ObjectBrowserProps) {
  const { createFolder, deleteCurrentObject } = useS3SimulatorStore();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const crumbs = folderBreadcrumbs(prefix);
  const rows = useMemo<BrowserRow[]>(() => {
    if (!showVersions) {
      return buildBrowserEntries(bucket, prefix, false, search).map((entry) => ({
        rowId: entry.key,
        key: entry.key,
        name: entry.name,
        isFolder: entry.isFolder,
        versionId: entry.object?.versionId ?? "null",
        size: entry.object?.size ?? 0,
        storageClass: entry.object?.storageClass ?? "STANDARD",
        lastModified: entry.object?.createdAt ?? "",
        type: entry.object?.type ?? "folder",
        deleteMarker: Boolean(entry.object?.deleteMarker),
        isCurrent: true,
        object: entry.object,
      }));
    }

    const query = search.trim().toLowerCase();
    return bucket.objects
      .filter((object) => !object.isFolder && object.key.startsWith(prefix))
      .filter((object) => !query || object.key.toLowerCase().includes(query))
      .flatMap((object) =>
        buildVersionTimeline(object).map((version) => ({
          rowId: `${object.key}#${version.versionId}`,
          key: object.key,
          name: object.key.slice(prefix.length),
          isFolder: false,
          versionId: version.versionId,
          size: version.size,
          storageClass: version.storageClass,
          lastModified: version.createdAt,
          type: version.type,
          deleteMarker: version.deleteMarker,
          isCurrent: version.isCurrent,
          object,
        })),
      )
      .sort((left, right) => {
        if (left.key !== right.key) return left.key.localeCompare(right.key);
        return new Date(right.lastModified).getTime() - new Date(left.lastModified).getTime();
      });
  }, [bucket, prefix, search, showVersions]);

  const selectedObject = selectedKey
    ? bucket.objects.find((object) => object.key === selectedKey)
    : undefined;

  const createNewFolder = () => {
    const trimmed = folderName.trim().replace(/^\/+|\/+$/g, "");
    if (!trimmed) {
      setError("Enter a folder name.");
      return;
    }
    if (trimmed.includes("/")) {
      setError("Create nested folders one level at a time.");
      return;
    }
    const key = `${prefix}${trimmed}/`;
    if (bucket.objects.some((object) => object.key === key)) {
      setError("A folder with this name already exists.");
      return;
    }
    createFolder(bucket.name, `${prefix}${trimmed}`);
    onFlash({ kind: "success", title: "Folder created", message: `s3://${bucket.name}/${key}` });
    setFolderOpen(false);
    setFolderName("");
    setError("");
  };

  const removeSelected = async () => {
    if (!selectedObject) return;
    setBusy(true);
    const result = await deleteCurrentObject(bucket.name, selectedObject.key);
    setBusy(false);
    setDeleteOpen(false);
    onFlash({
      kind: result.deleteMarker ? "warning" : "success",
      title: result.deleteMarker ? "Delete marker added" : "Object deleted",
      message: result.deleteMarker
        ? `${selectedObject.key} is hidden by a delete marker. Every version is still stored and billable.`
        : `${selectedObject.key} was permanently deleted because the bucket is unversioned.`,
    });
  };

  return (
    <section className="learn-card" data-tour="object-browser">
      <header className="learn-card-header">
        <div>
          <h2>Objects and versions</h2>
          <p>Browse prefixes, upload objects, and switch to a flat version listing.</p>
        </div>
        <span className="learn-chip">{bucket.objects.filter((object) => !object.isFolder).length} objects</span>
      </header>

      <div className="learn-toolbar">
        <div className="learn-breadcrumbs">
          {crumbs.map((crumb, index) => (
            <span key={crumb.prefix || "root"}>
              {index > 0 && <b>›</b>}
              <button type="button" onClick={() => onPrefixChange(crumb.prefix)}>
                {crumb.label}
              </button>
            </span>
          ))}
        </div>
        <div className="learn-actions">
          <button type="button" className="learn-btn" onClick={() => setFolderOpen(true)}>
            <FolderPlus size={15} />
            Create folder
          </button>
          <button
            type="button"
            className="learn-btn learn-btn-primary"
            data-tour="upload-button"
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={15} />
            Upload
          </button>
        </div>
      </div>

      <div className="learn-toolbar learn-toolbar-secondary">
        <div className="learn-inline">
          <label className="learn-switch">
            <input
              type="checkbox"
              checked={showVersions}
              onChange={(event) => onShowVersionsChange(event.target.checked)}
            />
            <span>Show versions</span>
          </label>
          <span className="learn-muted">
            {showVersions
              ? "Every version and delete marker is listed."
              : "A plain listing shows only the current version and hides deleted keys."}
          </span>
        </div>
        <div className="learn-inline">
          <input
            className="learn-input learn-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find by key"
            aria-label="Find objects by key"
          />
          <button
            type="button"
            className="learn-btn learn-btn-danger"
            data-tour="delete-object"
            disabled={!selectedObject || Boolean(selectedObject.deleteMarker)}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      <div className="learn-table-wrap">
        <table className="learn-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Version ID</th>
              <th>Size</th>
              <th>Storage class</th>
              <th>Last modified</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = row.key === selectedKey;
              return (
                <tr
                  key={row.rowId}
                  className={isSelected ? "selected" : ""}
                  onClick={() => {
                    if (!row.isFolder) onSelectKey(row.key);
                  }}
                >
                  <td>
                    {row.isFolder ? (
                      <button
                        type="button"
                        className="learn-key"
                        onClick={() => {
                          onPrefixChange(row.key);
                          onSelectKey("");
                        }}
                      >
                        <Folder size={15} />
                        {row.name}
                      </button>
                    ) : (
                      <button type="button" className="learn-key">
                        {row.name}
                        {row.deleteMarker && <span className="learn-badge learn-badge-warning">Delete marker</span>}
                        {row.isCurrent && !row.deleteMarker && !showVersions && (
                          <span className="learn-badge">Current</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td>
                    <code className="learn-version-id">{row.versionId || "null"}</code>
                  </td>
                  <td>{row.isFolder ? "—" : formatBytes(row.size)}</td>
                  <td>{row.isFolder ? "—" : classShortLabel(row.storageClass)}</td>
                  <td>{row.lastModified ? formatDateTime(row.lastModified) : "—"}</td>
                  <td>{row.type || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="learn-empty">
            {showVersions
              ? "No versions under this prefix. Upload an object to create version 1."
              : "This prefix is empty. Upload an object or create a folder."}
          </p>
        )}
      </div>

      {uploadOpen && (
        <UploadDialog
          bucket={bucket}
          prefix={prefix}
          onClose={() => setUploadOpen(false)}
          onFlash={onFlash}
        />
      )}

      {folderOpen && (
        <Modal
          title="Create folder"
          subtitle={`s3://${bucket.name}/${prefix}`}
          onClose={() => {
            setFolderOpen(false);
            setError("");
          }}
          footer={
            <>
              <button type="button" className="learn-btn" onClick={() => setFolderOpen(false)}>
                Cancel
              </button>
              <button type="button" className="learn-btn learn-btn-primary" onClick={createNewFolder}>
                Create folder
              </button>
            </>
          }
        >
          <label className="learn-field">
            <span>Folder name</span>
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="images"
              autoFocus
            />
            <small>Object keys ending in / act as folder markers in S3.</small>
          </label>
          {error && <div className="learn-error-panel">{error}</div>}
        </Modal>
      )}

      {deleteOpen && selectedObject && (
        <Modal
          title="Delete object"
          subtitle={`s3://${bucket.name}/${selectedObject.key}`}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button type="button" className="learn-btn" onClick={() => setDeleteOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="learn-btn learn-btn-danger"
                onClick={() => void removeSelected()}
                disabled={busy}
              >
                {busy ? "Deleting..." : bucket.versioning === "Unversioned" ? "Delete permanently" : "Add delete marker"}
              </button>
            </>
          }
        >
          <p className="learn-note">
            {bucket.versioning === "Unversioned"
              ? "This bucket is unversioned. The object and its data are permanently removed."
              : "This bucket is versioned. S3 adds a delete marker instead of destroying data. The object disappears from a normal listing, but every version remains restorable and billable."}
          </p>
        </Modal>
      )}
    </section>
  );
}
