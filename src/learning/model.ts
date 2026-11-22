import { storedVersions } from '../engine/versionModel'
import type { Bucket, S3Object } from '../store/s3SimulatorStore'

export const SIMULATION_EPOCH_ISO = '2026-11-22T00:00:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000

export function simulationDate(day: number): Date {
  return new Date(new Date(SIMULATION_EPOCH_ISO).getTime() + Math.max(0, day) * DAY_MS)
}

export function simulationDateLabel(day: number): string {
  return simulationDate(day).toISOString().slice(0, 10)
}

export function simulationTimestamp(day: number): string {
  return simulationDate(day).toISOString()
}

export function formatClock(day: number): string {
  return `Day ${day} · ${simulationDateLabel(day)}`
}

export type BrowserEntry = {
  key: string
  name: string
  depth: number
  isFolder: boolean
  object?: S3Object
}

export function buildBrowserEntries(
  bucket: Bucket,
  prefix: string,
  showVersions: boolean,
  search: string,
): BrowserEntry[] {
  const query = search.trim().toLowerCase()
  const objects = bucket.objects.filter((object) => {
    if (!object.key.startsWith(prefix)) return false
    if (object.key === prefix) return false
    if (!showVersions && object.deleteMarker) return false
    if (query && !object.key.toLowerCase().includes(query)) return false
    return true
  })

  if (showVersions || query) {
    return objects
      .map((object) => ({
        key: object.key,
        name: object.key.slice(prefix.length),
        depth: object.key.slice(prefix.length).split('/').length - 1,
        isFolder: Boolean(object.isFolder),
        object,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const folders = new Map<string, BrowserEntry>()
  const files: BrowserEntry[] = []
  for (const object of objects) {
    const relative = object.key.slice(prefix.length)
    const slash = relative.indexOf('/')
    if (slash >= 0) {
      const folderKey = `${prefix}${relative.slice(0, slash + 1)}`
      if (!folders.has(folderKey)) {
        folders.set(folderKey, {
          key: folderKey,
          name: relative.slice(0, slash),
          depth: 0,
          isFolder: true,
          object: bucket.objects.find((candidate) => candidate.key === folderKey && candidate.isFolder),
        })
      }
    } else if (!object.isFolder) {
      files.push({ key: object.key, name: relative, depth: 0, isFolder: false, object })
    }
  }
  return [...folders.values(), ...files].sort((a, b) => a.name.localeCompare(b.name))
}

export function storedCostEntries(buckets: Bucket[]) {
  return buckets.flatMap((bucket) =>
    storedVersions(bucket.objects).map((version) => ({
      bucket: bucket.name,
      key: version.key,
      versionId: version.versionId,
      size: version.size,
      storageClass: version.storageClass,
      createdDay: version.createdDay ?? 0,
      storageClassChangedDay: version.storageClassChangedDay ?? version.createdDay ?? 0,
    })),
  )
}

export function parseJsonRecord(text: string, label: string): { value: Record<string, string>; error: string | null } {
  if (!text.trim()) return { value: {}, error: null }
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: {}, error: `${label} must be a JSON object such as {"key": "value"}.` }
    }
    return {
      value: Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
      ),
      error: null,
    }
  } catch (error) {
    return {
      value: {},
      error: `${label} is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}

export function folderBreadcrumbs(prefix: string): Array<{ label: string; prefix: string }> {
  const segments = prefix.split('/').filter(Boolean)
  const crumbs = [{ label: 'root', prefix: '' }]
  let current = ''
  for (const segment of segments) {
    current += `${segment}/`
    crumbs.push({ label: segment, prefix: current })
  }
  return crumbs
}

export function downloadJson(filename: string, payload: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
  return Promise.resolve()
}
