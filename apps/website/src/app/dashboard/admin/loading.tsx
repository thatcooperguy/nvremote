export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-44 bg-gray-200 rounded" />
        <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
      </div>

      {/* Admin stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-8 w-14 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-24 bg-gray-50 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="h-5 w-36 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
