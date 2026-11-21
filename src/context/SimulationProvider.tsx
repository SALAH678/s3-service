import { useEffect, useReducer, type ReactNode } from 'react'
import { loadSimulationState, saveSimulationState } from '../storage/simulationDb'
import { SimulationContext } from './simulationContext'
import type { Region, SimulationState } from './simulationContext'
import type { Bucket } from './simulationContext'
import type { S3Object } from './simulationContext'
import type { LifecycleRule, StorageClass } from './simulationContext'
import type { ReplicationRule, InventoryConfiguration, BatchOperation } from './simulationContext'
import { deleteObjectBlob, loadObjectBlob, saveObjectBlob } from '../storage/simulationDb'

type SimulationAction =
  | { type: 'set-region'; region: Region }
  | { type: 'hydrate'; state: SimulationState }
  | { type: 'reset' }
  | { type: 'create-bucket'; bucket: Bucket }
  | { type: 'delete-bucket'; name: string }
  | { type: 'upload-object'; bucketName: string; object: import('./simulationContext').S3Object }
  | { type: 'delete-object'; bucketName: string; key: string }
  | { type: 'update-bucket'; bucketName: string; changes: Partial<Bucket> }

const initialState: SimulationState = {
  region: 'us-east-1',
  resetVersion: 0,
  buckets: [],
}

function reducer(state: SimulationState, action: SimulationAction): SimulationState {
  if (action.type === 'hydrate') {
    return {
      ...initialState,
      ...action.state,
      buckets: (action.state.buckets ?? []).map((bucket) => ({
        ...bucket,
        objects: bucket.objects ?? [],
        policy: bucket.policy ?? '',
        cors: bucket.cors ?? '',
        aclEnabled: bucket.aclEnabled ?? false,
        lifecycleRules: bucket.lifecycleRules ?? [],
        simulatedDay: bucket.simulatedDay ?? 0,
        replicationRules: bucket.replicationRules ?? [],
        inventoryConfigurations: bucket.inventoryConfigurations ?? [],
        batchOperations: bucket.batchOperations ?? [],
        metrics: bucket.metrics ?? { getRequests: 0, putRequests: 0, deleteRequests: 0, bytesStored: 0 },
        storageLensEnabled: bucket.storageLensEnabled ?? false,
        websiteEnabled: bucket.websiteEnabled ?? false,
        websiteIndex: bucket.websiteIndex ?? 'index.html',
        websiteError: bucket.websiteError ?? 'error.html',
        serverLogging: bucket.serverLogging ?? false,
        loggingDestination: bucket.loggingDestination ?? '',
        transferAcceleration: bucket.transferAcceleration ?? false,
        requesterPays: bucket.requesterPays ?? false,
        objectLock: bucket.objectLock ?? false,
        eventNotifications: bucket.eventNotifications ?? [],
        accessPoints: bucket.accessPoints ?? [],
        multiRegionAccessPoints: bucket.multiRegionAccessPoints ?? [],
      })),
    }
  }
  if (action.type === 'set-region') return { ...state, region: action.region }
  if (action.type === 'reset') return { ...initialState, resetVersion: state.resetVersion + 1 }
  if (action.type === 'create-bucket') return { ...state, buckets: [...state.buckets, action.bucket] }
  if (action.type === 'delete-bucket') return { ...state, buckets: state.buckets.filter((bucket) => bucket.name !== action.name) }
  if (action.type === 'upload-object') {
    return {
      ...state,
      buckets: state.buckets.map((bucket) => bucket.name === action.bucketName
        ? { ...bucket, objects: [...bucket.objects.filter((object) => object.key !== action.object.key), action.object] }
        : bucket),
    }
  }
  if (action.type === 'delete-object') {
    return {
      ...state,
      buckets: state.buckets.map((bucket) => bucket.name === action.bucketName
        ? { ...bucket, objects: bucket.objects.filter((object) => object.key !== action.key) }
        : bucket),
    }
  }
  if (action.type === 'update-bucket') {
    return {
      ...state,
      buckets: state.buckets.map((bucket) => bucket.name === action.bucketName
        ? { ...bucket, ...action.changes }
        : bucket),
    }
  }
  return state
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    void loadSimulationState('console', initialState).then((saved) => {
      dispatch({ type: 'hydrate', state: saved })
    })
  }, [])

  useEffect(() => {
    void saveSimulationState('console', state)
  }, [state])

  const createBucket = (bucket: Omit<Bucket, 'createdAt' | 'versioning' | 'encryption' | 'tags' | 'objects' | 'policy' | 'cors' | 'aclEnabled' | 'lifecycleRules' | 'simulatedDay' | 'replicationRules' | 'inventoryConfigurations' | 'batchOperations' | 'metrics' | 'storageLensEnabled' | 'websiteEnabled' | 'websiteIndex' | 'websiteError' | 'serverLogging' | 'loggingDestination' | 'transferAcceleration' | 'requesterPays' | 'objectLock' | 'eventNotifications' | 'accessPoints' | 'multiRegionAccessPoints'>) => {
    if (bucket.name.length < 3 || bucket.name.length > 63) return 'The bucket name must be between 3 and 63 characters.'
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket.name)) return 'The bucket name must use lowercase letters, numbers, periods, and hyphens.'
    if (/\.\.|-\./.test(bucket.name) || /\.-/.test(bucket.name)) return 'The bucket name contains invalid adjacent characters.'
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(bucket.name)) return 'The bucket name cannot be formatted as an IP address.'
    if (state.buckets.some((existing) => existing.name === bucket.name)) return 'A bucket with this name already exists.'
    dispatch({
      type: 'create-bucket',
      bucket: {
        ...bucket,
        createdAt: new Date().toISOString(),
        versioning: 'Suspended',
        encryption: 'SSE-S3',
        tags: {},
        objects: [],
        policy: '',
        cors: '',
        aclEnabled: false,
        lifecycleRules: [],
        simulatedDay: 0,
        replicationRules: [],
        inventoryConfigurations: [],
        batchOperations: [],
        metrics: { getRequests: 0, putRequests: 0, deleteRequests: 0, bytesStored: 0 },
        storageLensEnabled: false,
        websiteEnabled: false,
        websiteIndex: 'index.html',
        websiteError: 'error.html',
        serverLogging: false,
        loggingDestination: '',
        transferAcceleration: false,
        requesterPays: false,
        objectLock: false,
        eventNotifications: [],
        accessPoints: [],
        multiRegionAccessPoints: [],
      },
    })
    return null
  }

  const deleteBucket = (name: string) => {
    if (!state.buckets.some((bucket) => bucket.name === name)) return 'The bucket was not found.'
    dispatch({ type: 'delete-bucket', name })
    return null
  }

  const uploadObject = async (bucketName: string, file: File, key: string) => {
    const bucket = state.buckets.find((item) => item.name === bucketName)
    if (!bucket) return 'The bucket was not found.'
    const normalizedKey = key.trim().replace(/^\/+/, '')
    if (!normalizedKey) return 'Object key is required.'
    await saveObjectBlob(bucketName, normalizedKey, file)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let checksum = 0
    for (const byte of bytes) checksum = (checksum + byte) % 0xffffffff
    const object: S3Object = {
      key: normalizedKey,
      size: file.size,
      type: file.type || 'application/octet-stream',
      etag: `"${checksum.toString(16).padStart(8, '0')}..."`,
      checksum: `SHA-256:${checksum.toString(16).padStart(8, '0')}`,
      storageClass: 'STANDARD',
      encryption: bucket.encryption,
      createdAt: new Date().toISOString(),
      metadata: {},
      tags: {},
      parts: file.size >= 100 * 1024 * 1024 ? Math.ceil(file.size / (10 * 1024 * 1024)) : 1,
      versionId: bucket.versioning === 'Enabled' ? `v-${Date.now()}` : 'null',
      versions: bucket.versioning === 'Enabled'
        ? [
            ...(bucket.objects.find((item) => item.key === normalizedKey)?.versions ?? []),
            ...(bucket.objects.find((item) => item.key === normalizedKey)
              ? [{
                  versionId: bucket.objects.find((item) => item.key === normalizedKey)?.versionId ?? 'v-null',
                  size: bucket.objects.find((item) => item.key === normalizedKey)?.size ?? 0,
                  type: bucket.objects.find((item) => item.key === normalizedKey)?.type ?? 'application/octet-stream',
                  createdAt: bucket.objects.find((item) => item.key === normalizedKey)?.createdAt ?? new Date().toISOString(),
                  storageClass: bucket.objects.find((item) => item.key === normalizedKey)?.storageClass ?? 'STANDARD',
                  checksum: bucket.objects.find((item) => item.key === normalizedKey)?.checksum ?? '',
                }]
              : []),
          ]
        : undefined,
    }
    dispatch({ type: 'upload-object', bucketName, object })
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        metrics: {
          getRequests: bucket.metrics?.getRequests ?? 0,
          putRequests: (bucket.metrics?.putRequests ?? 0) + 1,
          deleteRequests: bucket.metrics?.deleteRequests ?? 0,
          bytesStored: (bucket.metrics?.bytesStored ?? 0) + file.size,
        },
      },
    })
    return null
  }

  const deleteObject = async (bucketName: string, key: string) => {
    await deleteObjectBlob(bucketName, key)
    const bucket = state.buckets.find((item) => item.name === bucketName)
    if (bucket?.versioning === 'Enabled') {
      dispatch({
        type: 'update-bucket',
        bucketName,
        changes: {
          objects: bucket.objects.map((object) =>
            object.key === key
              ? { ...object, deleteMarker: true, versionId: `dm-${Date.now()}` }
              : object,
          ),
        },
      })
    } else {
      dispatch({ type: 'delete-object', bucketName, key })
    }
    if (bucket) {
      dispatch({
        type: 'update-bucket',
        bucketName,
        changes: {
          metrics: {
            ...bucket.metrics,
            deleteRequests: bucket.metrics.deleteRequests + 1,
          },
        },
      })
    }
    return null
  }

  const copyObject = async (sourceBucket: string, sourceKey: string, destinationBucket: string, destinationKey: string) => {
    const source = state.buckets.find((bucket) => bucket.name === sourceBucket)?.objects.find((object) => object.key === sourceKey)
    const blob = await loadObjectBlob(sourceBucket, sourceKey)
    if (!source || !blob) return 'The source object was not found.'
    if (!state.buckets.some((bucket) => bucket.name === destinationBucket)) return 'The destination bucket was not found.'
    await saveObjectBlob(destinationBucket, destinationKey, blob)
    dispatch({
      type: 'upload-object',
      bucketName: destinationBucket,
      object: { ...source, key: destinationKey, createdAt: new Date().toISOString(), versionId: 'null' },
    })
    return null
  }

  const createFolder = (bucketName: string, prefix: string) => {
    const bucket = state.buckets.find((item) => item.name === bucketName)
    if (!bucket) return 'The bucket was not found.'
    const key = `${prefix.replace(/^\/+|\/+$/g, '')}/`
    if (!key || key === '/') return 'Folder name is required.'
    dispatch({
      type: 'upload-object',
      bucketName,
      object: {
        key,
        size: 0,
        type: 'folder',
        etag: '',
        checksum: '',
        storageClass: 'STANDARD',
        encryption: bucket.encryption,
        createdAt: new Date().toISOString(),
        metadata: {},
        tags: {},
        isFolder: true,
        parts: 0,
        versionId: 'null',
      },
    })
    return null
  }

  const setBlockPublicAccess = (bucketName: string, enabled: boolean) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { blockPublicAccess: enabled } })

  const setObjectOwnership = (bucketName: string, ownership: Bucket['objectOwnership']) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { objectOwnership: ownership } })

  const setBucketEncryption = (bucketName: string, encryption: Bucket['encryption']) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { encryption } })

  const setBucketPolicy = (bucketName: string, policy: string) => {
    if (!policy.trim()) {
      dispatch({ type: 'update-bucket', bucketName, changes: { policy: '' } })
      return null
    }
    try {
      const parsed = JSON.parse(policy) as { Statement?: unknown; Version?: unknown }
      if (parsed.Version !== '2012-10-17' || !Array.isArray(parsed.Statement)) {
        return 'Policy must include Version "2012-10-17" and a Statement array.'
      }
    } catch {
      return 'Enter valid JSON.'
    }
    dispatch({ type: 'update-bucket', bucketName, changes: { policy } })
    return null
  }

  const setBucketCors = (bucketName: string, cors: string) => {
    if (!cors.trim()) {
      dispatch({ type: 'update-bucket', bucketName, changes: { cors: '' } })
      return null
    }
    try {
      const parsed = JSON.parse(cors)
      if (!Array.isArray(parsed)) return 'CORS configuration must be a JSON array.'
    } catch {
      return 'Enter valid JSON.'
    }
    dispatch({ type: 'update-bucket', bucketName, changes: { cors } })
    return null
  }

  const setAclEnabled = (bucketName: string, enabled: boolean) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { aclEnabled: enabled } })

  const setBucketVersioning = (bucketName: string, enabled: boolean) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { versioning: enabled ? 'Enabled' : 'Suspended' } })

  const setLifecycleRules = (bucketName: string, rules: LifecycleRule[]) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { lifecycleRules: rules } })

  const advanceSimulatedTime = (bucketName: string, days: number) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: (() => {
        const bucket = state.buckets.find((item) => item.name === bucketName)
        if (!bucket) return {}
        const nextDay = bucket.simulatedDay + days
        let objects = bucket.objects.map((object) => {
          const matchingRules = bucket.lifecycleRules.filter((rule) =>
            rule.status === 'Enabled' &&
            (!rule.prefix || object.key.startsWith(rule.prefix)) &&
            nextDay >= rule.transitionAfterDays,
          )
          if (matchingRules.length) return { ...object, storageClass: matchingRules[matchingRules.length - 1].storageClass }
          return object
        })
        for (const rule of bucket.lifecycleRules.filter((item) => item.status === 'Enabled')) {
          objects = objects.filter((object) =>
            (rule.prefix && !object.key.startsWith(rule.prefix)) ||
            rule.expireAfterDays <= 0 ||
            nextDay < rule.expireAfterDays,
          )
        }
        return { simulatedDay: nextDay, objects }
      })(),
    })

  const setObjectStorageClass = (bucketName: string, key: string, storageClass: StorageClass) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        objects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.map((object) =>
          object.key === key ? { ...object, storageClass } : object,
        ),
      },
    })

  const restoreObjectVersion = (bucketName: string, key: string, versionId: string) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        objects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.map((object) => {
          if (object.key !== key) return object
          const version = object.versions?.find((item) => item.versionId === versionId)
          if (!version) return object
          return {
            ...object,
            size: version.size,
            type: version.type,
            createdAt: version.createdAt,
            storageClass: version.storageClass,
            checksum: version.checksum,
            versionId,
            deleteMarker: false,
          }
        }),
      },
    })

  const deleteObjectVersion = (bucketName: string, key: string, versionId: string) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        objects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.map((object) =>
          object.key === key
            ? { ...object, versions: object.versions?.filter((version) => version.versionId !== versionId) }
            : object,
        ),
      },
    })

  const setReplicationRules = (bucketName: string, rules: ReplicationRule[]) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { replicationRules: rules } })

  const setInventoryConfigurations = (bucketName: string, configurations: InventoryConfiguration[]) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { inventoryConfigurations: configurations } })

  const setStorageLensEnabled = (bucketName: string, enabled: boolean) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { storageLensEnabled: enabled } })

  const recordGetRequest = (bucketName: string) => {
    const bucket = state.buckets.find((item) => item.name === bucketName)
    if (!bucket) return
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        metrics: {
          ...bucket.metrics,
          getRequests: bucket.metrics.getRequests + 1,
        },
      },
    })
  }

  const updateBucketFeatures = (bucketName: string, changes: Partial<Bucket>) =>
    dispatch({ type: 'update-bucket', bucketName, changes })

  const setBucketTags = (bucketName: string, tags: Record<string, string>) =>
    dispatch({ type: 'update-bucket', bucketName, changes: { tags } })

  const setObjectMetadataTags = (
    bucketName: string,
    key: string,
    metadata: Record<string, string>,
    tags: Record<string, string>,
  ) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        objects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.map((object) =>
          object.key === key ? { ...object, metadata, tags } : object,
        ),
      },
    })

  const setObjectLockSettings = (
    bucketName: string,
    key: string,
    retentionMode: 'Governance' | 'Compliance',
    retainUntil: string,
    legalHold: boolean,
  ) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        objects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.map((object) =>
          object.key === key
            ? { ...object, retentionMode, retainUntil, legalHold }
            : object,
        ),
      },
    })

  const createBatchOperation = (bucketName: string, operation: BatchOperation['operation']) =>
    dispatch({
      type: 'update-bucket',
      bucketName,
      changes: {
        batchOperations: [
          ...(state.buckets.find((bucket) => bucket.name === bucketName)?.batchOperations ?? []),
          {
            id: `job-${Date.now()}`,
            operation,
            status: 'Completed',
            manifestObjects: state.buckets.find((bucket) => bucket.name === bucketName)?.objects.filter((object) => !object.isFolder).length ?? 0,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    })

  const executeReplication = (bucketName: string) => {
    const source = state.buckets.find((bucket) => bucket.name === bucketName)
    if (!source) return
    let buckets = state.buckets
    let replicationRules = source.replicationRules
    for (const rule of replicationRules) {
      if (rule.status !== 'Enabled') continue
      buckets = buckets.map((bucket) => {
        if (bucket.name !== rule.destinationBucket) return bucket
        const copies = source.objects.filter((object) =>
          !object.isFolder &&
          (!rule.prefix || object.key.startsWith(rule.prefix)),
        )
        return {
          ...bucket,
          objects: [
            ...bucket.objects.filter((object) => !copies.some((copy) => copy.key === object.key)),
            ...copies.map((object) => ({ ...object, versionId: `rep-${Date.now()}` })),
          ],
        }
      })
    }
    replicationRules = replicationRules.map((rule) => rule.status === 'Enabled'
      ? { ...rule, statusLabel: 'Replicated' as const }
      : rule)
    dispatch({
      type: 'hydrate',
      state: {
        ...state,
        buckets: buckets.map((bucket) => bucket.name === bucketName
          ? { ...bucket, replicationRules }
          : bucket),
      },
    })
  }

  return (
    <SimulationContext.Provider
      value={{
        state,
        setRegion: (region) => dispatch({ type: 'set-region', region }),
        resetSimulation: () => dispatch({ type: 'reset' }),
        createBucket,
        deleteBucket,
        uploadObject,
        deleteObject,
        copyObject,
        createFolder,
        setBlockPublicAccess,
        setObjectOwnership,
        setBucketEncryption,
        setBucketPolicy,
        setBucketCors,
        setAclEnabled,
        setBucketVersioning,
        setLifecycleRules,
        advanceSimulatedTime,
        setObjectStorageClass,
        restoreObjectVersion,
        deleteObjectVersion,
        setReplicationRules,
        setInventoryConfigurations,
        setStorageLensEnabled,
        createBatchOperation,
        executeReplication,
        recordGetRequest,
        updateBucketFeatures,
        setBucketTags,
        setObjectMetadataTags,
        setObjectLockSettings,
      }}
    >
      {children}
    </SimulationContext.Provider>
  )
}
