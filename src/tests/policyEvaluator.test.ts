import { describe, expect, it } from 'vitest'
import { evaluateBucketPolicy } from '../simulation/policyEvaluator'

describe('bucket policy simulator', () => {
  it('defaults to implicit deny', () => {
    expect(evaluateBucketPolicy('{"Statement":[]}', '*', 's3:GetObject', 'arn:aws:s3:::lab/*')).toBe('Implicit deny')
  })

  it('allows matching public reads', () => {
    const policy = JSON.stringify({
      Statement: [{
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::lab/*',
      }],
    })
    expect(evaluateBucketPolicy(policy, '*', 's3:GetObject', 'arn:aws:s3:::lab/file.txt')).toBe('Allowed')
  })

  it('gives explicit deny precedence', () => {
    const policy = JSON.stringify({
      Statement: [
        { Effect: 'Allow', Principal: '*', Action: 's3:*', Resource: 'arn:aws:s3:::lab/*' },
        { Effect: 'Deny', Principal: '*', Action: 's3:DeleteObject', Resource: 'arn:aws:s3:::lab/*' },
      ],
    })
    expect(evaluateBucketPolicy(policy, '*', 's3:DeleteObject', 'arn:aws:s3:::lab/file.txt')).toBe('Explicit deny')
  })
})
