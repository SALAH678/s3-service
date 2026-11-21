export const MULTIPART_THRESHOLD = 100 * 1024 * 1024
export const PART_SIZE = 10 * 1024 * 1024

export function calculateParts(size: number) {
  if (size < MULTIPART_THRESHOLD) return 1
  return Math.max(1, Math.ceil(size / PART_SIZE))
}
