import { ModelEntry } from '../types';
import { fetchWithRetry } from '../utils/retry';

interface AAModel {
  short_name: string;
  omniscience?: number;
  hallucination_rate?: number;
  coding_index?: number;
  agentic_index?: number;
  long_context_reasoning?: number;
  ifbench?: number;
}

function parseRSCPayload(html: string): AAModel[] {
  const modelsByName = new Map<string, AAModel>();

  try {
    // The data is duplicated many times in the HTML with huge gaps between fields
    // Strategy: Find each metric and look backwards for the nearest short_name and slug

    // Collect all short_name positions
    const namePositions: Array<{ index: number; name: string }> = [];
    const nameRegex = /\\"short_name\\":\\"([^\\"]+)\\"/g;
    let nameMatch;
    while ((nameMatch = nameRegex.exec(html)) !== null) {
      const name = nameMatch[1];
      namePositions.push({ index: nameMatch.index, name });
      if (!modelsByName.has(name)) {
        modelsByName.set(name, { short_name: name });
      }
    }

    // Helper: Find the closest short_name before a given position
    function findClosestName(position: number): string | null {
      let closest: { index: number; name: string } | null = null;
      for (const np of namePositions) {
        if (np.index < position) {
          if (!closest || np.index > closest.index) {
            closest = np;
          }
        }
      }
      return closest?.name || null;
    }

    // Extract omniscience values (the main leaderboard score)
    // The HTML has multiple omniscience fields per model, but we want the simple "omniscience":VALUE field
    // that represents the overall leaderboard score, not the detailed breakdown
    // Note: omniscience can be negative (range -100 to 100)
    // Strategy: Skip omniscience values that are inside "omniscience_breakdown" by checking context
    const omniscienceRegex = /\\"omniscience\\":(-?[0-9.]+)/g;
    let omniscienceMatch;
    while ((omniscienceMatch = omniscienceRegex.exec(html)) !== null) {
      const value = parseFloat(omniscienceMatch[1]);
      if (!isNaN(value)) {
        // Check if this omniscience value is inside an omniscience_breakdown (skip those)
        const contextBefore = html.substring(Math.max(0, omniscienceMatch.index - 500), omniscienceMatch.index);
        const isInBreakdown = /\\"omniscience_breakdown\\"[^}]*$/.test(contextBefore);

        if (!isInBreakdown) {
          const name = findClosestName(omniscienceMatch.index);
          if (name) {
            const model = modelsByName.get(name) || { short_name: name };
            // Only set if not already set (keep first non-breakdown occurrence)
            if (model.omniscience === undefined) {
              // Round to integer for the AA-Omniscience Index
              model.omniscience = Math.round(value);
              modelsByName.set(name, model);
            }
          }
        }
      }
    }

    // Extract hallucination rates from schema.org structured data CSV
    // Format: omniscienceHallucinationRate,detailsUrl,isLabClaimedValue\nModel,rate,url,bool\n...
    const csvMatch = html.match(/omniscienceHallucinationRate,detailsUrl,isLabClaimedValue([^"]+)"/);
    if (csvMatch) {
      const csvData = csvMatch[1];
      // Split by \\n to get rows (the newlines are escaped in the HTML)
      const rows = csvData.split('\\\\n');

      for (const row of rows) {
        if (!row.trim()) continue;

        // Parse CSV row: ModelName,rate,url,bool
        const parts = row.split(',');
        if (parts.length >= 3) {
          const modelName = parts[0].trim();
          const rate = parseFloat(parts[1]);
          const url = parts[2].trim();

          if (modelName && !isNaN(rate)) {
            const model = modelsByName.get(modelName) || { short_name: modelName };

            // Prefer reasoning/thinking variants (they typically perform better)
            // If this is a thinking variant, always use it
            // If not thinking variant, only set if not already set
            const isThinkingVariant = url.includes('-thinking/') || url.includes('-reasoning/');

            if (isThinkingVariant || model.hallucination_rate === undefined) {
              model.hallucination_rate = rate;
              modelsByName.set(modelName, model);
            }
          }
        }
      }
    }

    // Extract coding_index values
    // For models with multiple occurrences, keep the maximum value
    const codingRegex = /\\"coding_index\\":([0-9.]+)/g;
    let codingMatch;
    while ((codingMatch = codingRegex.exec(html)) !== null) {
      const value = parseFloat(codingMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(codingMatch.index);

        if (name) {
          const model = modelsByName.get(name) || { short_name: name };

          // Keep the maximum value (higher is better for coding)
          if (model.coding_index === undefined || value > model.coding_index) {
            model.coding_index = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract agentic_index values
    // Keep only the first occurrence per model (typically the primary/standard variant)
    const agenticRegex = /\\"agentic_index\\":([0-9.]+)/g;
    let agenticMatch;
    while ((agenticMatch = agenticRegex.exec(html)) !== null) {
      const value = parseFloat(agenticMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(agenticMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };

          // Only keep the first occurrence
          if (model.agentic_index === undefined) {
            model.agentic_index = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract long_context_reasoning values
    // Keep only the first occurrence per model
    const longContextRegex = /\\"long_context_reasoning\\":([0-9.]+)/g;
    let longContextMatch;
    while ((longContextMatch = longContextRegex.exec(html)) !== null) {
      const value = parseFloat(longContextMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(longContextMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };

          // Only keep the first occurrence
          if (model.long_context_reasoning === undefined) {
            model.long_context_reasoning = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract ifbench values
    // Keep only the first occurrence per model
    const ifbenchRegex = /\\"ifbench\\":([0-9.]+)/g;
    let ifbenchMatch;
    while ((ifbenchMatch = ifbenchRegex.exec(html)) !== null) {
      const value = parseFloat(ifbenchMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(ifbenchMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };

          // Only keep the first occurrence
          if (model.ifbench === undefined) {
            model.ifbench = value;
            modelsByName.set(name, model);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error parsing AA RSC payload:', error);
  }

  return Array.from(modelsByName.values());
}

function scoreToRank(models: AAModel[], key: keyof AAModel, lowerIsBetter = false): ModelEntry[] {
  // Filter to only models that have this specific metric
  const filtered = models.filter(m => typeof m[key] === 'number' && !isNaN(m[key] as number));

  if (filtered.length === 0) {
    return [];
  }

  // Sort by score (descending for higher=better, ascending for lower=better)
  filtered.sort((a, b) => {
    const aVal = a[key] as number;
    const bVal = b[key] as number;
    return lowerIsBetter ? aVal - bVal : bVal - aVal;
  });

  // Assign ranks
  return filtered.map((m, idx) => ({
    name: m.short_name,
    rank: idx + 1,
    score: m[key] as number,
    source: `aa:${key.replace('_index', '').replace('_rate', '')}`,
  }));
}

export async function fetchArtificialAnalysis(): Promise<Record<string, ModelEntry[]>> {
  try {
    // Merge models by name - process sequentially to reduce memory footprint
    const allModels = new Map<string, AAModel>();

    // Fetch and process omniscience metrics from /evaluations/omniscience
    const omniscienceRes = await fetchWithRetry('https://artificialanalysis.ai/evaluations/omniscience', { cache: 'no-store' });
    if (omniscienceRes.ok) {
      const omniscienceModels = parseRSCPayload(await omniscienceRes.text());
      for (const model of omniscienceModels) {
        allModels.set(model.short_name, { ...model });
      }
    }

    // Fetch and process coding/agentic metrics from /models page
    const modelsRes = await fetchWithRetry('https://artificialanalysis.ai/models', { cache: 'no-store' });
    if (modelsRes.ok) {
      const modelsPageModels = parseRSCPayload(await modelsRes.text());
      for (const model of modelsPageModels) {
        const existing = allModels.get(model.short_name);
        if (existing) {
          if (model.coding_index !== undefined) existing.coding_index = model.coding_index;
          if (model.agentic_index !== undefined) existing.agentic_index = model.agentic_index;
        } else {
          allModels.set(model.short_name, { ...model });
        }
      }
    }

    // Fetch and process long context reasoning metrics
    const longContextRes = await fetchWithRetry('https://artificialanalysis.ai/evaluations/artificial-analysis-long-context-reasoning', { cache: 'no-store' });
    if (longContextRes.ok) {
      const longContextModels = parseRSCPayload(await longContextRes.text());
      for (const model of longContextModels) {
        const existing = allModels.get(model.short_name);
        if (existing) {
          if (model.long_context_reasoning !== undefined) existing.long_context_reasoning = model.long_context_reasoning;
        } else {
          allModels.set(model.short_name, { ...model });
        }
      }
    }

    // Fetch and process ifbench metrics
    const ifbenchRes = await fetchWithRetry('https://artificialanalysis.ai/evaluations/ifbench', { cache: 'no-store' });
    if (ifbenchRes.ok) {
      const ifbenchModels = parseRSCPayload(await ifbenchRes.text());
      for (const model of ifbenchModels) {
        const existing = allModels.get(model.short_name);
        if (existing) {
          if (model.ifbench !== undefined) existing.ifbench = model.ifbench;
        } else {
          allModels.set(model.short_name, { ...model });
        }
      }
    }

    const models = Array.from(allModels.values());

    if (models.length === 0) {
      console.warn('No AA models found');
      return {};
    }

    // Generate rankings for each metric independently
    // Models participate only in metrics they have data for
    const sources: Record<string, ModelEntry[]> = {};

    const omniscience = scoreToRank(models, 'omniscience');
    if (omniscience.length > 0) sources['aa:omniscience'] = omniscience;

    const hallucination = scoreToRank(models, 'hallucination_rate', true);
    if (hallucination.length > 0) sources['aa:hallucination'] = hallucination;

    const coding = scoreToRank(models, 'coding_index');
    if (coding.length > 0) sources['aa:coding'] = coding;

    const agentic = scoreToRank(models, 'agentic_index');
    if (agentic.length > 0) sources['aa:agentic'] = agentic;

    const longContext = scoreToRank(models, 'long_context_reasoning');
    if (longContext.length > 0) sources['aa:longcontext'] = longContext;

    const ifbench = scoreToRank(models, 'ifbench');
    if (ifbench.length > 0) sources['aa:ifbench'] = ifbench;

    return sources;
  } catch (error) {
    console.error('AA fetch failed:', error);
    return {};
  }
}
