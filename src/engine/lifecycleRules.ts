import {
  classLabel,
  detailsFor,
  formatBytes,
  LEARNING_STORAGE_CLASSES,
  type LearningStorageClass,
} from './storageClasses'

export type LifecycleTransitionLike = {
  days: number
  storageClass: string
}

export type LifecycleRuleLike = {
  id?: string
  name: string
  status?: 'Enabled' | 'Disabled'
  prefix?: string
  filterTagKey?: string
  filterTagValue?: string
  filterSizeGreaterThan?: number
  filterSizeLessThan?: number
  transitionDays?: number
  targetClass?: string
  transitions?: LifecycleTransitionLike[]
  expirationDays?: number
  noncurrentTransitions?: LifecycleTransitionLike[]
  noncurrentExpirationDays?: number
  abortIncompleteMultipartDays?: number
}

export type LifecycleObjectLike = {
  key: string
  size: number
  tags?: Record<string, string>
  isFolder?: boolean
  deleteMarker?: boolean
}

export type LifecycleIssue = {
  ruleId?: string
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export type LifecycleMilestone = {
  day: number
  storageClass: string
  expired: boolean
  events: string[]
}

const MINIMUM_TRANSITION_DAYS: Record<string, number> = {
  STANDARD_IA: 30,
  ONE_ZONE_IA: 30,
  GLACIER_IR: 90,
  GLACIER: 90,
  DEEP_ARCHIVE: 180,
}

/** Supports both the simple legacy rule shape and the full learning rule. */
export function resolvedTransitions(rule: LifecycleRuleLike): LifecycleTransitionLike[] {
  const transitions = Array.isArray(rule.transitions)
    ? rule.transitions
    : rule.targetClass && typeof rule.transitionDays === 'number'
      ? [{ days: rule.transitionDays, storageClass: rule.targetClass }]
      : []
  return [...transitions].sort((a, b) => a.days - b.days)
}

export function resolvedNoncurrentTransitions(rule: LifecycleRuleLike): LifecycleTransitionLike[] {
  return [...(rule.noncurrentTransitions ?? [])].sort((a, b) => a.days - b.days)
}

export function ruleMatchesObject(rule: LifecycleRuleLike, object: LifecycleObjectLike): boolean {
  if (object.isFolder) return false
  if (rule.prefix && !object.key.startsWith(rule.prefix)) return false
  if (rule.filterTagKey) {
    const value = object.tags?.[rule.filterTagKey]
    if (value === undefined) return false
    if (rule.filterTagValue && value !== rule.filterTagValue) return false
  }
  if (typeof rule.filterSizeGreaterThan === 'number' && object.size <= rule.filterSizeGreaterThan) return false
  if (typeof rule.filterSizeLessThan === 'number' && object.size >= rule.filterSizeLessThan) return false
  return true
}

/** The class an object should be in after `ageDays` under this rule. */
export function targetClassAtAge(rule: LifecycleRuleLike, ageDays: number): LearningStorageClass | null {
  let target: LearningStorageClass | null = null
  for (const transition of resolvedTransitions(rule)) {
    if (ageDays >= transition.days && isKnownClass(transition.storageClass)) {
      target = transition.storageClass
    }
  }
  return target
}

function isKnownClass(value: string): value is LearningStorageClass {
  return (LEARNING_STORAGE_CLASSES as string[]).includes(value)
}

export function expiryDay(rule: LifecycleRuleLike): number | null {
  return typeof rule.expirationDays === 'number' && rule.expirationDays > 0 ? rule.expirationDays : null
}

/**
 * Applies the real S3 lifecycle validation rules that matter for teaching.
 * Errors block saving; warnings still allow the rule to be stored.
 */
export function validateLifecycleRule(
  rule: LifecycleRuleLike,
  allRules: LifecycleRuleLike[] = [],
  objects: LifecycleObjectLike[] = [],
): LifecycleIssue[] {
  const issues: LifecycleIssue[] = []
  const name = rule.name.trim()
  const ruleId = rule.id

  if (!name) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidRequest',
      message: 'Rule name is required. Use a short, descriptive name such as "archive-images".',
    })
  } else if (allRules.some((candidate) => candidate !== rule && candidate.name.trim().toLowerCase() === name.toLowerCase())) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidRequest',
      message: `A lifecycle rule named "${name}" already exists in this bucket. Rule names must be unique.`,
    })
  }

  const transitions = resolvedTransitions(rule)
  if (
    !transitions.length &&
    !expiryDay(rule) &&
    !resolvedNoncurrentTransitions(rule).length &&
    !rule.noncurrentExpirationDays &&
    !rule.abortIncompleteMultipartDays
  ) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'MalformedXML',
      message: 'A rule must contain at least one action: a transition, an expiration, a noncurrent action, or abort incomplete multipart upload.',
    })
  }

  const seenDays = new Set<number>()
  for (const transition of transitions) {
    if (!Number.isFinite(transition.days) || transition.days < 0) {
      issues.push({
        ruleId,
        severity: 'error',
        code: 'InvalidArgument',
        message: 'Transition days must be zero or a positive whole number.',
      })
      continue
    }
    if (seenDays.has(transition.days)) {
      issues.push({
        ruleId,
        severity: 'error',
        code: 'InvalidArgument',
        message: `Two transitions are scheduled for day ${transition.days}. S3 allows only one transition per day.`,
      })
    }
    seenDays.add(transition.days)

    if (!isKnownClass(transition.storageClass)) {
      issues.push({
        ruleId,
        severity: 'error',
        code: 'InvalidStorageClass',
        message: `${transition.storageClass} is not a valid lifecycle transition target.`,
      })
      continue
    }
    if (transition.storageClass === 'STANDARD') {
      issues.push({
        ruleId,
        severity: 'warning',
        code: 'InvalidStorageClass',
        message: 'S3 lifecycle rules cannot transition objects back to Standard. Standard is only the starting class.',
      })
    }
    const minimum = MINIMUM_TRANSITION_DAYS[transition.storageClass] ?? 0
    if (minimum && transition.days < minimum) {
      issues.push({
        ruleId,
        severity: 'error',
        code: 'InvalidArgument',
        message: `${classLabel(transition.storageClass)} requires at least ${minimum} days before transition. Change day ${transition.days} to ${minimum} or later.`,
      })
    }
  }

  for (let index = 1; index < transitions.length; index += 1) {
    if (transitions[index].days <= transitions[index - 1].days) {
      issues.push({
        ruleId,
        severity: 'error',
        code: 'InvalidArgument',
        message: 'Transitions must move forward in time. Order transitions from the cheapest early class to the deepest archive class.',
      })
      break
    }
  }

  const iaTransition = transitions.find((transition) =>
    transition.storageClass === 'STANDARD_IA' || transition.storageClass === 'ONE_ZONE_IA',
  )
  const glacierTransition = transitions.find((transition) =>
    transition.storageClass === 'GLACIER_IR' || transition.storageClass === 'GLACIER' || transition.storageClass === 'DEEP_ARCHIVE',
  )
  if (glacierTransition && iaTransition && glacierTransition.days < iaTransition.days) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidArgument',
      message: 'A Glacier transition must come after the Standard-IA transition. Move the archive transition to a later day.',
    })
  } else if (glacierTransition && !iaTransition) {
    issues.push({
      ruleId,
      severity: 'warning',
      code: 'InvalidArgument',
      message: 'Best practice: transition to Standard-IA before Glacier so rarely accessed data leaves the most expensive class first.',
    })
  }

  const expiration = expiryDay(rule)
  const lastTransition = transitions[transitions.length - 1]
  if (expiration && lastTransition && expiration <= lastTransition.days) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidArgument',
      message: `Expiration (day ${expiration}) must be after the last transition (day ${lastTransition.days}). Otherwise the object is deleted before it ever reaches the archive class.`,
    })
  }

  const noncurrentTransitions = resolvedNoncurrentTransitions(rule)
  const noncurrentExpiration = rule.noncurrentExpirationDays
  const lastNoncurrentTransition = noncurrentTransitions[noncurrentTransitions.length - 1]
  if (noncurrentExpiration && lastNoncurrentTransition && noncurrentExpiration <= lastNoncurrentTransition.days) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidArgument',
      message: 'Noncurrent version expiration must be after the last noncurrent transition.',
    })
  }
  for (const transition of noncurrentTransitions) {
    const minimum = MINIMUM_TRANSITION_DAYS[transition.storageClass] ?? 0
    if (minimum && transition.days < minimum) {
      issues.push({
        ruleId,
        severity: 'warning',
        code: 'InvalidArgument',
        message: `Noncurrent transition to ${classLabel(transition.storageClass)} is shorter than the ${minimum}-day minimum storage duration. Early deletion charges may apply.`,
      })
    }
  }

  if (typeof rule.abortIncompleteMultipartDays === 'number' && rule.abortIncompleteMultipartDays < 1) {
    issues.push({
      ruleId,
      severity: 'error',
      code: 'InvalidArgument',
      message: 'Abort incomplete multipart upload must be at least 1 day after initiation.',
    })
  }

  const matchingObjects = objects.filter((object) => ruleMatchesObject(rule, object))
  for (const transition of transitions) {
    if (!isKnownClass(transition.storageClass)) continue
    const detail = detailsFor(transition.storageClass)
    if (!detail.minBillableBytes) continue
    const smallObjects = matchingObjects.filter((object) => object.size > 0 && object.size < detail.minBillableBytes)
    if (smallObjects.length) {
      issues.push({
        ruleId,
        severity: 'warning',
        code: 'ObjectSizeWarning',
        message: `${smallObjects.length} matching object${smallObjects.length === 1 ? ' is' : 's are'} smaller than ${formatBytes(detail.minBillableBytes)}. ${classLabel(transition.storageClass)} bills a minimum object size, so savings may be lower than expected.`,
      })
      break
    }
  }

  return issues
}

export function validateLifecycleRules(
  rules: LifecycleRuleLike[],
  objects: LifecycleObjectLike[] = [],
): LifecycleIssue[] {
  return rules.flatMap((rule) => validateLifecycleRule(rule, rules, objects))
}

export function hasBlockingIssues(issues: LifecycleIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

/**
 * Shows the state of an object at the four teaching milestones. This is what
 * the visual lifecycle timeline renders.
 */
export function lifecycleMilestones(
  rule: LifecycleRuleLike,
  milestones: number[] = [0, 30, 90, 365],
): LifecycleMilestone[] {
  return milestones.map((day) => {
    const target = targetClassAtAge(rule, day)
    const events: string[] = []
    if (day === 0) events.push('Object created in S3 Standard')
    for (const transition of resolvedTransitions(rule)) {
      if (transition.days === day) events.push(`Transition to ${classLabel(transition.storageClass)}`)
    }
    const expiration = expiryDay(rule)
    const expired = Boolean(expiration !== null && expiration <= day)
    if (expiration !== null && expiration === day) events.push('Current version expires')
    if (expired && expiration !== day) events.push('Object is already expired')
    for (const transition of resolvedNoncurrentTransitions(rule)) {
      if (transition.days === day) events.push(`Previous versions move to ${classLabel(transition.storageClass)}`)
    }
    if (typeof rule.noncurrentExpirationDays === 'number' && rule.noncurrentExpirationDays === day) {
      events.push('Previous versions expire')
    }
    if (typeof rule.abortIncompleteMultipartDays === 'number' && rule.abortIncompleteMultipartDays === day) {
      events.push('Incomplete multipart uploads abort')
    }
    if (!events.length) events.push('No lifecycle action scheduled')
    return {
      day,
      storageClass: topLevelClass(rule, day, target),
      expired,
      events,
    }
  })
}

function topLevelClass(rule: LifecycleRuleLike, day: number, target: LearningStorageClass | null): string {
  if (target) return target
  void rule
  void day
  return 'STANDARD'
}

export function lifecycleSummary(rule: LifecycleRuleLike): string {
  const parts: string[] = []
  if (rule.prefix) parts.push(`prefix ${rule.prefix}`)
  if (rule.filterTagKey) parts.push(`tag ${rule.filterTagKey}=${rule.filterTagValue ?? '*'}`)
  if (typeof rule.filterSizeGreaterThan === 'number') parts.push(`size > ${formatBytes(rule.filterSizeGreaterThan)}`)
  if (typeof rule.filterSizeLessThan === 'number') parts.push(`size < ${formatBytes(rule.filterSizeLessThan)}`)
  return parts.length ? parts.join(' · ') : 'All objects'
}
