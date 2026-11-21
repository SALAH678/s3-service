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

const objectBlobKey = (bucketName: string, key: string) => `${bucketName}/${key}`
const versionBlobKey = (bucketName: string, key: string, versionId: string) =>
  `${bucketName}/${key}#${versionId}`

export async function loadSimulationState<T>(key: string, fallback: T): Promise<T> {
  const database = await dbPromise
  return ((await database.get('state', key)) as T | undefined) ?? fallback
}

export async function saveSimulationState<T>(key: string, value: T): Promise<void> {
  const database = await dbPromise
  await database.put('state', value, key)
}

export async function saveObjectBlob(bucketName: string, key: string, blob: Blob): Promise<void> {
  const database = await dbPromise
  await database.put('files', blob, objectBlobKey(bucketName, key))
}

export async function loadObjectBlob(bucketName: string, key: string): Promise<Blob | undefined> {
  const database = await dbPromise
  return database.get('files', objectBlobKey(bucketName, key))
}

export async function deleteObjectBlob(bucketName: string, key: string): Promise<void> {
  const database = await dbPromise
  await database.delete('files', objectBlobKey(bucketName, key))
}

export async function saveObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
  blob: Blob,
): Promise<void> {
  const database = await dbPromise
  await database.put('files', blob, versionBlobKey(bucketName, key, versionId))
}

export async function loadObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
): Promise<Blob | undefined> {
  const database = await dbPromise
  return database.get('files', versionBlobKey(bucketName, key, versionId))
}

export async function deleteObjectVersionBlob(
  bucketName: string,
  key: string,
  versionId: string,
): Promise<void> {
  const database = await dbPromise
  await database.delete('files', versionBlobKey(bucketName, key, versionId))
}

export async function deleteAllObjectVersionBlobs(bucketName: string, key: string): Promise<void> {
  const database = await dbPromise
  const prefix = `${objectBlobKey(bucketName, key)}#`
  const keys = await database.getAllKeys('files')
  await Promise.all(
    keys
      .filter((storedKey) => storedKey.startsWith(prefix))
      .map((storedKey) => database.delete('files', storedKey)),
  )
}

export async function clearBucketBlobs(bucketName: string): Promise<void> {
  const database = await dbPromise
  const prefix = `${bucketName}/`
  const keys = await database.getAllKeys('files')
  await Promise.all(
    keys
      .filter((storedKey) => storedKey.startsWith(prefix))
      .map((storedKey) => database.delete('files', storedKey)),
  )
}

export async function clearObjectBlobs(): Promise<void> {
  const database = await dbPromise
  await database.clear('files')
}
