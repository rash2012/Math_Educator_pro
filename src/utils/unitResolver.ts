import { supabase } from '../services/supabaseClient';

export function isUuid(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

export function cleanArabicUnitName(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/^الوحدة\s+(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة)\s*[-:]?\s*/, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[-:ـ_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Safely resolves an Arabic unit name or identifier into a valid Supabase UUID.
 * Returns null if no UUID can be determined, avoiding PostgreSQL 400 'invalid input syntax for type uuid' errors.
 */
export async function resolveUnitUuid(unitIdentifier?: string, titleHint?: string): Promise<string | null> {
  if (!unitIdentifier) return null;
  const trimmed = unitIdentifier.trim();
  if (isUuid(trimmed)) return trimmed;

  const dbClient = supabase as any;

  // 1. Try resolving via taxonomy hierarchy
  try {
    const { resolveTaxonomyHierarchy } = await import('../services/supabaseSync');
    const taxonomy = await resolveTaxonomyHierarchy({ unit: trimmed });
    if (taxonomy.unitId && isUuid(taxonomy.unitId)) {
      return taxonomy.unitId;
    }
  } catch (e) {
    // Ignore and proceed to fallback matching
  }

  // 2. Search NewUnits table directly
  try {
    const clean = cleanArabicUnitName(trimmed);
    const { data: units } = await dbClient
      .from('NewUnits')
      .select('id, name');

    if (units && units.length > 0) {
      // Direct exact match
      const exact = units.find((u: any) => u.name?.trim() === trimmed);
      if (exact?.id && isUuid(exact.id)) return exact.id;

      // Cleaned match
      const cleanMatch = units.find((u: any) => cleanArabicUnitName(u.name) === clean);
      if (cleanMatch?.id && isUuid(cleanMatch.id)) return cleanMatch.id;

      // Substring match
      if (clean.length >= 4) {
        const sub = units.find((u: any) => {
          const uClean = cleanArabicUnitName(u.name);
          return uClean.includes(clean) || clean.includes(uClean);
        });
        if (sub?.id && isUuid(sub.id)) return sub.id;
      }
    }
  } catch (e) {
    console.warn('Error querying NewUnits in resolveUnitUuid:', e);
  }

  return null;
}
