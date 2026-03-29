import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

type RangeLoader<TData> = (params: { start: string; end: string }) => Promise<TData>;

interface UsePeriodComparisonParams<TData> {
  enabled: boolean;
  queryKey: readonly unknown[];
  start: string;
  end: string;
  load: RangeLoader<TData>;
}

function toIsoDate(value: Date): string {
  return value.toISOString().split('T')[0];
}

function diffInDaysInclusive(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

export function getPreviousPeriodRange(start: string, end: string) {
  const periodDays = diffInDaysInclusive(start, end);
  const currentStart = new Date(`${start}T00:00:00`);
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (periodDays - 1));

  return {
    start: toIsoDate(previousStart),
    end: toIsoDate(previousEnd),
    days: periodDays,
  };
}

export function getPercentDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function usePeriodComparison<TData>({
  enabled,
  queryKey,
  start,
  end,
  load,
}: UsePeriodComparisonParams<TData>) {
  const previousRange = useMemo(() => getPreviousPeriodRange(start, end), [start, end]);

  const currentQuery = useQuery({
    queryKey: [...queryKey, 'current', start, end],
    queryFn: () => load({ start, end }),
    enabled,
  });

  const previousQuery = useQuery({
    queryKey: [...queryKey, 'previous', previousRange.start, previousRange.end],
    queryFn: () => load({ start: previousRange.start, end: previousRange.end }),
    enabled,
  });

  return {
    current: currentQuery.data,
    previous: previousQuery.data,
    previousRange,
    isLoading: currentQuery.isLoading || previousQuery.isLoading,
    isFetching: currentQuery.isFetching || previousQuery.isFetching,
    isError: currentQuery.isError || previousQuery.isError,
  };
}
