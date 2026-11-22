import {
  LEARNING_STORAGE_CLASSES,
  classLabel,
  classShortLabel,
  detailsFor,
  estimateEarlyDeletionCharge,
  estimateMonthlyStorageCost,
  formatBytes,
  formatUsd,
  isLearningStorageClass,
} from "../../engine/storageClasses";
import type { StorageClass } from "../../store/s3SimulatorStore";

type StorageClassPickerProps = {
  value: StorageClass;
  onChange: (value: StorageClass) => void;
  objectSize: number;
  currentClass?: StorageClass;
  ageInClassDays?: number;
  disabled?: boolean;
};

export function StorageClassPicker({
  value,
  onChange,
  objectSize,
  currentClass,
  ageInClassDays = 0,
  disabled = false,
}: StorageClassPickerProps) {
  const selected = isLearningStorageClass(value) ? value : "STANDARD";
  const detail = detailsFor(selected);
  const monthlyCost = estimateMonthlyStorageCost(objectSize, selected);
  const earlyDeletion =
    currentClass && currentClass !== value
      ? estimateEarlyDeletionCharge(objectSize, currentClass, ageInClassDays)
      : 0;
  const minimumBilled = objectSize > 0 && objectSize < detail.minBillableBytes;

  return (
    <div className="learn-class-picker" data-tour="storage-class-picker">
      <div className="learn-class-options" role="radiogroup" aria-label="Storage class">
        {LEARNING_STORAGE_CLASSES.map((storageClass) => (
          <button
            type="button"
            key={storageClass}
            role="radio"
            aria-checked={selected === storageClass}
            className={selected === storageClass ? "learn-class-option active" : "learn-class-option"}
            disabled={disabled}
            onClick={() => onChange(storageClass)}
          >
            <strong>{classShortLabel(storageClass)}</strong>
            <span>{formatUsd(detailsFor(storageClass).pricePerGBMonth, 4)} / GB-month</span>
            <small>{detailsFor(storageClass).retrievalTime}</small>
          </button>
        ))}
      </div>

      <div className="learn-class-details" data-tour="storage-class-details">
        <div className="learn-class-details-head">
          <div>
            <h4>{classLabel(selected)}</h4>
            <p>{detail.description}</p>
          </div>
          <span className="learn-chip">{detail.useCase}</span>
        </div>

        <dl className="learn-detail-grid">
          <div>
            <dt>Minimum storage duration</dt>
            <dd>{detail.minStorageDays ? `${detail.minStorageDays} days` : "None"}</dd>
          </div>
          <div>
            <dt>Minimum billable object size</dt>
            <dd>{detail.minBillableBytes ? formatBytes(detail.minBillableBytes) : "None"}</dd>
          </div>
          <div>
            <dt>Price per GB / month</dt>
            <dd>{formatUsd(detail.pricePerGBMonth, 4)}</dd>
          </div>
          <div>
            <dt>Retrieval fee</dt>
            <dd>{detail.retrievalFeePerGB ? `${formatUsd(detail.retrievalFeePerGB, 4)} / GB` : "None"}</dd>
          </div>
          <div>
            <dt>Estimated storage cost</dt>
            <dd>{formatUsd(monthlyCost, 4)} / month</dd>
          </div>
          <div>
            <dt>Retrieval time</dt>
            <dd>{detail.retrievalTime}</dd>
          </div>
        </dl>

        {minimumBilled && (
          <p className="learn-note learn-note-warning">
            This object is {formatBytes(objectSize)}. {classLabel(selected)} bills a minimum of{" "}
            {formatBytes(detail.minBillableBytes)} per object, so the estimate uses the minimum billable size.
          </p>
        )}

        {earlyDeletion > 0 && (
          <p className="learn-note learn-note-warning">
            Early deletion charge: {formatUsd(earlyDeletion, 4)}. Leaving{" "}
            {classLabel(currentClass ?? selected)} before its minimum storage duration charges the remaining
            days.
          </p>
        )}

        {detail.minStorageDays > 0 && (
          <p className="learn-note">
            If you delete or transition this object before {detail.minStorageDays} days, AWS bills the
            remaining minimum storage duration.
          </p>
        )}
      </div>
    </div>
  );
}
