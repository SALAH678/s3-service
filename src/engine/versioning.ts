/**
 * S3 versioning state machine and realistic identifier helpers.
 *
 * AWS only allows two explicit versioning states, but a bucket that has never
 * been versioned behaves differently from one that was enabled and suspended.
 * The learning simulator therefore exposes three states:
 *
 *   Unversioned -> Enabled <-> Suspended
 *
 * Once a bucket has been versioned it can never return to Unversioned.
 */
export type VersioningState = 'Unversioned' | 'Enabled' | 'Suspended'

export const VERSIONING_STATES: VersioningState[] = ['Unversioned', 'Enabled', 'Suspended']

export type VersioningTransitionError = {
  code: 'InvalidBucketState' | 'InvalidRequest'
  message: string
}

export function validateVersioningTransition(
  current: VersioningState,
  next: VersioningState,
): VersioningTransitionError | null {
  if (current === next) {
    return {
      code: 'InvalidRequest',
      message: `Bucket versioning is already ${current}. Choose a different state.`,
    }
  }
  if (next === 'Unversioned') {
    return {
      code: 'InvalidBucketState',
      message:
        'Versioning cannot be reverted to Unversioned. Once a bucket has been versioned, use Suspended to stop creating new versions while keeping existing ones.',
    }
  }
  if (current === 'Unversioned' && next === 'Suspended') {
    return {
      code: 'InvalidBucketState',
      message:
        'A bucket must be Enabled before it can be Suspended. Enable versioning first, then suspend it later if needed.',
    }
  }
  return null
}

export function canTransitionVersioning(current: VersioningState, next: VersioningState): boolean {
  return validateVersioningTransition(current, next) === null
}

export function versioningTooltip(current: VersioningState, next: VersioningState): string {
  const error = validateVersioningTransition(current, next)
  if (error) return error.message
  if (next === 'Enabled' && current === 'Unversioned') {
    return 'Enable versioning so every PUT creates a new version instead of overwriting the existing object.'
  }
  if (next === 'Suspended' && current === 'Enabled') {
    return 'Suspending stops new versions from being created. Existing versions and delete markers are retained.'
  }
  return `Change bucket versioning from ${current} to ${next}.`
}

const VERSION_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._'

/** AWS-style 32 character opaque version id. */
export function generateVersionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let id = ''
  for (const byte of bytes) id += VERSION_ALPHABET[byte % VERSION_ALPHABET.length]
  return id
}

/** MD5-looking ETag. Multipart ETags include the part count suffix. */
export function generateEtag(parts = 1): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return parts > 1 ? `"${hex}-${parts}"` : `"${hex}"`
}

export function versionIdForNewObject(state: VersioningState): string {
  return state === 'Enabled' ? generateVersionId() : 'null'
}

export function generateMultipartUploadId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function bucketArn(bucketName: string): string {
  return `arn:aws:s3:::${bucketName}`
}

export function objectArn(bucketName: string, key: string): string {
  return `arn:aws:s3:::${bucketName}/${key}`
}
