import Button from '@/components/Button';

export default function NotFound() {
  return (
    <section className="section-padding pt-32 pb-20 min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl font-extrabold text-gradient mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-3">Page Not Found</h1>
        <p className="text-cs-gray-300 mb-8 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button href="/" size="lg">
          Back to Home
        </Button>
      </div>
    </section>
  );
}
