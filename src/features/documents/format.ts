export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  const digits = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[exponent]}`
}

export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diff = now - timestamp
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  const startOfDay = new Date(now).setHours(0, 0, 0, 0)
  if (timestamp >= startOfDay) {
    const hours = Math.floor(diff / 3_600_000)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const startOfYesterday = startOfDay - 86_400_000
  if (timestamp >= startOfYesterday) return 'Yesterday'
  if (timestamp >= startOfDay - 7 * 86_400_000) {
    const days = Math.floor((startOfDay - timestamp) / 86_400_000)
    return `${days} days ago`
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
