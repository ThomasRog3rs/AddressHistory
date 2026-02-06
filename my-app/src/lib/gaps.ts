import type { Address } from "./storage";

export type DateRange = {
  start: string;
  end: string;
};

export type Gap = {
  start: string;
  end: string;
  isLeading: boolean;
  isTrailing: boolean;
};

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function clampDate(date: Date, min: Date, max: Date) {
  if (date < min) {
    return min;
  }
  if (date > max) {
    return max;
  }
  return date;
}

function subtractYears(date: Date, years: number) {
  const year = date.getUTCFullYear() - years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCMonth() !== month) {
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return candidate;
}

export function getLastThreeYearsRange(today = new Date()): DateRange {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = subtractYears(end, 3);
  return { start: formatDate(start), end: formatDate(end) };
}

export function getCoverageGaps(addresses: Address[], range: DateRange): Gap[] {
  const startDate = parseDate(range.start);
  const endDate = parseDate(range.end);
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const ranges = addresses
    .map((address) => {
      const start = parseDate(address.startDate);
      const end = parseDate(address.endDate ?? range.end);
      if (!start || !end || end < start) {
        return null;
      }
      return {
        start: clampDate(start, startDate, endDate),
        end: clampDate(end, startDate, endDate),
      };
    })
    .filter((range): range is { start: Date; end: Date } => Boolean(range))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (ranges.length === 0) {
    return [
      {
        start: range.start,
        end: range.end,
        isLeading: true,
        isTrailing: true,
      },
    ];
  }

  const merged: { start: Date; end: Date }[] = [];
  for (const rangeItem of ranges) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...rangeItem });
      continue;
    }
    const contiguousEnd = addDays(last.end, 1);
    if (rangeItem.start <= contiguousEnd) {
      if (rangeItem.end > last.end) {
        last.end = rangeItem.end;
      }
    } else {
      merged.push({ ...rangeItem });
    }
  }

  const gaps: Gap[] = [];
  if (merged[0].start > startDate) {
    gaps.push({
      start: formatDate(startDate),
      end: formatDate(addDays(merged[0].start, -1)),
      isLeading: true,
      isTrailing: false,
    });
  }

  for (let index = 0; index < merged.length - 1; index += 1) {
    const current = merged[index];
    const next = merged[index + 1];
    const gapStart = addDays(current.end, 1);
    const gapEnd = addDays(next.start, -1);
    if (gapStart <= gapEnd) {
      gaps.push({
        start: formatDate(gapStart),
        end: formatDate(gapEnd),
        isLeading: false,
        isTrailing: false,
      });
    }
  }

  const lastRange = merged[merged.length - 1];
  if (lastRange.end < endDate) {
    gaps.push({
      start: formatDate(addDays(lastRange.end, 1)),
      end: formatDate(endDate),
      isLeading: false,
      isTrailing: true,
    });
  }

  return gaps;
}

export function getLastThreeYearGaps(addresses: Address[], today = new Date()) {
  const range = getLastThreeYearsRange(today);
  return getCoverageGaps(addresses, range);
}
