import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, radius, spacing, typography, shadows } from '../styles/theme';
import { Button } from './Button';
import { StatusBadge, type HostStatus } from './StatusBadge';

export interface Host {
  id: string;
  name: string;
  hostname: string;
  status: HostStatus;
  gpuModel?: string;
  gpuVram?: string;
  latencyMs?: number;
  os?: string;
  hostVersion?: string;
}

interface HostCardProps {
  host: Host;
  onConnect: (hostId: string) => void;
  connecting?: boolean;
}

export function HostCard({
  host,
  onConnect,
  connecting = false,
}: HostCardProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();

  const handleConnect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onConnect(host.id);
    },
    [host.id, onConnect]
  );

  const handleCardClick = useCallback(() => {
    navigate(`/hosts/${host.id}`);
  }, [host.id, navigate]);

  const isOnline = host.status === 'online';

  return (
    <div
      style={{
        ...styles.card,
        ...(isHovered ? styles.cardHovered : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={styles.name}>{host.name}</h3>
          <span style={styles.hostname}>{host.hostname}</span>
        </div>
        <StatusBadge status={host.status} />
      </div>

      {/* Info Row */}
      <div style={styles.infoRow}>
        {host.gpuModel && (
          <div style={styles.gpuBadge} title={`${host.gpuModel}${host.gpuVram ? ` (${host.gpuVram})` : ''}`}>
            <GpuIcon />
            <span>{host.gpuModel}</span>
            {host.gpuVram && (
              <span style={styles.vram}>{host.gpuVram}</span>
            )}
          </div>
        )}
        {host.os && (
          <span style={styles.osBadge}>{host.os}</span>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        {host.latencyMs !== undefined && (
          <div style={styles.latency}>
            <LatencyIcon latency={host.latencyMs} />
            <span
              style={{
                color: getLatencyColor(host.latencyMs),
              }}
            >
              {host.latencyMs}ms
            </span>
          </div>
        )}
        <div style={styles.footerRight} title={!isOnline ? 'Host is offline' : undefined}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            disabled={!isOnline}
            loading={connecting}
          >
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}

function GpuIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="12" height="8" rx="1.5" stroke={colors.accent.default} strokeWidth="1.2" />
      <rect x="3" y="5" width="3" height="4" rx="0.5" fill={colors.accent.default} opacity="0.5" />
      <rect x="7" y="5" width="3" height="4" rx="0.5" fill={colors.accent.default} opacity="0.5" />
    </svg>
  );
}

function LatencyIcon({ latency }: { latency: number }): React.ReactElement {
  const color = getLatencyColor(latency);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.2" />
      <path d="M7 4V7.5L9.5 9" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function getLatencyColor(latency: number): string {
  if (latency < 20) return colors.semantic.success;
  if (latency < 50) return colors.semantic.warning;
  return colors.semantic.error;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    cursor: 'pointer',
    transition: 'all 250ms ease',
    outline: 'none',
  },
  cardHovered: {
    borderColor: colors.border.hover,
    boxShadow: `${shadows.md}, ${shadows.glow}`,
    transform: 'translateY(-2px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  name: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  hostname: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontFamily: typography.fontMono,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  gpuBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    backgroundColor: colors.accent.muted,
    borderRadius: radius.full,
    fontSize: typography.fontSize.xs,
    color: colors.accent.default,
    fontWeight: typography.fontWeight.medium,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  vram: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  osBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.full,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTop: `1px solid ${colors.border.default}`,
  },
  latency: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
};
