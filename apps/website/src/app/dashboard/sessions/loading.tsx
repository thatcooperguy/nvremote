export default function SessionsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-72 bg-gray-100 rounded mt-2" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-32 bg-gray-100 rounded-lg" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="h-10 bg-gray-50 border-b border-gray-100" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 flex items-center px-4 gap-4">
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-32 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
