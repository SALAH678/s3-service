export type PolicyDecision = 'Allowed' | 'Explicit deny' | 'Implicit deny'

type Statement = {
  Effect: 'Allow' | 'Deny'
  Principal?: '*' | string
  Action: string | string[]
  Resource: string | string[]
}

export function evaluateBucketPolicy(
  policyText: string,
  principal: string,
  action: string,
  resource: string,
): PolicyDecision {
  try {
    const policy = JSON.parse(policyText) as { Statement?: Statement | Statement[] }
    const statements = Array.isArray(policy.Statement)
      ? policy.Statement
      : policy.Statement
        ? [policy.Statement]
        : []

    const matches = statements.filter((statement) => {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]
      return (!statement.Principal || statement.Principal === '*' || statement.Principal === principal)
        && actions.some((pattern) => wildcardMatches(pattern, action))
        && resources.some((pattern) => wildcardMatches(pattern, resource))
    })

    if (matches.some((statement) => statement.Effect === 'Deny')) return 'Explicit deny'
    if (matches.some((statement) => statement.Effect === 'Allow')) return 'Allowed'
  } catch {
    return 'Implicit deny'
  }
  return 'Implicit deny'
}

function wildcardMatches(pattern: string, value: string) {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${expression}$`).test(value)
}
