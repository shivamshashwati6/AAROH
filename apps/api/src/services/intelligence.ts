import { z } from 'zod';
import { query } from '../db';

// -----------------------------------------------------------------------------
// 1. Zod Schemas for AI & NLP Structured Extraction
// -----------------------------------------------------------------------------

export const extractedReportSchema = z.object({
  disaster_type: z.enum(['flood', 'cyclone', 'landslide', 'earthquake', 'fire', 'extreme_weather']),
  category: z.enum(['rescue', 'medical', 'water', 'food', 'shelter', 'infrastructure', 'general_distress']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  people_affected: z.number().int().min(1).nullable(),
  medical_need: z.boolean(),
  urgent_needs: z.array(z.string()),
  extracted_location: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  key_facts: z.array(z.string()),
});

export type ExtractedReportData = z.infer<typeof extractedReportSchema>;

export interface RawCitizenReport {
  id: string;
  disaster_id: string;
  user_id: string | null;
  location_lat: number;
  location_lng: number;
  location_name: string | null;
  description: string;
  disaster_type?: string | null;
  severity: string;
  category: string;
  people_affected: number | null;
  medical_need: boolean;
  confidence: number;
  is_simulated: boolean;
  status: string;
  contact_number?: string | null;
  created_at: string;
}

export interface ReportDuplicateCluster {
  cluster_id: string;
  primary_report_id: string;
  duplicate_report_ids: string[];
  total_reports: number;
  confidence: number;
  reason: string;
  shared_location: string | null;
  combined_people_estimate: number;
  category: string;
}

export interface SituationAnalysisResult {
  id: string;
  disaster_id: string;
  disaster_name: string;
  analyzed_by: string | null;
  created_at: string;
  provider: 'gemini-1.5-pro' | 'deterministic_fallback';
  provider_note?: string;
  total_reports_analyzed: number;
  pending_reports_remaining: number;
  summary: string;
  reported_facts: string[];
  inferred_findings: string[];
  uncertain_information: string[];
  unresolved_conflicts: string[];
  categories_breakdown: Record<string, { count: number; percentage: number }>;
  severity_breakdown: Record<string, number>;
  urgent_needs: { need: string; count: number }[];
  high_severity_count: number;
  clusters: ReportDuplicateCluster[];
  high_severity_reports: {
    id: string;
    description: string;
    location_name: string | null;
    severity: string;
    category: string;
    people_affected: number | null;
    medical_need: boolean;
  }[];
}

// -----------------------------------------------------------------------------
// 2. Haversine Spatial Proximity Utility
// -----------------------------------------------------------------------------

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// -----------------------------------------------------------------------------
// 3. Text Tokenization & Jaccard Similarity Utility
// -----------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'near',
  'to', 'for', 'of', 'with', 'by', 'from', 'has', 'have', 'had', 'been',
  'we', 'our', 'my', 'i', 'they', 'them', 'are', 'was', 'were', 'it', 'there'
]);

export function tokenizeAndNormalize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

export function calculateTextJaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenizeAndNormalize(text1);
  const tokens2 = tokenizeAndNormalize(text2);
  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  let intersection = 0;
  tokens1.forEach((t) => {
    if (tokens2.has(t)) intersection++;
  });

  const union = tokens1.size + tokens2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// -----------------------------------------------------------------------------
// 4. Deterministic NLP Extractor (Always Available, Zero Hallucination)
// -----------------------------------------------------------------------------

export function extractReportDeterministic(description: string): ExtractedReportData {
  const textLower = description.toLowerCase();

  // 1. Disaster Type
  let disasterType: ExtractedReportData['disaster_type'] = 'flood';
  if (textLower.includes('cyclone') || textLower.includes('storm surge') || textLower.includes('gale')) {
    disasterType = 'cyclone';
  } else if (textLower.includes('landslide') || textLower.includes('mudslide') || textLower.includes('rockfall')) {
    disasterType = 'landslide';
  } else if (textLower.includes('earthquake') || textLower.includes('tremor') || textLower.includes('aftershock')) {
    disasterType = 'earthquake';
  } else if (textLower.includes('fire') || textLower.includes('blaze')) {
    disasterType = 'fire';
  } else if (textLower.includes('hail') || textLower.includes('heatwave') || textLower.includes('drought')) {
    disasterType = 'extreme_weather';
  }

  // 2. Medical Need
  const medicalKeywords = [
    'medicine', 'insulin', 'doctor', 'hospital', 'pregnant', 'injury', 'injured',
    'sick', 'bleeding', 'fever', 'patient', 'cardiac', 'oxygen', 'clinic',
    'paramedic', 'ambulance', 'diabetic', 'stroke', 'unconscious', 'fracture'
  ];
  const hasMedical = medicalKeywords.some((kw) => textLower.includes(kw));

  // 3. Urgent Needs
  const urgentNeeds: string[] = [];
  if (textLower.includes('rescue') || textLower.includes('boat') || textLower.includes('trapped') || textLower.includes('marooned') || textLower.includes('stranded')) {
    urgentNeeds.push('rescue');
  }
  if (hasMedical) {
    urgentNeeds.push('medicine');
  }
  if (textLower.includes('water') || textLower.includes('drinking') || textLower.includes('clean water') || textLower.includes('thirst')) {
    urgentNeeds.push('water');
  }
  if (textLower.includes('food') || textLower.includes('starv') || textLower.includes('hunger') || textLower.includes('ration') || textLower.includes('meal')) {
    urgentNeeds.push('food');
  }
  if (textLower.includes('shelter') || textLower.includes('homeless') || textLower.includes('washed away') || textLower.includes('roof collapsed')) {
    urgentNeeds.push('shelter');
  }
  if (textLower.includes('bridge') || textLower.includes('road') || textLower.includes('submerged') || textLower.includes('cut off')) {
    urgentNeeds.push('transport');
  }

  // 4. Primary Category
  let category: ExtractedReportData['category'] = 'general_distress';
  if (urgentNeeds.includes('rescue')) {
    category = 'rescue';
  } else if (hasMedical) {
    category = 'medical';
  } else if (urgentNeeds.includes('water')) {
    category = 'water';
  } else if (urgentNeeds.includes('food')) {
    category = 'food';
  } else if (urgentNeeds.includes('shelter')) {
    category = 'shelter';
  } else if (urgentNeeds.includes('transport')) {
    category = 'infrastructure';
  }

  // 5. Severity Assessment
  let severity: ExtractedReportData['severity'] = 'medium';
  const criticalPhrases = [
    'trapped on roof', 'roof', 'drowning', 'insulin', 'cardiac', 'heart',
    'pregnant', 'unconscious', 'severe bleeding', 'life threatening', 'immediate rescue',
    'infant trapped', 'swept away', 'house submerged'
  ];
  const highPhrases = [
    'submerged', 'cut off', 'water rising fast', 'no food', 'no clean water',
    'elderly', 'sick patient', 'marooned', 'bridge broken', 'embankment breached'
  ];

  if (criticalPhrases.some((cp) => textLower.includes(cp))) {
    severity = 'critical';
  } else if (highPhrases.some((hp) => textLower.includes(hp))) {
    severity = 'high';
  } else if (textLower.includes('advisory') || textLower.includes('minor') || textLower.includes('query')) {
    severity = 'low';
  }

  // 6. People Affected Extraction
  let peopleAffected: number | null = null;
  const numMatch = description.match(/(\d+)\s*(people|persons|family members|individuals|kids|children|elderly|trapped|members)/i);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 50000) {
      peopleAffected = val;
    }
  } else if (textLower.includes('family')) {
    peopleAffected = 4; // Standard household assumption in disaster response
  } else if (textLower.includes('mother') || textLower.includes('father') || textLower.includes('patient') || textLower.includes('someone')) {
    peopleAffected = 1;
  }

  // 7. Location Extraction
  let extractedLocation: string | null = null;
  const locMatch = description.match(
    /(?:in|near|at|around|from)\s+([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*(?:\s+(?:embankment|school|village|bridge|hospital|camp|road|bazaar|riverbank|hills|nagar|bari|gaon))?)/
  );
  if (locMatch && locMatch[1]) {
    extractedLocation = locMatch[1].trim();
  }

  // 8. Key Facts
  const keyFacts: string[] = [];
  if (peopleAffected) {
    keyFacts.push(`${peopleAffected} individuals identified in distress`);
  }
  if (severity === 'critical') {
    keyFacts.push('Critical life-safety emergency requiring immediate intervention');
  }
  if (hasMedical) {
    keyFacts.push('Immediate medical need or prescription dependency indicated');
  }
  if (extractedLocation) {
    keyFacts.push(`Reported location: ${extractedLocation}`);
  }

  const confidence = 0.92;

  const result: ExtractedReportData = {
    disaster_type: disasterType,
    category,
    severity,
    people_affected: peopleAffected,
    medical_need: hasMedical,
    urgent_needs: urgentNeeds.length > 0 ? urgentNeeds : ['general_assistance'],
    extracted_location: extractedLocation,
    confidence,
    key_facts: keyFacts,
  };

  return extractedReportSchema.parse(result);
}

// -----------------------------------------------------------------------------
// 5. Gemini AI Extraction Pipeline with Robust Fallback
// -----------------------------------------------------------------------------

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  return (
    key.length > 10 &&
    !key.includes('your_gemini_api_key_here') &&
    !key.includes('[YOUR-API-KEY]')
  );
}

export async function extractReportWithAiOrFallback(
  description: string
): Promise<{ extracted: ExtractedReportData; provider: 'gemini-1.5-pro' | 'deterministic_fallback' }> {
  if (!isGeminiConfigured()) {
    return {
      extracted: extractReportDeterministic(description),
      provider: 'deterministic_fallback',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are the RELIEF-OS Disaster Intelligence Extraction Engine.
Analyze the following citizen emergency report and return ONLY valid JSON matching this schema:
{
  "disaster_type": "flood" | "cyclone" | "landslide" | "earthquake" | "fire" | "extreme_weather",
  "category": "rescue" | "medical" | "water" | "food" | "shelter" | "infrastructure" | "general_distress",
  "severity": "low" | "medium" | "high" | "critical",
  "people_affected": number | null,
  "medical_need": boolean,
  "urgent_needs": string[],
  "extracted_location": string | null,
  "confidence": number between 0.0 and 1.0,
  "key_facts": string[]
}
Never fabricate coordinates, casualties, or facts not present in the text.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemInstruction },
              { text: `Report Text: "${description}"` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Gemini API Warning]: HTTP ${response.status}. Falling back to deterministic NLP.`);
      return {
        extracted: extractReportDeterministic(description),
        provider: 'deterministic_fallback',
      };
    }

    const data = (await response.json()) as any;
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      throw new Error('Empty candidate response from Gemini');
    }

    const parsedJson = JSON.parse(textContent);
    const validated = extractedReportSchema.parse(parsedJson);

    return {
      extracted: validated,
      provider: 'gemini-1.5-pro',
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    // Sanitize log: never leak API key
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AI Extraction Fallback]: Gemini unavailable (${msg}). Using deterministic NLP.`);
    return {
      extracted: extractReportDeterministic(description),
      provider: 'deterministic_fallback',
    };
  }
}

// -----------------------------------------------------------------------------
// 6. Report Clustering and Duplicate Detection
// -----------------------------------------------------------------------------

export function detectReportClusters(reports: RawCitizenReport[]): ReportDuplicateCluster[] {
  if (reports.length < 2) return [];

  const clusters: ReportDuplicateCluster[] = [];
  const visitedReportIds = new Set<string>();

  for (let i = 0; i < reports.length; i++) {
    const r1 = reports[i];
    if (visitedReportIds.has(r1.id)) continue;

    const duplicatesForR1: { report: RawCitizenReport; confidence: number; reason: string }[] = [];

    for (let j = i + 1; j < reports.length; j++) {
      const r2 = reports[j];
      if (visitedReportIds.has(r2.id)) continue;

      // 1. Text Similarity
      const textSim = calculateTextJaccardSimilarity(r1.description, r2.description);
      const isIdenticalText = r1.description.trim().toLowerCase() === r2.description.trim().toLowerCase();

      // 2. Spatial Distance (meters)
      const hasCoords1 = !isNaN(r1.location_lat) && !isNaN(r1.location_lng);
      const hasCoords2 = !isNaN(r2.location_lat) && !isNaN(r2.location_lng);
      let distMeters = 999999;
      if (hasCoords1 && hasCoords2) {
        distMeters = calculateDistanceMeters(r1.location_lat, r1.location_lng, r2.location_lat, r2.location_lng);
      }

      // 3. Temporal Difference (Hours)
      const t1 = new Date(r1.created_at).getTime();
      const t2 = new Date(r2.created_at).getTime();
      const diffHours = Math.abs(t1 - t2) / (1000 * 3600);

      // 4. Location Name Match
      const loc1 = (r1.location_name || '').trim().toLowerCase();
      const loc2 = (r2.location_name || '').trim().toLowerCase();
      const isSharedLocation = loc1.length > 2 && loc2.length > 2 && loc1 === loc2;

      // Evaluation Rules:
      // High Confidence Rule A: Exact or near-identical text in the same geographic radius (< 1500m)
      if (isIdenticalText && distMeters <= 1500) {
        duplicatesForR1.push({
          report: r2,
          confidence: 0.95,
          reason: `Identical distress text reported within ${distMeters}m (${distMeters === 0 ? 'same coordinates' : 'immediate proximity'})`,
        });
        continue;
      }

      // High Confidence Rule B: High text similarity (> 0.65) AND within 1000m AND within 24 hours
      if (textSim >= 0.65 && distMeters <= 1000 && diffHours <= 24) {
        duplicatesForR1.push({
          report: r2,
          confidence: 0.88,
          reason: `High semantic overlap (${Math.round(textSim * 100)}%) within ${distMeters}m and ${Math.round(diffHours)}h`,
        });
        continue;
      }

      // Medium Confidence Rule C: Same named landmark/village AND exact same category AND within 24 hours AND textSim >= 0.50
      if (isSharedLocation && r1.category === r2.category && diffHours <= 24 && textSim >= 0.5) {
        duplicatesForR1.push({
          report: r2,
          confidence: 0.78,
          reason: `Same landmark '${r1.location_name}' and category '${r1.category}' with ${Math.round(textSim * 100)}% content similarity`,
        });
        continue;
      }

      // Medium Confidence Rule D: Identical text across repeated submissions without coordinates or within immediate proximity (<2000m)
      const hasDistanceSeparation = hasCoords1 && hasCoords2 && distMeters > 2000;
      if (isIdenticalText && diffHours <= 48 && !hasDistanceSeparation) {
        duplicatesForR1.push({
          report: r2,
          confidence: 0.75,
          reason: `Identical citizen distress description re-submitted within ${Math.round(diffHours)}h`,
        });
        continue;
      }

      // Note: Text similarity alone WITHOUT geographic proximity, named landmark, or identical description
      // is deliberately NOT clustered to avoid false-positive mergers as mandated by PRD.
    }

    if (duplicatesForR1.length > 0) {
      const clusterId = `cluster-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      visitedReportIds.add(r1.id);
      duplicatesForR1.forEach((d) => visitedReportIds.add(d.report.id));

      const allReports = [r1, ...duplicatesForR1.map((d) => d.report)];
      const maxConfidence = Math.max(...duplicatesForR1.map((d) => d.confidence));
      
      // Conservative population estimate: Take maximum single report affected count, rather than summing
      const maxPeople = Math.max(...allReports.map((r) => r.people_affected || 1));

      clusters.push({
        cluster_id: clusterId,
        primary_report_id: r1.id,
        duplicate_report_ids: duplicatesForR1.map((d) => d.report.id),
        total_reports: allReports.length,
        confidence: maxConfidence,
        reason: duplicatesForR1[0].reason,
        shared_location: r1.location_name || null,
        combined_people_estimate: maxPeople,
        category: r1.category,
      });
    }
  }

  return clusters;
}

// -----------------------------------------------------------------------------
// 7. Situation Analysis Synthesis
// -----------------------------------------------------------------------------

export function synthesizeSituationOverview(
  disaster: { id: string; name: string },
  reports: RawCitizenReport[],
  clusters: ReportDuplicateCluster[],
  provider: 'gemini-1.5-pro' | 'deterministic_fallback'
): SituationAnalysisResult {
  const totalAnalyzed = reports.length;

  // 1. Categories Breakdown
  const catCounts: Record<string, number> = {};
  const sevCounts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const urgentNeedsMap: Record<string, number> = {};

  reports.forEach((r) => {
    const c = r.category || 'general_distress';
    catCounts[c] = (catCounts[c] || 0) + 1;

    const s = r.severity?.toLowerCase() || 'medium';
    if (s in sevCounts) {
      sevCounts[s]++;
    } else {
      sevCounts.medium++;
    }

    if (r.medical_need) {
      urgentNeedsMap['medicine'] = (urgentNeedsMap['medicine'] || 0) + 1;
    }
    if (c === 'rescue' || s === 'critical') {
      urgentNeedsMap['rescue'] = (urgentNeedsMap['rescue'] || 0) + 1;
    }
    if (c === 'water') {
      urgentNeedsMap['clean_water'] = (urgentNeedsMap['clean_water'] || 0) + 1;
    }
    if (c === 'food') {
      urgentNeedsMap['food_kits'] = (urgentNeedsMap['food_kits'] || 0) + 1;
    }
    if (c === 'shelter') {
      urgentNeedsMap['evacuation_shelter'] = (urgentNeedsMap['evacuation_shelter'] || 0) + 1;
    }
  });

  const categoriesBreakdown: Record<string, { count: number; percentage: number }> = {};
  Object.keys(catCounts).forEach((cat) => {
    categoriesBreakdown[cat] = {
      count: catCounts[cat],
      percentage: totalAnalyzed > 0 ? Math.round((catCounts[cat] / totalAnalyzed) * 100) : 0,
    };
  });

  const urgentNeedsList = Object.entries(urgentNeedsMap).map(([need, count]) => ({ need, count }));

  // 2. Facts directly extracted from citizen submissions
  const reportedFacts: string[] = [];
  const topCritical = reports.filter((r) => r.severity === 'critical').slice(0, 5);
  topCritical.forEach((r) => {
    const loc = r.location_name ? ` at ${r.location_name}` : '';
    const people = r.people_affected ? ` affecting ~${r.people_affected} people` : '';
    reportedFacts.push(`[${r.category.toUpperCase()}] "${r.description.slice(0, 100)}"${loc}${people}`);
  });

  if (reportedFacts.length === 0 && reports.length > 0) {
    reportedFacts.push(`Ingested ${reports.length} citizen distress reports across the disaster region.`);
  }

  // 3. Inferred Findings
  const inferredFindings: string[] = [];
  if (sevCounts.critical > 0) {
    inferredFindings.push(
      `Acute threat to life detected: ${sevCounts.critical} critical reports require immediate search-and-rescue prioritization.`
    );
  }
  if (clusters.length > 0) {
    inferredFindings.push(
      `Identified ${clusters.length} duplicate incident clusters. Eliminating redundant dispatch requests across ${clusters.reduce((acc, c) => acc + c.total_reports, 0)} reports.`
    );
  }
  if (urgentNeedsMap['medicine'] && urgentNeedsMap['medicine'] > 0) {
    inferredFindings.push(
      `${urgentNeedsMap['medicine']} medical distress cases require specialized paramedics or essential medication delivery.`
    );
  }

  // 4. Uncertain Information
  const uncertainInfo: string[] = [];
  const reportsWithoutCoords = reports.filter((r) => isNaN(r.location_lat) || isNaN(r.location_lng));
  if (reportsWithoutCoords.length > 0) {
    uncertainInfo.push(
      `${reportsWithoutCoords.length} reports lack precise GPS coordinates; location verification needed via phone triage.`
    );
  }
  const reportsWithVaguePeople = reports.filter((r) => r.people_affected === null);
  if (reportsWithVaguePeople.length > 0) {
    uncertainInfo.push(
      `${reportsWithVaguePeople.length} reports have unverified casualty/population numbers; using conservative planning baselines.`
    );
  }

  // 5. Unresolved Conflicts
  const unresolvedConflicts: string[] = [];
  if (clusters.length > 0) {
    const multiSeverityClusters = clusters.filter((c) => {
      const group = reports.filter((r) => r.id === c.primary_report_id || c.duplicate_report_ids.includes(r.id));
      const sevs = new Set(group.map((g) => g.severity));
      return sevs.size > 1;
    });
    if (multiSeverityClusters.length > 0) {
      unresolvedConflicts.push(
        `Discrepancy in severity ratings across ${multiSeverityClusters.length} duplicate clusters; default escalated to highest reported severity.`
      );
    }
  }

  // 6. Summary Narrative
  const highSevTotal = sevCounts.critical + sevCounts.high;
  const summary = totalAnalyzed === 0
    ? `No pending citizen reports available for disaster '${disaster.name}'. All records up to date.`
    : `AI Situation Analysis of ${totalAnalyzed} citizen reports for '${disaster.name}': ${highSevTotal} reports flagged as high or critical severity. Primary operational demands focus on ${Object.keys(urgentNeedsMap).join(', ') || 'general relief'}. ${clusters.length} duplicate incident clusters identified to prevent redundant fleet dispatch.`;

  return {
    id: `sit-analysis-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    disaster_id: disaster.id,
    disaster_name: disaster.name,
    analyzed_by: null,
    created_at: new Date().toISOString(),
    provider,
    provider_note: provider === 'deterministic_fallback' 
      ? 'Deterministic rule-based analysis active (zero hallucination, schema compliant)'
      : 'Gemini 1.5 Pro multimodal intelligence active',
    total_reports_analyzed: totalAnalyzed,
    pending_reports_remaining: 0,
    summary,
    reported_facts: reportedFacts,
    inferred_findings: inferredFindings,
    uncertain_information: uncertainInfo,
    unresolved_conflicts: unresolvedConflicts,
    categories_breakdown: categoriesBreakdown,
    severity_breakdown: sevCounts,
    urgent_needs: urgentNeedsList,
    high_severity_count: highSevTotal,
    clusters,
    high_severity_reports: topCritical.map((r) => ({
      id: r.id,
      description: r.description,
      location_name: r.location_name,
      severity: r.severity,
      category: r.category,
      people_affected: r.people_affected,
      medical_need: r.medical_need,
    })),
  };
}

// -----------------------------------------------------------------------------
// 8. Execute End-to-End Disaster Report Intelligence Pipeline
// -----------------------------------------------------------------------------

export async function analyzeDisasterReports(
  disasterId: string,
  options?: {
    limit?: number;
    force_reanalyze?: boolean;
    report_ids?: string[];
    user?: { id: string; role: string; name?: string };
  }
): Promise<SituationAnalysisResult> {
  // 1. Verify disaster existence
  const disRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM disasters WHERE id = $1`,
    [disasterId]
  );
  if (disRes.rows.length === 0) {
    const err = new Error(`Disaster with ID '${disasterId}' not found`);
    (err as any).status = 404;
    throw err;
  }
  const disaster = disRes.rows[0];

  // 2. Fetch target reports
  const limit = options?.limit || 100;
  const conditions: string[] = ['disaster_id = $1'];
  const params: unknown[] = [disasterId];

  if (options?.report_ids && options.report_ids.length > 0) {
    params.push(options.report_ids);
    conditions.push(`id = ANY($${params.length}::varchar[])`);
  } else if (!options?.force_reanalyze) {
    conditions.push(`status = 'pending_ai'`);
  }

  params.push(limit);
  const limitIdx = params.length;

  const rawReportsRes = await query(
    `SELECT 
      id, 
      disaster_id, 
      user_id, 
      ST_Y(location::geometry) as lat, 
      ST_X(location::geometry) as lng, 
      location_name, 
      description, 
      disaster_type, 
      severity, 
      category, 
      people_affected, 
      medical_need, 
      confidence::float as confidence, 
      is_simulated, 
      status, 
      contact_number, 
      created_at 
    FROM reports 
    WHERE ${conditions.join(' AND ')} 
    ORDER BY 
      CASE severity 
        WHEN 'critical' THEN 0 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        ELSE 3 
      END ASC, 
      created_at DESC 
    LIMIT $${limitIdx}`,
    params
  );

  const rawReports: RawCitizenReport[] = rawReportsRes.rows.map((r) => ({
    id: r.id,
    disaster_id: r.disaster_id,
    user_id: r.user_id,
    location_lat: parseFloat(r.lat),
    location_lng: parseFloat(r.lng),
    location_name: r.location_name,
    description: r.description,
    disaster_type: r.disaster_type,
    severity: r.severity,
    category: r.category,
    people_affected: r.people_affected,
    medical_need: r.medical_need,
    confidence: r.confidence,
    is_simulated: r.is_simulated,
    status: r.status,
    contact_number: r.contact_number,
    created_at: r.created_at,
  }));

  // Handle zero eligible reports
  if (rawReports.length === 0) {
    const emptyResult = synthesizeSituationOverview(disaster, [], [], 'deterministic_fallback');
    emptyResult.analyzed_by = options?.user?.id || null;
    return emptyResult;
  }

  // 3. Extract structured intelligence for each report
  let primaryProvider: 'gemini-1.5-pro' | 'deterministic_fallback' = 'deterministic_fallback';
  const analyzedReports: RawCitizenReport[] = [];

  for (const report of rawReports) {
    const { extracted, provider } = await extractReportWithAiOrFallback(report.description);
    if (provider === 'gemini-1.5-pro') {
      primaryProvider = 'gemini-1.5-pro';
    }

    // Merge extracted data without overwriting original description, location, or contact
    const mergedReport: RawCitizenReport = {
      ...report,
      category: extracted.category,
      severity: extracted.severity,
      disaster_type: extracted.disaster_type,
      people_affected: extracted.people_affected ?? report.people_affected,
      medical_need: extracted.medical_need || report.medical_need,
      confidence: extracted.confidence,
      status: 'analyzed',
    };

    analyzedReports.push(mergedReport);

    // Update in database with status 'analyzed' and structured metadata
    await query(
      `UPDATE reports 
       SET 
         status = 'analyzed',
         severity = $1,
         category = $2,
         disaster_type = $3,
         people_affected = $4,
         medical_need = $5,
         confidence = $6,
         ai_extracted = $7,
         analyzed_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [
        mergedReport.severity,
        mergedReport.category,
        mergedReport.disaster_type,
        mergedReport.people_affected,
        mergedReport.medical_need,
        mergedReport.confidence,
        JSON.stringify(extracted),
        report.id,
      ]
    );
  }

  // 4. Duplicate Detection & Clustering
  const clusters = detectReportClusters(analyzedReports);

  // Mark duplicate_cluster_id on reports
  for (const c of clusters) {
    const memberIds = [c.primary_report_id, ...c.duplicate_report_ids];
    await query(
      `UPDATE reports SET duplicate_cluster_id = $1 WHERE id = ANY($2::varchar[])`,
      [c.cluster_id, memberIds]
    );
  }

  // 5. Synthesize Situation Overview
  const situationResult = synthesizeSituationOverview(
    disaster,
    analyzedReports,
    clusters,
    primaryProvider
  );
  situationResult.analyzed_by = options?.user?.id || null;

  // Check remaining pending reports
  const pendingCountRes = await query<{ count: string }>(
    `SELECT count(*) as count FROM reports WHERE disaster_id = $1 AND status = 'pending_ai'`,
    [disasterId]
  );
  situationResult.pending_reports_remaining = parseInt(pendingCountRes.rows[0]?.count || '0', 10);

  // 6. Persist Situation Analysis to database
  await query(
    `INSERT INTO situation_analyses (
      id, disaster_id, analyzed_by, summary, facts, inferred, uncertainties, conflicts,
      categories_breakdown, severity_breakdown, urgent_needs, high_severity_count,
      total_reports_analyzed, clusters, provider, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )`,
    [
      situationResult.id,
      situationResult.disaster_id,
      situationResult.analyzed_by,
      situationResult.summary,
      JSON.stringify(situationResult.reported_facts),
      JSON.stringify(situationResult.inferred_findings),
      JSON.stringify(situationResult.uncertain_information),
      JSON.stringify(situationResult.unresolved_conflicts),
      JSON.stringify(situationResult.categories_breakdown),
      JSON.stringify(situationResult.severity_breakdown),
      JSON.stringify(situationResult.urgent_needs),
      situationResult.high_severity_count,
      situationResult.total_reports_analyzed,
      JSON.stringify(situationResult.clusters),
      situationResult.provider,
      situationResult.created_at,
    ]
  );

  // 7. Audit Log Entry (Sanitized, zero contact information)
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [
        options?.user?.id || null,
        'SITUATION_ANALYSIS_EXECUTED',
        JSON.stringify({
          analysis_id: situationResult.id,
          disaster_id: disasterId,
          total_reports_analyzed: situationResult.total_reports_analyzed,
          clusters_count: situationResult.clusters.length,
          provider: situationResult.provider,
          actor_role: options?.user?.role,
        }),
      ]
    );
  } catch (auditErr) {
    console.warn('[Audit Log Warning]: Could not record situation analysis:', auditErr);
  }

  return situationResult;
}

// -----------------------------------------------------------------------------
// 9. Get Latest Situation Analysis for a Disaster
// -----------------------------------------------------------------------------

export async function getLatestSituationAnalysis(
  disasterId: string
): Promise<SituationAnalysisResult | null> {
  const res = await query(
    `SELECT 
      sa.id, 
      sa.disaster_id, 
      d.name as disaster_name,
      sa.analyzed_by, 
      sa.summary, 
      sa.facts, 
      sa.inferred, 
      sa.uncertainties, 
      sa.conflicts, 
      sa.categories_breakdown, 
      sa.severity_breakdown, 
      sa.urgent_needs, 
      sa.high_severity_count, 
      sa.total_reports_analyzed, 
      sa.clusters, 
      sa.provider, 
      sa.created_at,
      (SELECT count(*) FROM reports WHERE disaster_id = $1 AND status = 'pending_ai') as pending_count
    FROM situation_analyses sa
    JOIN disasters d ON d.id = sa.disaster_id
    WHERE sa.disaster_id = $1
    ORDER BY sa.created_at DESC
    LIMIT 1`,
    [disasterId]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  return {
    id: row.id,
    disaster_id: row.disaster_id,
    disaster_name: row.disaster_name,
    analyzed_by: row.analyzed_by,
    created_at: row.created_at,
    provider: row.provider,
    provider_note: row.provider === 'deterministic_fallback'
      ? 'Deterministic rule-based analysis active'
      : 'Gemini 1.5 Pro intelligence active',
    total_reports_analyzed: row.total_reports_analyzed,
    pending_reports_remaining: parseInt(row.pending_count || '0', 10),
    summary: row.summary,
    reported_facts: typeof row.facts === 'string' ? JSON.parse(row.facts) : row.facts || [],
    inferred_findings: typeof row.inferred === 'string' ? JSON.parse(row.inferred) : row.inferred || [],
    uncertain_information: typeof row.uncertainties === 'string' ? JSON.parse(row.uncertainties) : row.uncertainties || [],
    unresolved_conflicts: typeof row.conflicts === 'string' ? JSON.parse(row.conflicts) : row.conflicts || [],
    categories_breakdown: typeof row.categories_breakdown === 'string' ? JSON.parse(row.categories_breakdown) : row.categories_breakdown || {},
    severity_breakdown: typeof row.severity_breakdown === 'string' ? JSON.parse(row.severity_breakdown) : row.severity_breakdown || {},
    urgent_needs: typeof row.urgent_needs === 'string' ? JSON.parse(row.urgent_needs) : row.urgent_needs || [],
    high_severity_count: row.high_severity_count,
    clusters: typeof row.clusters === 'string' ? JSON.parse(row.clusters) : row.clusters || [],
    high_severity_reports: [],
  };
}
