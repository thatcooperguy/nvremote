export default function NetworkLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-56 bg-gray-100 rounded mt-2" />
      </div>

      {/* Network status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
            <div className="h-6 w-12 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
        <div className="h-48 bg-gray-50 rounded" />
      </div>
    </div>
  );
}
