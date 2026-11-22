/**
 * Builds an ordered version timeline for a single S3 key.
 *
 * The store keeps the current version on the object itself and older versions
 * in `object.versions`. The timeline flattens both collections so the UI can
 * render v1, v2, v3 and delete markers in chronological order.
 */
export type VersionLike = {
  versionId: string
  size: number
  type: string
  createdAt: string
  storageClass: string
  etag?: string
  parts?: number
  deleteMarker?: boolean
  createdDay?: number
  storageClassChangedDay?: number
}

export type ObjectLike = VersionLike & {
  key: string
  versions?: VersionLike[]
  isFolder?: boolean
}

export type TimelineEntry = {
  ordinal: number
  label: string
  versionId: string
  size: number
  type: string
  createdAt: string
  storageClass: string
  etag: string
  parts: number
  deleteMarker: boolean
  isCurrent: boolean
  createdDay: number
  storageClassChangedDay: number
}

const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function buildVersionTimeline(object: ObjectLike): TimelineEntry[] {
  const current: VersionLike = {
    versionId: object.versionId,
    size: object.size,
    type: object.type,
    createdAt: object.createdAt,
    storageClass: object.storageClass,
    etag: object.etag,
    parts: object.parts,
    deleteMarker: object.deleteMarker,
    createdDay: object.createdDay,
    storageClassChangedDay: object.storageClassChangedDay,
  }

  const history = [...(object.versions ?? [])]
    .map((version, index) => ({ version, index }))
    .sort((a, b) => {
      const left = new Date(a.version.createdAt).getTime()
      const right = new Date(b.version.createdAt).getTime()
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
      return a.index - b.index
    })
    .map(({ version }) => version)

  const ordered = [...history, current]

  return ordered.map((version, index) => ({
    ordinal: index + 1,
    label: version.deleteMarker ? `Delete marker ${index + 1}` : `v${index + 1}`,
    versionId: version.versionId,
    size: version.size,
    type: version.type,
    createdAt: version.createdAt,
    storageClass: version.storageClass,
    etag: version.etag ?? '',
    parts: asNumber(version.parts, 1),
    deleteMarker: Boolean(version.deleteMarker),
    isCurrent: index === ordered.length - 1,
    createdDay: asNumber(version.createdDay, 0),
    storageClassChangedDay: asNumber(version.storageClassChangedDay, asNumber(version.createdDay, 0)),
  }))
}

export function currentVersion(object: ObjectLike): TimelineEntry | undefined {
  return buildVersionTimeline(object).find((entry) => entry.isCurrent)
}

export function previousVersions(object: ObjectLike): TimelineEntry[] {
  return buildVersionTimeline(object).filter((entry) => !entry.isCurrent)
}

/** Flattens every stored version in a bucket for cost calculation. */
export function storedVersions(bucketObjects: ObjectLike[]): Array<VersionLike & { key: string }> {
  const entries: Array<VersionLike & { key: string }> = []
  for (const object of bucketObjects) {
    if (object.isFolder) continue
    for (const version of object.versions ?? []) {
      if (version.deleteMarker || !version.size) continue
      entries.push({ ...version, key: object.key })
    }
    if (!object.deleteMarker && object.size) {
      entries.push({
        versionId: object.versionId,
        size: object.size,
        type: object.type,
        createdAt: object.createdAt,
        storageClass: object.storageClass,
        etag: object.etag,
        parts: object.parts,
        createdDay: object.createdDay,
        storageClassChangedDay: object.storageClassChangedDay,
        key: object.key,
      })
    }
  }
  return entries
}

export function versionAgeInClass(version: VersionLike, currentDay: number): number {
  const changedDay = asNumber(version.storageClassChangedDay, asNumber(version.createdDay, 0))
  return Math.max(0, currentDay - changedDay)
}
