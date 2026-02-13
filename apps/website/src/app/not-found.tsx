import Button from '@/components/Button';

export default function NotFound() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute inset-0 grid-overlay opacity-30 mask-fade-y" />
      <div className="orb orb-green-dim w-[400px] h-[400px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />

      <div className="relative section-padding text-center">
        {/* Giant 404 */}
        <div className="text-[120px] sm:text-[160px] lg:text-[200px] font-extrabold leading-none tracking-tighter text-gradient mb-6 select-none">
          404
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4 tracking-tight">
          Page Not Found
        </h1>
        <p className="text-cs-gray-300 mb-10 max-w-md mx-auto leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist, has been moved, or
          the stream dropped. Let&apos;s get you back.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/" size="lg" showArrow>
            Back to Home
          </Button>
          <Button href="/downloads/" variant="secondary" size="lg">
            Downloads
          </Button>
        </div>
      </div>
    </section>
  );
}
