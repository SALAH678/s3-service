import type { Bucket } from './buckets'

export type CliActions = {
  buckets: Bucket[]
  createBucket: (name: string, region?: string) => string | null
  deleteBucket?: (name: string) => string | null
  uploadObject: (bucketName: string, file: { key: string; size: number; type: string }) => void | Promise<void>
  deleteObject: (bucketName: string, key: string) => void | Promise<void>
  setVersioning?: (bucketName: string, enabled: boolean) => void
  setLifecycleRule?: (bucketName: string, rule: { prefix: string; transitionAfterDays: number; storageClass: 'STANDARD_IA' | 'GLACIER' }) => void
}

export type CliResult = {
  output: string
  success: boolean
}

function parseS3Uri(uri: string) {
  const match = /^s3:\/\/([^/]+)(?:\/(.*))?$/.exec(uri)
  if (!match) return null
  return { bucket: match[1], key: match[2] ?? '' }
}

export function executeCliCommand(input: string, actions: CliActions): CliResult {
  const tokens = input.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  if (tokens.length === 0) return { output: '', success: true }
  if (tokens[0] !== 'aws') return { output: 'aws: command not found', success: false }

  const [, service, command, ...args] = tokens
  if (service === 's3') {
    if (command === 'mb') {
      const uri = parseS3Uri(args[0] ?? '')
      if (!uri) return { output: 'usage: aws s3 mb s3://bucket-name', success: false }
      const regionIndex = args.findIndex((arg) => arg === '--region')
      const region = regionIndex >= 0 ? args[regionIndex + 1] : undefined
      const error = actions.createBucket(uri.bucket, region)
      return error
        ? { output: `make_bucket failed: ${error}`, success: false }
        : { output: `make_bucket: ${args[0]}`, success: true }
    }

    if (command === 'ls') {
      const uri = parseS3Uri(args[0] ?? '')
      if (!args[0]) {
        const lines = actions.buckets.map((bucket) =>
          `${new Date(bucket.createdAt).toLocaleDateString()} ${bucket.name}`,
        )
        return { output: lines.join('\n') || 'No buckets found.', success: true }
      }
      if (!uri) return { output: 'usage: aws s3 ls s3://bucket-name', success: false }
      const bucket = actions.buckets.find((item) => item.name === uri.bucket)
      if (!bucket) return { output: `NoSuchBucket: ${uri.bucket}`, success: false }
      const prefix = uri.key
      const objects = bucket.objects.filter((object) => !object.deleteMarker && (!prefix || object.key.startsWith(prefix)))
      if (!objects.length) return { output: 'No objects found.', success: true }
      return {
        output: objects.map((object) =>
          `${new Date(object.createdAt).toLocaleDateString()} ${object.size}  ${object.key}`,
        ).join('\n'),
        success: true,
      }
    }

    if (command === 'cp' || command === 'mv') {
      if (args.length < 2) return { output: `usage: aws s3 ${command} <source> <destination>`, success: false }
      const sourceUri = parseS3Uri(args[0])
      const destinationUri = parseS3Uri(args[1])

      if (!sourceUri && destinationUri) {
        const bucket = actions.buckets.find((item) => item.name === destinationUri.bucket)
        if (!bucket) return { output: `NoSuchBucket: ${destinationUri.bucket}`, success: false }
        const basename = args[0].replace(/.*[\\/]/, '')
        const key = destinationUri.key.endsWith('/') || !destinationUri.key
          ? `${destinationUri.key}${basename}`
          : destinationUri.key
        actions.uploadObject(bucket.name, {
          key,
          size: 1024,
          type: 'application/octet-stream',
        })
        return { output: `upload: ${args[0]} to ${args[1]}`, success: true }
      }

      if (sourceUri && destinationUri) {
        if (sourceUri.bucket === destinationUri.bucket && sourceUri.key === destinationUri.key) {
          return { output: `${command}: source and destination are the same object`, success: false }
        }
        const source = actions.buckets.find((item) => item.name === sourceUri.bucket)
        const object = source?.objects.find((item) => item.key === sourceUri.key)
        if (!object || object.deleteMarker) return { output: `NoSuchKey: ${sourceUri.key}`, success: false }
        const destination = actions.buckets.find((item) => item.name === destinationUri.bucket)
        if (!destination) return { output: `NoSuchBucket: ${destinationUri.bucket}`, success: false }
        const key = destinationUri.key.endsWith('/') || !destinationUri.key
          ? `${destinationUri.key}${sourceUri.key.replace(/.*\//, '')}`
          : destinationUri.key
        actions.uploadObject(destination.name, {
          key,
          size: object.size,
          type: object.type,
        })
        if (command === 'mv') actions.deleteObject(source!.name, object.key)
        return { output: `${command === 'mv' ? 'move' : 'copy'}: ${args[0]} to ${args[1]}`, success: true }
      }
      return { output: `usage: aws s3 ${command} <source> <destination>`, success: false }
    }

    if (command === 'rb') {
      const uri = parseS3Uri(args[0] ?? '')
      if (!uri) return { output: 'usage: aws s3 rb s3://bucket-name', success: false }
      if (!actions.deleteBucket) return { output: 'remove_bucket is not supported.', success: false }
      const error = actions.deleteBucket(uri.bucket)
      return error
        ? { output: `remove_bucket failed: ${error}`, success: false }
        : { output: `remove_bucket: ${args[0]}`, success: true }
    }

    if (command === 'rm') {
      const uri = parseS3Uri(args[0] ?? '')
      if (!uri) return { output: 'usage: aws s3 rm s3://bucket-name/key', success: false }
      const bucket = actions.buckets.find((item) => item.name === uri.bucket)
      if (!bucket) return { output: `NoSuchBucket: ${uri.bucket}`, success: false }
      const object = bucket.objects.find((item) => item.key === uri.key)
      if (!object) return { output: `NoSuchKey: ${uri.key}`, success: false }
      actions.deleteObject(bucket.name, uri.key)
      return { output: `delete: ${args[0]}`, success: true }
    }

    if (command === 'sync') {
      if (args.length < 2) return { output: 'usage: aws s3 sync <source> <destination>', success: false }
      const destinationUri = parseS3Uri(args[1])
      if (!destinationUri) return { output: 'sync: only local-to-S3 sync is supported in this lab', success: false }
      const bucket = actions.buckets.find((item) => item.name === destinationUri.bucket)
      if (!bucket) return { output: `NoSuchBucket: ${destinationUri.bucket}`, success: false }
      const prefix = destinationUri.key.replace(/\/+$/, '')
      for (const file of [
        { key: 'demo/index.html', size: 2048, type: 'text/html' },
        { key: 'demo/assets/app.css', size: 4096, type: 'text/css' },
        { key: 'demo/assets/app.js', size: 8192, type: 'application/javascript' },
      ]) {
        actions.uploadObject(bucket.name, { ...file, key: prefix ? `${prefix}/${file.key}` : file.key })
      }
      return { output: `upload: demo files to ${args[1]}\nSync complete.`, success: true }
    }
  }

  if (service === 's3api') {
    const bucketArgIndex = args.findIndex((arg) => arg === '--bucket')
    const bucketName = bucketArgIndex >= 0 ? args[bucketArgIndex + 1]?.replace(/["']/g, '') : undefined

    if (command === 'put-bucket-versioning') {
      if (!bucketName) return { output: 'usage: aws s3api put-bucket-versioning --bucket bucket --versioning-configuration Status=Enabled', success: false }
      if (!actions.buckets.some((bucket) => bucket.name === bucketName)) return { output: `NoSuchBucket: ${bucketName}`, success: false }
      const status = args.find((arg) => /Status=(Enabled|Suspended)/i.test(arg))
      if (!status) return { output: 'usage: aws s3api put-bucket-versioning --bucket bucket --versioning-configuration Status=Enabled|Suspended', success: false }
      const enabled = /Status=Enabled/i.test(status)
      actions.setVersioning?.(bucketName, enabled)
      return { output: `Bucket versioning ${enabled ? 'enabled' : 'suspended'} for ${bucketName}.`, success: true }
    }

    if (command === 'list-object-versions') {
      if (!bucketName) return { output: 'usage: aws s3api list-object-versions --bucket bucket', success: false }
      const bucket = actions.buckets.find((item) => item.name === bucketName)
      if (!bucket) return { output: `NoSuchBucket: ${bucketName}`, success: false }
      const lines: string[] = []
      for (const object of bucket.objects) {
        for (const version of object.versions ?? []) {
          lines.push(
            `${version.deleteMarker ? 'DeleteMarker' : 'Version'} ${version.versionId} ${version.size} ${version.createdAt} ${object.key}`,
          )
        }
        lines.push(
          `${object.deleteMarker ? 'DeleteMarker' : 'Version'} ${object.versionId ?? 'null'} ${object.size} ${object.createdAt} ${object.key}`,
        )
      }
      return { output: lines.join('\n') || 'No versions found.', success: true }
    }

    if (command === 'put-bucket-lifecycle-configuration') {
      if (!bucketName) return { output: 'usage: aws s3api put-bucket-lifecycle-configuration --bucket bucket --lifecycle-configuration ...', success: false }
      if (!actions.buckets.some((bucket) => bucket.name === bucketName)) return { output: `NoSuchBucket: ${bucketName}`, success: false }
      const text = args.join(' ')
      const daysMatch = /Days"?\s*[:=]\s*(\d+)/i.exec(text)
      const prefixMatch = /Prefix"?\s*[:=]\s*"?([^",}\s]*)/i.exec(text)
      const glacier = /GLACIER/i.test(text)
      actions.setLifecycleRule?.(bucketName, {
        prefix: prefixMatch?.[1] ?? '',
        transitionAfterDays: daysMatch ? Number(daysMatch[1]) : 30,
        storageClass: glacier ? 'GLACIER' : 'STANDARD_IA',
      })
      return { output: `Lifecycle configuration applied to ${bucketName}.`, success: true }
    }
  }

  return { output: `Unsupported command: aws ${service} ${command ?? ''}`.trim(), success: false }
}
