import { resolveLbcBranch, searchTerms, type LbcBranch } from './lbc-resolver.ts';
import { privateBranchClue } from './ai-extraction.ts';
import { postalMatches } from './zip-lookup.ts';

export function createLookups({ db, cacheDb, branchIdentities }: any) {
    async function officialZipLookup(query: string) {
      const response = await fetch('https://phlpost.gov.ph/zip-code-locator/', { headers: { 'User-Agent': 'DistrictWheels/1.0' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { error: `PHLPost lookup failed (${response.status}).` };
      const html = await response.text();
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
        [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
          cell[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
        )
      ).filter((cells) => cells.length >= 4);
      return postalMatches(rows.map(([region, province, locality, postal_code]) => ({ region, province, locality, postal_code, source_url: 'https://phlpost.gov.ph/zip-code-locator/' })), query).slice(0, 11);
    }

    async function findLbcBranch(lookup: { name?: string; address?: string; location?: string }) {
      if (privateBranchClue(lookup, branchIdentities())) return { kind: 'not_found' as const };
      const cached = new Map<string, LbcBranch>();
      const terms = searchTerms(lookup).map((term) => term.replace(/[%_,()]/g, '').trim()).filter(Boolean).slice(0, 2);
      for (const term of terms) {
        const [names, addresses] = await Promise.all([
          db.from('lbc_branches').select('branch_name,branch_address,source_url,verified_at').ilike('branch_name', `%${term}%`).limit(100),
          db.from('lbc_branches').select('branch_name,branch_address,source_url,verified_at').ilike('branch_address', `%${term}%`).limit(100),
        ]);
        for (const branch of [...(names.data ?? []), ...(addresses.data ?? [])]) {
          cached.set(`${branch.branch_name}|${branch.branch_address}`, branch);
        }
      }
      return resolveLbcBranch(lookup, fetch, {
        cachedBranches: [...cached.values()],
        onVerified: async (branches) => {
          const unique = [...new Map(branches.map((branch) => [`${branch.branch_name}|${branch.branch_address}`, branch])).values()];
          if (!cacheDb) return;
          const { error } = await cacheDb.from('lbc_branches').upsert(unique.map((branch) => ({
            ...branch, verified_at: new Date().toISOString(),
          })), { onConflict: 'branch_name,branch_address' });
          if (error) console.error('LBC cache update failed:', error.message);
        },
      });
    }


  return { officialZipLookup, findLbcBranch };
}
