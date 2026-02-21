export default function BillingLoading() {
  return (
    <div className="space-y-8 max-w-4xl animate-pulse">
      <div>
        <div className="h-8 bg-gray-200 rounded w-32" />
        <div className="h-4 bg-gray-100 rounded w-64 mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-20" />
            <div className="h-3 bg-gray-100 rounded w-32 mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
