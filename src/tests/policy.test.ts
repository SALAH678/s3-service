import { describe, expect, it } from 'vitest'
import { evaluatePolicy, validatePolicyJson } from '../engine/policy'

describe('bucket policy engine', () => {
  it('defaults to implicit deny', () => {
    const policy = validatePolicyJson(JSON.stringify({
      Version: '2012-10-17',
      Statement: [],
    }))
    expect(evaluatePolicy(policy, '*', 's3:GetObject', 'arn:aws:s3:::lab/*')).toBe('Implicit deny')
  })

  it('allows matching public reads', () => {
    const policy = validatePolicyJson(JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::lab/*',
      }],
    }))
    expect(evaluatePolicy(policy, '*', 's3:GetObject', 'arn:aws:s3:::lab/file.txt')).toBe('Allowed')
  })

  it('makes explicit deny win over allow', () => {
    const policy = validatePolicyJson(JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Principal: '*', Action: 's3:*', Resource: 'arn:aws:s3:::lab/*' },
        { Effect: 'Deny', Principal: '*', Action: 's3:DeleteObject', Resource: 'arn:aws:s3:::lab/*' },
      ],
    }))
    expect(evaluatePolicy(policy, '*', 's3:DeleteObject', 'arn:aws:s3:::lab/file.txt')).toBe('Explicit deny')
  })

  it('rejects malformed JSON', () => {
    expect(validatePolicyJson('{bad json')).toBeNull()
  })
})
