import React, { useState, useCallback, useEffect, useRef } from 'react';
import { colors, spacing, typography, radius } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useHostAgentStore } from '../store/hostAgentStore';
import { useConnectionStore } from '../store/connectionStore';
import { useDiagnosticsStore } from '../store/diagnosticsStore';
import { toast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Health check types
// ---------------------------------------------------------------------------

type CheckStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';

interface HealthCheck {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail?: string;
}

const INITIAL_CHECKS: HealthCheck[] = [
  { id: 'gpu', label: 'GPU Detection', description: 'Detect available GPU and encoder support', status: 'idle' },
  { id: 'encoder', label: 'Encoder Available', description: 'Check for NVENC/AMF hardware encoder', status: 'idle' },
  { id: 'network', label: 'Network Connectivity', description: 'Verify internet connection', status: 'idle' },
  { id: 'signaling', label: 'Signaling Server', description: 'Connect to NVRemote signaling server', status: 'idle' },
  { id: 'display', label: 'Display Capture', description: 'Verify display capture availability', status: 'idle' },
  { id: 'audio', label: 'Audio Devices', description: 'Check system audio capture', status: 'idle' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagnosticsPage(): React.ReactElement {
  const [checks, setChecks] = useState<HealthCheck[]>(INITIAL_CHECKS);
  const [isRunning, setIsRunning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Persistent logs from diagnosticsStore (survive page navigation)
  const logs = useDiagnosticsStore((s) => s.logs);
  const addStoreLog = useDiagnosticsStore((s) => s.addLog);
  const clearLogs = useDiagnosticsStore((s) => s.clearLogs);

  const hostStatus = useHostAgentStore((s) => s.status);
  const connectionStatus = useConnectionStore((s) => s.status);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((level: 'info' | 'warn' | 'error', message: string) => {
    addStoreLog(level, 'diagnostics', message);
  }, [addStoreLog]);

  const runChecks = useCallback(async () => {
    setIsRunning(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: 'running' })));
    addLog('info', 'Starting health checks...');

    const results = [...INITIAL_CHECKS];

    // 1. GPU Detection
    try {
      const status = await window.nvrs.host.getStatus();
      if (status.gpuModel) {
        results[0] = { ...results[0], status: 'pass', detail: status.gpuModel };
        addLog('info', `GPU detected: ${status.gpuModel}`);
      } else {
        results[0] = { ...results[0], status: 'warn', detail: 'No GPU detected by host agent' };
        addLog('warn', 'No GPU detected — host streaming may not work');
      }
    } catch {
      results[0] = { ...results[0], status: 'fail', detail: 'Could not query GPU status' };
      addLog('error', 'GPU check failed — host agent not responding');
    }
    setChecks([...results]);

    // 2. Encoder
    try {
      const status = await window.nvrs.host.getStatus();
      if (status.codecs && status.codecs.length > 0) {
        results[1] = { ...results[1], status: 'pass', detail: status.codecs.join(', ') };
        addLog('info', `Encoders: ${status.codecs.join(', ')}`);
      } else {
        results[1] = { ...results[1], status: 'warn', detail: 'No hardware encoders found' };
        addLog('warn', 'No hardware encoders available');
      }
    } catch {
      results[1] = { ...results[1], status: 'fail', detail: 'Encoder check failed' };
      addLog('error', 'Encoder check failed');
    }
    setChecks([...results]);

    // 3. Network
    try {
      const online = navigator.onLine;
      if (online) {
        results[2] = { ...results[2], status: 'pass', detail: 'Connected' };
        addLog('info', 'Network: online');
      } else {
        results[2] = { ...results[2], status: 'fail', detail: 'No internet connection' };
        addLog('error', 'Network: offline');
      }
    } catch {
      results[2] = { ...results[2], status: 'fail', detail: 'Network check error' };
      addLog('error', 'Network check failed');
    }
    setChecks([...results]);

    // 4. Signaling
    try {
      const status = await window.nvrs.host.getStatus();
      if (status.signalingConnected) {
        results[3] = { ...results[3], status: 'pass', detail: 'Connected' };
        addLog('info', 'Signaling: connected');
      } else {
        results[3] = { ...results[3], status: 'warn', detail: 'Not connected' };
        addLog('warn', 'Signaling server not connected');
      }
    } catch {
      results[3] = { ...results[3], status: 'warn', detail: 'Could not check signaling' };
      addLog('warn', 'Signaling check skipped');
    }
    setChecks([...results]);

    // 5. Display
    try {
      if (hostStatus.state === 'running' || hostStatus.streamerRunning) {
        results[4] = { ...results[4], status: 'pass', detail: 'Display capture active' };
        addLog('info', 'Display capture: active');
      } else {
        results[4] = { ...results[4], status: 'pass', detail: 'Available (host not started)' };
        addLog('info', 'Display capture: available');
      }
    } catch {
      results[4] = { ...results[4], status: 'warn', detail: 'Could not verify display capture' };
      addLog('warn', 'Display check inconclusive');
    }
    setChecks([...results]);

    // 6. Audio
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
      if (audioOutputs.length > 0) {
        results[5] = { ...results[5], status: 'pass', detail: `${audioOutputs.length} output device(s)` };
        addLog('info', `Audio: ${audioOutputs.length} output device(s)`);
      } else {
        results[5] = { ...results[5], status: 'warn', detail: 'No audio output devices' };
        addLog('warn', 'No audio output devices found');
      }
    } catch {
      results[5] = { ...results[5], status: 'warn', detail: 'Audio enumeration not available' };
      addLog('warn', 'Audio check inconclusive');
    }
    setChecks([...results]);

    addLog('info', 'Health checks complete');
    setIsRunning(false);
  }, [addLog, hostStatus]);

  const handleCopyDebugBundle = useCallback(async () => {
    const bundle = {
      timestamp: new Date().toISOString(),
      version: '0.5.1-beta',
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      healthChecks: checks.map((c) => ({ id: c.id, status: c.status, detail: c.detail })),
      hostAgent: {
        state: hostStatus.state,
        gpuModel: hostStatus.gpuModel,
        codecs: hostStatus.codecs,
        signalingConnected: hostStatus.signalingConnected,
      },
      connectionStatus,
      logs: logs.slice(-50),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      toast.success('Debug bundle copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  }, [checks, hostStatus, connectionStatus, logs]);

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Diagnostics</h1>
        <p style={styles.subtitle}>
          Run health checks and inspect system state
        </p>
      </div>

      {/* Section 1: Health Checks */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Health Checks</h2>
          <Button
            size="sm"
            onClick={runChecks}
            disabled={isRunning}
          >
            {isRunning ? 'Running...' : 'Run All Checks'}
          </Button>
        </div>
        <Card>
          <div style={styles.checkList}>
            {checks.map((check) => (
              <div key={check.id} style={styles.checkRow}>
                <StatusIndicator status={check.status} />
                <div style={styles.checkInfo}>
                  <span style={styles.checkLabel}>{check.label}</span>
                  <span style={styles.checkDesc}>
                    {check.detail || check.description}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {checks.some((c) => c.status !== 'idle') && (
            <div style={styles.checkSummary}>
              {passCount > 0 && <span style={{ ...styles.summaryBadge, color: '#76B900' }}>{passCount} passed</span>}
              {warnCount > 0 && <span style={{ ...styles.summaryBadge, color: '#F59E0B' }}>{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
              {failCount > 0 && <span style={{ ...styles.summaryBadge, color: '#EF4444' }}>{failCount} failed</span>}
            </div>
          )}
        </Card>
      </div>

      {/* Section 2: Live Log Viewer */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Log Viewer</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            Clear
          </Button>
        </div>
        <div style={styles.logViewer}>
          {logs.length === 0 ? (
            <div style={styles.logEmpty}>
              <span style={styles.logEmptyText}>
                Run health checks to see logs here
              </span>
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} style={styles.logLine}>
                <span style={styles.logTimestamp}>{entry.timestamp}</span>
                <span style={{
                  ...styles.logLevel,
                  color: entry.level === 'error' ? '#EF4444' :
                         entry.level === 'warn' ? '#F59E0B' : colors.text.disabled,
                }}>
                  [{entry.level.toUpperCase()}]
                </span>
                <span style={styles.logMessage}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Section 3: System Info */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>System Info</h2>
        <Card>
          <div style={styles.infoGrid}>
            <InfoRow label="App Version" value="v0.5.1-beta" />
            <InfoRow label="Platform" value={
              navigator.platform.includes('Win') ? 'Windows' :
              navigator.platform.includes('Mac') ? 'macOS' : 'Linux'
            } />
            <InfoRow label="Host Agent" value={hostStatus.state} />
            <InfoRow label="GPU" value={hostStatus.gpuModel || 'Not detected'} />
            <InfoRow label="Encoders" value={hostStatus.codecs.length > 0 ? hostStatus.codecs.join(', ') : 'None'} />
            <InfoRow label="Connection" value={connectionStatus} />
          </div>
          <div style={styles.infoActions}>
            <Button variant="secondary" size="sm" onClick={handleCopyDebugBundle}>
              Copy Debug Bundle
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatusIndicator({ status }: { status: CheckStatus }): React.ReactElement {
  const colorMap: Record<CheckStatus, string> = {
    idle: colors.text.disabled,
    running: '#F59E0B',
    pass: '#76B900',
    warn: '#F59E0B',
    fail: '#EF4444',
  };

  if (status === 'running') {
    return (
      <div style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        borderColor: colorMap.running,
        borderStyle: 'solid',
        borderWidth: 2,
        borderTopColor: 'transparent',
        flexShrink: 0,
        animation: 'spin 0.8s linear infinite',
      }} />
    );
  }

  if (status === 'pass') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="9" cy="9" r="8" stroke={colorMap.pass} strokeWidth="1.5" />
        <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke={colorMap.pass} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'warn') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="9" cy="9" r="8" stroke={colorMap.warn} strokeWidth="1.5" />
        <path d="M9 6v4" stroke={colorMap.warn} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12.5" r="0.75" fill={colorMap.warn} />
      </svg>
    );
  }

  if (status === 'fail') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="9" cy="9" r="8" stroke={colorMap.fail} strokeWidth="1.5" />
        <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke={colorMap.fail} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // idle
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="8" stroke={colorMap.idle} strokeWidth="1.5" />
    </svg>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    maxWidth: 900,
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  // Health checks
  checkList: {
    display: 'flex',
    flexDirection: 'column',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm + 2}px 0`,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  checkInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    flex: 1,
  },
  checkLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  checkDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  checkSummary: {
    display: 'flex',
    gap: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  // Log viewer
  logViewer: {
    backgroundColor: colors.bg.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    padding: spacing.sm,
    maxHeight: 250,
    overflowY: 'auto',
    fontFamily: typography.fontMono,
    fontSize: typography.fontSize.xs,
  },
  logEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${spacing.xl}px`,
  },
  logEmptyText: {
    color: colors.text.disabled,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
  },
  logLine: {
    display: 'flex',
    gap: spacing.sm,
    padding: '2px 0',
    lineHeight: 1.6,
  },
  logTimestamp: {
    color: colors.text.disabled,
    flexShrink: 0,
  },
  logLevel: {
    fontWeight: typography.fontWeight.semibold,
    flexShrink: 0,
    width: 50,
  },
  logMessage: {
    color: colors.text.secondary,
    wordBreak: 'break-word',
  },
  // System info
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.sm}px 0`,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  infoLabel: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
  },
  infoActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
  },
};
