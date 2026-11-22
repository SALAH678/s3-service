import { useRef, useState, type FormEvent } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  Box,
  ChevronDown,
  Cloud,
  CloudCog,
  Folder,
  GraduationCap,
  Grid3X3,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  useS3SimulatorStore,
  normalizeBucket,
  type Bucket,
  type S3Object,
  type StorageClass,
} from "./store/s3SimulatorStore";
import { clearObjectBlobs, loadObjectBlob, loadObjectVersionBlob } from "./storage/simulationDb";
import { executeCliCommand } from "./engine/cli-parser";
import { validatePolicyJson } from "./engine/policy";
import { calculateEstimatedCost } from "./engine/pricing";
import { evaluateBucketPolicy } from "./simulation/policyEvaluator";
import { validateBucketName } from "./engine/buckets";
import LearningSimulatorPage from "./learning/LearningSimulatorPage";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./App.css";

const regions = [
  ["us-east-1", "US East (N. Virginia)"],
  ["us-east-2", "US East (Ohio)"],
  ["us-west-1", "US West (N. California)"],
  ["us-west-2", "US West (Oregon)"],
  ["af-south-1", "Africa (Cape Town)"],
  ["ap-east-1", "Asia Pacific (Hong Kong)"],
  ["ap-south-2", "Asia Pacific (Hyderabad)"],
  ["ap-southeast-1", "Asia Pacific (Singapore)"],
  ["ca-central-1", "Canada (Central)"],
  ["eu-central-1", "Europe (Frankfurt)"],
  ["eu-west-1", "Europe (Ireland)"],
  ["eu-west-3", "Europe (Paris)"],
  ["sa-east-1", "South America (Sao Paulo)"],
];

function TopNav({ consoleMode = false }: { consoleMode?: boolean }) {
  const navigate = useNavigate();
  const { region, setRegion, reset } = useS3SimulatorStore();

  return (
    <header className="aws-top-nav">
      <button className="mobile-menu" aria-label="Open menu">
        <Menu size={20} />
      </button>
      <button className="aws-wordmark" onClick={() => navigate("/")}>
        aws
      </button>
      {consoleMode && (
        <>
          <button className="services-button">
            Services <ChevronDown size={14} />
          </button>
          <div className="global-search">
            <Search size={16} />
            <input aria-label="Search AWS" placeholder="Search" />
            <kbd>Alt+S</kbd>
          </div>
          <select
            className="region-select"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            aria-label="AWS Region"
          >
            {regions.map(([value, label]) => (
              <option key={value} value={value}>
                {value} · {label}
              </option>
            ))}
          </select>
          <button className="nav-icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>
          <button className="nav-icon-button" aria-label="Help">
            <HelpCircle size={18} />
          </button>
          <button className="account-menu">
            Simulation account <ChevronDown size={14} />
          </button>
          <button
            className="reset-nav"
            onClick={() => {
              if (window.confirm("Reset all S3 simulator data to demo state?")) reset();
            }}
          >
            Reset
          </button>
        </>
      )}
      {!consoleMode && (
        <nav className="marketing-nav">
          <button onClick={() => navigate("/console/buckets")}>Console</button>
          <button onClick={() => navigate("/console/buckets")}>Get started</button>
        </nav>
      )}
    </header>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="landing">
      <TopNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">Amazon S3</span>
            <h1>Object storage built to retrieve any amount of data from anywhere</h1>
            <p>
              Store, protect, and analyze virtually unlimited data in an interactive browser-only AWS console
              simulation.
            </p>
            <div className="hero-actions">
              <button className="orange-button" onClick={() => navigate("/console/buckets")}>
                Get started
              </button>
              <button className="secondary-button">Explore S3</button>
              <button className="secondary-button" onClick={() => navigate("/console/learn")}>
                Learning simulator
              </button>
            </div>
          </div>
          <div className="hero-console">
            <div className="hero-console-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-console-body">
              <div className="hero-sidebar">
                <Box />
                <Grid3X3 />
                <ShieldCheck />
                <Settings />
              </div>
              <div className="hero-table">
                <h3>General purpose buckets</h3>
                <div className="hero-table-head" />
                <div className="hero-table-row" />
                <div className="hero-table-row" />
                <div className="hero-table-row" />
              </div>
            </div>
          </div>
        </section>
        <section className="feature-grid">
          {[
            ["Designed for durability", "11 nines of durability for objects stored across multiple facilities."],
            ["Scale on demand", "Store any object size and serve any volume of traffic."],
            ["Control access", "Explore ownership, policies, ACLs, public access, and encryption."],
            ["Storage for every workload", "Move data across Standard, IA, Glacier, and Express classes."],
          ].map(([title, copy]) => (
            <article key={title}>
              <div className="feature-icon">
                <Cloud size={22} />
              </div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </section>
        <section className="landing-pricing">
          <div>
            <span>Pricing overview</span>
            <h2>Free to explore</h2>
            <p>This educational simulator is browser-only. No AWS account or real charges are created.</p>
          </div>
          <button className="orange-button" onClick={() => navigate("/console/buckets")}>
            Open console
          </button>
        </section>
      </main>
    </div>
  );
}

function ConsoleSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="console-sidebar">
      <div className="sidebar-service">
        <CloudCog size={20} />
        <strong>Amazon S3</strong>
      </div>
      <nav>
        <NavLink to="/console/buckets" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <Box size={16} />
          Buckets
        </NavLink>
        <button className="side-link" onClick={() => navigate("/console/access-points")}>
          <ShieldCheck size={16} />
          Access Grants
        </button>
        <NavLink
          to="/console/access-points"
          className={({ isActive }) => (isActive ? "side-link active" : "side-link")}
        >
          <LayoutDashboard size={16} />
          Access Points
        </NavLink>
        <button className="side-link" onClick={() => navigate("/console/buckets")}>
          <CloudCog size={16} />
          Object Lambda access points
        </button>
        <button className="side-link" onClick={() => navigate("/console/buckets")}>
          <Grid3X3 size={16} />
          Multi-Region Access Points
        </button>
        <div className="side-divider" />
        <NavLink to="/console/activity" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <Bell size={16} />
          Activity / CloudTrail
        </NavLink>
        <NavLink to="/console/cli" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <Settings size={16} />
          AWS CLI
        </NavLink>
        <NavLink to="/console/pricing" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <LayoutDashboard size={16} />
          Pricing calculator
        </NavLink>
        <NavLink to="/console/iam" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <ShieldCheck size={16} />
          IAM Access Simulator
        </NavLink>
        <NavLink to="/console/tutorials" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <HelpCircle size={16} />
          Tutorials
        </NavLink>
        <NavLink to="/console/learn" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <GraduationCap size={16} />
          Learning Simulator
        </NavLink>
        <NavLink to="/console/state" className={({ isActive }) => (isActive ? "side-link active" : "side-link")}>
          <Settings size={16} />
          Export / Import
        </NavLink>
        <button className="side-link" onClick={() => navigate("/console/buckets")}>
          <Settings size={16} />
          Block Public Access settings
        </button>
        <button className="side-link" onClick={() => navigate("/console/buckets")}>
          <LayoutDashboard size={16} />
          Storage Lens
        </button>
        <button className="side-link" onClick={() => navigate("/console/buckets")}>
          <Folder size={16} />
          Batch Operations
        </button>
      </nav>
    </aside>
  );
}

function BucketsPage() {
  const { buckets, createBucket, deleteBucket, emptyBucket, addCliCommand } = useS3SimulatorStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"general" | "directory" | "table">("general");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [ownership, setOwnership] = useState<Bucket["objectOwnership"]>("Bucket owner enforced");
  const [blockPublicAccess, setBlockPublicAccess] = useState(true);
  const [error, setError] = useState("");
  const [liveError, setLiveError] = useState("");
  const [step, setStep] = useState(1);
  const [versioning, setVersioning] = useState(false);
  const [encryption, setEncryption] = useState<Bucket["encryption"]>("SSE-S3");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const filtered = buckets.filter((bucket) => bucket.name.includes(search.trim().toLowerCase()));

  const closeCreate = () => {
    setCreateOpen(false);
    setName("");
    setError("");
    setStep(1);
    setVersioning(false);
    setBlockPublicAccess(true);
    setOwnership("Bucket owner enforced");
    setEncryption("SSE-S3");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = createBucket({
      name: name.trim(),
      region,
      blockPublicAccess,
      versioning: versioning ? "Enabled" : "Suspended",
      objectOwnership: ownership,
      encryption,
    });
    if (result) {
      setError(result);
      return;
    }
    addCliCommand(
      `aws s3 mb s3://${name.trim()}`,
      JSON.stringify(
        { Bucket: { Name: name.trim(), Region: region }, Location: `http://s3.${region}.amazonaws.com` },
        null,
        2,
      ),
    );
    closeCreate();
  };

  const deleteSelected = () => {
    if (selected.length !== 1) return;
    const bucketName = selected[0];
    if (deleteConfirmation !== bucketName) return;
    const result = deleteBucket(bucketName);
    if (result) window.alert(result);
    setSelected([]);
    setDeleteOpen(false);
    setDeleteConfirmation("");
  };

  const emptySelected = () => {
    if (selected.length !== 1) return;
    const bucket = buckets.find((item) => item.name === selected[0]);
    if (!bucket) return;
    if (!bucket.objects.length) {
      window.alert("The bucket is already empty.");
      return;
    }
    if (!window.confirm(`Permanently delete all ${bucket.objects.length} object(s) in ${bucket.name}?`)) return;
    const result = emptyBucket(bucket.name);
    if (result) window.alert(result);
    else setSelected([]);
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>Amazon S3</span>
        <b>›</b>
        <strong>General purpose buckets</strong>
      </div>
      <div className="bucket-tabs-top">
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
          General purpose buckets
        </button>
        <button className={tab === "directory" ? "active" : ""} onClick={() => setTab("directory")}>
          Directory buckets
        </button>
        <button className={tab === "table" ? "active" : ""} onClick={() => setTab("table")}>
          Table buckets
        </button>
      </div>
      {tab !== "general" ? (
        <div className="flashbar info">
          <strong>{tab === "directory" ? "Directory buckets" : "Table buckets"}</strong>
          <span>
            {tab === "directory"
              ? "Directory buckets are purpose-built for low-latency single Availability Zone workloads."
              : "Table buckets are designed for analytics workloads with S3 Tables integration."}
          </span>
        </div>
      ) : null}
      <div className="page-title">
        <div>
          <h1>
            {tab === "general"
              ? "General purpose buckets"
              : tab === "directory"
                ? "Directory buckets"
                : "Table buckets"}
          </h1>
          <p>Store and retrieve objects in buckets.</p>
        </div>
        {tab === "general" && (
          <button className="orange-button" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Create bucket
          </button>
        )}
      </div>
      {tab === "general" && (
        <section className="console-card">
          <div className="table-toolbar">
            <div className="resource-search">
              <Search size={15} />
              <input
                aria-label="Find buckets"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelected([]);
                }}
                placeholder="Find buckets by name"
              />
            </div>
            <div className="toolbar-actions">
              <button
                disabled={selected.length !== 1}
                onClick={() => selected[0] && void navigator.clipboard.writeText(`arn:aws:s3:::${selected[0]}`)}
              >
                Copy ARN
              </button>
              <button disabled={selected.length !== 1} onClick={emptySelected}>
                Empty
              </button>
              <button
                disabled={selected.length !== 1}
                onClick={() => {
                  setDeleteConfirmation("");
                  setDeleteOpen(true);
                }}
              >
                Delete
              </button>
            </div>
          </div>
          {filtered.length ? (
            <table className="console-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((bucket) => selected.includes(bucket.name))}
                      onChange={(event) =>
                        setSelected(event.target.checked ? filtered.map((bucket) => bucket.name) : [])
                      }
                    />
                  </th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Access</th>
                  <th>Creation date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((bucket) => (
                  <tr key={bucket.name} className={selected.includes(bucket.name) ? "selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(bucket.name)}
                        onChange={(event) =>
                          setSelected((names) =>
                            event.target.checked
                              ? [...names, bucket.name]
                              : names.filter((name) => name !== bucket.name),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => navigate(`/console/buckets/${encodeURIComponent(bucket.name)}`)}
                      >
                        {bucket.name}
                      </button>
                    </td>
                    <td>
                      <span className="status-badge">General purpose</span>
                    </td>
                    <td>{regions.find(([value]) => value === bucket.region)?.[1] ?? bucket.region}</td>
                    <td>
                      <span className="status-badge">{bucket.access}</span>
                    </td>
                    <td>{new Date(bucket.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <Box size={38} />
              <h2>No matching buckets</h2>
              <p>Create a bucket or try a different search.</p>
            </div>
          )}
        </section>
      )}
      {deleteOpen && selected.length === 1 && (
        <div className="modal-backdrop" onMouseDown={() => setDeleteOpen(false)}>
          <form
            className="upload-modal"
            onSubmit={(event) => {
              event.preventDefault();
              deleteSelected();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="wizard-header">
              <div>
                <span>Delete bucket</span>
                <h2>Confirm deletion</h2>
              </div>
              <button type="button" onClick={() => setDeleteOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="wizard-body">
              <div className="flashbar warning">
                <strong>Bucket must be empty</strong>
                <span>Otherwise, AWS returns BucketNotEmpty.</span>
              </div>
              <p>To confirm deletion, type the bucket name:</p>
              <strong>{selected[0]}</strong>
              <label>
                Bucket name
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="orange-button" disabled={deleteConfirmation !== selected[0]}>
                Delete bucket
              </button>
            </div>
          </form>
        </div>
      )}
      {createOpen && (
        <div className="modal-backdrop" onMouseDown={closeCreate}>
          <form className="wizard" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="wizard-header">
              <div>
                <span>Step {step} of 3</span>
                <h2>Create bucket</h2>
              </div>
              <button type="button" onClick={closeCreate}>
                <X size={20} />
              </button>
            </div>
            <div className="wizard-progress">
              <i className={step >= 1 ? "active" : ""} />
              <i className={step >= 2 ? "active" : ""} />
              <i className={step >= 3 ? "active" : ""} />
            </div>
            {step === 1 && (
              <div className="wizard-body">
                <h3>General configuration</h3>
                <label>
                  Bucket name<span className="required">*</span>
                  <input
                    value={name}
                    onChange={(event) => {
                      const value = event.target.value;
                      setName(value);
                      setError("");
                      if (!value.trim()) {
                        setLiveError("");
                        return;
                      }
                      const validationError = validateBucketName(
                        value.trim(),
                        buckets.map((bucket) => bucket.name),
                      );
                      if (validationError) {
                        setLiveError(
                          validationError.startsWith("A bucket")
                            ? `BucketAlreadyExists: ${validationError}`
                            : `InvalidBucketName: ${validationError}`,
                        );
                      } else {
                        setLiveError("");
                      }
                    }}
                    placeholder="my-event-bucket"
                    autoFocus
                  />
                  <small>Globally unique, lowercase, 3–63 characters.</small>
                </label>
                {liveError && <div className="form-error">{liveError}</div>}
                {error && <div className="form-error">{error}</div>}
                <label>
                  AWS Region
                  <select value={region} onChange={(event) => setRegion(event.target.value)}>
                    {regions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label} ({value})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {step === 2 && (
              <div className="wizard-body">
                <h3>Object ownership</h3>
                {(["Bucket owner enforced", "Bucket owner preferred", "Object writer"] as const).map((option) => (
                  <label className="radio-card" key={option}>
                    <input type="radio" checked={ownership === option} onChange={() => setOwnership(option)} />
                    <span>
                      <strong>{option}</strong>
                      <small>
                        {option === "Bucket owner enforced"
                          ? "ACLs are disabled and the bucket owner owns all objects."
                          : "Configure ownership behavior for uploaded objects."}
                      </small>
                    </span>
                  </label>
                ))}
                <h3 className="section-gap">Bucket settings</h3>
                <label className="toggle-row">
                  <span>Bucket Versioning</span>
                  <input
                    type="checkbox"
                    checked={versioning}
                    onChange={(event) => setVersioning(event.target.checked)}
                  />
                </label>
                <label>
                  Default encryption
                  <select
                    value={encryption}
                    onChange={(event) => setEncryption(event.target.value as Bucket["encryption"])}
                  >
                    <option>SSE-S3</option>
                    <option>SSE-KMS</option>
                    <option>DSSE-KMS</option>
                  </select>
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="wizard-body">
                <h3>Block Public Access</h3>
                <label className="toggle-card">
                  <input
                    type="checkbox"
                    checked={blockPublicAccess}
                    onChange={(event) => setBlockPublicAccess(event.target.checked)}
                  />
                  <span>
                    <strong>Block all public access</strong>
                    <small>Recommended for private bucket data.</small>
                  </span>
                </label>
                {!blockPublicAccess && (
                  <div className="flashbar warning">
                    Warning: Public access settings may expose bucket data. Confirm only if public access is
                    intentional.
                  </div>
                )}
                <div className="review-box">
                  <strong>Review</strong>
                  <span>Bucket name: {name}</span>
                  <span>Region: {region}</span>
                  <span>Encryption: {encryption}</span>
                  <span>Versioning: {versioning ? "Enabled" : "Suspended"}</span>
                </div>
              </div>
            )}
            {error && step !== 1 && <div className="form-error wizard-error">{error}</div>}
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={closeCreate}>
                Cancel
              </button>
              {step > 1 && (
                <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}>
                  Previous
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  className="orange-button"
                  onClick={() => (!name.trim() ? setError("Bucket name is required.") : setStep(step + 1))}
                >
                  Next
                </button>
              ) : (
                <button type="submit" className="orange-button">
                  Create bucket
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function BucketTagsEditor({ bucket, onChange }: { bucket: Bucket; onChange: (tags: Record<string, string>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(bucket.tags, null, 2));
  const [error, setError] = useState("");

  const save = () => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Tags must be a JSON object.");
      }
      const tags = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
      );
      onChange(tags);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enter a valid JSON object.");
    }
  };

  return (
    <div className="tags-editor">
      <label>
        Tag set JSON
        <textarea className="small-json" value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {error && <div className="form-error">{error}</div>}
      <button className="orange-button" onClick={save}>
        Save tags
      </button>
    </div>
  );
}

function BucketDetailsPage() {
  const { name } = useParams();
  const bucketName = name ? decodeURIComponent(name) : "";
  const {
    buckets,
    uploadObject,
    deleteObject,
    createFolder,
    updateBucket,
    logActivity,
    setLifecycleRules,
    setObjectStorageClass,
    setReplicationRules,
    runReplication,
    advanceSimulatedTime,
    restoreObjectVersion,
    deleteObjectVersion,
    recordGetRequest,
    createAccessPoint,
    deleteAccessPoint,
    addCliCommand,
  } = useS3SimulatorStore();
  const navigate = useNavigate();
  const bucket = buckets.find((item) => item.name === bucketName);
  const [tab, setTab] = useState("Objects");
  const [prefix, setPrefix] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [propertiesKey, setPropertiesKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [policyText, setPolicyText] = useState("");
  const [corsText, setCorsText] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [corsError, setCorsError] = useState("");
  const [lifecycleName, setLifecycleName] = useState("");
  const [lifecyclePrefix, setLifecyclePrefix] = useState("");
  const [transitionDays, setTransitionDays] = useState(30);
  const [targetClass, setTargetClass] = useState<Bucket["lifecycleRules"][number]["targetClass"]>("STANDARD_IA");
  const [replicationName, setReplicationName] = useState("");
  const [replicationDestination, setReplicationDestination] = useState("");
  const [accessPointOpen, setAccessPointOpen] = useState(false);
  const [accessPointName, setAccessPointName] = useState("");
  const [accessPointNetwork, setAccessPointNetwork] = useState<"Internet" | "VPC">("Internet");
  const [uploadStorageClass, setUploadStorageClass] = useState<StorageClass>("STANDARD");
  const [uploadMetadataText, setUploadMetadataText] = useState("");
  const [uploadTagsText, setUploadTagsText] = useState("");

  if (!bucket) return <Navigate to="/console/buckets" replace />;

  type ObjectEntry = { key: string; name: string; object?: S3Object; isFolder: boolean };

  const query = search.trim().toLowerCase();
  const matchingObjects = bucket.objects.filter(
    (object) =>
      object.key.startsWith(prefix) &&
      object.key !== prefix &&
      (showVersions || !object.deleteMarker) &&
      (!query || object.key.toLowerCase().includes(query)),
  );

  const entries: ObjectEntry[] = (() => {
    if (query || showVersions) {
      return matchingObjects
        .map((object) => {
          const relative = object.key.slice(prefix.length);
          return {
            key: object.key,
            name: object.isFolder ? relative.replace(/\/$/, "") : relative,
            object,
            isFolder: Boolean(object.isFolder),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const folders = new Map<string, ObjectEntry>();
    const files: ObjectEntry[] = [];
    for (const object of matchingObjects) {
      const relative = object.key.slice(prefix.length);
      const slash = relative.indexOf("/");
      if (slash >= 0) {
        const folderKey = prefix + relative.slice(0, slash + 1);
        if (!folders.has(folderKey)) {
          const marker = bucket.objects.find((candidate) => candidate.key === folderKey && candidate.isFolder);
          folders.set(folderKey, {
            key: folderKey,
            name: relative.slice(0, slash),
            object: marker,
            isFolder: true,
          });
        }
      } else if (!object.isFolder) {
        files.push({ key: object.key, name: relative, object, isFolder: false });
      }
    }
    return [...folders.values(), ...files].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const selectableEntries = entries.filter((entry) => !entry.isFolder && entry.object);
  const selectedObject =
    selected.length === 1 ? bucket.objects.find((object) => object.key === selected[0]) : undefined;
  const propertiesObject = bucket.objects.find((object) => object.key === propertiesKey);

  const openFolder = (folderKey: string) => {
    setPrefix(folderKey);
    setSelected([]);
    setSearch("");
  };

  const openUpload = () => {
    setUploadFile(null);
    setUploadKey("");
    setProgress(0);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUploadFile(null);
    setUploadKey("");
    setProgress(0);
    setUploadStorageClass("STANDARD");
    setUploadMetadataText("");
    setUploadTagsText("");
  };

  const openFolderModal = () => {
    setFolderName("");
    setFolderOpen(true);
  };

  const closeFolderModal = () => {
    setFolderOpen(false);
    setFolderName("");
  };

  const openAccessPointModal = () => {
    setAccessPointName("");
    setAccessPointNetwork("Internet");
    setAccessPointOpen(true);
  };

  const closeAccessPointModal = () => {
    setAccessPointOpen(false);
    setAccessPointName("");
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadFile) return;
    const rawKey = uploadKey.trim() || uploadFile.name;
    const key = (rawKey.startsWith(prefix) ? rawKey : `${prefix}${rawKey}`).replace(/^\/+/, "");
    setProgress(12);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 16, 94)), 100);
    try {
      let metadata: Record<string, string> = {};
      let tags: Record<string, string> = {};
      try {
        metadata = uploadMetadataText.trim() ? JSON.parse(uploadMetadataText) : {};
      } catch {
        metadata = {};
      }
      try {
        tags = uploadTagsText.trim() ? JSON.parse(uploadTagsText) : {};
      } catch {
        tags = {};
      }
      await uploadObject(
        bucket.name,
        key,
        uploadFile.size,
        uploadFile.type || "application/octet-stream",
        uploadFile,
        metadata,
        tags,
      );
      setProgress(100);
      window.setTimeout(() => {
        closeUpload();
      }, 250);
      addCliCommand(
        `aws s3 cp ${uploadFile.name} s3://${bucket.name}/${key} --storage-class ${uploadStorageClass}`,
        JSON.stringify(
          {
            ETag: `"${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}"`,
            VersionId: bucket.versioning === "Enabled" ? "v-simulated" : "null",
            StorageClass: uploadStorageClass,
            Key: key,
            Bucket: bucket.name,
          },
          null,
          2,
        ),
      );
    } catch {
      window.alert("The file could not be stored in this browser.");
      setProgress(0);
    } finally {
      window.clearInterval(timer);
    }
  };

  const download = async (key: string, versionId?: string) => {
    const blob = versionId
      ? await loadObjectVersionBlob(bucket.name, key, versionId)
      : await loadObjectBlob(bucket.name, key);
    if (!blob) {
      window.alert("The file contents are not available in this simulator.");
      return;
    }
    recordGetRequest(bucket.name);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = key.split("/").pop() ?? key;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const deleteSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Permanently delete ${selected.length} selected object(s)?`)) return;
    try {
      await Promise.all(
        selected.map(async (key) => {
          const object = bucket.objects.find((item) => item.key === key);
          if (object?.deleteMarker) await deleteObjectVersion(bucket.name, key, object.versionId);
          else await deleteObject(bucket.name, key);
        }),
      );
      setSelected([]);
    } catch {
      window.alert("Some objects could not be deleted. Please try again.");
    }
  };

  const runObjectVersionAction = (action: Promise<void>) => {
    void action.catch(() => window.alert("The version action could not be completed. Please try again."));
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/console/buckets")}>General purpose buckets</button>
        <b>›</b>
        <strong>{bucket.name}</strong>
      </div>
      <div className="bucket-page-title">
        <h1>{bucket.name}</h1>
        <span className="region-tag">{bucket.region}</span>
      </div>
      <div className="bucket-tabs">
        {["Objects", "Properties", "Permissions", "Metrics", "Management", "Access Points"].map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => {
              setTab(item);
              if (item === "Permissions") {
                setPolicyText(bucket.policy ?? "");
                setCorsText(bucket.cors ?? "");
                setPolicyError("");
                setCorsError("");
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <section className="console-card bucket-detail-card">
        {tab === "Objects" ? (
          <>
            <div className="table-toolbar">
              <div className="resource-search">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelected([]);
                  }}
                  placeholder="Find objects by prefix"
                />
              </div>
              <div className="toolbar-actions">
                <button
                  disabled={selected.length !== 1}
                  onClick={() =>
                    selected[0] && void navigator.clipboard.writeText(`s3://${bucket.name}/${selected[0]}`)
                  }
                >
                  Copy S3 URI
                </button>
                <button
                  disabled={selected.length !== 1 || Boolean(selectedObject?.deleteMarker)}
                  onClick={() => selected[0] && void download(selected[0])}
                >
                  Download
                </button>{" "}
                <button disabled={!selected.length} onClick={() => void deleteSelected()}>
                  Delete
                </button>
                <button
                  className={showVersions ? "active" : ""}
                  onClick={() => {
                    setShowVersions((value) => !value);
                    setSelected([]);
                  }}
                >
                  {showVersions ? "Hide versions" : "Show versions"}
                </button>
                <button onClick={openFolderModal}>Create folder</button>
                <button className="orange-button" onClick={openUpload}>
                  <Upload size={15} />
                  Upload
                </button>
              </div>
            </div>
            <div className="object-path">
              <button
                onClick={() => {
                  setPrefix("");
                  setSearch("");
                  setSelected([]);
                }}
              >
                {bucket.name}
              </button>
              {prefix && (
                <>
                  <b>/</b>
                  <strong>{prefix}</strong>
                </>
              )}
            </div>
            {entries.length ? (
              <table className="console-table object-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={
                          selectableEntries.length > 0 &&
                          selectableEntries.every((entry) => selected.includes(entry.key))
                        }
                        onChange={(event) =>
                          setSelected(event.target.checked ? selectableEntries.map((entry) => entry.key) : [])
                        }
                      />
                    </th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Storage class</th>
                    <th>Last modified</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const object = entry.object;
                    return (
                      <tr key={entry.key} className={selected.includes(entry.key) ? "selected" : ""}>
                        <td>
                          {entry.isFolder ? null : (
                            <input
                              type="checkbox"
                              checked={selected.includes(entry.key)}
                              onChange={(event) =>
                                setSelected((keys) =>
                                  event.target.checked ? [...keys, entry.key] : keys.filter((key) => key !== entry.key),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          <button
                            className="object-link"
                            onClick={() => (entry.isFolder ? openFolder(entry.key) : setPropertiesKey(entry.key))}
                          >
                            {entry.isFolder ? <Folder size={15} /> : <Box size={15} />}
                            {entry.name}
                            {object?.deleteMarker ? <span className="status-badge warning">Delete marker</span> : null}
                          </button>
                        </td>
                        <td>{entry.isFolder ? "Folder" : object?.type}</td>
                        <td>{entry.isFolder || !object ? "—" : formatBytes(object.size)}</td>
                        <td>
                          {entry.isFolder || !object ? (
                            "—"
                          ) : (
                            <select
                              className="storage-select"
                              value={object.storageClass}
                              onChange={(event) =>
                                setObjectStorageClass(bucket.name, object.key, event.target.value as StorageClass)
                              }
                            >
                              <option value="STANDARD">S3 Standard</option>
                              <option value="INTELLIGENT_TIERING">S3 Intelligent-Tiering</option>
                              <option value="STANDARD_IA">S3 Standard-IA</option>
                              <option value="ONE_ZONE_IA">S3 One Zone-IA</option>
                              <option value="GLACIER_IR">Glacier Instant Retrieval</option>
                              <option value="GLACIER">Glacier Flexible Retrieval</option>
                              <option value="DEEP_ARCHIVE">Glacier Deep Archive</option>
                              <option value="EXPRESS_ONE_ZONE">S3 Express One Zone</option>
                              <option value="REDUCED_REDUNDANCY">Reduced Redundancy</option>
                            </select>
                          )}
                        </td>
                        <td>{object ? new Date(object.createdAt).toLocaleString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <Box size={38} />
                <h2>{search ? "No matching objects" : "This bucket is empty"}</h2>
                <p>Upload objects or create a folder to get started.</p>
              </div>
            )}
          </>
        ) : tab === "Properties" ? (
          <div className="configuration-layout">
            <section className="configuration-section">
              <h2>Bucket Versioning</h2>
              <p>Keep multiple versions of objects in this bucket.</p>
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={bucket.versioning === "Enabled"}
                  onChange={(event) => {
                    updateBucket(bucket.name, { versioning: event.target.checked ? "Enabled" : "Suspended" });
                    logActivity("PutBucketVersioning", `arn:aws:s3:::${bucket.name}`, "Success");
                  }}
                />
                <span>
                  <strong>{bucket.versioning}</strong>
                  <small>Enable or suspend object versioning.</small>
                </span>
              </label>
            </section>
            <section className="configuration-section">
              <h2>Default encryption</h2>
              <label>
                Encryption type
                <select
                  value={bucket.encryption}
                  onChange={(event) => {
                    const encryption = event.target.value as Bucket["encryption"];
                    updateBucket(bucket.name, { encryption });
                    logActivity("PutEncryptionConfiguration", `arn:aws:s3:::${bucket.name}`, "Success");
                  }}
                >
                  <option>SSE-S3</option>
                  <option>SSE-KMS</option>
                  <option>DSSE-KMS</option>
                </select>
              </label>
              {bucket.encryption !== "SSE-S3" && (
                <label>
                  Fake KMS key
                  <select
                    value={bucket.kmsKey ?? "alias/aws/s3"}
                    onChange={(event) => updateBucket(bucket.name, { kmsKey: event.target.value })}
                  >
                    <option>alias/aws/s3</option>
                    <option>alias/cloud-club-event</option>
                    <option>arn:aws:kms:us-east-1:111122223333:key/s3-demo-key</option>
                  </select>
                </label>
              )}
              <label className="toggle-row">
                <span>S3 Bucket Key</span>
                <input
                  type="checkbox"
                  checked={bucket.bucketKey ?? true}
                  onChange={(event) => updateBucket(bucket.name, { bucketKey: event.target.checked })}
                />
              </label>
            </section>
            <section className="configuration-section">
              <h2>Object Lock</h2>
              <p>Simulate retention and compliance controls for this bucket.</p>
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={bucket.objectLock ?? false}
                  onChange={(event) => updateBucket(bucket.name, { objectLock: event.target.checked })}
                />
                <span>
                  <strong>Object Lock</strong>
                  <small>Only relevant for buckets created with Object Lock enabled.</small>
                </span>
              </label>
            </section>
            <section className="configuration-section">
              <h2>Static website hosting</h2>
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={bucket.websiteHosting?.enabled ?? false}
                  onChange={(event) =>
                    updateBucket(bucket.name, {
                      websiteHosting: {
                        enabled: event.target.checked,
                        indexDocument: bucket.websiteHosting?.indexDocument ?? "index.html",
                        errorDocument: bucket.websiteHosting?.errorDocument ?? "error.html",
                      },
                    })
                  }
                />
                <span>
                  <strong>Enable static website hosting</strong>
                  <small>Render uploaded index.html in a simulated hosted endpoint.</small>
                </span>
              </label>
              {(bucket.websiteHosting?.enabled ?? false) && (
                <div className="lifecycle-form">
                  <label>
                    Index document
                    <input
                      value={bucket.websiteHosting?.indexDocument ?? "index.html"}
                      onChange={(event) =>
                        updateBucket(bucket.name, {
                          websiteHosting: {
                            enabled: true,
                            indexDocument: event.target.value,
                            errorDocument: bucket.websiteHosting?.errorDocument ?? "error.html",
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Error document
                    <input
                      value={bucket.websiteHosting?.errorDocument ?? "error.html"}
                      onChange={(event) =>
                        updateBucket(bucket.name, {
                          websiteHosting: {
                            enabled: true,
                            indexDocument: bucket.websiteHosting?.indexDocument ?? "index.html",
                            errorDocument: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <div className="endpoint-preview">http://{bucket.name}.s3-website.local</div>
                </div>
              )}
            </section>
            <section className="configuration-section">
              <h2>Bucket tags</h2>
              <p>{Object.keys(bucket.tags).length ? JSON.stringify(bucket.tags) : "No tags configured."}</p>
              <BucketTagsEditor
                key={`${bucket.name}-${JSON.stringify(bucket.tags)}`}
                bucket={bucket}
                onChange={(tags) => {
                  updateBucket(bucket.name, { tags });
                  logActivity("PutBucketTagging", `arn:aws:s3:::${bucket.name}`, "Success");
                }}
              />
            </section>
          </div>
        ) : tab === "Permissions" ? (
          <div className="configuration-layout">
            <section className="configuration-section">
              <h2>Block Public Access</h2>
              <p>Manage public access for this bucket.</p>
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={bucket.blockPublicAccess}
                  onChange={(event) => {
                    if (!event.target.checked) {
                      if (!window.confirm("Turning off Block Public Access may allow public access. Continue?")) return;
                    }
                    updateBucket(bucket.name, {
                      blockPublicAccess: event.target.checked,
                      access: event.target.checked ? "Bucket and objects not public" : "Objects can be public",
                    });
                    logActivity(
                      "PutPublicAccessBlock",
                      `arn:aws:s3:::${bucket.name}`,
                      event.target.checked ? "Success" : "Warning",
                    );
                  }}
                />
                <span>
                  <strong>Block all public access</strong>
                  <small>When off, bucket policies or ACLs may grant public access.</small>
                </span>
              </label>
            </section>
            <section className="configuration-section">
              <div className="section-heading">
                <div>
                  <h2>Bucket policy</h2>
                  <p>Edit the JSON policy and validate it locally.</p>
                </div>
                <button
                  className="orange-button"
                  onClick={() => {
                    try {
                      if (!validatePolicyJson(policyText)) {
                        throw new Error('Policy must include Version "2012-10-17" and a valid Statement array.');
                      }
                      updateBucket(bucket.name, {
                        policy: policyText,
                        access: bucket.blockPublicAccess ? "Bucket and objects not public" : "Objects can be public",
                      });
                      setPolicyError("");
                      logActivity("PutBucketPolicy", `arn:aws:s3:::${bucket.name}`, "Success");
                    } catch (error) {
                      setPolicyError(error instanceof Error ? error.message : "Enter valid JSON.");
                      logActivity("PutBucketPolicy", `arn:aws:s3:::${bucket.name}`, "Error");
                    }
                  }}
                >
                  Save
                </button>
              </div>
              <CodeMirror
                value={policyText}
                height="260px"
                extensions={[json()]}
                onChange={setPolicyText}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
              />
              {policyError && <div className="form-error">{policyError}</div>}
            </section>
            <section className="configuration-section">
              <div className="section-heading">
                <div>
                  <h2>CORS configuration</h2>
                  <p>Define allowed origins, methods, and headers.</p>
                </div>
                <button
                  className="orange-button"
                  onClick={() => {
                    try {
                      const cors = JSON.parse(corsText);
                      if (!Array.isArray(cors)) throw new Error("CORS configuration must be a JSON array.");
                      updateBucket(bucket.name, { cors: corsText });
                      setCorsError("");
                      logActivity("PutBucketCors", `arn:aws:s3:::${bucket.name}`, "Success");
                    } catch (error) {
                      setCorsError(error instanceof Error ? error.message : "Enter valid JSON.");
                      logActivity("PutBucketCors", `arn:aws:s3:::${bucket.name}`, "Error");
                    }
                  }}
                >
                  Save
                </button>
              </div>
              <CodeMirror
                value={corsText}
                height="220px"
                extensions={[json()]}
                onChange={setCorsText}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
              />
              {corsError && <div className="form-error">{corsError}</div>}
            </section>
            <section className="configuration-section">
              <h2>Object Ownership</h2>
              <select
                className="configuration-select"
                value={bucket.objectOwnership}
                onChange={(event) =>
                  updateBucket(bucket.name, { objectOwnership: event.target.value as Bucket["objectOwnership"] })
                }
              >
                <option>Bucket owner enforced</option>
                <option>Bucket owner preferred</option>
                <option>Object writer</option>
              </select>
              <p className="access-status">
                <strong>Access status:</strong> {bucket.access}
              </p>
            </section>
          </div>
        ) : tab === "Management" ? (
          <div className="configuration-layout">
            <section className="configuration-section">
              <div className="section-heading">
                <div>
                  <h2>Lifecycle rules</h2>
                  <p>Transition objects based on prefix and simulated bucket age.</p>
                </div>
                <button
                  className="orange-button"
                  disabled={!bucket.lifecycleRules.some((rule) => rule.status === "Enabled")}
                  onClick={() => advanceSimulatedTime(bucket.name, 30)}
                >
                  Simulate 30 days
                </button>
              </div>
              <p className="access-status">
                Simulated bucket age: <strong>{bucket.simulatedDay ?? 0} days</strong>
              </p>
              <div className="lifecycle-form">
                <label>
                  Rule name
                  <input
                    value={lifecycleName}
                    onChange={(event) => setLifecycleName(event.target.value)}
                    placeholder="Archive images"
                  />
                </label>
                <label>
                  Prefix
                  <input
                    value={lifecyclePrefix}
                    onChange={(event) => setLifecyclePrefix(event.target.value)}
                    placeholder="images/"
                  />
                </label>
                <label>
                  Transition after
                  <select value={transitionDays} onChange={(event) => setTransitionDays(Number(event.target.value))}>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                  </select>
                </label>
                <label>
                  Storage class
                  <select
                    value={targetClass}
                    onChange={(event) => setTargetClass(event.target.value as typeof targetClass)}
                  >
                    <option value="STANDARD_IA">S3 Standard-IA</option>
                    <option value="GLACIER_IR">Glacier Instant Retrieval</option>
                    <option value="GLACIER">Glacier Flexible Retrieval</option>
                    <option value="DEEP_ARCHIVE">Glacier Deep Archive</option>
                  </select>
                </label>
                <button
                  className="orange-button"
                  disabled={!lifecycleName.trim()}
                  onClick={() => {
                    setLifecycleRules(bucket.name, [
                      ...bucket.lifecycleRules,
                      {
                        id: `lc-${crypto.randomUUID().slice(0, 8)}`,
                        name: lifecycleName,
                        status: "Enabled",
                        prefix: lifecyclePrefix,
                        transitionDays,
                        targetClass,
                      },
                    ]);
                    setLifecycleName("");
                  }}
                >
                  Create rule
                </button>
              </div>
              {bucket.lifecycleRules.length ? (
                <div className="lifecycle-table">
                  {bucket.lifecycleRules.map((rule) => (
                    <div className="lifecycle-row" key={rule.id}>
                      <div>
                        <strong>{rule.name}</strong>
                        <span>
                          {rule.status} · {rule.prefix || "All objects"} ·{" "}
                          {rule.transitions?.length
                            ? rule.transitions
                                .slice()
                                .sort((left, right) => left.days - right.days)
                                .map((transition) => `${transition.days}d → ${transition.storageClass}`)
                                .join(" · ")
                            : rule.expirationDays
                              ? `Expires day ${rule.expirationDays}`
                              : `${rule.transitionDays} days → ${rule.targetClass}`}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setLifecycleRules(
                            bucket.name,
                            bucket.lifecycleRules.filter((item) => item.id !== rule.id),
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">No lifecycle rules configured.</p>
              )}
            </section>
            <section className="configuration-section">
              <div className="section-heading">
                <div>
                  <h2>Replication</h2>
                  <p>Copy objects from this bucket to another bucket in the simulator.</p>
                </div>
                <button
                  disabled={!bucket.replicationRules.length}
                  onClick={() => {
                    void runReplication(bucket.name).catch(() =>
                      window.alert("Replication could not be completed. Please try again."),
                    );
                  }}
                >
                  Run replication
                </button>
              </div>
              <div className="lifecycle-form">
                <label>
                  Rule name
                  <input
                    value={replicationName}
                    onChange={(event) => setReplicationName(event.target.value)}
                    placeholder="Replicate archive"
                  />
                </label>
                <label>
                  Destination bucket
                  <select
                    value={replicationDestination}
                    onChange={(event) => setReplicationDestination(event.target.value)}
                  >
                    <option value="">Choose destination</option>
                    {buckets
                      .filter((item) => item.name !== bucket.name)
                      .map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="orange-button"
                  disabled={!replicationName.trim() || !replicationDestination}
                  onClick={() =>
                    setReplicationRules(bucket.name, [
                      ...bucket.replicationRules,
                      {
                        id: `rep-${crypto.randomUUID().slice(0, 8)}`,
                        name: replicationName,
                        status: "Enabled",
                        destination: replicationDestination,
                        mode: bucket.region === "us-east-1" ? "CRR" : "SRR",
                        prefix: "",
                        replicateDeleteMarkers: false,
                        statusLabel: "Pending",
                      },
                    ])
                  }
                >
                  Create rule
                </button>
              </div>
              {bucket.replicationRules.map((rule) => (
                <div className="lifecycle-row" key={rule.id}>
                  <div>
                    <strong>{rule.name}</strong>
                    <span>
                      {rule.mode} · {rule.destination} · {rule.statusLabel}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setReplicationRules(
                        bucket.name,
                        bucket.replicationRules.filter((item) => item.id !== rule.id),
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              ))}
            </section>
            <section className="configuration-section">
              <h2>Inventory</h2>
              <label className="toggle-row">
                <span>Enable daily inventory</span>
                <input
                  type="checkbox"
                  checked={bucket.inventoryEnabled}
                  onChange={(event) => updateBucket(bucket.name, { inventoryEnabled: event.target.checked })}
                />
              </label>
              {bucket.inventoryEnabled && (
                <label>
                  Destination and name
                  <input
                    value={bucket.inventoryName}
                    onChange={(event) => updateBucket(bucket.name, { inventoryName: event.target.value })}
                    placeholder={`${bucket.name}-inventory`}
                  />
                </label>
              )}
            </section>
          </div>
        ) : tab === "Metrics" ? (
          <div className="configuration-layout">
            <section className="configuration-section">
              <h2>Bucket metrics</h2>
              <div className="metrics-grid">
                <article>
                  <span>Objects</span>
                  <strong>{bucket.objects.filter((object) => !object.isFolder && !object.deleteMarker).length}</strong>
                </article>
                <article>
                  <span>Stored size</span>
                  <strong>
                    {formatBytes(
                      bucket.objects.reduce((sum, object) => sum + (object.deleteMarker ? 0 : object.size), 0),
                    )}
                  </strong>
                </article>
                <article>
                  <span>GET requests</span>
                  <strong>{bucket.metrics?.getRequests ?? 0}</strong>
                </article>
                <article>
                  <span>PUT requests</span>
                  <strong>{bucket.metrics?.putRequests ?? 0}</strong>
                </article>
                <article>
                  <span>DELETE requests</span>
                  <strong>{bucket.metrics?.deleteRequests ?? 0}</strong>
                </article>
              </div>
            </section>
            <section className="configuration-section">
              <h2>Storage by class</h2>
              {(() => {
                const data = (
                  [
                    "STANDARD",
                    "STANDARD_IA",
                    "GLACIER",
                    "DEEP_ARCHIVE",
                    "GLACIER_IR",
                    "EXPRESS_ONE_ZONE",
                  ] as StorageClass[]
                )
                  .map((storageClass) => ({
                    name: storageClass,
                    value: bucket.objects
                      .filter((object) => !object.deleteMarker && object.storageClass === storageClass)
                      .reduce((sum, object) => sum + object.size, 0),
                  }))
                  .filter((item) => item.value > 0);
                return (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={data.length ? data : [{ name: "STANDARD", value: 0 }]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#0972d3" fill="#cce5ff" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </section>
            <section className="configuration-section">
              <h2>Object count</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={bucket.objects
                      .filter((object) => !object.deleteMarker)
                      .reduce<{ name: string; value: number }[]>((items, object) => {
                        const existing = items.find((item) => item.name === object.storageClass);
                        if (existing) existing.value += 1;
                        else items.push({ name: object.storageClass, value: 1 });
                        return items;
                      }, [])}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    fill="#0972d3"
                    label
                  />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </section>
          </div>
        ) : tab === "Access Points" ? (
          <div className="configuration-layout">
            <section className="configuration-section">
              <div className="section-heading">
                <div>
                  <h2>Access Points</h2>
                  <p>Access points simplify data access by providing unique hostnames for applications and users.</p>
                </div>
                <button className="orange-button" onClick={openAccessPointModal}>
                  Create access point
                </button>
              </div>
              {bucket.accessPoints.length ? (
                <div className="lifecycle-table">
                  {bucket.accessPoints.map((ap) => (
                    <div className="lifecycle-row" key={ap.id}>
                      <div>
                        <strong>{ap.name}</strong>
                        <span>
                          {ap.network} · {ap.status} · arn:aws:s3::{bucket.name}:accesspoint/{ap.name}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          deleteAccessPoint(bucket.name, ap.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">No access points configured.</p>
              )}
            </section>
          </div>
        ) : (
          <div className="properties-grid">
            <article>
              <h3>Region</h3>
              <p>{bucket.region}</p>
            </article>
            <article>
              <h3>Object Ownership</h3>
              <p>{bucket.objectOwnership}</p>
            </article>
            <article>
              <h3>Block Public Access</h3>
              <p>{bucket.blockPublicAccess ? "On" : "Off"}</p>
            </article>
            <article>
              <h3>Bucket Versioning</h3>
              <p>{bucket.versioning}</p>
            </article>
            <article>
              <h3>Default Encryption</h3>
              <p>{bucket.encryption}</p>
            </article>
            <article>
              <h3>Objects</h3>
              <p>{bucket.objects.filter((object) => !object.isFolder && !object.deleteMarker).length}</p>
            </article>
          </div>
        )}
      </section>
      {uploadOpen && (
        <div className="modal-backdrop" onMouseDown={closeUpload}>
          <form className="upload-modal" onSubmit={upload} onMouseDown={(event) => event.stopPropagation()}>
            <div className="wizard-header">
              <div>
                <span>Upload</span>
                <h2>Add files</h2>
              </div>
              <button type="button" onClick={closeUpload}>
                <X size={20} />
              </button>
            </div>
            <div className="wizard-body upload-body">
              <div
                className="drop-zone"
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) {
                    setUploadFile(file);
                    setUploadKey(file.name);
                  }
                }}
              >
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file) setUploadKey(file.name);
                  }}
                />
                <Upload size={28} />
                <strong>{uploadFile ? uploadFile.name : "Choose file or drag and drop"}</strong>
                <small>{uploadFile ? formatBytes(uploadFile.size) : "Files are stored locally in this browser"}</small>
              </div>
              <label>
                Destination key
                <input
                  value={uploadKey}
                  onChange={(event) => setUploadKey(event.target.value)}
                  placeholder="folder/file-name.txt"
                />
              </label>
              <label>
                Storage class
                <select
                  value={uploadStorageClass}
                  onChange={(event) => setUploadStorageClass(event.target.value as StorageClass)}
                >
                  <option value="STANDARD">S3 Standard</option>
                  <option value="STANDARD_IA">S3 Standard-IA</option>
                  <option value="GLACIER">S3 Glacier</option>
                  <option value="DEEP_ARCHIVE">S3 Glacier Deep Archive</option>
                </select>
              </label>
              <label>
                Metadata (JSON)
                <textarea
                  value={uploadMetadataText}
                  onChange={(event) => setUploadMetadataText(event.target.value)}
                  placeholder='{"key": "value"}'
                />
              </label>
              <label>
                Tags (JSON)
                <textarea
                  value={uploadTagsText}
                  onChange={(event) => setUploadTagsText(event.target.value)}
                  placeholder='{"Category": "demo"}'
                />
              </label>
              {progress > 0 && (
                <div className="progress-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={closeUpload}>
                Cancel
              </button>
              <button type="submit" className="orange-button" disabled={!uploadFile || progress > 0}>
                Upload
              </button>
            </div>
          </form>
        </div>
      )}
      {folderOpen && (
        <div className="modal-backdrop" onMouseDown={closeFolderModal}>
          <form
            className="upload-modal"
            onSubmit={(event) => {
              event.preventDefault();
              createFolder(bucket.name, prefix + folderName);
              closeFolderModal();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="wizard-header">
              <div>
                <span>Folder</span>
                <h2>Create folder</h2>
              </div>
              <button type="button" onClick={closeFolderModal}>
                <X size={20} />
              </button>
            </div>
            <div className="wizard-body">
              <label>
                Folder name
                <input
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="images"
                  autoFocus
                />
              </label>
            </div>
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={closeFolderModal}>
                Cancel
              </button>
              <button type="submit" className="orange-button" disabled={!folderName.trim()}>
                Create folder
              </button>
            </div>
          </form>
        </div>
      )}
      {accessPointOpen && (
        <div className="modal-backdrop" onMouseDown={closeAccessPointModal}>
          <form
            className="upload-modal"
            onSubmit={(event) => {
              event.preventDefault();
              if (!accessPointName.trim()) return;
              createAccessPoint(bucket.name, accessPointName, accessPointNetwork);
              closeAccessPointModal();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="wizard-header">
              <div>
                <span>Access Point</span>
                <h2>Create access point</h2>
              </div>
              <button type="button" onClick={closeAccessPointModal}>
                <X size={20} />
              </button>
            </div>
            <div className="wizard-body">
              <label>
                Access point name
                <input
                  value={accessPointName}
                  onChange={(event) => setAccessPointName(event.target.value)}
                  placeholder="my-access-point"
                  autoFocus
                />
                <small>Unique within the bucket.</small>
              </label>
              <label>
                Network origin
                <select
                  value={accessPointNetwork}
                  onChange={(event) => setAccessPointNetwork(event.target.value as "Internet" | "VPC")}
                >
                  <option value="Internet">Internet</option>
                  <option value="VPC">VPC</option>
                </select>
              </label>
            </div>
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={closeAccessPointModal}>
                Cancel
              </button>
              <button type="submit" className="orange-button" disabled={!accessPointName.trim()}>
                Create access point
              </button>
            </div>
          </form>
        </div>
      )}
      {propertiesObject && (
        <div className="properties-drawer">
          <div className="drawer-header">
            <div>
              <span>Object overview</span>
              <h2>{propertiesObject.key}</h2>
            </div>
            <button onClick={() => setPropertiesKey(null)}>
              <X size={20} />
            </button>
          </div>
          <dl className="object-properties">
            <dt>Key</dt>
            <dd>{propertiesObject.key}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(propertiesObject.size)}</dd>
            <dt>Type</dt>
            <dd>{propertiesObject.type}</dd>
            <dt>Storage class</dt>
            <dd>{propertiesObject.storageClass}</dd>
            <dt>ETag</dt>
            <dd>{propertiesObject.etag}</dd>
            <dt>Version ID</dt>
            <dd>
              {propertiesObject.versionId}
              {propertiesObject.deleteMarker ? " (delete marker)" : ""}
            </dd>
            <dt>ARN</dt>
            <dd>
              arn:aws:s3:::${bucket.name}/{propertiesObject.key}
            </dd>
          </dl>
          <div className="drawer-versions">
            <h3>Versions</h3>
            <div className="lifecycle-table">
              <div className="lifecycle-row">
                <div>
                  <strong>Current version</strong>
                  <span>
                    {propertiesObject.versionId}
                    {propertiesObject.deleteMarker ? " · delete marker" : ""} · {formatBytes(propertiesObject.size)} ·{" "}
                    {new Date(propertiesObject.createdAt).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() =>
                    runObjectVersionAction(
                      deleteObjectVersion(bucket.name, propertiesObject.key, propertiesObject.versionId),
                    )
                  }
                >
                  Delete
                </button>
              </div>
              {(propertiesObject.versions ?? []).map((version) => (
                <div className="lifecycle-row" key={version.versionId}>
                  <div>
                    <strong>{version.deleteMarker ? "Delete marker" : version.versionId}</strong>
                    <span>
                      {formatBytes(version.size)} · {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="version-actions">
                    {!version.deleteMarker && (
                      <button
                        onClick={() =>
                          runObjectVersionAction(
                            restoreObjectVersion(bucket.name, propertiesObject.key, version.versionId),
                          )
                        }
                      >
                        Restore
                      </button>
                    )}
                    <button
                      onClick={() =>
                        runObjectVersionAction(
                          deleteObjectVersion(bucket.name, propertiesObject.key, version.versionId),
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {!(propertiesObject.versions ?? []).length && <p className="empty-text">No previous versions.</p>}
            </div>
          </div>
          <div className="drawer-actions">
            <button
              className="secondary-button"
              onClick={() => void navigator.clipboard.writeText(`s3://${bucket.name}/${propertiesObject.key}`)}
            >
              Copy S3 URI
            </button>
            {!propertiesObject.deleteMarker && (
              <button className="orange-button" onClick={() => void download(propertiesObject.key)}>
                Download
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function ActivityPage() {
  const activity = useS3SimulatorStore((state) => state.activity);
  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>Amazon S3</span>
        <b>›</b>
        <strong>Activity</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>Recent activity</h1>
          <p>Simulated CloudTrail events for this browser.</p>
        </div>
      </div>
      <section className="console-card">
        {activity.length ? (
          <table className="console-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Resource</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((event) => (
                <tr key={event.id}>
                  <td>{event.action}</td>
                  <td>{event.resource}</td>
                  <td>
                    <span className={`status-badge ${event.status.toLowerCase()}`}>{event.status}</span>
                  </td>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Bell size={38} />
            <h2>No recent activity</h2>
            <p>Create or modify resources to generate events.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function CliPage() {
  const store = useS3SimulatorStore();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([
    { command: "", output: "Welcome to the simulated AWS CLI.\nType help for available commands." },
  ]);

  const execute = (event: FormEvent) => {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    if (command === "clear") {
      setHistory([]);
      setInput("");
      return;
    }
    if (command === "help") {
      setHistory((items) => [
        ...items,
        {
          command,
          output: [
            "Supported:",
            "aws s3 ls",
            "aws s3 mb s3://bucket-name",
            "aws s3 ls s3://bucket-name[/prefix]",
            "aws s3 cp <local-file> s3://bucket-name/key",
            "aws s3 cp s3://source/key s3://destination/key",
            "aws s3 mv <source> <destination>",
            "aws s3 rm s3://bucket-name/key",
            "aws s3 rb s3://bucket-name",
            "aws s3 sync <local-folder> s3://bucket-name[/prefix]",
            "aws s3api put-bucket-versioning --bucket bucket-name --versioning-configuration Status=Enabled|Suspended",
            "aws s3api list-object-versions --bucket bucket-name",
            "aws s3api put-bucket-lifecycle-configuration --bucket bucket-name --lifecycle-configuration ...",
          ].join("\n"),
        },
      ]);
      setInput("");
      return;
    }
    const result = executeCliCommand(command, {
      buckets: store.buckets,
      createBucket: (name, region) =>
        store.createBucket({
          name,
          region: region ?? "us-east-1",
          blockPublicAccess: true,
          versioning: "Suspended",
          objectOwnership: "Bucket owner enforced",
          encryption: "SSE-S3",
        }),
      deleteBucket: (name) => store.deleteBucket(name),
      uploadObject: (bucketName, file) => {
        void store.uploadObject(bucketName, file.key, file.size, file.type);
      },
      deleteObject: (bucketName, key) => {
        void store.deleteObject(bucketName, key);
      },
      setVersioning: (bucketName, enabled) => {
        store.updateBucket(bucketName, { versioning: enabled ? "Enabled" : "Suspended" });
      },
      setLifecycleRule: (bucketName, rule) => {
        const bucket = store.buckets.find((item) => item.name === bucketName);
        if (!bucket) return;
        store.setLifecycleRules(bucketName, [
          ...bucket.lifecycleRules,
          {
            id: `lc-${crypto.randomUUID().slice(0, 8)}`,
            name: `CLI lifecycle ${bucket.lifecycleRules.length + 1}`,
            status: "Enabled",
            prefix: rule.prefix,
            transitionDays: rule.transitionAfterDays,
            targetClass: rule.storageClass,
          },
        ]);
      },
    });
    setHistory((items) => [...items, { command, output: result.output }]);
    setInput("");
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>Tools</span>
        <b>›</b>
        <strong>AWS CLI</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>AWS CLI</h1>
          <p>Execute simulated AWS CLI commands against local S3 state.</p>
        </div>
      </div>
      <section className="terminal-card">
        <div className="terminal-output">
          {history.map((entry, index) => (
            <div key={index}>
              {entry.command && (
                <div>
                  <span className="terminal-prompt">admin@s3:~$</span> {entry.command}
                </div>
              )}
              <pre>{entry.output}</pre>
            </div>
          ))}
        </div>
        <form className="terminal-form" onSubmit={execute}>
          <span className="terminal-prompt">admin@s3:~$</span>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type help" />
        </form>
      </section>
    </main>
  );
}

function PricingPage() {
  const [storageGb, setStorageGb] = useState(100);
  const [putRequests, setPutRequests] = useState(10000);
  const [getRequests, setGetRequests] = useState(50000);
  const [transferGb, setTransferGb] = useState(20);
  const gb = 1024 * 1024 * 1024;
  const estimate = calculateEstimatedCost({
    standardBytes: storageGb * gb,
    standardIaBytes: 0,
    glacierBytes: 0,
    putRequests,
    getRequests,
  });
  const cost = estimate.storage + estimate.requests + transferGb * 0.09;
  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>S3</span>
        <b>›</b>
        <strong>Pricing calculator</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>S3 pricing calculator</h1>
          <p>Estimate monthly costs for a simulated Standard storage workload.</p>
        </div>
      </div>
      <section className="configuration-layout">
        <div className="configuration-content">
          <section className="configuration-section">
            <div className="pricing-grid">
              <label>
                Storage (GB)
                <input
                  type="number"
                  min="0"
                  value={storageGb}
                  onChange={(event) => setStorageGb(Number(event.target.value))}
                />
              </label>
              <label>
                PUT requests
                <input
                  type="number"
                  min="0"
                  value={putRequests}
                  onChange={(event) => setPutRequests(Number(event.target.value))}
                />
              </label>
              <label>
                GET requests
                <input
                  type="number"
                  min="0"
                  value={getRequests}
                  onChange={(event) => setGetRequests(Number(event.target.value))}
                />
              </label>
              <label>
                Internet transfer (GB)
                <input
                  type="number"
                  min="0"
                  value={transferGb}
                  onChange={(event) => setTransferGb(Number(event.target.value))}
                />
              </label>
            </div>
          </section>
          <section className="configuration-section pricing-result">
            <span>Estimated monthly cost</span>
            <strong>${cost.toFixed(2)} USD</strong>
            <p>Educational estimate; real prices vary by region and usage tier.</p>
          </section>
        </div>
      </section>
    </main>
  );
}

function IamPage() {
  const buckets = useS3SimulatorStore((state) => state.buckets);
  const [action, setAction] = useState("s3:GetObject");
  const [bucketName, setBucketName] = useState(buckets[0]?.name ?? "");
  const [iamAllow, setIamAllow] = useState(false);
  const [blockPublic, setBlockPublic] = useState(buckets[0]?.blockPublicAccess ?? true);
  const bucket = buckets.find((item) => item.name === bucketName);
  const resource = bucket
    ? action === "s3:ListBucket"
      ? `arn:aws:s3:::${bucket.name}`
      : `arn:aws:s3:::${bucket.name}/*`
    : "";
  const policyDecision = bucket
    ? evaluateBucketPolicy(bucket.policy || '{"Statement":[]}', "*", action, resource)
    : "Implicit deny";
  const allowed =
    Boolean(bucket) &&
    policyDecision !== "Explicit deny" &&
    (iamAllow || (policyDecision === "Allowed" && !blockPublic));

  const changeBucket = (nextName: string) => {
    setBucketName(nextName);
    setBlockPublic(buckets.find((item) => item.name === nextName)?.blockPublicAccess ?? true);
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>IAM</span>
        <b>›</b>
        <strong>Policy simulator</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>IAM policy simulator</h1>
          <p>Test a simulated action against bucket policy, IAM policy, and Block Public Access.</p>
        </div>
      </div>
      <section className="configuration-layout">
        <div className="configuration-content">
          <section className="configuration-section">
            <div className="pricing-grid">
              <label>
                Bucket
                <select value={bucketName} onChange={(event) => changeBucket(event.target.value)}>
                  {buckets.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Action
                <select value={action} onChange={(event) => setAction(event.target.value)}>
                  <option>s3:GetObject</option>
                  <option>s3:PutObject</option>
                  <option>s3:DeleteObject</option>
                  <option>s3:ListBucket</option>
                </select>
              </label>
            </div>
            <p className="access-status">
              <strong>Bucket policy decision:</strong> {policyDecision}
            </p>
            <label className="toggle-row">
              <span>IAM policy allows the action</span>
              <input type="checkbox" checked={iamAllow} onChange={(event) => setIamAllow(event.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>Block all public access</span>
              <input type="checkbox" checked={blockPublic} onChange={(event) => setBlockPublic(event.target.checked)} />
            </label>
          </section>
          <section className={`configuration-section policy-result ${allowed ? "allowed" : "denied"}`}>
            <h2>{allowed ? "Allowed" : "Denied"}</h2>
            <p>
              {allowed
                ? "The IAM policy or public bucket policy grants the action."
                : policyDecision === "Explicit deny"
                  ? "An explicit Deny statement in the bucket policy overrides every Allow."
                  : "No Allow matched, or Block Public Access blocked the public policy."}
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}

function TutorialsPage() {
  const [tutorial, setTutorial] = useState(0);
  const tutorials: [string, string[]][] = [
    [
      "Host a static website",
      ["Create a bucket", "Upload index.html", "Enable static website hosting", "Open the endpoint"],
    ],
    [
      "Enable versioning",
      ["Open Properties", "Enable Bucket Versioning", "Upload the same key twice", "Restore or view versions"],
    ],
    [
      "Set up a lifecycle rule",
      ["Open Management", "Create a lifecycle rule", "Set prefix and transition class", "Review the timeline"],
    ],
  ];
  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>Learn</span>
        <b>›</b>
        <strong>Tutorials</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>Tutorials</h1>
          <p>Step-by-step event presentation guides.</p>
        </div>
      </div>
      <section className="configuration-layout">
        <div className="configuration-content">
          <section className="configuration-section">
            <div className="tutorial-tabs">
              {tutorials.map(([title], index) => (
                <button className={tutorial === index ? "active" : ""} key={title} onClick={() => setTutorial(index)}>
                  {title}
                </button>
              ))}
            </div>
            <ol className="tutorial-list">
              {tutorials[tutorial][1].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </div>
      </section>
    </main>
  );
}

function ExportImportPage() {
  const state = useS3SimulatorStore();
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");

  const exportState = () => {
    const payload = JSON.stringify(
      {
        buckets: state.buckets,
        activity: state.activity,
        region: state.region,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "s3-simulator-state.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Simulator state exported.");
  };

  const importState = () => {
    try {
      const parsed = JSON.parse(importText) as {
        buckets?: Array<Partial<Bucket> & { name: string }>;
        activity?: typeof state.activity;
        region?: string;
      };
      if (!Array.isArray(parsed.buckets)) throw new Error("Imported JSON must contain a buckets array.");
      const buckets = [
        ...new Map(
          parsed.buckets
            .filter((bucket) => bucket && typeof bucket.name === "string" && bucket.name.length > 0)
            .map((bucket) => [bucket.name, normalizeBucket(bucket)]),
        ).values(),
      ];
      if (!buckets.length) throw new Error("Imported JSON does not contain any valid buckets.");
      const activity = Array.isArray(parsed.activity)
        ? parsed.activity.map((event, index) => ({
            id: event.id ?? `imported-${index}`,
            action: event.action ?? "ImportedEvent",
            resource: event.resource ?? "",
            createdAt: event.createdAt ?? new Date().toISOString(),
            status: event.status ?? "Success",
          }))
        : [];
      useS3SimulatorStore.setState({
        buckets,
        activity,
        region: typeof parsed.region === "string" ? parsed.region : "us-east-1",
      });
      void clearObjectBlobs();
      setMessage("Simulator state imported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>S3 Simulator</span>
        <b>›</b>
        <strong>Export / Import</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>Export / Import</h1>
          <p>Move this browser simulation between devices as JSON.</p>
        </div>
      </div>
      <section className="configuration-layout">
        <div className="configuration-content">
          <section className="configuration-section">
            <h2>Export</h2>
            <p>Download buckets, objects, policies, and activity from this browser.</p>
            <button className="orange-button" onClick={exportState}>
              Export state
            </button>
          </section>
          <section className="configuration-section">
            <h2>Import</h2>
            <textarea
              className="import-json"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste simulator JSON here"
            />
            <button className="orange-button" onClick={importState}>
              Import state
            </button>
            {message && <p className="import-message">{message}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}

function AccessPointsPage() {
  const { buckets, createAccessPoint, deleteAccessPoint } = useS3SimulatorStore();
  const [apName, setApName] = useState("");
  const [apNetwork, setApNetwork] = useState<"Internet" | "VPC">("Internet");
  const [selectedBucket, setSelectedBucket] = useState(buckets[0]?.name ?? "");
  const bucket = buckets.find((item) => item.name === selectedBucket);

  const changeBucket = (nextName: string) => setSelectedBucket(nextName);

  const createAP = () => {
    if (!apName.trim() || !bucket) return;
    createAccessPoint(bucket.name, apName, apNetwork);
    setApName("");
  };

  return (
    <main className="console-main">
      <div className="breadcrumbs">
        <span>Amazon S3</span>
        <b>›</b>
        <strong>Access Points</strong>
      </div>
      <div className="page-title">
        <div>
          <h1>Access Points</h1>
          <p>Manage access points for simplifying data access across your buckets.</p>
        </div>
      </div>
      <section className="configuration-layout">
        <div className="configuration-content">
          <section className="configuration-section">
            <div className="pricing-grid">
              <label>
                Bucket
                <select value={selectedBucket} onChange={(event) => changeBucket(event.target.value)}>
                  {buckets.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Access point name
                <input
                  value={apName}
                  onChange={(event) => setApName(event.target.value)}
                  placeholder="my-access-point"
                />
              </label>
              <label>
                Network origin
                <select value={apNetwork} onChange={(event) => setApNetwork(event.target.value as "Internet" | "VPC")}>
                  <option value="Internet">Internet</option>
                  <option value="VPC">VPC</option>
                </select>
              </label>
            </div>
            <button className="orange-button" disabled={!apName.trim() || !bucket} onClick={createAP}>
              Create access point
            </button>
          </section>
          <section className="configuration-section">
            <h2>Access points by bucket</h2>
            {buckets.length ? (
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Name</th>
                    <th>Network</th>
                    <th>Status</th>
                    <th>ARN</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.flatMap((b) =>
                    b.accessPoints.map((ap) => (
                      <tr key={ap.id}>
                        <td>{b.name}</td>
                        <td>{ap.name}</td>
                        <td>{ap.network}</td>
                        <td>
                          <span className="status-badge">{ap.status}</span>
                        </td>
                        <td>
                          arn:aws:s3:::{b.name}:accesspoint/{ap.name}
                        </td>
                        <td>
                          <button onClick={() => deleteAccessPoint(b.name, ap.id)}>Delete</button>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <Box size={38} />
                <h2>No buckets</h2>
                <p>Create a bucket to get started.</p>
              </div>
            )}
            {!buckets.some((b) => b.accessPoints.length) && buckets.length && (
              <p className="empty-text">No access points configured across buckets.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function ConsoleLayout() {
  return (
    <div className="console-shell">
      <TopNav consoleMode />
      <ConsoleSidebar />
      <Routes>
        <Route path="/" element={<Navigate to="/console/buckets" replace />} />
        <Route path="/buckets" element={<BucketsPage />} />
        <Route path="/buckets/:name" element={<BucketDetailsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/cli" element={<CliPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/iam" element={<IamPage />} />
        <Route path="/tutorials" element={<TutorialsPage />} />
        <Route path="/learn" element={<LearningSimulatorPage />} />
        <Route path="/state" element={<ExportImportPage />} />
        <Route path="/access-points" element={<AccessPointsPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/console/*" element={<ConsoleLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
