import { openDB, type DBSchema } from 'idb'

interface SimulationSchema extends DBSchema {
  state: {
    key: string
    value: unknown
  }
  files: {
    key: string
    value: Blob
  }
}

const dbPromise = openDB<SimulationSchema>('s3-console-simulation', 1, {
  upgrade(database) {
    database.createObjectStore('state')
    database.createObjectStore('files')
  },
})

let fileOperationQueue: Promise<unknown> = Promise.resolve()

function queueFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = fileOperationQueue.then(operation, operation)
  fileOperationQueue = result.then(() => undefined, () => undefined)
  return result
}

const objectBlobKey = (bucketName: string, key: string) => `${bucketName}/${key}`
const legacyVersionBlobKey = (bucketName: string, key: string, versionId: string) =>
  `${bucketName}/${key}#${versionId}`
const versionPrefix = (bucketName: string) => `__versions__/${encodeURIComponent(bucketName)}/`
const versionBlobKey = (bucketName: string, key: string, versionId: string) =>
  `${versionPrefix(bucketName)}${encodeURIComponent(key)}#${encodeURIComponent(versionId)}`

export async function loadSimulationState<T>(key: string, fallback: T): Promise<T> {
  const database = await dbPromise
  return ((await database.get('state', key)) as T | undefined) ?? fallback
}

export async function saveSimulationState<T>(key: string, value: T): Promise<void> {
  const database = await dbPromise
  await database.put('state', value, key)
}

export function saveObjectBlob(bucketName: string, key: string, blob: Blob): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    await database.put('files', blob, objectBlobKey(bucketName, key))
  })
}

export async function loadObjectBlob(bucketName: string, key: string): Promise<Blob | undefined> {
  const database = await dbPromise
  return database.get('files', objectBlobKey(bucketName, key))
}

export function deleteObjectBlob(bucketName: string, key: string): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    await database.delete('files', objectBlobKey(bucketName, key))
  })
}

export function saveObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
  blob: Blob,
): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    await database.put('files', blob, versionBlobKey(bucketName, key, versionId))
    await database.delete('files', legacyVersionBlobKey(bucketName, key, versionId))
  })
}

export async function loadObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
): Promise<Blob | undefined> {
  const database = await dbPromise
  const current = await database.get('files', versionBlobKey(bucketName, key, versionId))
  if (current) return current
  return database.get('files', legacyVersionBlobKey(bucketName, key, versionId))
}

export function deleteObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    await database.delete('files', versionBlobKey(bucketName, key, versionId))
    await database.delete('files', legacyVersionBlobKey(bucketName, key, versionId))
  })
}

export function deleteAllObjectVersionBlobs(bucketName: string, key: string): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    const prefix = `${versionPrefix(bucketName)}${encodeURIComponent(key)}#`
    const keys = await database.getAllKeys('files')
    await Promise.all(
      keys
        .filter((storedKey) => storedKey.startsWith(prefix))
        .map((storedKey) => database.delete('files', storedKey)),
    )
  })
}

export function clearBucketBlobs(bucketName: string): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    const prefixes = [`${bucketName}/`, versionPrefix(bucketName)]
    const keys = await database.getAllKeys('files')
    await Promise.all(
      keys
        .filter((storedKey) => prefixes.some((prefix) => storedKey.startsWith(prefix)))
        .map((storedKey) => database.delete('files', storedKey)),
    )
  })
}

export function clearObjectBlobs(): Promise<void> {
  return queueFileOperation(async () => {
    const database = await dbPromise
    await database.clear('files')
  })
}
