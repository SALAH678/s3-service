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
  prefix: string
  transitionAfterDays: number
  storageClass: Exclude<StorageClass, 'STANDARD'>
}

export function getStorageClass(rule: LifecycleRule | undefined, ageInDays: number): StorageClass {
  if (!rule || ageInDays < rule.transitionAfterDays) return 'STANDARD'
  return rule.storageClass
}
