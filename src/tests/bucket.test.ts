import { describe, expect, it } from 'vitest'
import { createBucket, validateBucketName } from '../engine/buckets'
import { calculateParts, MULTIPART_THRESHOLD } from '../engine/multipart'

describe('bucket engine', () => {
  it('creates a bucket with the requested name', () => {
    expect(createBucket('my-lab-bucket').name).toBe('my-lab-bucket')
  })

  it('validates bucket names', () => {
    expect(validateBucketName('ab')).toContain('between')
    expect(validateBucketName('My_Bucket')).toContain('lowercase')
    expect(validateBucketName('good.bucket-1')).toBeNull()
  })

  it('rejects reserved and duplicate names', () => {
    expect(validateBucketName('aws')).toContain('already exists')
    expect(validateBucketName('existing', ['existing'])).toContain('already exists')
  })
})

describe('multipart engine', () => {
  it('uses one part below the threshold', () => {
    expect(calculateParts(MULTIPART_THRESHOLD - 1)).toBe(1)
  })

  it('splits objects above the threshold', () => {
    expect(calculateParts(MULTIPART_THRESHOLD * 3)).toBe(30)
  })
})
