import { createContext } from 'react'

export type Region = 'us-east-1' | 'eu-west-1' | 'eu-central-1'
export type StorageClass =
  | 'STANDARD'
  | 'INTELLIGENT_TIERING'
  | 'STANDARD_IA'
  | 'ONE_ZONE_IA'
  | 'GLACIER_IR'
  | 'GLACIER'
  | 'DEEP_ARCHIVE'
  | 'EXPRESS_ONE_ZONE'

export type LifecycleRule = {
  id: string
  name: string
  status: 'Enabled' | 'Disabled'
  prefix: string
  transitionAfterDays: number
  storageClass: Exclude<StorageClass, 'STANDARD'>
  expireAfterDays: number
  expireNoncurrentDays: number
  removeExpiredDeleteMarkers: boolean
  abortIncompleteMultipartDays: number
}

export type ReplicationRule = {
  id: string
  name: string
  status: 'Enabled' | 'Disabled'
  mode: 'CRR' | 'SRR'
  destinationBucket: string
  prefix: string
  replicateDeleteMarkers: boolean
  statusLabel: 'Replicated' | 'Pending'
}

export type InventoryConfiguration = {
  id: string
  name: string
  status: 'Enabled' | 'Disabled'
  destination: string
  format: 'CSV' | 'Apache ORC' | 'Apache Parquet'
  schedule: 'Daily' | 'Weekly'
}

export type BatchOperation = {
  id: string
  operation: 'Copy' | 'Restore' | 'Replace tags'
  status: 'Completed' | 'Running'
  manifestObjects: number
  createdAt: string
}

export type Bucket = {
  name: string
  region: Region
  createdAt: string
  objectOwnership: 'bucket-owner-enforced' | 'bucket-owner-preferred' | 'object-writer'
  blockPublicAccess: boolean
  versioning: 'Enabled' | 'Suspended'
  encryption: 'SSE-S3' | 'SSE-KMS'
  tags: Record<string, string>
  objects: S3Object[]
  policy: string
  cors: string
  aclEnabled: boolean
  lifecycleRules: LifecycleRule[]
  simulatedDay: number
  replicationRules: ReplicationRule[]
  inventoryConfigurations: InventoryConfiguration[]
  batchOperations: BatchOperation[]
  metrics: { getRequests: number; putRequests: number; deleteRequests: number; bytesStored: number }
  storageLensEnabled: boolean
  websiteEnabled: boolean
  websiteIndex: string
  websiteError: string
  serverLogging: boolean
  loggingDestination: string
  transferAcceleration: boolean
  requesterPays: boolean
  objectLock: boolean
  eventNotifications: Array<{ id: string; name: string; events: string[]; destination: string }>
  accessPoints: Array<{ name: string; network: 'Internet' | 'VPC'; status: 'Active' }>
  multiRegionAccessPoints: Array<{ name: string; regions: Region[]; status: 'Active' }>
}

export type S3Object = {
  key: string
  size: number
  type: string
  etag: string
  checksum: string
  storageClass: StorageClass
  encryption: 'SSE-S3' | 'SSE-KMS'
  createdAt: string
  metadata: Record<string, string>
  tags: Record<string, string>
  isFolder?: boolean
  parts: number
  versionId: string
  deleteMarker?: boolean
  versions?: S3ObjectVersion[]
  retentionMode?: 'Governance' | 'Compliance'
  retainUntil?: string
  legalHold?: boolean
}

export type S3ObjectVersion = {
  versionId: string
  size: number
  type: string
  createdAt: string
  storageClass: StorageClass
  checksum: string
}

export type SimulationState = {
  region: Region
  resetVersion: number
  buckets: Bucket[]
}

export const SimulationContext = createContext<{
  state: SimulationState
  setRegion: (region: Region) => void
  resetSimulation: () => void
  createBucket: (bucket: Omit<Bucket, 'createdAt' | 'versioning' | 'encryption' | 'tags' | 'objects' | 'policy' | 'cors' | 'aclEnabled' | 'lifecycleRules' | 'simulatedDay' | 'replicationRules' | 'inventoryConfigurations' | 'batchOperations' | 'metrics' | 'storageLensEnabled' | 'websiteEnabled' | 'websiteIndex' | 'websiteError' | 'serverLogging' | 'loggingDestination' | 'transferAcceleration' | 'requesterPays' | 'objectLock' | 'eventNotifications' | 'accessPoints' | 'multiRegionAccessPoints'>) => string | null
  deleteBucket: (name: string) => string | null
  uploadObject: (bucketName: string, file: File, key: string) => Promise<string | null>
  deleteObject: (bucketName: string, key: string) => Promise<string | null>
  copyObject: (sourceBucket: string, sourceKey: string, destinationBucket: string, destinationKey: string) => Promise<string | null>
  createFolder: (bucketName: string, prefix: string) => string | null
  setBlockPublicAccess: (bucketName: string, enabled: boolean) => void
  setObjectOwnership: (bucketName: string, ownership: Bucket['objectOwnership']) => void
  setBucketEncryption: (bucketName: string, encryption: Bucket['encryption']) => void
  setBucketPolicy: (bucketName: string, policy: string) => string | null
  setBucketCors: (bucketName: string, cors: string) => string | null
  setAclEnabled: (bucketName: string, enabled: boolean) => void
  setBucketVersioning: (bucketName: string, enabled: boolean) => void
  setLifecycleRules: (bucketName: string, rules: LifecycleRule[]) => void
  advanceSimulatedTime: (bucketName: string, days: number) => void
  setObjectStorageClass: (bucketName: string, key: string, storageClass: StorageClass) => void
  restoreObjectVersion: (bucketName: string, key: string, versionId: string) => void
  deleteObjectVersion: (bucketName: string, key: string, versionId: string) => void
  setReplicationRules: (bucketName: string, rules: ReplicationRule[]) => void
  setInventoryConfigurations: (bucketName: string, configurations: InventoryConfiguration[]) => void
  setStorageLensEnabled: (bucketName: string, enabled: boolean) => void
  createBatchOperation: (bucketName: string, operation: BatchOperation['operation']) => void
  executeReplication: (bucketName: string) => void
  recordGetRequest: (bucketName: string) => void
  updateBucketFeatures: (bucketName: string, changes: Partial<Bucket>) => void
  setBucketTags: (bucketName: string, tags: Record<string, string>) => void
  setObjectMetadataTags: (bucketName: string, key: string, metadata: Record<string, string>, tags: Record<string, string>) => void
  setObjectLockSettings: (bucketName: string, key: string, retentionMode: 'Governance' | 'Compliance', retainUntil: string, legalHold: boolean) => void
} | null>(null)
