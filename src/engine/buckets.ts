export type S3ObjectVersion = {
  versionId: string
  size: number
  type: string
  createdAt: string
  parts: number
  storageClass?: string
  etag?: string
  deleteMarker?: boolean
}

export type S3Object = {
  key: string
  size: number
  type: string
  createdAt: string
  parts: number
  versionId?: string
  storageClass?: string
  etag?: string
  deleteMarker?: boolean
  versions?: S3ObjectVersion[]
}

export type Bucket = {
  name: string
  region: string
  createdAt: string
  objects: S3Object[]
}

export const RESERVED_BUCKET_NAMES = [
  'aws',
  's3',
  'console',
  'administrator',
  'test',
]

export function validateBucketName(name: string, existingNames: string[] = []) {
  if (name.length < 3 || name.length > 63) {
    return 'Bucket name must be between 3 and 63 characters.'
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) {
    return 'Use lowercase letters, numbers, periods, and hyphens only.'
  }
  if (/\.\.|-\./.test(name) || /\.-/.test(name)) {
    return 'Bucket names cannot contain adjacent or improperly adjacent periods and hyphens.'
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(name)) {
    return 'Bucket name cannot be formatted as an IP address.'
  }
  if (RESERVED_BUCKET_NAMES.includes(name) || existingNames.includes(name)) {
    return 'A bucket with this name already exists.'
  }
  return null
}

export function createBucket(name: string, region = 'US East (N. Virginia)') {
  return {
    name,
    region,
    createdAt: new Date().toISOString(),
    objects: [],
  }
}
