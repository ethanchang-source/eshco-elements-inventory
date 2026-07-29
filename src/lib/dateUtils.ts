export const toTorontoTime = (date: string | Date): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export const torontoDateOnly = (date: string | Date): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(date))
}

export const getTodayToronto = (): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// Parses a date-only 'YYYY-MM-DD' string (as stored for issued_at, delivery_date,
// payment_date, applied_date, ordered_at, shipped_at, received_at, produced_at, etc.)
// into a Date at local midnight. Never pass a date-only string straight to `new Date()` —
// that parses it as UTC midnight, which formats as the previous day in Toronto.
export const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Safe display formatter for date-only DB columns. Date-only strings are parsed with
// parseLocalDate (no timezone shift); anything else (e.g. a real timestamptz) falls back
// to Intl formatting pinned to America/Toronto.
export const formatDateForDisplay = (
  dateStr: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' },
  locale: string = 'en-CA'
): string => {
  if (!dateStr) return '—'
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return parseLocalDate(dateStr).toLocaleDateString(locale, options)
  }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'America/Toronto' }).format(new Date(dateStr))
}
