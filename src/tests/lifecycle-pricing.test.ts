import { describe, expect, it } from 'vitest'
import { getStorageClass } from '../engine/lifecycle'
import { calculateEstimatedCost } from '../engine/pricing'

describe('lifecycle engine', () => {
  it('starts in Standard storage', () => {
    expect(getStorageClass({ prefix: '', transitionAfterDays: 30, storageClass: 'STANDARD_IA' }, 29)).toBe('STANDARD')
  })

  it('transitions after the configured age', () => {
    expect(getStorageClass({ prefix: '', transitionAfterDays: 30, storageClass: 'GLACIER' }, 30)).toBe('GLACIER')
  })
})

describe('pricing engine', () => {
  it('calculates storage and request costs', () => {
    const gb = 1024 * 1024 * 1024
    const cost = calculateEstimatedCost({
      standardBytes: gb,
      standardIaBytes: 0,
      glacierBytes: 0,
      putRequests: 1000,
      getRequests: 1000,
    })
    expect(cost.storage).toBeCloseTo(0.023)
    expect(cost.requests).toBeCloseTo(0.0054)
  })
})
