/**
 * FilterBar.tsx — Session filter bar with dropdowns and action buttons.
 *
 * Provides date range, host, and outcome filters + Export/Copy buttons.
 */

import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';
import { Button } from './Button';
import { toast } from './Toast';

export interface FilterState {
  dateRange: 'all' | '7d' | '30d' | '90d';
  host: string;
  status: 'all' | 'active' | 'completed' | 'failed' | 'terminated';
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  hostOptions: { value: string; label: string }[];
  sessions: unknown[];
  onExport: () => void;
  onCopy: () => void;
}

export function FilterBar({
  filters,
  onChange,
  hostOptions,
  sessions,
  onExport,
  onCopy,
}: FilterBarProps): React.ReactElement {
  const handleChange = useCallback(
    (key: keyof FilterState, value: string) => {
      onChange({ ...filters, [key]: value });
    },
    [filters, onChange]
  );

  return (
    <div style={styles.bar}>
      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Date Range</label>
          <select
            value={filters.dateRange}
            onChange={(e) => handleChange('dateRange', e.target.value)}
            style={styles.select}
          >
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Host</label>
          <select
            value={filters.host}
            onChange={(e) => handleChange('host', e.target.value)}
            style={styles.select}
          >
            <option value="all">All Hosts</option>
            {hostOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Outcome</label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            style={styles.select}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        <div style={styles.resultCount}>
          <span style={styles.resultText}>{(sessions as unknown[]).length} sessions</span>
        </div>
      </div>

      <div style={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10 4V3C10 2.44772 9.55228 2 9 2H3C2.44772 2 2 2.44772 2 3V9C2 9.55228 2.44772 10 3 10H4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={onExport}>
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <path d="M7 2V9M7 9L4 6.5M7 9L10 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 10V11C2 11.5523 2.44772 12 3 12H11C11.5523 12 12 11.5523 12 11V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Export
        </Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  filterLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: typography.fontWeight.medium,
  },
  select: {
    height: 32,
    padding: `0 ${spacing.sm + 2}px`,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    outline: 'none',
    cursor: 'pointer',
    transition: `border-color ${transitions.fast}`,
    minWidth: 120,
  },
  resultCount: {
    display: 'flex',
    alignItems: 'center',
    height: 32,
  },
  resultText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
  actions: {
    display: 'flex',
    gap: spacing.xs,
  },
};
