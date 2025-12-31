import { ModelEntry } from '../types';
import { fetchWithRetry } from '../utils/retry';

interface AAModel {
  short_name: string;
  omniscience?: number;
  hallucination_rate?: number;
  lcr?: number; // Long Context Reasoning
  ifbench?: number;
  livecodebench?: number;
  scicode?: number;
  terminalbench_hard?: number;
  tau2?: number;
  gpqa?: number; // GPQA Diamond
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

    // Extract lcr (Long Context Reasoning) values
    // Keep only the first occurrence per model
    const lcrRegex = /\\"lcr\\":([0-9.]+)/g;
    let lcrMatch;
    while ((lcrMatch = lcrRegex.exec(html)) !== null) {
      const value = parseFloat(lcrMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(lcrMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };

          // Only keep the first occurrence
          if (model.lcr === undefined) {
            model.lcr = value;
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

    // Extract livecodebench values
    const livecodeRegex = /\\"livecodebench\\":([0-9.]+)/g;
    let livecodeMatch;
    while ((livecodeMatch = livecodeRegex.exec(html)) !== null) {
      const value = parseFloat(livecodeMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(livecodeMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };
          if (model.livecodebench === undefined) {
            model.livecodebench = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract scicode values
    const scicodeRegex = /\\"scicode\\":([0-9.]+)/g;
    let scicodeMatch;
    while ((scicodeMatch = scicodeRegex.exec(html)) !== null) {
      const value = parseFloat(scicodeMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(scicodeMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };
          if (model.scicode === undefined) {
            model.scicode = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract terminalbench_hard values
    const terminalbenchRegex = /\\"terminalbench_hard\\":([0-9.]+)/g;
    let terminalbenchMatch;
    while ((terminalbenchMatch = terminalbenchRegex.exec(html)) !== null) {
      const value = parseFloat(terminalbenchMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(terminalbenchMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };
          if (model.terminalbench_hard === undefined) {
            model.terminalbench_hard = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract tau2 values
    const tau2Regex = /\\"tau2\\":([0-9.]+)/g;
    let tau2Match;
    while ((tau2Match = tau2Regex.exec(html)) !== null) {
      const value = parseFloat(tau2Match[1]);
      if (!isNaN(value)) {
        const name = findClosestName(tau2Match.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };
          if (model.tau2 === undefined) {
            model.tau2 = value;
            modelsByName.set(name, model);
          }
        }
      }
    }

    // Extract gpqa values
    const gpqaRegex = /\\"gpqa\\":([0-9.]+)/g;
    let gpqaMatch;
    while ((gpqaMatch = gpqaRegex.exec(html)) !== null) {
      const value = parseFloat(gpqaMatch[1]);
      if (!isNaN(value)) {
        const name = findClosestName(gpqaMatch.index);
        if (name) {
          const model = modelsByName.get(name) || { short_name: name };
          if (model.gpqa === undefined) {
            model.gpqa = value;
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

    // Fetch and process long context reasoning metrics
    const longContextRes = await fetchWithRetry('https://artificialanalysis.ai/evaluations/artificial-analysis-long-context-reasoning', { cache: 'no-store' });
    if (longContextRes.ok) {
      const longContextModels = parseRSCPayload(await longContextRes.text());
      for (const model of longContextModels) {
        const existing = allModels.get(model.short_name);
        if (existing) {
          if (model.lcr !== undefined) existing.lcr = model.lcr;
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

    // Fetch and process GPQA Diamond metrics
    const gpqaRes = await fetchWithRetry('https://artificialanalysis.ai/evaluations/gpqa-diamond', { cache: 'no-store' });
    if (gpqaRes.ok) {
      const gpqaModels = parseRSCPayload(await gpqaRes.text());
      for (const model of gpqaModels) {
        const existing = allModels.get(model.short_name);
        if (existing) {
          if (model.gpqa !== undefined) existing.gpqa = model.gpqa;
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

    const longContext = scoreToRank(models, 'lcr');
    if (longContext.length > 0) sources['aa:longcontext'] = longContext;

    const ifbench = scoreToRank(models, 'ifbench');
    if (ifbench.length > 0) sources['aa:ifbench'] = ifbench;

    const livecodebench = scoreToRank(models, 'livecodebench');
    if (livecodebench.length > 0) sources['aa:livecodebench'] = livecodebench;

    const scicode = scoreToRank(models, 'scicode');
    if (scicode.length > 0) sources['aa:scicode'] = scicode;

    const terminalbench = scoreToRank(models, 'terminalbench_hard');
    if (terminalbench.length > 0) sources['aa:terminalbench'] = terminalbench;

    const tau2 = scoreToRank(models, 'tau2');
    if (tau2.length > 0) sources['aa:tau2'] = tau2;

    const gpqa = scoreToRank(models, 'gpqa');
    if (gpqa.length > 0) sources['aa:gpqa'] = gpqa;

    return sources;
  } catch (error) {
    console.error('AA fetch failed:', error);
    return {};
  }
}
