/**
 * Semantic ID Generation Engine for Device Doctor India CRM Workspaces
 * Standardized across:
 * - Device Doctor India (DDI)
 * - Codestro (CDS)
 * - FX Launch Pad (FXL)
 * - DUNS (DUNS)
 */

export const BRAND_PREFIX_MAP: Record<string, string> = {
  'device doctor india': 'DDI',
  'device doctor': 'DDI',
  'ddi': 'DDI',
  'codestro': 'CDS',
  'cds': 'CDS',
  'fx launch pad': 'FXL',
  'fx launchpad': 'FXL',
  'fxl': 'FXL',
  'duns': 'DUNS',
  'dns': 'DUNS',
};

/**
 * Returns the standardized brand prefix (DDI, CDS, FXL, DUNS)
 */
export function getBrandSemanticPrefix(brand?: string | null): string {
  if (!brand) return 'DDI';
  const clean = brand.trim().toLowerCase();
  if (BRAND_PREFIX_MAP[clean]) {
    return BRAND_PREFIX_MAP[clean];
  }
  if (clean.includes('codestro')) return 'CDS';
  if (clean.includes('fx') || clean.includes('launch pad') || clean.includes('launchpad')) return 'FXL';
  if (clean.includes('duns')) return 'DUNS';
  return 'DDI';
}

/**
 * Slugifies string for semantic ID formatting:
 * - Trims whitespace
 * - Converts non-alphanumeric characters to hyphens
 * - Merges consecutive hyphens
 * - Converts to uppercase
 * - Strips leading/trailing hyphens
 */
export function slugifySemantic(input?: string | null, fallback: string = 'DEFAULT'): string {
  if (!input || typeof input !== 'string') return fallback;
  const slug = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/**
 * Generates semantic Client ID:
 * Format: [BRAND_PREFIX]-[CLIENT_NAME_SLUGIFIED]
 * Example: DDI-MUKUNDRA-ROARING-TIGERS
 */
export function generateSemanticClientId(brand?: string | null, clientName?: string | null): string {
  const prefix = getBrandSemanticPrefix(brand);
  const clientSlug = slugifySemantic(clientName, 'CLIENT');
  return `${prefix}-${clientSlug}`;
}

/**
 * Generates base project prefix:
 * Format: [BRAND_PREFIX]-[CLIENT_NAME_SLUGIFIED]-[SERVICE_TYPE_SLUGIFIED]
 * Example: DDI-MUKUNDRA-ROARING-TIGERS-WEBSITE-DEVELOPMENT
 */
export function getBaseProjectPrefix(
  brand?: string | null,
  clientName?: string | null,
  serviceName?: string | null
): string {
  const prefix = getBrandSemanticPrefix(brand);
  const clientSlug = slugifySemantic(clientName, 'CLIENT');
  const serviceSlug = slugifySemantic(serviceName, 'SERVICE');
  return `${prefix}-${clientSlug}-${serviceSlug}`;
}

/**
 * Generates full semantic Project ID with sequence counter:
 * Format: [BRAND_PREFIX]-[CLIENT_NAME_SLUGIFIED]-[SERVICE_TYPE_SLUGIFIED]-[SEQUENCE_NUMBER]
 * Example: DDI-MUKUNDRA-ROARING-TIGERS-WEBSITE-DEVELOPMENT-1
 */
export function generateSemanticProjectId(
  brand?: string | null,
  clientName?: string | null,
  serviceName?: string | null,
  sequence: number = 1
): string {
  const basePrefix = getBaseProjectPrefix(brand, clientName, serviceName);
  const safeSeq = Math.max(1, Math.floor(sequence) || 1);
  return `${basePrefix}-${safeSeq}`;
}

/**
 * Extracts sequence number from a project ID string.
 * Supports exact format ([BASE_PREFIX]-[SEQ]) as well as legacy and trailing hyphen formats.
 */
export function extractProjectSequence(projectId: string, basePrefix?: string): number | null {
  if (!projectId || typeof projectId !== 'string') return null;
  const trimmed = projectId.trim();

  if (basePrefix) {
    const escaped = basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}-(\\d+)$`, 'i');
    const match = trimmed.match(regex);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed)) return parsed;
    }

    // Also check space-delimited variant: BASE - SEQ
    const spaceRegex = new RegExp(`^${escaped}\\s*-\\s*(\\d+)$`, 'i');
    const spaceMatch = trimmed.match(spaceRegex);
    if (spaceMatch && spaceMatch[1]) {
      const parsed = parseInt(spaceMatch[1], 10);
      if (!isNaN(parsed)) return parsed;
    }
  }

  // Trailing digits after hyphen or space
  const matchGeneric = trimmed.match(/[-_\s](\d+)$/);
  if (matchGeneric && matchGeneric[1]) {
    const parsed = parseInt(matchGeneric[1], 10);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

/**
 * Generates generic semantic ID with sequential padding (e.g. DDI-CAT-001, DDI-SRV-003, DDI-BNK-004)
 * Guarantees unlimited record creation with strictly non-colliding increments.
 */
export function generateSemanticEntityId(
  type: string,
  brand?: string | null,
  existingItems: Array<{ id?: string; brand?: string }> = []
): string {
  const prefix = getBrandSemanticPrefix(brand);
  const cleanType = type.replace(/^(DDI|CDS|FXL|DNS|DUNS)-/, '').toUpperCase();
  const pattern = new RegExp(`^${prefix}-${cleanType}-(\\d+)$`, 'i');

  let max = 0;
  for (const item of existingItems) {
    if (!item || !item.id) continue;
    const match = item.id.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > max) {
        max = num;
      }
    }
  }

  const nextNum = max + 1;
  return `${prefix}-${cleanType}-${String(nextNum).padStart(3, '0')}`;
}
