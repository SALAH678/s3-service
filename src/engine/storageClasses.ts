/**
 * Storage class catalogue used by the teaching UI.
 *
 * Prices are approximate US East (N. Virginia) list prices and are only used to
 * make relative cost differences visible. No real AWS billing is involved.
 */
export type LearningStorageClass =
  | 'STANDARD'
  | 'INTELLIGENT_TIERING'
  | 'STANDARD_IA'
  | 'ONE_ZONE_IA'
  | 'GLACIER_IR'
  | 'GLACIER'
  | 'DEEP_ARCHIVE'

export type StorageClassDetail = {
  id: LearningStorageClass
  label: string
  shortLabel: string
  minStorageDays: number
  minBillableBytes: number
  pricePerGBMonth: number
  retrievalFeePerGB: number
  retrievalTime: string
  durability: string
  useCase: string
  description: string
}

const KB = 1024
const GB = 1024 * 1024 * 1024

export const LEARNING_STORAGE_CLASSES: LearningStorageClass[] = [
  'STANDARD',
  'INTELLIGENT_TIERING',
  'STANDARD_IA',
  'ONE_ZONE_IA',
  'GLACIER_IR',
  'GLACIER',
  'DEEP_ARCHIVE',
]

export const STORAGE_CLASS_DETAILS: Record<LearningStorageClass, StorageClassDetail> = {
  STANDARD: {
    id: 'STANDARD',
    label: 'S3 Standard',
    shortLabel: 'Standard',
    minStorageDays: 0,
    minBillableBytes: 0,
    pricePerGBMonth: 0.023,
    retrievalFeePerGB: 0,
    retrievalTime: 'Milliseconds',
    durability: '99.999999999% (11 nines)',
    useCase: 'Frequently accessed data, dynamic websites, mobile apps',
    description: 'General purpose storage for frequently accessed data with low latency and high throughput.',
  },
  INTELLIGENT_TIERING: {
    id: 'INTELLIGENT_TIERING',
    label: 'S3 Intelligent-Tiering',
    shortLabel: 'Intelligent-Tiering',
    minStorageDays: 0,
    minBillableBytes: 0,
    pricePerGBMonth: 0.025,
    retrievalFeePerGB: 0,
    retrievalTime: 'Milliseconds',
    durability: '99.999999999% (11 nines)',
    useCase: 'Unknown or changing access patterns',
    description: 'Automatically moves objects between access tiers based on changing access patterns, with no retrieval fees.',
  },
  STANDARD_IA: {
    id: 'STANDARD_IA',
    label: 'S3 Standard-IA',
    shortLabel: 'Standard-IA',
    minStorageDays: 30,
    minBillableBytes: 128 * KB,
    pricePerGBMonth: 0.0125,
    retrievalFeePerGB: 0.01,
    retrievalTime: 'Milliseconds',
    durability: '99.999999999% (11 nines)',
    useCase: 'Long-lived, infrequently accessed data',
    description: 'Infrequent access storage with millisecond access. Objects are billed for a minimum of 30 days.',
  },
  ONE_ZONE_IA: {
    id: 'ONE_ZONE_IA',
    label: 'S3 One Zone-IA',
    shortLabel: 'One Zone-IA',
    minStorageDays: 30,
    minBillableBytes: 128 * KB,
    pricePerGBMonth: 0.01,
    retrievalFeePerGB: 0.01,
    retrievalTime: 'Milliseconds',
    durability: '99.999999999% in a single Availability Zone',
    useCase: 'Re-creatable infrequent data',
    description: 'Lower-cost infrequent access storage stored in a single Availability Zone.',
  },
  GLACIER_IR: {
    id: 'GLACIER_IR',
    label: 'S3 Glacier Instant Retrieval',
    shortLabel: 'Glacier Instant',
    minStorageDays: 90,
    minBillableBytes: 128 * KB,
    pricePerGBMonth: 0.004,
    retrievalFeePerGB: 0.01,
    retrievalTime: 'Milliseconds',
    durability: '99.999999999% (11 nines)',
    useCase: 'Archive data that is occasionally accessed',
    description: 'Archive storage with millisecond retrieval, ideal for data accessed once a quarter.',
  },
  GLACIER: {
    id: 'GLACIER',
    label: 'S3 Glacier Flexible Retrieval',
    shortLabel: 'Glacier Flexible',
    minStorageDays: 90,
    minBillableBytes: 40 * KB,
    pricePerGBMonth: 0.0036,
    retrievalFeePerGB: 0.05,
    retrievalTime: 'Minutes to hours',
    durability: '99.999999999% (11 nines)',
    useCase: 'Backups and disaster recovery',
    description: 'Low-cost archive storage with flexible retrieval times from minutes to hours.',
  },
  DEEP_ARCHIVE: {
    id: 'DEEP_ARCHIVE',
    label: 'S3 Glacier Deep Archive',
    shortLabel: 'Deep Archive',
    minStorageDays: 180,
    minBillableBytes: 40 * KB,
    pricePerGBMonth: 0.00099,
    retrievalFeePerGB: 0.02,
    retrievalTime: 'Hours (within 12 hours)',
    durability: '99.999999999% (11 nines)',
    useCase: 'Long-term retention and compliance archives',
    description: 'Lowest-cost archive storage for data that is rarely accessed and retained for years.',
  },
}

export function isLearningStorageClass(value: string): value is LearningStorageClass {
  return (LEARNING_STORAGE_CLASSES as string[]).includes(value)
}

export function detailsFor(storageClass: string): StorageClassDetail {
  return isLearningStorageClass(storageClass)
    ? STORAGE_CLASS_DETAILS[storageClass]
    : STORAGE_CLASS_DETAILS.STANDARD
}

export function classLabel(storageClass: string): string {
  return detailsFor(storageClass).label
}

export function classShortLabel(storageClass: string): string {
  return detailsFor(storageClass).shortLabel
}

/** AWS rounds object storage billing up to the class minimum billable size. */
export function billableBytes(size: number, storageClass: string): number {
  const detail = detailsFor(storageClass)
  return Math.max(0, size, detail.minBillableBytes)
}

export function billableGB(size: number, storageClass: string): number {
  return billableBytes(size, storageClass) / GB
}

/** Estimated monthly storage cost for a single object. */
export function estimateMonthlyStorageCost(size: number, storageClass: string): number {
  return billableGB(size, storageClass) * detailsFor(storageClass).pricePerGBMonth
}

/**
 * Early deletion charge for leaving a class before its minimum storage
 * duration completes. AWS bills the remaining days at the storage rate.
 */
export function estimateEarlyDeletionCharge(
  size: number,
  storageClass: string,
  ageInClassDays: number,
): number {
  const detail = detailsFor(storageClass)
  if (!detail.minStorageDays) return 0
  const remainingDays = Math.max(0, detail.minStorageDays - Math.max(0, ageInClassDays))
  if (!remainingDays) return 0
  return estimateMonthlyStorageCost(size, storageClass) * (remainingDays / 30)
}

export function estimateRetrievalCost(size: number, storageClass: string): number {
  const detail = detailsFor(storageClass)
  if (!detail.retrievalFeePerGB) return 0
  return (size / GB) * detail.retrievalFeePerGB
}

export function formatUsd(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '$0.00'
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(Math.max(digits, 4))}`
  return `$${value.toFixed(2)}`
}

export function formatEarlyDeletionCharge(value: number): string {
  if (value > 0 && value < 0.00005) return '< $0.0001'
  return formatUsd(value, 4)
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : digits)} ${units[index]}`
}

export function formatBytesExact(bytes: number): string {
  return `${bytes.toLocaleString()} bytes (${formatBytes(bytes)})`
}

export function formatDurationDays(days: number): string {
  if (days === 0) return 'None'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? '' : 's'}`
  return `${days} days`
}

export const STORAGE_CLASS_COLORS: Record<string, string> = {
  STANDARD: '#0972d3',
  INTELLIGENT_TIERING: '#1d8102',
  STANDARD_IA: '#8d6b00',
  ONE_ZONE_IA: '#c45500',
  GLACIER_IR: '#6b40a8',
  GLACIER: '#3f4b5b',
  DEEP_ARCHIVE: '#232f3e',
}
