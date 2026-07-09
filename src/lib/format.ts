export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'unknown';
  }

  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatRoute(origin?: string | null, destination?: string | null): string {
  return `${origin || 'unknown'} to ${destination || 'unknown'}`;
}
