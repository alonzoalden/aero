export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatMeasurement(value: number | null | undefined, unit: string): string | null {
  const formattedValue = formatNumber(value);
  return formattedValue === null ? null : `${formattedValue} ${unit}`;
}

export function formatRoute(origin?: string | null, destination?: string | null): string | null {
  if (!hasDisplayText(origin) || !hasDisplayText(destination)) {
    return null;
  }

  return `${origin.trim()} to ${destination.trim()}`;
}

export function hasDisplayText(value?: string | null): value is string {
  if (!value?.trim()) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue !== 'unknown' && normalizedValue !== 'undefined' && normalizedValue !== 'null';
}
