import React, { useMemo } from 'react';
import { useConnectionStore, ConnectionStatus } from '../store/connectionStore';
import { useHostAgentStore } from '../store/hostAgentStore';
import { colors, radius, typography, transitions, statusColors } from '../styles/theme';

type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'hosting' | 'streaming' | 'error';

interface StatusInfo {
  label: string;
  color: string;
}

const STATUS_MAP: Record<AppStatus, StatusInfo> = {
  disconnected: { label: 'Disconnected', color: statusColors.disconnected },
  connecting:   { label: 'Connecting',    color: statusColors.connecting },
  connected:    { label: 'Connected',     color: statusColors.connected },
  hosting:      { label: 'Hosting',       color: statusColors.hosting },
  streaming:    { label: 'Streaming',     color: statusColors.streaming },
  error:        { label: 'Error',         color: statusColors.error },
};

function deriveStatus(
  connectionStatus: ConnectionStatus,
  hostState: string,
): AppStatus {
  // Error takes priority
  if (connectionStatus === 'error') return 'error';
  if (hostState === 'error') return 'error';

  // Active streaming
  if (connectionStatus === 'streaming' || connectionStatus === 'reconnecting') {
    return 'streaming';
  }

  // Connecting phases
  if (
    connectionStatus === 'requesting' ||
    connectionStatus === 'signaling' ||
    connectionStatus === 'ice-gathering' ||
    connectionStatus === 'connecting'
  ) {
    return 'connecting';
  }

  // Connected (has an active connection but not streaming)
  if (connectionStatus === 'connected') return 'connected';

  // Host agent running
  if (hostState === 'running') return 'hosting';
  if (hostState === 'starting') return 'connecting';

  return 'disconnected';
}

export function StatusPill(): React.ReactElement {
  const connectionStatus = useConnectionStore((s) => s.status);
  const hostState = useHostAgentStore((s) => s.status.state);

  const appStatus = useMemo(
    () => deriveStatus(connectionStatus, hostState),
    [connectionStatus, hostState],
  );

  const info = STATUS_MAP[appStatus];

  return (
    <div style={styles.pill}>
      <span
        style={{
          ...styles.dot,
          backgroundColor: info.color,
          boxShadow: `0 0 6px ${info.color}`,
        }}
      />
      <span style={styles.label}>{info.label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    transition: `all ${transitions.fast}`,
    userSelect: 'none',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    flexShrink: 0,
    transition: `all ${transitions.fast}`,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    letterSpacing: '0.3px',
    lineHeight: 1,
  },
};
