/**
 * TabGroup.tsx — Horizontal tab bar with underline active indicator.
 *
 * Used in SettingsPage and anywhere we need tabbed navigation.
 */

import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabGroupProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function TabGroup({ tabs, activeTab, onChange }: TabGroupProps): React.ReactElement {
  return (
    <div style={styles.container}>
      <div style={styles.tabList} role="tablist">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
          />
        ))}
      </div>
      <div style={styles.divider} />
    </div>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabItem;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.tab,
        color: active ? colors.accent.default : isHovered ? colors.text.primary : colors.text.secondary,
        borderBottomColor: active ? colors.accent.default : 'transparent',
      }}
    >
      {tab.icon && <span style={styles.tabIcon}>{tab.icon}</span>}
      {tab.label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  tabList: {
    display: 'flex',
    gap: spacing.xs,
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: `${spacing.sm}px ${spacing.md}px`,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    outline: 'none',
    whiteSpace: 'nowrap',
    transition: `color ${transitions.fast}, border-color ${transitions.fast}`,
  },
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
  },
};
