import React, { useState, useCallback, useMemo } from 'react';
import { colors, spacing, typography, radius, transitions, statusColors } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ToggleRow } from '../components/ToggleRow';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { toast } from '../components/Toast';
import type { Host } from '../components/HostCard';
import type { HostStatus } from '../components/StatusBadge';

export function ClientPage(): React.ReactElement {
  const hosts = useHostStore((s) => s.hosts);
  const isLoading = useHostStore((s) => s.isLoading);
  const connect = useConnectionStore((s) => s.connect);
  const connectionStatus = useConnectionStore((s) => s.status);
  const connectedHostId = useConnectionStore((s) => s.hostId);

  const [directHostId, setDirectHostId] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  // Client preferences (local state for now)
  const [hardwareDecode, setHardwareDecode] = useState(true);
  const [vsync, setVsync] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);

  const isConnecting = connectionStatus === 'requesting' ||
    connectionStatus === 'signaling' ||
    connectionStatus === 'ice-gathering' ||
    connectionStatus === 'connecting';

  const handleConnect = useCallback(async (host: Host) => {
    setConnectingId(host.id);
    try {
      await connect(host);
    } catch (err) {
      toast.error((err as Error).message || 'Connection failed');
    } finally {
      setConnectingId(null);
    }
  }, [connect]);

  const handleDirectConnect = useCallback(async () => {
    const id = directHostId.trim();
    if (!id) {
      toast.error('Enter a Host ID');
      return;
    }
    // Try to find in existing hosts first
    const existing = hosts.find((h) => h.id === id);
    if (existing) {
      await handleConnect(existing);
    } else {
      toast.info('Looking up host...');
      try {
        // Create a minimal host object for direct connection
        const host: Host = {
          id,
          name: `Host ${id.slice(0, 8)}`,
          hostname: '',
          status: 'online' as HostStatus,
        };
        await handleConnect(host);
      } catch (err) {
        toast.error((err as Error).message || 'Host not found');
      }
    }
  }, [directHostId, hosts, handleConnect]);

  const handlePairCode = useCallback(() => {
    toast.info('Pair code feature coming soon');
  }, []);

  // Sort: online first, then by name
  const sortedHosts = useMemo(() => {
    return [...hosts].sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [hosts]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Client</h1>
        <p style={styles.subtitle}>
          Connect to a host and start streaming
        </p>
      </div>

      {/* Section 1: Paired Hosts */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Paired Hosts</h2>
        {isLoading && hosts.length === 0 ? (
          <Card>
            <div style={styles.emptyState}>
              <span style={styles.emptyText}>Loading hosts...</span>
            </div>
          </Card>
        ) : sortedHosts.length === 0 ? (
          <Card>
            <div style={styles.emptyState}>
              <NoHostsIcon />
              <span style={styles.emptyTitle}>No paired hosts</span>
              <span style={styles.emptyText}>
                Enter a pair code or Host ID below to add one
              </span>
            </div>
          </Card>
        ) : (
          <div style={styles.hostList}>
            {sortedHosts.map((host) => {
              const isThisConnecting = connectingId === host.id && isConnecting;
              const isThisConnected = connectedHostId === host.id &&
                (connectionStatus === 'connected' || connectionStatus === 'streaming');

              return (
                <div key={host.id} style={styles.hostRow}>
                  <div style={styles.hostInfo}>
                    <div style={styles.hostNameRow}>
                      <span
                        style={{
                          ...styles.statusDot,
                          backgroundColor: host.status === 'online'
                            ? statusColors.connected
                            : statusColors.disconnected,
                        }}
                      />
                      <span style={styles.hostName}>{host.name}</span>
                    </div>
                    <div style={styles.hostMeta}>
                      {host.gpuModel && (
                        <span style={styles.gpuBadge}>{host.gpuModel}</span>
                      )}
                      {host.latencyMs != null && (
                        <span style={styles.latencyText}>{host.latencyMs}ms</span>
                      )}
                      <span style={styles.statusText}>
                        {host.status === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isThisConnected ? 'secondary' : 'primary'}
                    disabled={host.status !== 'online' || isThisConnecting}
                    onClick={() => handleConnect(host)}
                  >
                    {isThisConnecting ? 'Connecting...' :
                     isThisConnected ? 'Connected' : 'Connect'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Enter Pair Code */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Enter Pair Code</h2>
        <Card>
          <div style={styles.pairCodeSection}>
            <p style={styles.pairCodeDesc}>
              Get a 6-character code from the host device to pair
            </p>
            <div style={styles.pairCodeInputRow}>
              <PairCodeInput onSubmit={handlePairCode} />
            </div>
          </div>
        </Card>
      </div>

      {/* Section 3: Direct Connect */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Direct Connect</h2>
        <Card>
          <div style={styles.directConnectSection}>
            <p style={styles.pairCodeDesc}>
              Connect directly using a Host ID
            </p>
            <div style={styles.directRow}>
              <input
                type="text"
                placeholder="Enter Host ID..."
                value={directHostId}
                onChange={(e) => setDirectHostId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDirectConnect()}
                style={styles.textInput}
              />
              <Button
                size="sm"
                onClick={handleDirectConnect}
                disabled={!directHostId.trim() || isConnecting}
              >
                Connect
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Section 4: Client Preferences */}
      <div style={styles.section}>
        <button
          onClick={() => setShowPrefs(!showPrefs)}
          style={styles.collapsibleHeader}
        >
          <h2 style={styles.sectionTitle}>Client Preferences</h2>
          <ChevronIcon expanded={showPrefs} />
        </button>
        {showPrefs && (
          <Card>
            <div style={styles.prefsList}>
              <ToggleRow
                label="Hardware Decoding"
                description="Use GPU-accelerated video decoding for better performance"
                checked={hardwareDecode}
                onChange={setHardwareDecode}
              />
              <div style={styles.divider} />
              <ToggleRow
                label="VSync"
                description="Synchronize frame rendering to prevent tearing"
                checked={vsync}
                onChange={setVsync}
              />
              <div style={styles.divider} />
              <ToggleRow
                label="Auto-Reconnect"
                description="Automatically reconnect when the connection is interrupted"
                checked={autoReconnect}
                onChange={setAutoReconnect}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------- Pair Code Input ---------- */

function PairCodeInput({ onSubmit }: { onSubmit: (code: string) => void }): React.ReactElement {
  const [chars, setChars] = useState<string[]>(['', '', '', '', '', '']);

  const handleChange = useCallback((index: number, value: string) => {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const newChars = [...chars];
    newChars[index] = char;
    setChars(newChars);

    // Auto-advance to next input
    if (char && index < 5) {
      const next = document.getElementById(`pair-${index + 1}`);
      next?.focus();
    }

    // Auto-submit when all filled
    if (char && index === 5 && newChars.every(Boolean)) {
      onSubmit(newChars.join(''));
    }
  }, [chars, onSubmit]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !chars[index] && index > 0) {
      const prev = document.getElementById(`pair-${index - 1}`);
      prev?.focus();
    }
  }, [chars]);

  return (
    <div style={styles.pairCodeGrid}>
      {chars.map((char, i) => (
        <input
          key={i}
          id={`pair-${i}`}
          type="text"
          maxLength={1}
          value={char}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={styles.pairCodeChar}
          aria-label={`Code character ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ---------- Icons ---------- */

function NoHostsIcon(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="4" y="8" width="32" height="20" rx="3" stroke={colors.text.disabled} strokeWidth="1.5" />
      <line x1="20" y1="28" x2="20" y2="33" stroke={colors.text.disabled} strokeWidth="1.5" />
      <line x1="14" y1="33" x2="26" y2="33" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 18l8 0" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'none',
        transition: `transform ${transitions.fast}`,
      }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    maxWidth: 800,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
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
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  // Host list
  hostList: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border.default}`,
    overflow: 'hidden',
  },
  hostRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  hostInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  hostNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  hostName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  hostMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 16, // align with name after dot
  },
  gpuBadge: {
    fontSize: typography.fontSize.xs,
    color: colors.accent.default,
    backgroundColor: colors.accent.muted,
    padding: '1px 6px',
    borderRadius: radius.sm,
    fontWeight: typography.fontWeight.medium,
  },
  latencyText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontFamily: typography.fontMono,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
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
  // Pair code
  pairCodeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    alignItems: 'center',
  },
  pairCodeDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    margin: 0,
    textAlign: 'center',
  },
  pairCodeInputRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  pairCodeGrid: {
    display: 'flex',
    gap: spacing.sm,
  },
  pairCodeChar: {
    width: 44,
    height: 52,
    textAlign: 'center',
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontMono,
    color: colors.text.primary,
    backgroundColor: colors.bg.elevated,
    border: `2px solid ${colors.border.default}`,
    borderRadius: radius.md,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
    caretColor: colors.accent.default,
  },
  // Direct connect
  directConnectSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  directRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 36,
    padding: `0 ${spacing.sm}px`,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontMono,
    color: colors.text.primary,
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
  },
  // Collapsible preferences
  collapsibleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
  },
  prefsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.xs}px 0`,
  },
};
