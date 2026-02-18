import React, { useState, useRef, useEffect, useCallback } from 'react';
import { colors, radius, typography, zIndex } from '../styles/theme';

type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  position?: TooltipPosition;
  delay?: number;
}

export function Tooltip({
  children,
  text,
  position = 'top',
  delay = 300,
}: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const positionStyle = getPositionStyle(position);

  return (
    <div
      style={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          style={{ ...styles.tooltip, ...positionStyle }}
          role="tooltip"
        >
          {text}
        </div>
      )}
    </div>
  );
}

function getPositionStyle(position: TooltipPosition): React.CSSProperties {
  switch (position) {
    case 'top':
      return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 };
    case 'bottom':
      return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 };
    case 'left':
      return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 };
    case 'right':
      return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 };
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
  tooltip: {
    position: 'absolute',
    padding: '4px 10px',
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    borderRadius: radius.sm,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: zIndex.toast + 100,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    animation: 'fadeIn 120ms ease',
  },
};
