/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Midnight at the start of the day `timestamp` falls in, in the viewer's own timezone. */
const startOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Whole days between two instants, counted by calendar day rather than elapsed hours. */
const calendarDaysAgo = (timestamp: number, now: number): number =>
  Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY);

/**
 * A short, human "when" for a chat row: "just now", "12 minutes ago", "yesterday", "3 days
 * ago", "last month".
 *
 * Uses `Intl.RelativeTimeFormat` so the wording and pluralisation follow the project's data
 * locale rather than being hardcoded English. Anything under a minute reads as "now"; past a
 * week it counts weeks, then months, then years.
 */
export const formatRelative = (
  timestamp: number,
  locale = 'en',
  now: number = Date.now()
): string => {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) return formatter.format(0, 'second');
  if (elapsed < HOUR)
    return formatter.format(-Math.floor(elapsed / MINUTE), 'minute');

  const days = calendarDaysAgo(timestamp, now);
  if (days === 0) return formatter.format(-Math.floor(elapsed / HOUR), 'hour');
  if (days < 7) return formatter.format(-days, 'day');
  if (days < 30) return formatter.format(-Math.floor(days / 7), 'week');
  if (days < 365) return formatter.format(-Math.floor(days / 30), 'month');
  return formatter.format(-Math.floor(days / 365), 'year');
};

/** Just the time of day, e.g. "10:29". For rows already grouped under a day heading. */
export const formatClock = (timestamp: number, locale = 'en'): string =>
  new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

/** A short absolute date, e.g. "17 Sep". For rows older than this week. */
export const formatShortDate = (timestamp: number, locale = 'en'): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(timestamp)
  );

export type DayGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

/** Which heading a chat row belongs under in the Chats drawer. */
export const dayGroup = (
  timestamp: number,
  now: number = Date.now()
): DayGroup => {
  const days = calendarDaysAgo(timestamp, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'thisWeek';
  return 'older';
};

export const DAY_GROUP_LABELS: Record<DayGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'Earlier this week',
  older: 'Older',
};

/** The order headings appear in, newest first. */
export const DAY_GROUP_ORDER: DayGroup[] = [
  'today',
  'yesterday',
  'thisWeek',
  'older',
];

/**
 * The "when" shown on a chat row: a clock time for today, a relative phrase this week, and a
 * short date beyond that. Keeps the recent list scannable without a heading for every row.
 */
export const formatRowTime = (
  timestamp: number,
  locale = 'en',
  now: number = Date.now()
): string => {
  const group = dayGroup(timestamp, now);
  if (group === 'today') return formatClock(timestamp, locale);
  if (group === 'yesterday' || group === 'thisWeek') {
    return formatRelative(timestamp, locale, now);
  }
  return formatShortDate(timestamp, locale);
};
