// US equity market hours (NYSE/NASDAQ): 9:30 AM - 4:00 PM ET, weekdays.
// DST-aware: uses Intl API to get the actual America/New_York wall clock,
// so we don't need to track EDT/EST transitions manually.

const HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

export function isUsMarketOpen(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});

  const weekday = parts.weekday;              // "Mon", "Tue", ...
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (HOLIDAYS_2026.has(dateKey)) return false;

  const hour   = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const minutes = hour * 60 + minute;

  // 9:30 AM (570) to 4:00 PM (960) ET
  return minutes >= 570 && minutes < 960;
}
