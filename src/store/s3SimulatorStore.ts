import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { validateBucketName } from '../engine/buckets'
import { calculateParts } from '../engine/multipart'
import {
  clearBucketBlobs,
  clearObjectBlobs,
  deleteAllObjectVersionBlobs,
  deleteObjectBlob,
  deleteObjectVersionBlob,
  loadObjectBlob,
  loadObjectVersionBlob,
  saveObjectBlob,
  saveObjectVersionBlob,
} from '../storage/simulationDb'

export type StorageClass =
  | 'STANDARD'
  | 'INTELLIGENT_TIERING'
  | 'STANDARD_IA'
  | 'ONE_ZONE_IA'
  | 'GLACIER_IR'
  | 'GLACIER'
  | 'DEEP_ARCHIVE'
  | 'EXPRESS_ONE_ZONE'
  | 'REDUCED_REDUNDANCY'

export type ObjectVersion = {
  versionId: string
  size: number
  type: string
  createdAt: string
  storageClass: StorageClass
  etag: string
  parts: number
  deleteMarker?: boolean
}

export type S3Object = {
  key: string
  size: number
  type: string
  storageClass: StorageClass
  createdAt: string
  etag: string
  parts: number
  versionId: string
  deleteMarker?: boolean
  versions?: ObjectVersion[]
  metadata: Record<string, string>
  tags: Record<string, string>
  isFolder?: boolean
}

export type BucketMetrics = {
  getRequests: number
  putRequests: number
  deleteRequests: number
}

export type Bucket = {
  name: string
  region: string
  createdAt: string
  access: 'Bucket and objects not public' | 'Objects can be public' | 'Public'
  blockPublicAccess: boolean
  versioning: 'Enabled' | 'Suspended'
  objectOwnership: 'Bucket owner enforced' | 'Bucket owner preferred' | 'Object writer'
  encryption: 'SSE-S3' | 'SSE-KMS' | 'DSSE-KMS'
  tags: Record<string, string>
  objects: S3Object[]
  policy: string
  cors: string
  kmsKey: string
  bucketKey: boolean
  objectLock: boolean
  websiteHosting: {
    enabled: boolean
    indexDocument: string
    errorDocument: string
  }
  lifecycleRules: Array<{
    id: string
    name: string
    status: 'Enabled' | 'Disabled'
    prefix: string
    transitionDays: number
    targetClass: StorageClass
  }>
  replicationRules: Array<{
    id: string
    name: string
    status: 'Enabled' | 'Disabled'
    destination: string
    mode: 'CRR' | 'SRR'
    prefix: string
    replicateDeleteMarkers: boolean
    statusLabel: 'Pending' | 'Replicated'
  }>
  inventoryName: string
  inventoryEnabled: boolean
  simulatedDay: number
  metrics: BucketMetrics
  accessPoints: Array<{
    id: string
    name: string
    bucketName: string
    network: 'Internet' | 'VPC'
    status: 'Active'
  }>
}

type Activity = {
  id: string
  action: string
  resource: string
  createdAt: string
  status: 'Success' | 'Warning' | 'Error'
}

export type CreateBucketInput = Pick<
  Bucket,
  'name' | 'region' | 'blockPublicAccess' | 'versioning' | 'objectOwnership' | 'encryption'
>

type SimulatorState = {
  buckets: Bucket[]
  activity: Activity[]
  region: string
  createBucket: (input: CreateBucketInput) => string | null
  deleteBucket: (name: string) => string | null
  emptyBucket: (name: string) => string | null
  uploadObject: (bucketName: string, key: string, size: number, type: string, blob?: Blob) => Promise<void>
  deleteObject: (bucketName: string, key: string) => Promise<void>
  createFolder: (bucketName: string, prefix: string) => void
  setRegion: (region: string) => void
  updateBucket: (name: string, changes: Partial<Bucket>) => void
  setLifecycleRules: (name: string, rules: Bucket['lifecycleRules']) => void
  setObjectStorageClass: (bucketName: string, key: string, storageClass: StorageClass) => void
  setReplicationRules: (name: string, rules: Bucket['replicationRules']) => void
  runReplication: (name: string) => Promise<void>
  advanceSimulatedTime: (name: string, days: number) => void
  restoreObjectVersion: (bucketName: string, key: string, versionId: string) => Promise<void>
  deleteObjectVersion: (bucketName: string, key: string, versionId: string) => Promise<void>
  recordGetRequest: (bucketName: string) => void
  createAccessPoint: (bucketName: string, name: string, network: 'Internet' | 'VPC') => void
  deleteAccessPoint: (bucketName: string, accessPointId: string) => void
  setAccessPoints: (bucketName: string, accessPoints: Bucket['accessPoints']) => void
  reset: () => void
  logActivity: (action: string, resource: string, status?: Activity['status']) => void
}

const emptyMetrics = (): BucketMetrics => ({ getRequests: 0, putRequests: 0, deleteRequests: 0 })

const nextVersionId = () => `v-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
const nextDeleteMarkerId = () => `dm-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
const nextReplicationId = () => `rep-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

function createEtag() {
  return `"${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}"`
}

function toVersion(object: S3Object): ObjectVersion {
  return {
    versionId: object.versionId,
    size: object.size,
    type: object.type,
    createdAt: object.createdAt,
    storageClass: object.storageClass,
    etag: object.etag,
    parts: object.parts,
    deleteMarker: object.deleteMarker,
  }
}

function normalizeObject(input: Partial<S3Object> & { key: string }): S3Object {
  return {
    ...input,
    key: input.key,
    size: input.size ?? 0,
    type: input.type ?? 'application/octet-stream',
    storageClass: input.storageClass ?? 'STANDARD',
    createdAt: input.createdAt ?? new Date().toISOString(),
    etag: input.etag ?? '',
    parts: input.parts ?? 1,
    versionId: input.versionId ?? 'null',
    versions: (Array.isArray(input.versions) ? input.versions : []).map((version) => ({
      versionId: version.versionId ?? 'null',
      size: version.size ?? 0,
      type: version.type ?? 'application/octet-stream',
      createdAt: version.createdAt ?? new Date().toISOString(),
      storageClass: version.storageClass ?? 'STANDARD',
      etag: version.etag ?? '',
      parts: version.parts ?? 1,
      deleteMarker: version.deleteMarker,
    })),
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {},
    tags: input.tags && typeof input.tags === 'object' && !Array.isArray(input.tags) ? input.tags : {},
  }
}

export function normalizeBucket(input: Partial<Bucket> & { name: string }): Bucket {
  const objects = (Array.isArray(input.objects) ? input.objects : []).map(normalizeObject)
  const uniqueObjects = [...new Map(objects.map((object) => [object.key, object])).values()]
  return {
    ...input,
    name: input.name,
    region: input.region ?? 'us-east-1',
    createdAt: input.createdAt ?? new Date().toISOString(),
    access: input.access ?? 'Bucket and objects not public',
    blockPublicAccess: input.blockPublicAccess ?? true,
    versioning: input.versioning ?? 'Suspended',
    objectOwnership: input.objectOwnership ?? 'Bucket owner enforced',
    encryption: input.encryption ?? 'SSE-S3',
    tags: input.tags && typeof input.tags === 'object' && !Array.isArray(input.tags) ? input.tags : {},
    objects: uniqueObjects,
    policy: input.policy ?? '',
    cors: input.cors ?? '',
    kmsKey: input.kmsKey ?? 'alias/aws/s3',
    bucketKey: input.bucketKey ?? true,
    objectLock: input.objectLock ?? false,
    websiteHosting: {
      enabled: input.websiteHosting?.enabled ?? false,
      indexDocument: input.websiteHosting?.indexDocument ?? 'index.html',
      errorDocument: input.websiteHosting?.errorDocument ?? 'error.html',
    },
    lifecycleRules: Array.isArray(input.lifecycleRules) ? input.lifecycleRules : [],
    replicationRules: Array.isArray(input.replicationRules) ? input.replicationRules : [],
    inventoryName: input.inventoryName ?? '',
    inventoryEnabled: input.inventoryEnabled ?? false,
    simulatedDay: input.simulatedDay ?? 0,
    accessPoints: Array.isArray(input.accessPoints) ? input.accessPoints : [],
    metrics: {
      getRequests: input.metrics?.getRequests ?? 0,
      putRequests: input.metrics?.putRequests ?? 0,
      deleteRequests: input.metrics?.deleteRequests ?? 0,
    },
  }
}

const seededBuckets: Bucket[] = [
  {
    name: 'cloud-club-demo',
    region: 'us-east-1',
    createdAt: '2026-11-15T09:30:00.000Z',
    access: 'Bucket and objects not public',
    blockPublicAccess: true,
    versioning: 'Enabled',
    objectOwnership: 'Bucket owner enforced',
    encryption: 'SSE-S3',
    tags: { Environment: 'Demo', Event: 'AWS Cloud Club' },
    policy: '',
    cors: '',
    kmsKey: 'alias/aws/s3',
    bucketKey: true,
    objectLock: false,
    websiteHosting: { enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' },
    lifecycleRules: [],
    replicationRules: [],
    inventoryName: '',
    inventoryEnabled: false,
    simulatedDay: 0,
    accessPoints: [],
    metrics: emptyMetrics(),
    objects: [
      { key: 'images/event.jpg', size: 284000, type: 'image/jpeg', storageClass: 'STANDARD', createdAt: '2026-11-20T14:12:00.000Z', etag: '"4f5a2c8a76e8d41e6c01f4b3dd90a101"', parts: 1, versionId: 'null', versions: [], metadata: { 'x-amz-meta-event': 'cloud-club' }, tags: { Category: 'Images' } },
      { key: 'documents/s3-guide.pdf', size: 1240000, type: 'application/pdf', storageClass: 'STANDARD_IA', createdAt: '2026-11-18T10:08:00.000Z', etag: '"7b91decb2ad0b9c8f18f4a86b31f2c20"', parts: 1, versionId: 'null', versions: [], metadata: {}, tags: {} },
      { key: 'data/users.json', size: 12400, type: 'application/json', storageClass: 'STANDARD', createdAt: '2026-11-21T08:44:00.000Z', etag: '"a8e31c74dd1c9ad2a7b4d90c55c118a3"', parts: 1, versionId: 'null', versions: [], metadata: {}, tags: {} },
    ],
  },
  {
    name: 'cloud-club-archive',
    region: 'eu-west-3',
    createdAt: '2026-10-22T16:20:00.000Z',
    access: 'Bucket and objects not public',
    blockPublicAccess: true,
    versioning: 'Suspended',
    objectOwnership: 'Bucket owner enforced',
    encryption: 'SSE-KMS',
    tags: { Purpose: 'Archive' },
    policy: '',
    cors: '',
    kmsKey: 'alias/archive',
    bucketKey: true,
    objectLock: false,
    websiteHosting: { enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' },
    lifecycleRules: [],
    replicationRules: [],
    inventoryName: '',
    inventoryEnabled: false,
    simulatedDay: 0,
    accessPoints: [],
    metrics: emptyMetrics(),
    objects: [
      { key: 'archives/2026.zip', size: 18500000, type: 'application/zip', storageClass: 'GLACIER', createdAt: '2026-10-23T11:00:00.000Z', etag: '"1a7ce94de5b2ac42fe4c69c3a0d83b2e"', parts: 2, versionId: 'null', versions: [], metadata: {}, tags: {} },
    ],
  },
]

export const useS3SimulatorStore = create<SimulatorState>()(
  persist(
    (set, get) => ({
      buckets: seededBuckets.map((bucket) => normalizeBucket(bucket)),
      activity: [],
      region: 'us-east-1',
      createBucket: (input) => {
        const name = input.name.trim()
        const validationError = validateBucketName(name, get().buckets.map((bucket) => bucket.name))
        if (validationError) {
          return validationError.startsWith('A bucket')
            ? `BucketAlreadyExists: ${validationError}`
            : `InvalidBucketName: ${validationError}`
        }
        const bucket: Bucket = {
          ...input,
          name,
          createdAt: new Date().toISOString(),
          access: input.blockPublicAccess ? 'Bucket and objects not public' : 'Objects can be public',
          tags: {},
          objects: [],
          policy: '',
          cors: '',
          kmsKey: 'alias/aws/s3',
          bucketKey: true,
          objectLock: false,
          websiteHosting: { enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' },
          lifecycleRules: [],
          replicationRules: [],
          inventoryName: '',
          inventoryEnabled: false,
          simulatedDay: 0,
          accessPoints: [],
          metrics: emptyMetrics(),
        }
        set((state) => ({ buckets: [...state.buckets, bucket] }))
        get().logActivity('CreateBucket', `arn:aws:s3:::${bucket.name}`, 'Success')
        return null
      },
      deleteBucket: (name) => {
        const bucket = get().buckets.find((item) => item.name === name)
        if (!bucket) return 'NoSuchBucket: The specified bucket does not exist.'
        if (bucket.objects.length) return 'BucketNotEmpty: The bucket you tried to delete is not empty.'
        set((state) => ({ buckets: state.buckets.filter((item) => item.name !== name) }))
        void clearBucketBlobs(name)
        get().logActivity('DeleteBucket', `arn:aws:s3:::${name}`, 'Success')
        return null
      },
      emptyBucket: (name) => {
        const bucket = get().buckets.find((item) => item.name === name)
        if (!bucket) return 'NoSuchBucket: The specified bucket does not exist.'
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === name ? { ...item, objects: [] } : item),
        }))
        void clearBucketBlobs(name)
        get().logActivity('EmptyBucket', `arn:aws:s3:::${name}`, 'Success')
        return null
      },
      uploadObject: async (bucketName, key, size, type, blob) => {
        const normalizedKey = key.trim().replace(/^\/+/, '')
        if (!normalizedKey) return
        const bucket = get().buckets.find((item) => item.name === bucketName)
        if (!bucket) return
        const existing = bucket.objects.find((object) => object.key === normalizedKey)
        const versioningEnabled = bucket.versioning === 'Enabled'
        const versionId = versioningEnabled ? nextVersionId() : 'null'
        const versions = existing?.versions ? [...existing.versions] : []
        const preserveExisting = existing && !existing.isFolder && (versioningEnabled || existing.versionId !== 'null')
        if (existing && preserveExisting) {
          if (!existing.deleteMarker) {
            const currentBlob = await loadObjectBlob(bucketName, normalizedKey)
            if (currentBlob) {
              await saveObjectVersionBlob(bucketName, normalizedKey, existing.versionId, currentBlob)
            }
          }
          versions.push(toVersion(existing))
        }
        await saveObjectBlob(
          bucketName,
          normalizedKey,
          blob ?? new Blob([`Simulated object content for ${normalizedKey}\n`], { type: type || 'application/octet-stream' }),
        )
        const object: S3Object = {
          key: normalizedKey,
          size,
          type: type || 'application/octet-stream',
          storageClass: 'STANDARD',
          createdAt: new Date().toISOString(),
          etag: createEtag(),
          parts: calculateParts(size),
          versionId,
          versions,
          metadata: {},
          tags: {},
        }
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? {
                ...item,
                objects: [...item.objects.filter((candidate) => candidate.key !== normalizedKey), object],
                metrics: {
                  getRequests: item.metrics?.getRequests ?? 0,
                  putRequests: (item.metrics?.putRequests ?? 0) + 1,
                  deleteRequests: item.metrics?.deleteRequests ?? 0,
                },
              }
            : item),
        }))
        get().logActivity('PutObject', `arn:aws:s3:::${bucketName}/${normalizedKey}`, 'Success')
      },
      deleteObject: async (bucketName, key) => {
        const bucket = get().buckets.find((item) => item.name === bucketName)
        const object = bucket?.objects.find((item) => item.key === key)
        if (!bucket || !object) return
        if (bucket.versioning === 'Enabled') {
          if (object.deleteMarker) return
          const currentBlob = await loadObjectBlob(bucketName, key)
          if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob)
          const versions = [...(object.versions ?? []), toVersion(object)]
          set((state) => ({
            buckets: state.buckets.map((item) => item.name === bucketName
              ? {
                  ...item,
                  objects: item.objects.map((candidate) => candidate.key === key
                    ? { ...candidate, deleteMarker: true, versionId: nextDeleteMarkerId(), versions }
                    : candidate),
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: item.metrics?.putRequests ?? 0,
                    deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                  },
                }
              : item),
          }))
        } else {
          set((state) => ({
            buckets: state.buckets.map((item) => item.name === bucketName
              ? {
                  ...item,
                  objects: item.objects.filter((candidate) => candidate.key !== key),
                  metrics: {
                    getRequests: item.metrics?.getRequests ?? 0,
                    putRequests: item.metrics?.putRequests ?? 0,
                    deleteRequests: (item.metrics?.deleteRequests ?? 0) + 1,
                  },
                }
              : item),
          }))
          await deleteObjectBlob(bucketName, key)
          await Promise.all((object.versions ?? []).map((version) =>
            deleteObjectVersionBlob(bucketName, key, version.versionId),
          ))
          await deleteAllObjectVersionBlobs(bucketName, key)
        }
        get().logActivity('DeleteObject', `arn:aws:s3:::${bucketName}/${key}`, 'Success')
      },
      createFolder: (bucketName, prefix) => {
        const normalized = prefix.trim().replace(/^\/+|\/+$/g, '')
        if (!normalized) return
        const key = `${normalized}/`
        const bucket = get().buckets.find((item) => item.name === bucketName)
        if (!bucket || bucket.objects.some((object) => object.key === key)) return
        const object: S3Object = {
          key,
          size: 0,
          type: 'folder',
          storageClass: 'STANDARD',
          createdAt: new Date().toISOString(),
          etag: '',
          parts: 0,
          versionId: bucket.versioning === 'Enabled' ? nextVersionId() : 'null',
          versions: [],
          metadata: {},
          tags: {},
          isFolder: true,
        }
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? {
                ...item,
                objects: [...item.objects, object],
                metrics: {
                  getRequests: item.metrics?.getRequests ?? 0,
                  putRequests: (item.metrics?.putRequests ?? 0) + 1,
                  deleteRequests: item.metrics?.deleteRequests ?? 0,
                },
              }
            : item),
        }))
        get().logActivity('CreateFolder', `arn:aws:s3:::${bucketName}/${key}`, 'Success')
      },
      setRegion: (region) => set({ region }),
      updateBucket: (name, changes) =>
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === name ? { ...bucket, ...changes } : bucket),
        })),
      setLifecycleRules: (name, rules) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === name ? { ...bucket, lifecycleRules: rules } : bucket),
        }))
        get().logActivity('PutLifecycleConfiguration', `arn:aws:s3:::${name}`, 'Success')
      },
      setObjectStorageClass: (bucketName, key, storageClass) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === bucketName
            ? { ...bucket, objects: bucket.objects.map((object) => object.key === key ? { ...object, storageClass } : object) }
            : bucket),
        }))
        get().logActivity('PutObjectStorageClass', `arn:aws:s3:::${bucketName}/${key}`, 'Success')
      },
      setReplicationRules: (name, rules) => {
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === name ? { ...bucket, replicationRules: rules } : bucket),
        }))
        get().logActivity('PutReplicationConfiguration', `arn:aws:s3:::${name}`, 'Success')
      },
      createAccessPoint: (bucketName: string, name: string, network: 'Internet' | 'VPC') => {
        const bucket = get().buckets.find((item) => item.name === bucketName)
        const accessPointName = name.trim()
        if (!bucket || !accessPointName || bucket.accessPoints.some((ap) => ap.name === accessPointName)) return
        const accessPoint = {
          id: `ap-${crypto.randomUUID().slice(0, 8)}`,
          name: accessPointName,
          bucketName,
          network,
          status: 'Active' as const,
        }
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? { ...item, accessPoints: [...item.accessPoints, accessPoint] }
            : item),
        }))
        get().logActivity('CreateAccessPoint', `arn:aws:s3:::${bucketName}/accesspoint/${name}`, 'Success')
      },
      deleteAccessPoint: (bucketName: string, accessPointId: string) => {
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? { ...item, accessPoints: item.accessPoints.filter((ap) => ap.id !== accessPointId) }
            : item),
        }))
        get().logActivity('DeleteAccessPoint', `arn:aws:s3:::${bucketName}/accesspoint/${accessPointId}`, 'Success')
      },
      setAccessPoints: (bucketName: string, accessPoints: Bucket['accessPoints']) => {
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? { ...item, accessPoints }
            : item),
        }))
        get().logActivity('PutAccessPoint', `arn:aws:s3:::${bucketName}`, 'Success')
      },
      runReplication: async (name) => {
        const source = get().buckets.find((bucket) => bucket.name === name)
        if (!source) return
        const enabledRules = source.replicationRules.filter((rule) => rule.status === 'Enabled')
        if (!enabledRules.length) return
        const destinationCopies = new Map<string, S3Object[]>()
        const copiedKeys = new Map<string, Set<string>>()
        const replicatedRuleIds = new Set<string>()
        for (const rule of enabledRules) {
          const destination = get().buckets.find((bucket) => bucket.name === rule.destination)
          if (!destination || destination.name === source.name) continue
          replicatedRuleIds.add(rule.id)
          const existingCopies = copiedKeys.get(destination.name) ?? new Set<string>()
          const copies = destinationCopies.get(destination.name) ?? []
          for (const object of source.objects) {
            if (object.isFolder || object.deleteMarker) continue
            if (rule.prefix && !object.key.startsWith(rule.prefix)) continue
            if (existingCopies.has(object.key)) continue
            const blob = await loadObjectBlob(source.name, object.key)
            await saveObjectBlob(
              destination.name,
              object.key,
              blob ?? new Blob([`Replicated object content for ${object.key}\n`], { type: object.type }),
            )
            copies.push({
              ...object,
              versionId: nextReplicationId(),
              versions: [],
              deleteMarker: false,
            })
            existingCopies.add(object.key)
          }
          copiedKeys.set(destination.name, existingCopies)
          destinationCopies.set(destination.name, copies)
        }
        if (!replicatedRuleIds.size) {
          get().logActivity('ReplicateObjects', `arn:aws:s3:::${name}`, 'Warning')
          return
        }
        set((state) => ({
          buckets: state.buckets.map((bucket) => {
            const copies = destinationCopies.get(bucket.name)
            const keys = copiedKeys.get(bucket.name)
            const updated = copies?.length
              ? {
                  ...bucket,
                  objects: [
                    ...bucket.objects.filter((object) => !keys?.has(object.key)),
                    ...copies,
                  ],
                }
              : bucket
            if (bucket.name !== name) return updated
            return {
              ...updated,
              replicationRules: updated.replicationRules.map((rule) => replicatedRuleIds.has(rule.id)
                ? { ...rule, statusLabel: 'Replicated' as const }
                : rule),
            }
          }),
        }))
        get().logActivity('ReplicateObjects', `arn:aws:s3:::${name}`, 'Success')
      },
      advanceSimulatedTime: (name, days) => {
        const bucket = get().buckets.find((item) => item.name === name)
        if (!bucket) return
        const nextDay = (bucket.simulatedDay ?? 0) + Math.max(0, days)
        const rules = bucket.lifecycleRules.filter((rule) => rule.status === 'Enabled')
        const objects = bucket.objects.map((object) => {
          if (object.isFolder || object.deleteMarker) return object
          const matchingRules = rules.filter((rule) =>
            (!rule.prefix || object.key.startsWith(rule.prefix)) && nextDay >= rule.transitionDays,
          )
          if (!matchingRules.length) return object
          const targetClass = matchingRules.reduce((latest, rule) =>
            rule.transitionDays > latest.transitionDays ? rule : latest,
          ).targetClass
          return object.storageClass === targetClass ? object : { ...object, storageClass: targetClass }
        })
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === name ? { ...item, simulatedDay: nextDay, objects } : item),
        }))
        get().logActivity('LifecycleTransition', `arn:aws:s3:::${name}`, 'Success')
      },
      restoreObjectVersion: async (bucketName, key, versionId) => {
        const object = get().buckets.find((bucket) => bucket.name === bucketName)
          ?.objects.find((item) => item.key === key)
        const version = object?.versions?.find((item) => item.versionId === versionId)
        if (!object || !version || version.deleteMarker || object.versionId === versionId) return
        const currentBlob = object.deleteMarker ? undefined : await loadObjectBlob(bucketName, key)
        const versionBlob = await loadObjectVersionBlob(bucketName, key, versionId)
        if (versionBlob) await saveObjectBlob(bucketName, key, versionBlob)
        if (currentBlob) await saveObjectVersionBlob(bucketName, key, object.versionId, currentBlob)
        await deleteObjectVersionBlob(bucketName, key, versionId)
        const versions = (object.versions ?? []).filter((item) => item.versionId !== versionId)
        if (!object.deleteMarker) versions.push(toVersion(object))
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === bucketName
            ? {
                ...bucket,
                objects: bucket.objects.map((item) => item.key === key
                  ? {
                      ...item,
                      size: version.size,
                      type: version.type,
                      createdAt: version.createdAt,
                      storageClass: version.storageClass,
                      etag: version.etag,
                      parts: version.parts,
                      versionId: version.versionId,
                      deleteMarker: false,
                      versions,
                    }
                  : item),
              }
            : bucket),
        }))
        get().logActivity('RestoreObjectVersion', `arn:aws:s3:::${bucketName}/${key}`, 'Success')
      },
      deleteObjectVersion: async (bucketName, key, versionId) => {
        const object = get().buckets.find((bucket) => bucket.name === bucketName)
          ?.objects.find((item) => item.key === key)
        if (!object) return
        if (object.versionId === versionId) {
          const remaining = (object.versions ?? []).filter((item) => item.versionId !== versionId)
          const next = [...remaining].reverse().find((item) => !item.deleteMarker)
          if (next) {
            const blob = await loadObjectVersionBlob(bucketName, key, next.versionId)
            await deleteObjectBlob(bucketName, key)
            if (blob) await saveObjectBlob(bucketName, key, blob)
            await deleteObjectVersionBlob(bucketName, key, next.versionId)
            set((state) => ({
              buckets: state.buckets.map((bucket) => bucket.name === bucketName
                ? {
                    ...bucket,
                    objects: bucket.objects.map((item) => item.key === key
                      ? {
                          ...item,
                          size: next.size,
                          type: next.type,
                          createdAt: next.createdAt,
                          storageClass: next.storageClass,
                          etag: next.etag,
                          parts: next.parts,
                          versionId: next.versionId,
                          deleteMarker: false,
                          versions: remaining.filter((candidate) => candidate.versionId !== next.versionId),
                        }
                      : item),
                  }
                : bucket),
            }))
          } else {
            set((state) => ({
              buckets: state.buckets.map((bucket) => bucket.name === bucketName
                ? { ...bucket, objects: bucket.objects.filter((item) => item.key !== key) }
                : bucket),
            }))
            await deleteObjectBlob(bucketName, key)
            await Promise.all(remaining.map((version) =>
              deleteObjectVersionBlob(bucketName, key, version.versionId),
            ))
            await deleteAllObjectVersionBlobs(bucketName, key)
          }
        } else {
          set((state) => ({
            buckets: state.buckets.map((bucket) => bucket.name === bucketName
              ? {
                  ...bucket,
                  objects: bucket.objects.map((item) => item.key === key
                    ? { ...item, versions: item.versions?.filter((version) => version.versionId !== versionId) }
                    : item),
                }
              : bucket),
          }))
          await deleteObjectVersionBlob(bucketName, key, versionId)
        }
        set((state) => ({
          buckets: state.buckets.map((bucket) => bucket.name === bucketName
            ? {
                ...bucket,
                metrics: {
                  getRequests: bucket.metrics?.getRequests ?? 0,
                  putRequests: bucket.metrics?.putRequests ?? 0,
                  deleteRequests: (bucket.metrics?.deleteRequests ?? 0) + 1,
                },
              }
            : bucket),
        }))
        get().logActivity('DeleteObjectVersion', `arn:aws:s3:::${bucketName}/${key}`, 'Success')
      },
      recordGetRequest: (bucketName) => {
        const bucket = get().buckets.find((item) => item.name === bucketName)
        if (!bucket) return
        set((state) => ({
          buckets: state.buckets.map((item) => item.name === bucketName
            ? {
                ...item,
                metrics: {
                  getRequests: (item.metrics?.getRequests ?? 0) + 1,
                  putRequests: item.metrics?.putRequests ?? 0,
                  deleteRequests: item.metrics?.deleteRequests ?? 0,
                },
              }
            : item),
        }))
      },
      reset: () => {
        void clearObjectBlobs()
        set({ buckets: structuredClone(seededBuckets), activity: [], region: 'us-east-1' })
      },
      logActivity: (action, resource, status = 'Success') =>
        set((state) => ({
          activity: [
            { id: crypto.randomUUID(), action, resource, createdAt: new Date().toISOString(), status },
            ...state.activity,
          ].slice(0, 100),
        })),
    }),
    {
      name: 's3-simulator-state',
      version: 2,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<SimulatorState> | undefined
        const buckets = Array.isArray(persisted?.buckets)
          ? persisted.buckets
            .filter((bucket): bucket is Bucket => Boolean(bucket && typeof bucket.name === 'string'))
            .map((bucket) => normalizeBucket(bucket))
          : seededBuckets.map((bucket) => normalizeBucket(bucket))
        return {
          ...persisted,
          buckets,
        } as SimulatorState
      },
    },
  ),
)
