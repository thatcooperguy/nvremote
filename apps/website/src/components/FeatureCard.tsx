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
    <div className="gradient-border gradient-border-hover group relative overflow-hidden p-6 sm:p-8 transition-all duration-500 hover:-translate-y-1 hover:shadow-card-hover">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-nv-green/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Subtle gradient hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-nv-green/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        {/* Icon container with glow */}
        <div className="relative w-14 h-14 rounded-xl bg-nv-green/10 border border-nv-green/20 flex items-center justify-center mb-6 group-hover:border-nv-green/40 group-hover:bg-nv-green/15 transition-all duration-300">
          <div className="text-nv-green">{icon}</div>
          {/* Icon glow on hover */}
          <div className="absolute inset-0 rounded-xl bg-nv-green/0 group-hover:bg-nv-green/10 blur-xl transition-all duration-500" />
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">{title}</h3>
        <p className="text-sm text-nv-gray-300 leading-relaxed mb-5">
          {description}
        </p>

        {/* Stats badge with pulse */}
        {stats && (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-nv-green/[0.06] border border-nv-green/15">
            <div className="relative w-2 h-2">
              <div className="absolute inset-0 rounded-full bg-nv-green animate-pulse-slow" />
              <div className="absolute inset-0 rounded-full bg-nv-green/40 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
            <span className="text-xs font-semibold text-nv-green tracking-wide">{stats}</span>
          </div>
        )}
      </div>
    </div>
  );
}
