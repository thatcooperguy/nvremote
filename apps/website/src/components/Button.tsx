import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  disabled?: boolean;
  className?: string;
  external?: boolean;
  showArrow?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'relative bg-cs-green text-cs-dark font-semibold hover:bg-cs-green-300 active:bg-cs-green-500 shadow-glow hover:shadow-glow-lg overflow-hidden group/btn',
  secondary:
    'relative bg-transparent text-white font-medium border border-white/[0.12] hover:border-cs-green/40 hover:text-cs-green hover:bg-cs-green/5 hover:shadow-glow-sm',
  ghost:
    'bg-transparent text-cs-gray-200 hover:text-white hover:bg-white/5',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg',
  md: 'px-6 py-3 text-sm rounded-xl',
  lg: 'px-8 py-4 text-base rounded-xl',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  disabled = false,
  className = '',
  external = false,
  showArrow = false,
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-medium transition-all duration-300 cursor-pointer select-none';
  const disabledStyles = disabled
    ? 'opacity-40 cursor-not-allowed pointer-events-none !shadow-none'
    : '';

  const shimmer =
    variant === 'primary' && !disabled ? (
      <div className="absolute inset-0 overflow-hidden rounded-inherit pointer-events-none">
        <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
    ) : null;

  const arrow = showArrow ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-300 group-hover/btn:translate-x-1"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ) : null;

  const combinedStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`;

  const content = (
    <>
      {shimmer}
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {arrow}
      </span>
    </>
  );

  if (href && !disabled) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={combinedStyles}
        >
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={combinedStyles}>
        {content}
      </Link>
    );
  }

  return (
    <button className={combinedStyles} disabled={disabled}>
      {content}
    </button>
  );
}
