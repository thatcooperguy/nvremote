export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-28 bg-gray-200 rounded" />
        <div className="h-4 w-52 bg-gray-100 rounded mt-2" />
      </div>

      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="h-5 w-36 bg-gray-200 rounded mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between py-2">
                <div>
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-48 bg-gray-50 rounded mt-1" />
                </div>
                <div className="h-6 w-11 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
