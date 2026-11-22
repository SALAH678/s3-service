import {
  LEARNING_STORAGE_CLASSES,
  estimateEarlyDeletionCharge,
  estimateMonthlyStorageCost,
  type LearningStorageClass,
} from './storageClasses'

export type CostEntry = {
  size: number
  storageClass: string
}

export type CostByClass = Record<LearningStorageClass, number>

export function emptyCostByClass(): CostByClass {
  return LEARNING_STORAGE_CLASSES.reduce((costs, storageClass) => {
    costs[storageClass] = 0
    return costs
  }, {} as CostByClass)
}

/** Monthly storage cost for every class, respecting minimum billable sizes. */
export function monthlyCostByClass(entries: CostEntry[]): CostByClass {
  const costs = emptyCostByClass()
  for (const entry of entries) {
    if (!entry.size) continue
    const storageClass = LEARNING_STORAGE_CLASSES.find((candidate) => candidate === entry.storageClass)
    if (!storageClass) continue
    costs[storageClass] += estimateMonthlyStorageCost(entry.size, storageClass)
  }
  return costs
}

export function totalMonthlyCost(entries: CostEntry[]): number {
  return Object.values(monthlyCostByClass(entries)).reduce((sum, value) => sum + value, 0)
}

/** Cost accrued for holding the same objects for `days` simulated days. */
export function accruedCostByClass(entries: CostEntry[], days: number): CostByClass {
  const monthly = monthlyCostByClass(entries)
  const factor = Math.max(0, days) / 30
  const accrued = emptyCostByClass()
  for (const storageClass of LEARNING_STORAGE_CLASSES) {
    accrued[storageClass] = monthly[storageClass] * factor
  }
  return accrued
}

export function addCostByClass(target: CostByClass, addition: CostByClass): CostByClass {
  const result = emptyCostByClass()
  for (const storageClass of LEARNING_STORAGE_CLASSES) {
    result[storageClass] = target[storageClass] + addition[storageClass]
  }
  return result
}

export function sumCostByClass(costs: CostByClass): number {
  return LEARNING_STORAGE_CLASSES.reduce((sum, storageClass) => sum + costs[storageClass], 0)
}

/**
 * Groups class costs into the four buckets used by the original console chart.
 * Kept for backwards compatibility with persisted cost snapshots.
 */
export function groupCostByClass(costs: CostByClass) {
  return {
    standardCost: costs.STANDARD + costs.INTELLIGENT_TIERING,
    iaCost: costs.STANDARD_IA + costs.ONE_ZONE_IA,
    glacierCost: costs.GLACIER_IR + costs.GLACIER,
    deepArchiveCost: costs.DEEP_ARCHIVE,
  }
}

export function earlyDeletionCharge(
  size: number,
  storageClass: string,
  ageInClassDays: number,
): number {
  return estimateEarlyDeletionCharge(size, storageClass, ageInClassDays)
}

export type CostChartRow = {
  day: number
  STANDARD: number
  INTELLIGENT_TIERING: number
  STANDARD_IA: number
  ONE_ZONE_IA: number
  GLACIER_IR: number
  GLACIER: number
  DEEP_ARCHIVE: number
  total: number
}

export function toChartRows(
  history: Array<{
    day: number;
    classCosts?: Partial<Record<string, number>>;
    total?: number;
    accrued?: number;
    standardCost?: number;
    iaCost?: number;
    glacierCost?: number;
    deepArchiveCost?: number;
  }>,
): CostChartRow[] {
  return history.map((snapshot) => {
    const classCosts = snapshot.classCosts ?? {}
    const row: CostChartRow = {
      day: snapshot.day,
      STANDARD: classCosts.STANDARD ?? snapshot.standardCost ?? 0,
      INTELLIGENT_TIERING: classCosts.INTELLIGENT_TIERING ?? 0,
      STANDARD_IA: classCosts.STANDARD_IA ?? snapshot.iaCost ?? 0,
      ONE_ZONE_IA: classCosts.ONE_ZONE_IA ?? 0,
      GLACIER_IR: classCosts.GLACIER_IR ?? 0,
      GLACIER: classCosts.GLACIER ?? snapshot.glacierCost ?? 0,
      DEEP_ARCHIVE: classCosts.DEEP_ARCHIVE ?? snapshot.deepArchiveCost ?? 0,
      total: snapshot.accrued ?? snapshot.total ?? 0,
    }
    return row
  })
}
