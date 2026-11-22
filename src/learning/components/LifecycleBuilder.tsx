import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Pencil, Plus, Trash2 } from "lucide-react";
import {
  hasBlockingIssues,
  lifecycleMilestones,
  lifecycleSummary,
  resolvedNoncurrentTransitions,
  resolvedTransitions,
  validateLifecycleRule,
  validateLifecycleRules,
  type LifecycleIssue,
} from "../../engine/lifecycleRules";
import {
  LEARNING_STORAGE_CLASSES,
  classLabel,
  classShortLabel,
  formatBytes,
} from "../../engine/storageClasses";
import {
  useS3SimulatorStore,
  type Bucket,
  type LifecycleRule,
  type StorageClass,
} from "../../store/s3SimulatorStore";
import { wait, type FlashHandler } from "../types";

type TransitionDraft = {
  days: string;
  storageClass: StorageClass;
};

const DEFAULT_TRANSITIONS: TransitionDraft[] = [{ days: "30", storageClass: "STANDARD_IA" }];

const toOptionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function emptyIssueIds(): string {
  return `lc-${crypto.randomUUID().slice(0, 8)}`;
}

export function LifecycleBuilder({ bucket, onFlash }: { bucket: Bucket; onFlash: FlashHandler }) {
  const { saveLifecycleRule, deleteLifecycleRule, validateBucketLifecycle, addMultipartUpload } =
    useS3SimulatorStore();
  const [draftId, setDraftId] = useState(emptyIssueIds);
  const [name, setName] = useState("archive-old-data");
  const [status, setStatus] = useState<"Enabled" | "Disabled">("Enabled");
  const [prefix, setPrefix] = useState("");
  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [sizeGreater, setSizeGreater] = useState("");
  const [sizeLess, setSizeLess] = useState("");
  const [transitions, setTransitions] = useState<TransitionDraft[]>(DEFAULT_TRANSITIONS);
  const [expiration, setExpiration] = useState("");
  const [noncurrentTransitions, setNoncurrentTransitions] = useState<TransitionDraft[]>([]);
  const [noncurrentExpiration, setNoncurrentExpiration] = useState("");
  const [abortDays, setAbortDays] = useState("");
  const [busy, setBusy] = useState(false);

  const draft = useMemo<LifecycleRule>(() => {
    const parsedTransitions = transitions.map((transition) => ({
      days: Number(transition.days) || 0,
      storageClass: transition.storageClass,
    }));
    const parsedNoncurrent = noncurrentTransitions.map((transition) => ({
      days: Number(transition.days) || 0,
      storageClass: transition.storageClass,
    }));
    const first = parsedTransitions[0];
    return {
      id: draftId,
      name,
      status,
      prefix: prefix.trim(),
      transitionDays: first?.days ?? 0,
      targetClass: first?.storageClass ?? "STANDARD_IA",
      transitions: parsedTransitions,
      filterTagKey: tagKey.trim() || undefined,
      filterTagValue: tagValue.trim() || undefined,
      filterSizeGreaterThan: toOptionalNumber(sizeGreater),
      filterSizeLessThan: toOptionalNumber(sizeLess),
      expirationDays: toOptionalNumber(expiration),
      noncurrentTransitions: parsedNoncurrent,
      noncurrentExpirationDays: toOptionalNumber(noncurrentExpiration),
      abortIncompleteMultipartDays: toOptionalNumber(abortDays),
    };
  }, [
    abortDays,
    draftId,
    expiration,
    name,
    noncurrentExpiration,
    noncurrentTransitions,
    prefix,
    sizeGreater,
    sizeLess,
    status,
    tagKey,
    tagValue,
    transitions,
  ]);

  const otherRules = bucket.lifecycleRules.filter((rule) => rule.id !== draftId);
  const issues = useMemo(
    () => validateLifecycleRule(draft, otherRules, bucket.objects),
    [bucket.objects, draft, otherRules],
  );
  const existingIssues = useMemo(
    () => validateLifecycleRules(bucket.lifecycleRules, bucket.objects),
    [bucket.lifecycleRules, bucket.objects],
  );
  const milestones = useMemo(() => lifecycleMilestones(draft, [0, 30, 90, 365]), [draft]);
  const blocking = hasBlockingIssues(issues) || !name.trim();

  const resetForm = () => {
    setDraftId(emptyIssueIds());
    setName("");
    setStatus("Enabled");
    setPrefix("");
    setTagKey("");
    setTagValue("");
    setSizeGreater("");
    setSizeLess("");
    setTransitions(DEFAULT_TRANSITIONS);
    setExpiration("");
    setNoncurrentTransitions([]);
    setNoncurrentExpiration("");
    setAbortDays("");
  };

  const loadRule = (rule: LifecycleRule) => {
    setDraftId(rule.id);
    setName(rule.name);
    setStatus(rule.status);
    setPrefix(rule.prefix ?? "");
    setTagKey(rule.filterTagKey ?? "");
    setTagValue(rule.filterTagValue ?? "");
    setSizeGreater(rule.filterSizeGreaterThan?.toString() ?? "");
    setSizeLess(rule.filterSizeLessThan?.toString() ?? "");
    setTransitions(
      resolvedTransitions(rule).map((transition) => ({
        days: String(transition.days),
        storageClass: transition.storageClass as StorageClass,
      })),
    );
    setExpiration(rule.expirationDays?.toString() ?? "");
    setNoncurrentTransitions(
      resolvedNoncurrentTransitions(rule).map((transition) => ({
        days: String(transition.days),
        storageClass: transition.storageClass as StorageClass,
      })),
    );
    setNoncurrentExpiration(rule.noncurrentExpirationDays?.toString() ?? "");
    setAbortDays(rule.abortIncompleteMultipartDays?.toString() ?? "");
  };

  const updateTransition = (index: number, changes: Partial<TransitionDraft>) => {
    setTransitions((current) =>
      current.map((transition, position) => (position === index ? { ...transition, ...changes } : transition)),
    );
  };

  const updateNoncurrentTransition = (index: number, changes: Partial<TransitionDraft>) => {
    setNoncurrentTransitions((current) =>
      current.map((transition, position) => (position === index ? { ...transition, ...changes } : transition)),
    );
  };

  const save = async () => {
    setBusy(true);
    await wait(320);
    const result = saveLifecycleRule(bucket.name, draft);
    setBusy(false);
    if (hasBlockingIssues(result)) {
      onFlash({
        kind: "error",
        title: "Lifecycle rule not saved",
        message: result.find((issue) => issue.severity === "error")?.message ?? "Fix the validation errors first.",
      });
      return;
    }
    onFlash({
      kind: "success",
      title: "Lifecycle rule saved",
      message: `${name} is now active for ${bucket.name}. Advance the clock to run it.`,
    });
    resetForm();
  };

  return (
    <section className="learn-card" data-tour="lifecycle-builder">
      <header className="learn-card-header">
        <div>
          <h2>Lifecycle builder</h2>
          <p>Build a rule, read the real S3 validation rules, and preview the day 0 / 30 / 90 / 365 timeline.</p>
        </div>
        <span className="learn-chip">{bucket.lifecycleRules.length} rules</span>
      </header>
      <div className="learn-card-body">
        <div className="learn-form-grid">
          <label className="learn-field">
            <span>
              Rule name <b className="learn-required">*</b>
            </span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="archive-old-data" />
          </label>
          <label className="learn-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "Enabled" | "Disabled")}>
              <option value="Enabled">Enabled</option>
              <option value="Disabled">Disabled</option>
            </select>
          </label>
          <label className="learn-field">
            <span>Prefix filter</span>
            <input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="images/" />
          </label>
          <label className="learn-field">
            <span>Tag filter</span>
            <div className="learn-inline">
              <input value={tagKey} onChange={(event) => setTagKey(event.target.value)} placeholder="Category" />
              <input value={tagValue} onChange={(event) => setTagValue(event.target.value)} placeholder="Images" />
            </div>
          </label>
          <label className="learn-field">
            <span>Object size greater than (bytes)</span>
            <input
              type="number"
              min={0}
              value={sizeGreater}
              onChange={(event) => setSizeGreater(event.target.value)}
              placeholder="131072"
            />
          </label>
          <label className="learn-field">
            <span>Object size less than (bytes)</span>
            <input
              type="number"
              min={0}
              value={sizeLess}
              onChange={(event) => setSizeLess(event.target.value)}
              placeholder="10485760"
            />
          </label>
        </div>

        <div className="learn-subsection" data-tour="lifecycle-transitions">
          <div className="learn-subsection-head">
            <h3>Transitions</h3>
            <button
              type="button"
              className="learn-btn learn-btn-small"
              onClick={() =>
                setTransitions((current) => [
                  ...current,
                  {
                    days: String((Number(current[current.length - 1]?.days) || 30) + 30),
                    storageClass: "GLACIER",
                  },
                ])
              }
            >
              <Plus size={14} />
              Add transition
            </button>
          </div>
          {transitions.length ? (
            transitions.map((transition, index) => (
              <div className="learn-transition-row" key={`transition-${index}`}>
                <label className="learn-field">
                  <span>Day</span>
                  <input
                    type="number"
                    min={0}
                    value={transition.days}
                    onChange={(event) => updateTransition(index, { days: event.target.value })}
                  />
                </label>
                <label className="learn-field">
                  <span>Storage class</span>
                  <select
                    value={transition.storageClass}
                    onChange={(event) =>
                      updateTransition(index, { storageClass: event.target.value as StorageClass })
                    }
                  >
                    {LEARNING_STORAGE_CLASSES.map((storageClass) => (
                      <option key={storageClass} value={storageClass}>
                        {classLabel(storageClass)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="learn-icon-button"
                  aria-label="Remove transition"
                  onClick={() => setTransitions((current) => current.filter((_, position) => position !== index))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <p className="learn-muted">No transitions. The object stays in its current class until it expires.</p>
          )}

          <div className="learn-form-grid">
            <label className="learn-field">
              <span>Expiration (days)</span>
              <input
                type="number"
                min={1}
                value={expiration}
                onChange={(event) => setExpiration(event.target.value)}
                placeholder="365"
              />
            </label>
            <label className="learn-field">
              <span>Abort incomplete multipart uploads (days)</span>
              <input
                type="number"
                min={1}
                value={abortDays}
                onChange={(event) => setAbortDays(event.target.value)}
                placeholder="7"
              />
            </label>
          </div>
        </div>

        <details className="learn-subsection learn-disclosure">
          <summary>Noncurrent version actions</summary>
          <div className="learn-disclosure-body">
            <div className="learn-subsection-head">
              <h3>Noncurrent transitions</h3>
              <button
                type="button"
                className="learn-btn learn-btn-small"
                onClick={() =>
                  setNoncurrentTransitions((current) => [
                    ...current,
                    {
                      days: String((Number(current[current.length - 1]?.days) || 0) + 30),
                      storageClass: "GLACIER",
                    },
                  ])
                }
              >
                <Plus size={14} />
                Add noncurrent transition
              </button>
            </div>
            {noncurrentTransitions.map((transition, index) => (
              <div className="learn-transition-row" key={`noncurrent-${index}`}>
                <label className="learn-field">
                  <span>Days after becoming noncurrent</span>
                  <input
                    type="number"
                    min={0}
                    value={transition.days}
                    onChange={(event) => updateNoncurrentTransition(index, { days: event.target.value })}
                  />
                </label>
                <label className="learn-field">
                  <span>Storage class</span>
                  <select
                    value={transition.storageClass}
                    onChange={(event) =>
                      updateNoncurrentTransition(index, { storageClass: event.target.value as StorageClass })
                    }
                  >
                    {LEARNING_STORAGE_CLASSES.map((storageClass) => (
                      <option key={storageClass} value={storageClass}>
                        {classLabel(storageClass)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="learn-icon-button"
                  aria-label="Remove noncurrent transition"
                  onClick={() =>
                    setNoncurrentTransitions((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <label className="learn-field">
              <span>Permanently expire noncurrent versions after (days)</span>
              <input
                type="number"
                min={1}
                value={noncurrentExpiration}
                onChange={(event) => setNoncurrentExpiration(event.target.value)}
                placeholder="30"
              />
            </label>
          </div>
        </details>

        <div className="learn-validation" data-tour="lifecycle-validation">
          <h3>Validation messages</h3>
          {issues.length ? (
            <IssueList issues={issues} />
          ) : (
            <p className="learn-ok">
              <CheckCircle2 size={16} /> No validation issues. The rule matches the real S3 constraints.
            </p>
          )}
        </div>

        <div className="learn-timeline-preview" data-tour="lifecycle-timeline">
          <h3>Visual timeline</h3>
          <div className="learn-milestones">
            {milestones.map((milestone) => (
              <article key={milestone.day} className={milestone.expired ? "expired" : ""}>
                <header>
                  <strong>Day {milestone.day}</strong>
                  <span>{classShortLabel(milestone.storageClass)}</span>
                </header>
                <ul>
                  {milestone.events.map((event) => (
                    <li key={event}>{event}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        <div className="learn-actions">
          <button
            type="button"
            className="learn-btn learn-btn-primary"
            disabled={blocking || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving rule..." : "Save lifecycle rule"}
          </button>
          <button type="button" className="learn-btn" onClick={resetForm} disabled={busy}>
            Reset form
          </button>
          <button
            type="button"
            className="learn-btn"
            onClick={() => {
              const result = validateBucketLifecycle(bucket.name);
              onFlash({
                kind: hasBlockingIssues(result) ? "warning" : "success",
                title: "Lifecycle validation complete",
                message: result.length
                  ? `${result.length} message(s) across the saved rules.`
                  : "All saved rules pass validation.",
              });
            }}
          >
            Validate saved rules
          </button>
          <button
            type="button"
            className="learn-btn"
            onClick={() => {
              addMultipartUpload(bucket.name, `${prefix}upload.bin`, 12 * 1024 * 1024);
              onFlash({
                kind: "info",
                title: "Incomplete multipart upload simulated",
                message: "Advance the clock past the abort day to see it cleaned up.",
              });
            }}
          >
            Simulate incomplete upload
          </button>
        </div>

        <div className="learn-subsection">
          <h3>Saved rules</h3>
          {bucket.lifecycleRules.length ? (
            <div className="learn-rule-list">
              {bucket.lifecycleRules.map((rule) => {
                const ruleIssues = existingIssues.filter((issue) => issue.ruleId === rule.id);
                return (
                  <div className="learn-rule-row" key={rule.id}>
                    <div>
                      <strong>{rule.name}</strong>
                      <span>
                        {rule.status} · {lifecycleSummary(rule)} · {rule.expirationDays ? `expires day ${rule.expirationDays}` : "no expiration"}
                      </span>
                      <small>
                        {resolvedTransitions(rule)
                          .map((transition) => `${transition.days}d → ${classShortLabel(transition.storageClass)}`)
                          .join(" · ") || "No transitions"}
                      </small>
                      {ruleIssues.length > 0 && (
                        <small className="learn-inline-error">{ruleIssues.length} validation message(s)</small>
                      )}
                    </div>
                    <div className="learn-inline">
                      <button type="button" className="learn-btn learn-btn-small" onClick={() => loadRule(rule)}>
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="learn-btn learn-btn-small learn-btn-danger"
                        onClick={() => {
                          deleteLifecycleRule(bucket.name, rule.id);
                          onFlash({
                            kind: "warning",
                            title: "Lifecycle rule deleted",
                            message: `${rule.name} no longer runs on this bucket.`,
                          });
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="learn-empty">No lifecycle rules saved for {bucket.name}.</p>
          )}
        </div>

        <p className="learn-note">
          Example: {formatBytes(131072)} is the minimum billable object size for Standard-IA and Glacier
          Instant Retrieval. Transitioning smaller objects can cost more than it saves.
        </p>
      </div>
    </section>
  );
}

function IssueList({ issues }: { issues: LifecycleIssue[] }) {
  return (
    <ul className="learn-issue-list">
      {issues.map((issue, index) => {
        const Icon =
          issue.severity === "error" ? AlertTriangle : issue.severity === "warning" ? AlertTriangle : Info;
        return (
          <li key={`${issue.code}-${index}`} className={`learn-issue issue-${issue.severity}`}>
            <Icon size={15} />
            <div>
              <strong>
                {issue.severity} · {issue.code}
              </strong>
              <span>{issue.message}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
