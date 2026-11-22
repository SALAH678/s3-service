import { describe, expect, it, vi } from 'vitest'
import { executeCliCommand } from '../engine/cli-parser'
import type { Bucket } from '../engine/buckets'

function createActions(initial: Bucket[] = []) {
  const buckets = [...initial]
  return {
    buckets,
    createBucket: vi.fn((name: string, region?: string) => {
      buckets.push({ name, region: region ?? 'US East (N. Virginia)', createdAt: new Date().toISOString(), objects: [] })
      return null
    }),
    deleteBucket: undefined as ((name: string) => string | null) | undefined,
    uploadObject: vi.fn(),
    deleteObject: vi.fn(),
    setVersioning: vi.fn(),
    setLifecycleRule: vi.fn(),
  }
}

describe('fake AWS CLI', () => {
  it('creates a bucket with mb', () => {
    const actions = createActions()
    const result = executeCliCommand('aws s3 mb s3://cli-lab', actions)
    expect(result.success).toBe(true)
    expect(result.output).toContain('cli-lab')
  })

  it('passes the requested region to mb', () => {
    const actions = createActions()
    const result = executeCliCommand('aws s3 mb s3://regional-lab --region eu-west-1', actions)
    expect(result.success).toBe(true)
    expect(actions.createBucket).toHaveBeenCalledWith('regional-lab', 'eu-west-1')
  })

  it('hides delete markers from ls', () => {
    const actions = createActions([
      {
        name: 'cli-lab',
        region: 'US East',
        createdAt: '2026-11-20T00:00:00Z',
        objects: [
          { key: 'visible.txt', size: 1, type: 'text/plain', createdAt: '2026-11-20T00:00:00Z', parts: 1, versionId: 'v1' },
          { key: 'deleted.txt', size: 1, type: 'text/plain', createdAt: '2026-11-20T00:00:00Z', parts: 1, versionId: 'v2', deleteMarker: true },
        ],
      },
    ])
    const result = executeCliCommand('aws s3 ls s3://cli-lab', actions)
    expect(result.output).toContain('visible.txt')
    expect(result.output).not.toContain('deleted.txt')
  })

  it('lists buckets', () => {
    const actions = createActions([
      { name: 'first-bucket', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    const result = executeCliCommand('aws s3 ls', actions)
    expect(result.output).toContain('first-bucket')
  })

  it('rejects unknown commands', () => {
    const result = executeCliCommand('aws s3 unknown', createActions())
    expect(result.success).toBe(false)
  })

  it('uploads a local file with cp', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    const result = executeCliCommand('aws s3 cp test.txt s3://cli-lab/test.txt', actions)
    expect(result.success).toBe(true)
    expect(actions.uploadObject).toHaveBeenCalledWith(
      'cli-lab',
      expect.objectContaining({ key: 'test.txt', size: 1024 }),
    )
  })

  it('enables bucket versioning with s3api', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    actions.setVersioning = vi.fn()
    const result = executeCliCommand(
      'aws s3api put-bucket-versioning --bucket cli-lab --versioning-configuration Status=Enabled',
      actions,
    )
    expect(result.success).toBe(true)
    expect(actions.setVersioning).toHaveBeenCalledWith('cli-lab', true)
  })

  it('suspends bucket versioning when requested', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    actions.setVersioning = vi.fn()
    const result = executeCliCommand(
      'aws s3api put-bucket-versioning --bucket cli-lab --versioning-configuration Status=Suspended',
      actions,
    )
    expect(result.success).toBe(true)
    expect(actions.setVersioning).toHaveBeenCalledWith('cli-lab', false)
  })

  it('removes an empty bucket with rb', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    actions.deleteBucket = vi.fn(() => null)
    const result = executeCliCommand('aws s3 rb s3://cli-lab', actions)
    expect(result.success).toBe(true)
    expect(actions.deleteBucket).toHaveBeenCalledWith('cli-lab')
  })

  it('lists object versions', () => {
    const actions = createActions([
      {
        name: 'cli-lab',
        region: 'US East',
        createdAt: '2026-11-20T00:00:00Z',
        objects: [{
          key: 'notes.txt',
          size: 10,
          type: 'text/plain',
          createdAt: '2026-11-20T00:00:00Z',
          parts: 1,
          versionId: 'v2',
          versions: [{
            versionId: 'v1',
            size: 5,
            type: 'text/plain',
            createdAt: '2026-11-19T00:00:00Z',
            parts: 1,
          }],
        }],
      },
    ])
    const result = executeCliCommand('aws s3api list-object-versions --bucket cli-lab', actions)
    expect(result.success).toBe(true)
    expect(result.output).toContain('v1')
    expect(result.output).toContain('v2')
  })

  it('keeps the file name when copying into a folder prefix', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    const result = executeCliCommand('aws s3 cp test.txt s3://cli-lab/uploads/', actions)
    expect(result.success).toBe(true)
    expect(actions.uploadObject).toHaveBeenCalledWith(
      'cli-lab',
      expect.objectContaining({ key: 'uploads/test.txt' }),
    )
  })

  it('rejects copying an object onto itself', () => {
    const actions = createActions([
      {
        name: 'cli-lab',
        region: 'US East',
        createdAt: '2026-11-20T00:00:00Z',
        objects: [{ key: 'notes.txt', size: 1, type: 'text/plain', createdAt: '2026-11-20T00:00:00Z', parts: 1 }],
      },
    ])
    const result = executeCliCommand('aws s3 cp s3://cli-lab/notes.txt s3://cli-lab/notes.txt', actions)
    expect(result.success).toBe(false)
    expect(actions.uploadObject).not.toHaveBeenCalled()
  })

  it('parses lifecycle prefix and transition days', () => {
    const actions = createActions([
      { name: 'cli-lab', region: 'US East', createdAt: '2026-11-20T00:00:00Z', objects: [] },
    ])
    const command = 'aws s3api put-bucket-lifecycle-configuration --bucket cli-lab --lifecycle-configuration {"Rules":[{"Filter":{"Prefix":"images/"},"Transition":{"Days":45,"StorageClass":"GLACIER"}}]}'
    const result = executeCliCommand(command, actions)
    expect(result.success).toBe(true)
    expect(actions.setLifecycleRule).toHaveBeenCalledWith('cli-lab', {
      prefix: 'images/',
      transitionAfterDays: 45,
      storageClass: 'GLACIER',
    })
  })
})
