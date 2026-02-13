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
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-cs-green text-cs-dark font-semibold hover:bg-cs-green-300 active:bg-cs-green-500 shadow-lg shadow-cs-green/20 hover:shadow-cs-green/30',
  secondary:
    'bg-transparent text-white border border-white/20 hover:border-cs-green/50 hover:text-cs-green',
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
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 cursor-pointer select-none';
  const disabledStyles = disabled
    ? 'opacity-40 cursor-not-allowed pointer-events-none'
    : '';

  const combinedStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`;

  if (href && !disabled) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={combinedStyles}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={combinedStyles}>
        {children}
      </Link>
    );
  }

  return (
    <button className={combinedStyles} disabled={disabled}>
      {children}
    </button>
  );
}
