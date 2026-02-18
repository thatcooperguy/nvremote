import React, { useState, useCallback, useEffect } from 'react';
import { colors, spacing, typography, radius, transitions, statusColors } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { CopyButton } from '../components/CopyButton';
import { useHostStore } from '../store/hostStore';
import { toast } from '../components/Toast';
import type { Host } from '../components/HostCard';

export function DevicesPage(): React.ReactElement {
  const hosts = useHostStore((s) => s.hosts);
  const isLoading = useHostStore((s) => s.isLoading);
  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchHosts().catch(() => {});
  }, [fetchHosts]);

  const renameHost = useHostStore((s) => s.renameHost);

  const handleRevoke = useCallback((host: Host) => {
    toast.info(`Revoke access for "${host.name}" — coming soon`);
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Devices</h1>
            <p style={styles.subtitle}>
              Manage all paired hosts and clients
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchHosts()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && hosts.length === 0 ? (
        <Card>
          <div style={styles.emptyState}>
            <span style={styles.emptyText}>Loading devices...</span>
          </div>
        </Card>
      ) : hosts.length === 0 ? (
        <Card>
          <div style={styles.emptyState}>
            <EmptyDevicesIcon />
            <span style={styles.emptyTitle}>No devices</span>
            <span style={styles.emptyText}>
              Pair with a host from the Client page to see it here
            </span>
          </div>
        </Card>
      ) : (
        <div style={styles.table}>
          {/* Table header */}
          <div style={styles.tableHeader}>
            <span style={{ ...styles.headerCell, flex: 2 }}>Name</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Status</span>
            <span style={{ ...styles.headerCell, flex: 2 }}>GPU</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>OS</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>Last Seen</span>
            <span style={{ ...styles.headerCell, width: 80 }}>Actions</span>
          </div>

          {/* Table rows */}
          {hosts.map((host) => (
            <DeviceRow
              key={host.id}
              host={host}
              expanded={expandedId === host.id}
              onToggle={() => setExpandedId(expandedId === host.id ? null : host.id)}
              onRevoke={() => handleRevoke(host)}
              onRename={async (name) => {
                try {
                  await renameHost(host.id, name);
                  toast.success(`Renamed to "${name}"`);
                } catch {
                  toast.error('Failed to rename device');
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {hosts.length > 0 && (
        <div style={styles.summary}>
          <span style={styles.summaryText}>
            {hosts.length} device{hosts.length !== 1 ? 's' : ''} &middot;{' '}
            {hosts.filter((h) => h.status === 'online').length} online
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Device Row ---------- */

interface DeviceRowProps {
  host: Host;
  expanded: boolean;
  onToggle: () => void;
  onRevoke: () => void;
  onRename: (name: string) => Promise<void>;
}

function DeviceRow({ host, expanded, onToggle, onRevoke, onRename }: DeviceRowProps): React.ReactElement {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(host.name);
  const [saving, setSaving] = useState(false);

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === host.name) {
      setIsRenaming(false);
      setRenameValue(host.name);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
      setIsRenaming(false);
    } catch {
      setRenameValue(host.name);
      setIsRenaming(false);
    } finally {
      setSaving(false);
    }
  }, [renameValue, host.name, onRename]);

  return (
    <>
      <div
        style={{
          ...styles.tableRow,
          ...(expanded ? styles.tableRowExpanded : {}),
        }}
        onClick={onToggle}
      >
        <div style={{ ...styles.cell, flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: host.status === 'online'
                ? statusColors.connected
                : statusColors.disconnected,
            }}
          />
          <span style={styles.cellText}>{host.name}</span>
        </div>
        <div style={{ ...styles.cell, flex: 1 }}>
          <span style={{
            ...styles.statusBadge,
            color: host.status === 'online' ? statusColors.connected : colors.text.disabled,
            backgroundColor: host.status === 'online'
              ? 'rgba(118, 185, 0, 0.12)'
              : 'rgba(255, 255, 255, 0.04)',
          }}>
            {host.status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
        <div style={{ ...styles.cell, flex: 2 }}>
          <span style={styles.cellTextSecondary}>{host.gpuModel || '—'}</span>
        </div>
        <div style={{ ...styles.cell, flex: 1 }}>
          <span style={styles.cellTextSecondary}>
            {host.os === 'win32' ? 'Windows' :
             host.os === 'darwin' ? 'macOS' :
             host.os === 'linux' ? 'Linux' : host.os || '—'}
          </span>
        </div>
        <div style={{ ...styles.cell, flex: 1 }}>
          <span style={styles.cellTextSecondary}>—</span>
        </div>
        <div style={{ ...styles.cell, width: 80, display: 'flex', justifyContent: 'flex-end' }}>
          <ChevronIcon expanded={expanded} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={styles.expandedPanel}>
          <div style={styles.detailGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Host ID</span>
              <div style={styles.detailValueRow}>
                <span style={styles.detailValueMono}>{host.id}</span>
                <CopyButton text={host.id} />
              </div>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Hostname</span>
              <span style={styles.detailValue}>{host.hostname || '—'}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>GPU</span>
              <span style={styles.detailValue}>{host.gpuModel || 'Unknown'}</span>
            </div>
            {host.gpuVram && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>VRAM</span>
                <span style={styles.detailValue}>{host.gpuVram}</span>
              </div>
            )}
            {host.hostVersion && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Agent Version</span>
                <span style={styles.detailValue}>v{host.hostVersion}</span>
              </div>
            )}
            {host.latencyMs != null && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Latency</span>
                <span style={styles.detailValue}>{host.latencyMs}ms</span>
              </div>
            )}
          </div>
          {/* Inline rename */}
          {isRenaming ? (
            <div style={styles.renameRow}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(host.name); }
                }}
                autoFocus
                style={styles.renameInput}
                disabled={saving}
              />
              <Button size="sm" onClick={handleRenameSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setIsRenaming(false); setRenameValue(host.name); }}>
                Cancel
              </Button>
            </div>
          ) : null}

          <div style={styles.detailActions}>
            <Button variant="secondary" size="sm" onClick={() => { setIsRenaming(true); setRenameValue(host.name); }}>
              Rename
            </Button>
            <Button variant="secondary" size="sm" onClick={onRevoke}>
              Revoke Access
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Icons ---------- */

function EmptyDevicesIcon(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="2" y="4" width="24" height="18" rx="3" stroke={colors.text.disabled} strokeWidth="1.5" />
      <rect x="20" y="14" width="16" height="22" rx="3" stroke={colors.text.disabled} strokeWidth="1.5" />
      <line x1="8" y1="28" x2="16" y2="28" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'none',
        transition: `transform ${transitions.fast}`,
      }}
    >
      <path d="M3.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    maxWidth: 1000,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
  },
  // Table
  table: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border.default}`,
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.sm}px ${spacing.lg}px`,
    backgroundColor: colors.bg.surface,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  headerCell: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.disabled,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border.default}`,
    cursor: 'pointer',
    transition: `background-color ${transitions.fast}`,
  },
  tableRowExpanded: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  cell: {
    display: 'flex',
    alignItems: 'center',
  },
  cellText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  cellTextSecondary: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    padding: '2px 8px',
    borderRadius: radius.full,
  },
  // Expanded panel
  expandedPanel: {
    padding: `${spacing.md}px ${spacing.lg}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border.default}`,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  detailValueMono: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontFamily: typography.fontMono,
  },
  detailValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  renameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border.default}`,
  },
  renameInput: {
    flex: 1,
    height: 32,
    padding: `0 ${spacing.sm}px`,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: `border-color ${transitions.fast}`,
  },
  detailActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border.default}`,
  },
  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xl}px`,
  },
  emptyTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    textAlign: 'center',
  },
  // Summary
  summary: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: `0 ${spacing.xs}px`,
  },
  summaryText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
};
