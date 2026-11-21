export type PolicyStatement = {
  Effect: 'Allow' | 'Deny'
  Principal?: '*' | string
  Action: string | string[]
  Resource: string | string[]
}

export type BucketPolicy = {
  Version: '2012-10-17'
  Statement: PolicyStatement[]
}

export function evaluatePolicy(policy: unknown, principal: string, action: string, resource: string) {
  if (!policy || typeof policy !== 'object') return 'Implicit deny'

  const candidate = policy as { Statement?: PolicyStatement | PolicyStatement[] }
  const statements = Array.isArray(candidate.Statement)
    ? candidate.Statement
    : candidate.Statement
      ? [candidate.Statement]
      : []

  const matches = statements.filter((statement) => {
    const principalMatches = !statement.Principal || statement.Principal === '*' || statement.Principal === principal
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]
    const actionMatches = actions.some((pattern) => matchWildcard(pattern, action))
    const resourceMatches = resources.some((pattern) => matchWildcard(pattern, resource))
    return principalMatches && actionMatches && resourceMatches
  })

  if (matches.some((statement) => statement.Effect === 'Deny')) return 'Explicit deny'
  if (matches.some((statement) => statement.Effect === 'Allow')) return 'Allowed'
  return 'Implicit deny'
}

export function validatePolicyJson(text: string): BucketPolicy | null {
  try {
    const policy = JSON.parse(text) as Partial<BucketPolicy>
    if (policy.Version !== '2012-10-17' || !Array.isArray(policy.Statement)) return null
    if (!policy.Statement.every((statement) =>
      (statement.Effect === 'Allow' || statement.Effect === 'Deny') &&
      (typeof statement.Action === 'string' || Array.isArray(statement.Action)) &&
      (typeof statement.Resource === 'string' || Array.isArray(statement.Resource))
    )) return null
    return policy as BucketPolicy
  } catch {
    return null
  }
}

function matchWildcard(pattern: string, value: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`).test(value)
}
