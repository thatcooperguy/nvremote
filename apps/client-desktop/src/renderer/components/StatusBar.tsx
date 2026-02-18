import React, { useState, useCallback } from 'react';
import { useConnectionStore } from '../store/connectionStore';
import { useHostAgentStore } from '../store/hostAgentStore';
import { colors, layout, typography, transitions, spacing } from '../styles/theme';

export function StatusBar(): React.ReactElement {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connectionStatus = useConnectionStore((s) => s.status);
  const stats = useConnectionStore((s) => s.stats);
  const hostState = useHostAgentStore((s) => s.status.state);
  const signalingConnected = useHostAgentStore((s) => s.status.signalingConnected);
  const streamerStats = useHostAgentStore((s) => s.streamerStats);

  const isStreaming = connectionStatus === 'streaming' || connectionStatus === 'reconnecting';

  const handleCopyDebug = useCallback(async () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      connectionStatus,
      hostState,
      signalingConnected,
      stats: stats || null,
      streamerStats: streamerStats || null,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [connectionStatus, hostState, signalingConnected, stats, streamerStats]);

  return (
    <div style={styles.bar}>
      {/* Left: Signaling status */}
      <div style={styles.segment}>
        <span
          style={{
            ...styles.dot,
            backgroundColor: signalingConnected ? '#76B900' : '#6B7280',
          }}
        />
        <span style={styles.text}>
          {signalingConnected ? 'Signaling connected' : 'Signaling offline'}
        </span>
      </div>

      {/* Center: Live stats when streaming */}
      {isStreaming && stats && (
        <>
          <span style={styles.separator}>|</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {Math.round(stats.rtt)}ms
            </span>
          </div>
          <span style={styles.separator}>&middot;</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {stats.fps} FPS
            </span>
          </div>
          <span style={styles.separator}>&middot;</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {(stats.bitrate / 1000).toFixed(1)} Mbps
            </span>
          </div>
        </>
      )}

      {/* Host streamer stats when hosting */}
      {!isStreaming && hostState === 'running' && streamerStats && (
        <>
          <span style={styles.separator}>|</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {streamerStats.rttMs}ms
            </span>
          </div>
          <span style={styles.separator}>&middot;</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {streamerStats.fps} FPS
            </span>
          </div>
          <span style={styles.separator}>&middot;</span>
          <div style={styles.segment}>
            <span style={styles.text}>
              {(streamerStats.bitrateKbps / 1000).toFixed(1)} Mbps
            </span>
          </div>
        </>
      )}

      {/* Right: Copy debug bundle */}
      <div style={{ flex: 1 }} />
      <button
        style={{
          ...styles.debugButton,
          ...(hoveredItem === 'debug' ? styles.debugButtonHover : {}),
        }}
        onClick={handleCopyDebug}
        onMouseEnter={() => setHoveredItem('debug')}
        onMouseLeave={() => setHoveredItem(null)}
        title="Copy debug info to clipboard"
      >
        {copied ? (
          <>
            <CheckIcon />
            <span>Copied</span>
          </>
        ) : (
          <>
            <CopyIcon />
            <span>Copy debug bundle</span>
          </>
        )}
      </button>
    </div>
  );
}

function CopyIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 3.5V2.5a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: layout.statusBarHeight,
    padding: `0 ${spacing.sm}px`,
    backgroundColor: colors.bg.surface,
    borderTop: `1px solid ${colors.border.default}`,
    flexShrink: 0,
    gap: 6,
  },
  segment: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  text: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  separator: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    lineHeight: 1,
  },
  debugButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    border: 'none',
    background: 'transparent',
    color: colors.text.disabled,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    borderRadius: 4,
    transition: `all ${transitions.fast}`,
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  debugButtonHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: colors.text.secondary,
  },
};
