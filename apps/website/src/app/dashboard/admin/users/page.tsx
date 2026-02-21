'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/auth';
import {
  Users,
  RefreshCw,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUserOrg {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
  joinedAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  createdAt: string;
  totalSessions: number;
  orgs: AdminUserOrg[];
  authProviders: string[];
}

interface UserListResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Auth provider icons (inline SVG for small provider badges)
// ---------------------------------------------------------------------------

const providerConfig: Record<string, { label: string; bg: string; text: string }> = {
  google: { label: 'G', bg: 'bg-red-100', text: 'text-red-600' },
  microsoft: { label: 'M', bg: 'bg-blue-100', text: 'text-blue-600' },
  apple: { label: 'A', bg: 'bg-gray-800', text: 'text-white' },
  discord: { label: 'D', bg: 'bg-indigo-100', text: 'text-indigo-600' },
};

function ProviderBadge({ provider }: { provider: string }) {
  const cfg = providerConfig[provider] || { label: provider[0]?.toUpperCase() ?? '?', bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span
      title={provider.charAt(0).toUpperCase() + provider.slice(1)}
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0',
        cfg.bg,
        cfg.text,
      )}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 25;

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search) params.set('search', search);

      const res = await authFetch(`/api/v1/admin/users?${params}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load users (${res.status})`);
      }
      setUsers(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    setLoading(true);
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  const totalPages = users ? Math.ceil(users.total / limit) : 0;

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
            <Users size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 text-sm">
              {users ? `${users.total} registered users` : 'Loading...'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchUsers(); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-nv-green/30 focus:border-nv-green/50 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Organizations</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">Sessions</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">Auth</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500 text-xs uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && !users ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Loading users...
                  </td>
                </tr>
              ) : users?.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    {search ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
              ) : (
                users?.data.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Avatar + Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-gray-400">
                              {(u.name || u.email)[0]?.toUpperCase() ?? '?'}
                            </span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-gray-900 truncate max-w-[140px]">
                          {u.name || 'Unnamed'}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 truncate max-w-[180px] inline-block">
                        {u.email}
                      </span>
                    </td>

                    {/* Orgs */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {u.orgs.length === 0 ? (
                          <span className="text-xs text-gray-300">None</span>
                        ) : (
                          u.orgs.map((org) => (
                            <span
                              key={org.orgId}
                              title={`${org.orgName} (${org.role})`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-[11px] font-medium text-gray-600 border border-gray-200"
                            >
                              <Building2 size={10} className="text-gray-400 shrink-0" />
                              {org.orgSlug}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Sessions */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-mono text-gray-700">{u.totalSessions}</span>
                    </td>

                    {/* Auth providers */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {u.authProviders.length === 0 ? (
                          <span className="text-xs text-gray-300">--</span>
                        ) : (
                          u.authProviders.map((p) => (
                            <ProviderBadge key={p} provider={p} />
                          ))
                        )}
                      </div>
                    </td>

                    {/* Super Admin badge */}
                    <td className="px-4 py-3 text-center">
                      {u.isSuperAdmin ? (
                        <span
                          title="Super Admin — managed via database"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-nv-green/10 text-[11px] font-semibold text-nv-green-700 border border-nv-green/20 cursor-help"
                        >
                          <ShieldCheck size={11} />
                          Admin
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">User</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Page {page} of {totalPages} ({users?.total ?? 0} users)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Admin note */}
      <p className="mt-6 text-[11px] text-gray-400 text-center">
        Super Admin status is managed via the database and cannot be changed from this interface.
      </p>
    </div>
  );
}
