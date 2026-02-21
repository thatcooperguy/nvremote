export default function DevicesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
      </div>

      {/* Device cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg" />
              <div>
                <div className="h-4 w-28 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded mt-1" />
              </div>
            </div>
            <div className="h-3 w-full bg-gray-50 rounded mt-4" />
            <div className="h-3 w-3/4 bg-gray-50 rounded mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
