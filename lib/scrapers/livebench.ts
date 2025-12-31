import { ModelEntry } from '../types';
import { fetchWithRetry } from '../utils/retry';

/**
 * Fetches LiveBench global average rankings from CSV export
 * CSV URL pattern: https://livebench.ai/table_YYYY_MM_DD.csv
 * Extracts the most recent version date from the LiveBench JavaScript bundle
 */
export async function fetchLiveBench(): Promise<Record<string, ModelEntry[]>> {
  try {
    // First, get the most recent LiveBench version date from the main page
    const mainPageResponse = await fetchWithRetry('https://livebench.ai', { cache: 'no-store' });
    if (!mainPageResponse.ok) {
      console.warn('Failed to fetch LiveBench main page');
      return {};
    }

    const mainPageHtml = await mainPageResponse.text();

    // Extract the JavaScript bundle URL (format: ./static/js/main.HASH.js)
    const jsMatch = mainPageHtml.match(/src="\.\/static\/js\/main\.[^"]+\.js"/);
    if (!jsMatch) {
      console.warn('Could not find LiveBench JavaScript bundle');
      return {};
    }

    const jsPath = jsMatch[0].match(/\.\/static\/js\/[^"]+/)?.[0];
    if (!jsPath) {
      console.warn('Could not parse LiveBench JavaScript path');
      return {};
    }

    // Fetch the JavaScript bundle
    const jsUrl = `https://livebench.ai/${jsPath.replace('./', '')}`;
    const jsResponse = await fetchWithRetry(jsUrl, { cache: 'no-store' });
    if (!jsResponse.ok) {
      console.warn('Failed to fetch LiveBench JavaScript bundle');
      return {};
    }

    const jsText = await jsResponse.text();

    // Extract the most recent version (format: LiveBench-YYYY-MM-DD)
    const versionMatch = jsText.match(/LiveBench-(\d{4})-(\d{2})-(\d{2})/);
    if (!versionMatch) {
      console.warn('Could not find LiveBench version in JavaScript bundle');
      return {};
    }

    const [, year, month, day] = versionMatch;
    const csvUrl = `https://livebench.ai/table_${year}_${month}_${day}.csv`;

    const response = await fetchWithRetry(csvUrl, { cache: 'no-store' });

    if (!response.ok) {
      console.warn(`LiveBench CSV fetch failed with status ${response.status}`);
      return {};
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');

    if (lines.length < 2) {
      console.warn('LiveBench CSV has insufficient data');
      return {};
    }

    // Parse CSV header to find column indices
    const header = lines[0].split(',');
    const modelIdx = header.indexOf('model');

    // Find all score columns (excluding 'model')
    const scoreColumns: Array<{ name: string; idx: number }> = [];
    for (let i = 0; i < header.length; i++) {
      if (i !== modelIdx) {
        scoreColumns.push({ name: header[i], idx: i });
      }
    }

    // Parse model rows
    interface ModelScores {
      name: string;
      scores: number[];
    }

    const models: ModelScores[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < header.length) continue;

      const modelName = parts[modelIdx];
      const scores: number[] = [];

      for (const col of scoreColumns) {
        const value = parseFloat(parts[col.idx]);
        if (!isNaN(value)) {
          scores.push(value);
        }
      }

      // Calculate global average (average of all benchmark scores)
      if (scores.length > 0) {
        const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        models.push({ name: modelName, scores: [avg] });
      }
    }

    if (models.length === 0) {
      console.warn('No LiveBench models parsed from CSV');
      return {};
    }

    // Sort by global average (descending - higher is better)
    models.sort((a, b) => b.scores[0] - a.scores[0]);

    // Assign ranks
    const entries: ModelEntry[] = models.map((m, idx) => ({
      name: m.name,
      rank: idx + 1,
      score: m.scores[0],
      source: 'livebench:global',
    }));

    return { 'livebench:global': entries };
  } catch (error) {
    console.error('LiveBench fetch failed:', error);
    return {};
  }
}
