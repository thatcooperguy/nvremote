interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  stats?: string;
}

export default function FeatureCard({
  icon,
  title,
  description,
  stats,
}: FeatureCardProps) {
  return (
    <div className="card-base group relative overflow-hidden">
      {/* Subtle gradient hover effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-cs-green/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-5 group-hover:border-cs-green/40 transition-colors duration-300">
          <div className="text-cs-green">{icon}</div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-cs-gray-300 leading-relaxed mb-4">
          {description}
        </p>

        {/* Stats badge */}
        {stats && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cs-green/10 border border-cs-green/20">
            <div className="w-1.5 h-1.5 rounded-full bg-cs-green animate-pulse-slow" />
            <span className="text-xs font-medium text-cs-green">{stats}</span>
          </div>
        )}
      </div>
    </div>
  );
}
