import { buildVersionTimeline } from './versionModel'
import { classLabel } from './storageClasses'
import type { Bucket, LifecycleRule, ObjectVersion, S3Object } from '../store/s3SimulatorStore'

export type CliPayload = {
  command: string
  json: string
}

const requestId = () =>
  crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()

const responseMetadata = () => ({
  RequestId: requestId(),
  HTTPStatusCode: 200,
  HTTPHeaders: {
    'x-amz-id-2': crypto.randomUUID(),
    'x-amz-request-id': requestId(),
    server: 'AmazonS3',
  },
  RetryAttempts: 0,
})

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9._:/=+@-]+$/.test(value)) return value
  return `"${value.replace(/(["\\])/g, '\\$1')}"`
}

function json(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

export function createBucketCommand(input: {
  name: string
  region: string
  versioning?: 'Unversioned' | 'Enabled' | 'Suspended'
  blockPublicAccess?: boolean
}): CliPayload {
  const location = input.region === 'us-east-1' ? '' : ` --create-bucket-configuration LocationConstraint=${input.region}`
  return {
    command: `aws s3api create-bucket --bucket ${shellQuote(input.name)} --region ${input.region}${location}`,
    json: json({
      Location: `/${input.name}`,
      BucketArn: `arn:aws:s3:::${input.name}`,
      Versioning: input.versioning ?? 'Unversioned',
      BlockPublicAccess: input.blockPublicAccess ?? true,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function deleteBucketCommand(bucketName: string): CliPayload {
  return {
    command: `aws s3api delete-bucket --bucket ${shellQuote(bucketName)}`,
    json: json({ ResponseMetadata: responseMetadata() }),
  }
}

export function putBucketVersioningCommand(
  bucketName: string,
  status: 'Unversioned' | 'Enabled' | 'Suspended',
): CliPayload {
  const awsStatus = status === 'Enabled' ? 'Enabled' : 'Suspended'
  return {
    command: `aws s3api put-bucket-versioning --bucket ${shellQuote(bucketName)} --versioning-configuration Status=${awsStatus}`,
    json: json({ Bucket: bucketName, VersioningConfiguration: { Status: awsStatus }, ResponseMetadata: responseMetadata() }),
  }
}

export function getBucketVersioningCommand(bucketName: string, status: string): CliPayload {
  return {
    command: `aws s3api get-bucket-versioning --bucket ${shellQuote(bucketName)}`,
    json: json({ Status: status === 'Unversioned' ? undefined : status, ResponseMetadata: responseMetadata() }),
  }
}

export function putObjectCommand(input: {
  bucket: string
  key: string
  size: number
  storageClass: string
  contentType?: string
  metadata?: Record<string, string>
  tags?: Record<string, string>
  versionId: string
  etag: string
}): CliPayload {
  const metadataFlags = Object.entries(input.metadata ?? {})
    .map(([key, value]) => ` --metadata ${shellQuote(`${key}=${value}`)}`)
    .join('')
  const tagging = Object.entries(input.tags ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  return {
    command: `aws s3api put-object --bucket ${shellQuote(input.bucket)} --key ${shellQuote(input.key)} --body ${shellQuote(input.key.split('/').pop() || 'object.bin')} --content-type ${shellQuote(input.contentType ?? 'application/octet-stream')} --storage-class ${input.storageClass}${metadataFlags}${tagging ? ` --tagging ${shellQuote(tagging)}` : ''}`,
    json: json({
      ETag: input.etag,
      VersionId: input.versionId,
      ServerSideEncryption: 'AES256',
      StorageClass: input.storageClass,
      Size: input.size,
      Key: input.key,
      Bucket: input.bucket,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function listObjectsV2Command(bucket: Bucket, prefix = ''): CliPayload {
  const contents = bucket.objects
    .filter((object) => !object.deleteMarker && !object.isFolder && (!prefix || object.key.startsWith(prefix)))
    .map((object) => ({
      Key: object.key,
      LastModified: object.createdAt,
      ETag: object.etag,
      Size: object.size,
      StorageClass: object.storageClass,
    }))
  return {
    command: `aws s3api list-objects-v2 --bucket ${shellQuote(bucket.name)}${prefix ? ` --prefix ${shellQuote(prefix)}` : ''}`,
    json: json({
      IsTruncated: false,
      Contents: contents,
      Name: bucket.name,
      Prefix: prefix || undefined,
      KeyCount: contents.length,
      MaxKeys: 1000,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function listObjectVersionsCommand(bucket: Bucket, prefix?: string): CliPayload {
  const versions: unknown[] = []
  const deleteMarkers: unknown[] = []
  for (const object of bucket.objects.filter((candidate) => !prefix || candidate.key.startsWith(prefix))) {
    for (const entry of buildVersionTimeline(object)) {
      if (entry.deleteMarker) {
        deleteMarkers.push({
          Key: object.key,
          VersionId: entry.versionId,
          IsLatest: entry.isCurrent,
          LastModified: entry.createdAt,
          Owner: { DisplayName: 'simulator', ID: 'simulator-owner' },
        })
      } else {
        versions.push({
          ETag: entry.etag,
          Size: entry.size,
          StorageClass: entry.storageClass,
          Key: object.key,
          VersionId: entry.versionId,
          IsLatest: entry.isCurrent,
          LastModified: entry.createdAt,
          Owner: { DisplayName: 'simulator', ID: 'simulator-owner' },
        })
      }
    }
  }
  return {
    command: `aws s3api list-object-versions --bucket ${shellQuote(bucket.name)}${prefix ? ` --prefix ${shellQuote(prefix)}` : ''}`,
    json: json({
      Versions: versions,
      DeleteMarkers: deleteMarkers,
      Name: bucket.name,
      Prefix: prefix || undefined,
      MaxKeys: 1000,
      IsTruncated: false,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function headObjectCommand(bucket: Bucket, key: string, versionId?: string): CliPayload {
  const object = bucket.objects.find((candidate) => candidate.key === key)
  const entry = object ? buildVersionTimeline(object).find((version) =>
    versionId ? version.versionId === versionId : version.isCurrent,
  ) : undefined
  return {
    command: `aws s3api head-object --bucket ${shellQuote(bucket.name)} --key ${shellQuote(key)}${versionId ? ` --version-id ${shellQuote(versionId)}` : ''}`,
    json: json(entry ? {
      AcceptRanges: 'bytes',
      LastModified: entry.createdAt,
      ContentLength: entry.size,
      ETag: entry.etag,
      ContentType: entry.type,
      StorageClass: entry.storageClass,
      VersionId: entry.versionId,
      Metadata: object?.metadata ?? {},
      ResponseMetadata: responseMetadata(),
    } : {
      __error: {
        Code: 'NoSuchKey',
        Message: 'The specified key does not exist.',
      },
      ResponseMetadata: { ...responseMetadata(), HTTPStatusCode: 404 },
    }),
  }
}

export function deleteObjectCommand(
  bucket: Bucket,
  key: string,
  versionId?: string,
  markerId?: string,
): CliPayload {
  const versioned = bucket.versioning === "Enabled";
  if (versioned && !versionId) {
    const marker = markerId ?? crypto.randomUUID().replace(/-/g, "");
    return {
      command: `aws s3api delete-object --bucket ${shellQuote(bucket.name)} --key ${shellQuote(key)}`,
      json: json({
        DeleteMarker: true,
        DeleteMarkerVersionId: marker,
        VersionId: marker,
        Key: key,
        Bucket: bucket.name,
        ResponseMetadata: responseMetadata(),
      }),
    }
  }
  return {
    command: `aws s3api delete-object --bucket ${shellQuote(bucket.name)} --key ${shellQuote(key)}${versionId ? ` --version-id ${shellQuote(versionId)}` : ''}`,
    json: json({
      DeleteMarker: false,
      VersionId: versionId ?? 'null',
      Key: key,
      Bucket: bucket.name,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function restoreVersionCommand(bucket: Bucket, key: string, versionId: string): CliPayload {
  return {
    command: `aws s3api copy-object --bucket ${shellQuote(bucket.name)} --key ${shellQuote(key)} --copy-source ${shellQuote(`${bucket.name}/${key}?versionId=${versionId}`)} --metadata-directive COPY`,
    json: json({
      CopyObjectResult: {
        ETag: `"${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}"`,
        LastModified: new Date().toISOString(),
      },
      CopySourceVersionId: versionId,
      VersionId: bucket.versioning === 'Enabled' ? crypto.randomUUID().replace(/-/g, '').slice(0, 32) : 'null',
      ResponseMetadata: responseMetadata(),
    }),
  }
}

export function changeStorageClassCommand(input: {
  bucket: string
  key: string
  storageClass: string
  versionId: string
}): CliPayload {
  return {
    command: `aws s3api copy-object --bucket ${shellQuote(input.bucket)} --key ${shellQuote(input.key)} --copy-source ${shellQuote(`${input.bucket}/${input.key}`)} --storage-class ${input.storageClass} --metadata-directive COPY`,
    json: json({
      CopyObjectResult: {
        ETag: `"${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}"`,
        LastModified: new Date().toISOString(),
      },
      VersionId: input.versionId,
      StorageClass: input.storageClass,
      ResponseMetadata: responseMetadata(),
    }),
  }
}

function transitionJson(transitions: Array<{ days: number; storageClass: string }> | undefined) {
  return (transitions ?? [])
    .slice()
    .sort((a, b) => a.days - b.days)
    .map((transition) => ({
      Days: transition.days,
      StorageClass: transition.storageClass,
    }))
}

function lifecycleRuleJson(rule: LifecycleRule) {
  const filter: Record<string, unknown> = {}
  if (rule.prefix) filter.Prefix = rule.prefix
  if (rule.filterTagKey) filter.Tag = { Key: rule.filterTagKey, Value: rule.filterTagValue ?? '' }
  if (typeof rule.filterSizeGreaterThan === 'number' || typeof rule.filterSizeLessThan === 'number') {
    filter.And = {
      Prefix: rule.prefix ?? '',
      ...(rule.filterTagKey ? { Tags: [{ Key: rule.filterTagKey, Value: rule.filterTagValue ?? '' }] } : {}),
      ...(typeof rule.filterSizeGreaterThan === 'number' ? { ObjectSizeGreaterThan: rule.filterSizeGreaterThan } : {}),
      ...(typeof rule.filterSizeLessThan === 'number' ? { ObjectSizeLessThan: rule.filterSizeLessThan } : {}),
    }
  }
  const transitions = rule.transitions?.length
    ? rule.transitions
    : rule.targetClass
      ? [{ days: rule.transitionDays, storageClass: rule.targetClass }]
      : []
  return {
    ID: rule.id,
    Status: rule.status ?? 'Enabled',
    Filter: filter,
    ...(transitions.length ? { Transitions: transitionJson(transitions) } : {}),
    ...(rule.expirationDays ? { Expiration: { Days: rule.expirationDays } } : {}),
    ...(rule.noncurrentTransitions?.length
      ? { NoncurrentVersionTransitions: transitionJson(rule.noncurrentTransitions) }
      : {}),
    ...(rule.noncurrentExpirationDays
      ? { NoncurrentVersionExpiration: { NoncurrentDays: rule.noncurrentExpirationDays } }
      : {}),
    ...(rule.abortIncompleteMultipartDays
      ? { AbortIncompleteMultipartUpload: { DaysAfterInitiation: rule.abortIncompleteMultipartDays } }
      : {}),
  }
}

export function putLifecycleCommand(bucketName: string, rules: LifecycleRule[]): CliPayload {
  const configuration = { Rules: rules.map(lifecycleRuleJson) }
  return {
    command: `aws s3api put-bucket-lifecycle-configuration --bucket ${shellQuote(bucketName)} --lifecycle-configuration file://lifecycle.json`,
    json: json(configuration),
  }
}

export function getLifecycleCommand(bucketName: string, rules: LifecycleRule[]): CliPayload {
  return {
    command: `aws s3api get-bucket-lifecycle-configuration --bucket ${shellQuote(bucketName)}`,
    json: json({ Rules: rules.map(lifecycleRuleJson), ResponseMetadata: responseMetadata() }),
  }
}

export function deleteLifecycleCommand(bucketName: string): CliPayload {
  return {
    command: `aws s3api delete-bucket-lifecycle --bucket ${shellQuote(bucketName)}`,
    json: json({ ResponseMetadata: responseMetadata() }),
  }
}

export function createFolderCommand(bucketName: string, key: string): CliPayload {
  return {
    command: `aws s3api put-object --bucket ${shellQuote(bucketName)} --key ${shellQuote(key)}`,
    json: json({ ETag: '"d41d8cd98f00b204e9800998ecf8427e"', Key: key, Bucket: bucketName, ResponseMetadata: responseMetadata() }),
  }
}

export function storageClassSummary(storageClass: string): string {
  return classLabel(storageClass)
}

export function describeVersion(object: S3Object, versionId: string): ObjectVersion | undefined {
  return object.versions?.find((version) => version.versionId === versionId)
}

export const __test = { lifecycleRuleJson }
