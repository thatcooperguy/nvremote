/**
 * HostPage.tsx — Comprehensive Host Control Panel
 *
 * Full host management dashboard with collapsible panels for:
 * 1. Master Toggle — large host On/Off
 * 2. Host Identity — display name, Host ID, visibility
 * 3. Streaming Defaults — presets + encoder settings
 * 4. Input & Peripherals — mouse, keyboard, gamepad
 * 5. Audio — system audio, mic passthrough
 * 6. Advanced Overrides — STUN/TURN, encoder profiles, FEC
 * 7. Live Telemetry — stats when active session
 */

import React, { useCallback, useState } from 'react';
import { colors, spacing, typography, radius, transitions, statusColors } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { PresetSelector, StreamingPreset } from '../components/PresetSelector';
import { ToggleRow } from '../components/ToggleRow';
import { CopyButton } from '../components/CopyButton';
import { useHostAgentStore } from '../store/hostAgentStore';
import { toast } from '../components/Toast';
import { HostSetupWizard } from '../components/HostSetupWizard';

// ---------------------------------------------------------------------------
// Streaming defaults state
// ---------------------------------------------------------------------------

interface StreamingDefaults {
  preset: StreamingPreset;
  resolution: string;
  fps: string;
  codec: string;
  rateControl: string;
  bitrateKbps: number;
  latencyMode: string;
}

const PRESET_DEFAULTS: Record<Exclude<StreamingPreset, 'custom'>, Omit<StreamingDefaults, 'preset'>> = {
  competitive: { resolution: '1920x1080', fps: '120', codec: 'h264', rateControl: 'cbr', bitrateKbps: 25000, latencyMode: 'ultra-low' },
  balanced:    { resolution: '1920x1080', fps: '60',  codec: 'h265', rateControl: 'vbr', bitrateKbps: 30000, latencyMode: 'low' },
  cinematic:   { resolution: '2560x1440', fps: '60',  codec: 'h265', rateControl: 'vbr', bitrateKbps: 50000, latencyMode: 'normal' },
};

export function HostPage(): React.ReactElement {
  const status = useHostAgentStore((s) => s.status);
  const stats = useHostAgentStore((s) => s.streamerStats);
  const config = useHostAgentStore((s) => s.config);
  const isRegistered = useHostAgentStore((s) => s.isRegistered);
  const isStarting = useHostAgentStore((s) => s.isStarting);
  const startAgent = useHostAgentStore((s) => s.startAgent);
  const stopAgent = useHostAgentStore((s) => s.stopAgent);
  const forceIDR = useHostAgentStore((s) => s.forceIDR);
  const setConfig = useHostAgentStore((s) => s.setConfig);

  const [showSetup, setShowSetup] = useState(false);

  // Streaming defaults
  const [streaming, setStreaming] = useState<StreamingDefaults>({
    preset: 'balanced',
    ...PRESET_DEFAULTS.balanced,
  });

  // Input & peripheral toggles
  const [mouseRelative, setMouseRelative] = useState(true);
  const [keyboardPassthrough, setKeyboardPassthrough] = useState(true);
  const [gamepadEnabled, setGamepadEnabled] = useState(false);

  // Audio toggles
  const [systemAudio, setSystemAudio] = useState(true);
  const [micPassthrough, setMicPassthrough] = useState(false);

  // Host identity
  const [hostName, setHostName] = useState(config?.hostName || 'My PC');
  const [isEditingName, setIsEditingName] = useState(false);

  // Advanced overrides
  const [stunServers, setStunServers] = useState(
    config?.stunServers?.join(', ') || 'stun:stun.l.google.com:19302'
  );
  const [fecEnabled, setFecEnabled] = useState(true);
  const [jitterBufferMs, setJitterBufferMs] = useState(50);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    try {
      await startAgent();
      toast.success('Host agent started');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [startAgent]);

  const handleStop = useCallback(async () => {
    try {
      await stopAgent();
      toast.info('Host agent stopped');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [stopAgent]);

  const handleForceIDR = useCallback(async () => {
    try {
      await forceIDR();
      toast.success('Keyframe sent');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [forceIDR]);

  const handlePresetChange = useCallback(
    (preset: StreamingPreset) => {
      if (preset === 'custom') {
        setStreaming((s) => ({ ...s, preset: 'custom' }));
      } else {
        setStreaming({ preset, ...PRESET_DEFAULTS[preset] });
      }
      setConfig({ streamingPreset: preset }).catch(() =>
        toast.error('Failed to save preset')
      );
    },
    [setConfig]
  );

  const handleStreamingChange = useCallback(
    (key: keyof StreamingDefaults, value: string | number) => {
      setStreaming((s) => ({ ...s, [key]: value, preset: 'custom' as StreamingPreset }));
    },
    []
  );

  const handleSaveName = useCallback(async () => {
    try {
      await setConfig({ hostName });
      setIsEditingName(false);
      toast.success('Host name updated');
    } catch {
      toast.error('Failed to update host name');
    }
  }, [hostName, setConfig]);

  const handleResetDefaults = useCallback(async () => {
    setStreaming({ preset: 'balanced', ...PRESET_DEFAULTS.balanced });
    setMouseRelative(true);
    setKeyboardPassthrough(true);
    setGamepadEnabled(false);
    setSystemAudio(true);
    setMicPassthrough(false);
    setFecEnabled(true);
    setJitterBufferMs(50);
    try {
      await setConfig({ streamingPreset: 'balanced', resetToDefaults: true });
      toast.success('Reset to defaults');
    } catch {
      toast.error('Failed to reset');
    }
  }, [setConfig]);

  // -----------------------------------------------------------------------
  // Setup / Registration
  // -----------------------------------------------------------------------

  if (!isRegistered && !showSetup) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>Host Mode</h1>
        <Card>
          <div style={styles.emptyState}>
            <HostIcon />
            <h2 style={styles.emptyTitle}>Set Up Host</h2>
            <p style={styles.emptyText}>
              Register this machine as a streaming host to share your GPU with remote clients.
            </p>
            <Button onClick={() => setShowSetup(true)}>Get Started</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>Host Setup</h1>
        <HostSetupWizard onComplete={() => setShowSetup(false)} onCancel={() => setShowSetup(false)} />
      </div>
    );
  }

  const isRunning = status.state === 'running';
  const isActive = Boolean(status.activeSession);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Host Control Panel</h1>
      </div>

      {/* 1. Master Toggle */}
      <div style={styles.masterToggle}>
        <div style={styles.masterLeft}>
          <div
            style={{
              ...styles.masterDot,
              backgroundColor: isRunning ? statusColors.hosting : statusColors.disconnected,
              boxShadow: isRunning ? `0 0 12px ${statusColors.hosting}80` : 'none',
            }}
          />
          <div style={styles.masterInfo}>
            <span style={styles.masterLabel}>
              Host Agent {isRunning ? 'Running' : status.state === 'starting' ? 'Starting...' : 'Stopped'}
            </span>
            <span style={styles.masterSub}>
              {isActive
                ? `Streaming to ${status.activeSession!.userId.slice(0, 8)}...`
                : isRunning
                ? 'Waiting for connections'
                : 'Start to accept remote sessions'}
            </span>
          </div>
        </div>
        <div style={styles.masterActions}>
          {isRunning ? (
            <Button variant="danger" size="lg" onClick={handleStop}>
              Stop Hosting
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleStart}
              disabled={isStarting || status.state === 'starting'}
              loading={isStarting}
            >
              {isStarting ? 'Starting...' : 'Start Hosting'}
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {status.error && (
        <div style={styles.errorBanner}>
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="7" stroke={colors.semantic.error} strokeWidth="1.5" />
            <line x1="8" y1="5" x2="8" y2="9" stroke={colors.semantic.error} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.75" fill={colors.semantic.error} />
          </svg>
          <span style={styles.errorText}>{status.error}</span>
        </div>
      )}

      {/* 2. Host Identity */}
      <CollapsiblePanel title="Host Identity" subtitle="Name, ID, and visibility">
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Display Name</label>
            <div style={styles.fieldRow}>
              {isEditingName ? (
                <>
                  <input
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    style={styles.input}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                  />
                  <Button size="sm" onClick={handleSaveName}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingName(false)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span style={styles.fieldValue}>{hostName}</span>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingName(true)}>Edit</Button>
                </>
              )}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Host ID</label>
            <div style={styles.fieldRow}>
              <code style={styles.mono}>{status.hostId || '—'}</code>
              {status.hostId && <CopyButton text={status.hostId} />}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>GPU</label>
            <span style={styles.fieldValue}>{status.gpuModel || 'Not detected'}</span>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Supported Codecs</label>
            <div style={styles.codecList}>
              {status.codecs.length > 0
                ? status.codecs.map((c) => (
                    <span key={c} style={styles.codecBadge}>{c.toUpperCase()}</span>
                  ))
                : <span style={styles.fieldValue}>None detected</span>}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Signaling Server</label>
            <div style={styles.fieldRow}>
              <div
                style={{
                  ...styles.statusDot,
                  backgroundColor: status.signalingConnected ? colors.semantic.success : colors.semantic.error,
                }}
              />
              <span style={styles.fieldValue}>
                {status.signalingConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      {/* 3. Streaming Defaults */}
      <CollapsiblePanel
        title="Streaming Defaults"
        subtitle="Quality presets and encoder settings"
        badge={streaming.preset.charAt(0).toUpperCase() + streaming.preset.slice(1)}
        badgeColor={streaming.preset === 'competitive' ? '#F59E0B' : streaming.preset === 'cinematic' ? '#8B5CF6' : colors.accent.default}
      >
        <PresetSelector value={streaming.preset} onChange={handlePresetChange} />

        <div style={styles.divider} />

        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Resolution</label>
            <select
              value={streaming.resolution}
              onChange={(e) => handleStreamingChange('resolution', e.target.value)}
              style={styles.select}
              disabled={streaming.preset !== 'custom'}
            >
              <option value="1280x720">1280×720 (720p)</option>
              <option value="1920x1080">1920×1080 (1080p)</option>
              <option value="2560x1440">2560×1440 (1440p)</option>
              <option value="3840x2160">3840×2160 (4K)</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Frame Rate</label>
            <select
              value={streaming.fps}
              onChange={(e) => handleStreamingChange('fps', e.target.value)}
              style={styles.select}
              disabled={streaming.preset !== 'custom'}
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="90">90 FPS</option>
              <option value="120">120 FPS</option>
              <option value="144">144 FPS</option>
              <option value="240">240 FPS</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Codec</label>
            <select
              value={streaming.codec}
              onChange={(e) => handleStreamingChange('codec', e.target.value)}
              style={styles.select}
              disabled={streaming.preset !== 'custom'}
            >
              {status.codecs.length > 0
                ? status.codecs.map((c) => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))
                : <>
                    <option value="h264">H.264</option>
                    <option value="h265">H.265</option>
                    <option value="av1">AV1</option>
                  </>}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Rate Control</label>
            <select
              value={streaming.rateControl}
              onChange={(e) => handleStreamingChange('rateControl', e.target.value)}
              style={styles.select}
              disabled={streaming.preset !== 'custom'}
            >
              <option value="cbr">CBR (Constant Bitrate)</option>
              <option value="vbr">VBR (Variable Bitrate)</option>
              <option value="cqp">CQP (Constant QP)</option>
            </select>
          </div>

          <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <div style={styles.sliderHeader}>
              <label style={styles.fieldLabel}>Target Bitrate</label>
              <span style={styles.sliderValue}>{streaming.bitrateKbps >= 1000 ? `${(streaming.bitrateKbps / 1000).toFixed(1)} Mbps` : `${streaming.bitrateKbps} kbps`}</span>
            </div>
            <input
              type="range"
              min={1000}
              max={100000}
              step={1000}
              value={streaming.bitrateKbps}
              onChange={(e) => handleStreamingChange('bitrateKbps', Number(e.target.value))}
              style={styles.slider}
              disabled={streaming.preset !== 'custom'}
            />
            <div style={styles.sliderMarks}>
              <span style={styles.sliderMark}>1 Mbps</span>
              <span style={styles.sliderMark}>100 Mbps</span>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Latency Mode</label>
            <select
              value={streaming.latencyMode}
              onChange={(e) => handleStreamingChange('latencyMode', e.target.value)}
              style={styles.select}
              disabled={streaming.preset !== 'custom'}
            >
              <option value="ultra-low">Ultra Low (competitive gaming)</option>
              <option value="low">Low (general gaming)</option>
              <option value="normal">Normal (quality priority)</option>
            </select>
          </div>
        </div>
      </CollapsiblePanel>

      {/* 4. Input & Peripherals */}
      <CollapsiblePanel title="Input & Peripherals" subtitle="Mouse, keyboard, and gamepad passthrough">
        <ToggleRow
          label="Relative Mouse Mode"
          description="Use relative mouse input for gaming (locks cursor)"
          checked={mouseRelative}
          onChange={(v) => {
            setMouseRelative(v);
            setConfig({ mouseRelative: v }).catch(() => toast.error('Failed to save'));
          }}
        />
        <ToggleRow
          label="Keyboard Passthrough"
          description="Forward all keyboard input to the host (including system keys)"
          checked={keyboardPassthrough}
          onChange={(v) => {
            setKeyboardPassthrough(v);
            setConfig({ keyboardPassthrough: v }).catch(() => toast.error('Failed to save'));
          }}
        />
        <ToggleRow
          label="Gamepad Support"
          description="Enable virtual gamepad for connected controllers"
          checked={gamepadEnabled}
          onChange={(v) => {
            setGamepadEnabled(v);
            setConfig({ gamepadEnabled: v }).catch(() => toast.error('Failed to save'));
          }}
        />
        <div style={styles.placeholderNote}>
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke={colors.text.disabled} strokeWidth="1.2" />
            <line x1="7" y1="4.5" x2="7" y2="7.5" stroke={colors.text.disabled} strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="7" cy="9.5" r="0.6" fill={colors.text.disabled} />
          </svg>
          <span>Advanced gamepad mapping available in a future update.</span>
        </div>
      </CollapsiblePanel>

      {/* 5. Audio */}
      <CollapsiblePanel title="Audio" subtitle="System audio and microphone routing">
        <ToggleRow
          label="System Audio"
          description="Stream desktop audio to the client"
          checked={systemAudio}
          onChange={(v) => {
            setSystemAudio(v);
            setConfig({ systemAudio: v }).catch(() => toast.error('Failed to save'));
          }}
        />
        <ToggleRow
          label="Microphone Passthrough"
          description="Route client microphone audio to host applications"
          checked={micPassthrough}
          onChange={(v) => {
            setMicPassthrough(v);
            setConfig({ micPassthrough: v }).catch(() => toast.error('Failed to save'));
          }}
        />

        {/* Audio device selection placeholders */}
        <div style={styles.divider} />
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Audio Output Device</label>
            <select style={styles.select} disabled>
              <option>Default System Output</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Microphone Input Device</label>
            <select style={styles.select} disabled>
              <option>Default System Microphone</option>
            </select>
          </div>
        </div>
        <div style={styles.placeholderNote}>
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke={colors.text.disabled} strokeWidth="1.2" />
            <line x1="7" y1="4.5" x2="7" y2="7.5" stroke={colors.text.disabled} strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="7" cy="9.5" r="0.6" fill={colors.text.disabled} />
          </svg>
          <span>Custom audio device selection requires host agent v0.5+.</span>
        </div>
      </CollapsiblePanel>

      {/* 6. Advanced Overrides (collapsed by default, danger zone) */}
      <CollapsiblePanel
        title="Advanced Overrides"
        subtitle="STUN/TURN, encoder profiles, FEC — for experts only"
        defaultOpen={false}
        danger
      >
        <div style={styles.fieldGrid}>
          <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <label style={styles.fieldLabel}>STUN/TURN Servers</label>
            <input
              value={stunServers}
              onChange={(e) => setStunServers(e.target.value)}
              style={styles.input}
              placeholder="stun:stun.l.google.com:19302"
              onBlur={() => {
                setConfig({ stunServers: stunServers.split(',').map((s) => s.trim()).filter(Boolean) })
                  .catch(() => toast.error('Failed to save STUN servers'));
              }}
            />
            <span style={styles.fieldHint}>Comma-separated. Changes take effect on next session.</span>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Encoder Profile</label>
            <select style={styles.select} defaultValue="high">
              <option value="baseline">Baseline</option>
              <option value="main">Main</option>
              <option value="high">High</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Jitter Buffer (ms)</label>
            <input
              type="number"
              value={jitterBufferMs}
              onChange={(e) => setJitterBufferMs(Number(e.target.value))}
              min={0}
              max={200}
              step={10}
              style={styles.input}
              onBlur={() => {
                setConfig({ jitterBufferMs }).catch(() => toast.error('Failed to save'));
              }}
            />
          </div>
        </div>

        <ToggleRow
          label="Forward Error Correction (FEC)"
          description="Add redundancy to video packets to recover from network loss"
          checked={fecEnabled}
          onChange={(v) => {
            setFecEnabled(v);
            setConfig({ fecEnabled: v }).catch(() => toast.error('Failed to save'));
          }}
        />

        <div style={styles.divider} />
        <Button variant="danger" size="sm" onClick={handleResetDefaults}>
          Reset All to Defaults
        </Button>
      </CollapsiblePanel>

      {/* 7. Live Telemetry (only when active session) */}
      {isActive && (
        <CollapsiblePanel
          title="Live Telemetry"
          subtitle={`Session ${status.activeSession!.sessionId.slice(0, 8)}...`}
          badge="LIVE"
          badgeColor={colors.semantic.error}
        >
          <div style={styles.sessionMeta}>
            <StatItem label="Viewer" value={status.activeSession!.userId.slice(0, 8)} />
            <StatItem label="Codec" value={status.activeSession!.codec.toUpperCase()} />
            <StatItem label="Connection" value={status.activeSession!.connectionType} />
          </div>

          {stats && (
            <>
              <div style={styles.divider} />
              <div style={styles.statsGrid}>
                <StatCard
                  label="Bitrate"
                  value={stats.bitrateKbps >= 1000 ? `${(stats.bitrateKbps / 1000).toFixed(1)}` : `${stats.bitrateKbps}`}
                  unit={stats.bitrateKbps >= 1000 ? 'Mbps' : 'kbps'}
                  color={colors.accent.default}
                />
                <StatCard
                  label="Frame Rate"
                  value={`${stats.fps}`}
                  unit="FPS"
                  color={colors.accent.default}
                />
                <StatCard
                  label="Resolution"
                  value={`${stats.width}×${stats.height}`}
                  unit=""
                  color={colors.semantic.info}
                />
                <StatCard
                  label="Latency (RTT)"
                  value={`${stats.rttMs.toFixed(1)}`}
                  unit="ms"
                  color={stats.rttMs > 50 ? colors.semantic.warning : colors.accent.default}
                />
                <StatCard
                  label="Packet Loss"
                  value={`${stats.packetLossPercent.toFixed(2)}`}
                  unit="%"
                  color={stats.packetLossPercent > 1 ? colors.semantic.error : colors.accent.default}
                />
                <StatCard
                  label="Jitter"
                  value={`${stats.jitterMs.toFixed(1)}`}
                  unit="ms"
                  color={stats.jitterMs > 20 ? colors.semantic.warning : colors.accent.default}
                />
              </div>
            </>
          )}

          <div style={styles.divider} />
          <div style={styles.sessionActions}>
            <Button variant="secondary" size="sm" onClick={handleForceIDR}>
              Force Keyframe
            </Button>
            <Button variant="danger" size="sm" onClick={handleStop}>
              End Session
            </Button>
          </div>
        </CollapsiblePanel>
      )}

      {/* Waiting state */}
      {!isActive && isRunning && (
        <Card>
          <div style={styles.waitingState}>
            <div style={styles.waitingDot} />
            <span style={styles.waitingText}>Waiting for a client to connect...</span>
            <span style={styles.waitingSubtext}>
              Share your Host ID or connect via nvremote.com/dashboard
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatItem({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.statItem}>
      <span style={styles.statItemLabel}>{label}</span>
      <span style={styles.statItemValue}>{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}): React.ReactElement {
  return (
    <div style={styles.statCard}>
      <span style={styles.statCardLabel}>{label}</span>
      <div style={styles.statCardRow}>
        <span style={{ ...styles.statCardValue, color }}>{value}</span>
        {unit && <span style={styles.statCardUnit}>{unit}</span>}
      </div>
    </div>
  );
}

function HostIcon(): React.ReactElement {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 8 }}>
      <rect x="6" y="8" width="36" height="24" rx="3" stroke={colors.text.secondary} strokeWidth="2" />
      <line x1="24" y1="32" x2="24" y2="40" stroke={colors.text.secondary} strokeWidth="2" />
      <line x1="16" y1="40" x2="32" y2="40" stroke={colors.text.secondary} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="20" r="4" stroke={colors.accent.default} strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    maxWidth: 740,
    animation: 'fadeIn 300ms ease',
    paddingBottom: spacing.xl,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },

  // Master toggle
  masterToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    padding: `${spacing.lg}px ${spacing.lg}px`,
  },
  masterLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  masterDot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    flexShrink: 0,
    transition: `all ${transitions.normal}`,
  },
  masterInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  masterLabel: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  masterSub: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  masterActions: {
    display: 'flex',
    gap: spacing.sm,
  },

  // Error
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    backgroundColor: `${colors.semantic.error}15`,
    borderRadius: radius.md,
    border: `1px solid ${colors.semantic.error}4D`,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.semantic.error,
  },

  // Fields
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.md,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: typography.fontWeight.medium,
  },
  fieldValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldHint: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    marginTop: 2,
  },
  mono: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontMono,
    color: colors.text.primary,
    backgroundColor: colors.bg.elevated,
    padding: `2px ${spacing.sm}px`,
    borderRadius: radius.sm,
  },

  // Codec badges
  codecList: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  codecBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent.default,
    backgroundColor: colors.accent.muted,
    padding: `2px ${spacing.sm}px`,
    borderRadius: radius.sm,
  },

  // Status dot
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },

  // Inputs / Selects
  input: {
    height: 36,
    padding: `0 ${spacing.sm + 2}px`,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
    flex: 1,
  },
  select: {
    height: 36,
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
  },

  // Slider
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent.default,
    fontFamily: typography.fontMono,
  },
  slider: {
    width: '100%',
    height: 4,
    appearance: 'auto',
    accentColor: colors.accent.default,
    cursor: 'pointer',
  },
  sliderMarks: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  sliderMark: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.md}px 0`,
  },

  // Placeholder note
  placeholderNote: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    fontStyle: 'italic',
  },

  // Session meta
  sessionMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: spacing.sm,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statItemLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statItemValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
  },

  // Stats grid
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: spacing.sm,
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: spacing.sm,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    border: `1px solid ${colors.border.default}`,
  },
  statCardLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statCardRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  statCardValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontMono,
  },
  statCardUnit: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },

  // Session actions
  sessionActions: {
    display: 'flex',
    gap: spacing.sm,
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${spacing.xl}px 0`,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 400,
    margin: `0 0 ${spacing.md}px`,
  },

  // Waiting state
  waitingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${spacing.lg}px 0`,
    gap: spacing.sm,
  },
  waitingDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: colors.accent.default,
    animation: 'pulse 2s ease-in-out infinite',
    marginBottom: spacing.xs,
  },
  waitingText: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  waitingSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
};
