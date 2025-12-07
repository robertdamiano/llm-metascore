'use client';

import { useState } from 'react';
import { AggregatedEntry, RankingMode } from '@/lib/types';

export default function Home() {
  const [mode, setMode] = useState<RankingMode>('general');
  const [generalRankings, setGeneralRankings] = useState<AggregatedEntry[]>([]);
  const [codingRankings, setCodingRankings] = useState<AggregatedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchRankings = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch both general and coding rankings
      const [generalRes, codingRes] = await Promise.all([
        fetch('/api/rankings?mode=general'),
        fetch('/api/rankings?mode=coding')
      ]);

      if (!generalRes.ok || !codingRes.ok) {
        throw new Error('Failed to fetch rankings');
      }

      const [generalData, codingData] = await Promise.all([
        generalRes.json(),
        codingRes.json()
      ]);

      setGeneralRankings(generalData.rankings);
      setCodingRankings(codingData.rankings);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setGeneralRankings([]);
      setCodingRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const formatSourceName = (source: string): string => {
    // Remove 'openlm:' prefix and format nicely
    return source
      .replace('openlm:arena:', 'Arena ')
      .replace('openlm:', '')
      .replace('swebench', 'SWE-bench')
      .replace('overall', 'Overall')
      .replace('coding', 'Coding');
  };

  const getCurrentRankings = () => {
    return mode === 'general' ? generalRankings : codingRankings;
  };

  const getModeTitle = () => {
    switch (mode) {
      case 'general':
        return 'General Intelligence Rankings';
      case 'coding':
        return 'Coding Rankings';
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case 'general':
        return 'Rankings based on Chatbot Arena Elo scores';
      case 'coding':
        return 'Rankings based on Chatbot Arena Coding and SWE-bench';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2 flex-wrap">
            <h1 className="text-4xl font-bold text-gray-900">
              LLM Metascore
            </h1>
            <a
              href="https://openrouter.ai/rankings#apps"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg font-medium transition-colors bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5 text-sm"
            >
              Top Apps
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          <p className="text-gray-600">
            Aggregated rankings of top LLM creators from multiple sources
          </p>
        </header>

        {/* Initial Load State - Prominent CTA */}
        {!lastUpdated && !loading && (
          <div className="bg-white rounded-lg shadow-md p-8 mb-6 text-center">
            <div className="max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Welcome to LLM Metascore
              </h2>
              <p className="text-gray-600 mb-6">
                Click below to load the latest rankings aggregated from Chatbot Arena and SWE-bench
              </p>
              <button
                onClick={fetchRankings}
                disabled={loading}
                className="w-full sm:w-auto px-8 py-4 bg-green-600 text-white rounded-lg font-semibold text-lg hover:bg-green-700 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
              >
                Load Rankings
              </button>
            </div>
          </div>
        )}

        {/* Mode Selector & Controls - Shown after data loads */}
        {(lastUpdated || loading) && (
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              {/* Mode Selector Tabs */}
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => setMode('general')}
                  disabled={loading}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                    mode === 'general'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  General
                </button>
                <button
                  onClick={() => setMode('coding')}
                  disabled={loading}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                    mode === 'coding'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Coding
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchRankings}
                disabled={loading}
                className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <p className="text-sm text-gray-600 mt-4">
              {getModeDescription()}
            </p>

            {lastUpdated && (
              <p className="text-xs text-gray-500 mt-2">
                Last updated: {lastUpdated.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {/* Rankings Display */}
        {getCurrentRankings().length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {getModeTitle()}
                </h2>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {getCurrentRankings().map((entry, index) => (
                <div key={entry.name} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-xl font-bold text-blue-600">
                        {index + 1}
                      </span>
                    </div>

                    <div className="flex-grow">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {entry.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Average Rank: {entry.aggregatedRank.toFixed(2)}
                      </p>

                      {showDetails && (
                        <div className="mt-3 space-y-1">
                          {Object.entries(entry.ranks)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([source, rank]) => (
                              <div
                                key={source}
                                className="text-xs text-gray-500 flex items-center gap-2"
                              >
                                <span className="font-medium">{formatSourceName(source)}:</span>
                                <span className="font-semibold text-gray-700">#{rank}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>
            Rankings aggregated from Chatbot Arena and SWE-bench leaderboards
          </p>
          <p className="mt-2">
            Tracking: Anthropic, Google, OpenAI, and xAI
          </p>
        </footer>
      </div>
    </div>
  );
}
