'use client';

import { useState, useEffect } from 'react';
import { RankingOverride, OverrideTarget, RankingMode } from '@/lib/types';

const CREATORS = ['OpenAI', 'Google', 'Anthropic', 'xAI'] as const;

const SOURCE_OPTIONS: { value: OverrideTarget; label: string }[] = [
  // General mode sources
  { value: 'lmarena:text', label: 'LMArena Text' },
  { value: 'lmarena:vision', label: 'LMArena Vision' },
  { value: 'lmarena:search', label: 'LMArena Search' },
  { value: 'aa:omniscience', label: 'AA Omniscience' },
  { value: 'aa:hallucination', label: 'AA Hallucination' },
  { value: 'aa:gpqa', label: 'AA GPQA Diamond' },
  { value: 'aa:ifbench', label: 'AA IFBench' },
  { value: 'aa:longcontext', label: 'AA Long Context' },
  { value: 'livebench:global', label: 'LiveBench Global' },
  { value: 'aggregated:general', label: 'Final General Ranking' },
  // Coding mode sources
  { value: 'lmarena:webdev', label: 'LMArena WebDev' },
  { value: 'swebench:bash', label: 'SWE-bench Bash' },
  { value: 'aa:livecodebench', label: 'AA LiveCodeBench' },
  { value: 'aa:scicode', label: 'AA SciCode' },
  { value: 'aa:terminalbench', label: 'AA TerminalBench' },
  { value: 'aa:tau2', label: 'AA Tau2' },
  { value: 'aa:longcontext', label: 'AA Long Context' },
  { value: 'aa:ifbench', label: 'AA IFBench' },
  { value: 'aggregated:coding', label: 'Final Coding Ranking' },
];

export default function AdminPage() {
  // Authentication state
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // Mode state
  const [mode, setMode] = useState<RankingMode>('general');

  // Overrides state
  const [overrides, setOverrides] = useState<RankingOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formTarget, setFormTarget] = useState<OverrideTarget>('aggregated:general');
  const [formCreator, setFormCreator] = useState<typeof CREATORS[number]>('OpenAI');
  const [formRank, setFormRank] = useState<string>('1');
  const [formReason, setFormReason] = useState('');

  // Check if password is stored in sessionStorage on mount
  useEffect(() => {
    const storedPassword = sessionStorage.getItem('adminPassword');
    if (storedPassword) {
      setPassword(storedPassword);
      validatePassword(storedPassword);
    }
  }, []);

  // Fetch overrides when authenticated
  useEffect(() => {
    if (authenticated) {
      fetchOverrides();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  async function validatePassword(pwd: string) {
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem('adminPassword', pwd);
        setAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError('Invalid password');
        setAuthenticated(false);
        sessionStorage.removeItem('adminPassword');
      }
    } catch {
      setAuthError('Failed to validate password');
      setAuthenticated(false);
    }
  }

  async function fetchOverrides() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/overrides', {
        headers: {
          'x-admin-password': password,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch overrides');
      }

      const data = await response.json();
      setOverrides(data.overrides);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrUpdate() {
    const rank = parseInt(formRank, 10);
    if (isNaN(rank) || rank <= 0) {
      setError('Rank must be a positive number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({
          target: formTarget,
          creatorName: formCreator,
          overrideRank: rank,
          reason: formReason || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create override');
      }

      // Reset form
      setFormRank('1');
      setFormReason('');

      // Refresh overrides list
      await fetchOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this override?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/overrides?id=${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': password,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete override');
      }

      // Refresh overrides list
      await fetchOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('adminPassword');
    setAuthenticated(false);
    setPassword('');
  }

  // Filter overrides and sources by mode
  const getRelevantSources = () => {
    if (mode === 'general') {
      return SOURCE_OPTIONS.filter(
        opt =>
          opt.value.includes('lmarena:text') ||
          opt.value.includes('lmarena:vision') ||
          opt.value.includes('lmarena:search') ||
          opt.value.includes('aa:omniscience') ||
          opt.value.includes('aa:hallucination') ||
          opt.value.includes('aa:gpqa') ||
          opt.value.includes('livebench:global') ||
          (opt.value.includes('aa:ifbench') && !opt.value.includes('coding')) ||
          (opt.value.includes('aa:longcontext') && !opt.value.includes('coding')) ||
          opt.value === 'aggregated:general'
      );
    } else {
      return SOURCE_OPTIONS.filter(
        opt =>
          opt.value.includes('lmarena:webdev') ||
          opt.value.includes('swebench') ||
          opt.value.includes('aa:livecodebench') ||
          opt.value.includes('aa:scicode') ||
          opt.value.includes('aa:terminalbench') ||
          opt.value.includes('aa:tau2') ||
          (opt.value.includes('aa:longcontext') && !opt.value.includes('general')) ||
          (opt.value.includes('aa:ifbench') && !opt.value.includes('general')) ||
          opt.value === 'aggregated:coding'
      );
    }
  };

  const getRelevantOverrides = () => {
    const relevantSources = getRelevantSources().map(s => s.value);
    return overrides.filter(override => relevantSources.includes(override.target));
  };

  // Password gate
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Access</h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              validatePassword(password);
            }}
          >
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {authError && (
              <div className="mb-4 text-sm text-red-600">{authError}</div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main admin UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Ranking Overrides Admin</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Mode Selector */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('general')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'general'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              General Mode
            </button>
            <button
              onClick={() => setMode('coding')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'coding'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Coding Mode
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Create/Update Override Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Create/Update Override</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source/Target
              </label>
              <select
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value as OverrideTarget)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {getRelevantSources().map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Creator
              </label>
              <select
                value={formCreator}
                onChange={(e) => setFormCreator(e.target.value as typeof CREATORS[number])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CREATORS.map(creator => (
                  <option key={creator} value={creator}>
                    {creator}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Override Rank
              </label>
              <input
                type="number"
                min="1"
                value={formRank}
                onChange={(e) => setFormRank(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (Optional)
              </label>
              <input
                type="text"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="e.g., Tie scenario adjustment"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleCreateOrUpdate}
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400"
          >
            {loading ? 'Saving...' : 'Save Override'}
          </button>
        </div>

        {/* Overrides List */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              Current Overrides ({getRelevantOverrides().length})
            </h2>
          </div>

          {loading && overrides.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : getRelevantOverrides().length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No overrides for {mode} mode
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {getRelevantOverrides().map(override => (
                <div key={override.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-lg text-gray-900">
                          {override.creatorName}
                        </span>
                        <span className="text-sm text-gray-500">→</span>
                        <span className="text-sm font-medium text-blue-600">
                          Rank {override.overrideRank}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Target:</span>{' '}
                        {SOURCE_OPTIONS.find(opt => opt.value === override.target)?.label || override.target}
                      </div>

                      {override.reason && (
                        <div className="text-sm text-gray-600 mb-1">
                          <span className="font-medium">Reason:</span> {override.reason}
                        </div>
                      )}

                      <div className="text-xs text-gray-500 mt-2">
                        Updated: {new Date(override.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(override.id)}
                      disabled={loading}
                      className="ml-4 px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
