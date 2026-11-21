export type MonthlyUsage = {
  standardBytes: number
  standardIaBytes: number
  glacierBytes: number
  putRequests: number
  getRequests: number
}

export function calculateEstimatedCost(usage: MonthlyUsage) {
  const gb = 1024 * 1024 * 1024
  return {
    storage:
      (usage.standardBytes / gb) * 0.023 +
      (usage.standardIaBytes / gb) * 0.0125 +
      (usage.glacierBytes / gb) * 0.004,
    requests:
      (usage.putRequests / 1000) * 0.005 +
      (usage.getRequests / 1000) * 0.0004,
  }
}
