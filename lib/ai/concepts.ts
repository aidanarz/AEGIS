// Offline semantic comparison of a root-cause statement against a reference (FR-3.6 when no LLM judge is available).
// A small, generic failure-cause lexicon: text → set of mechanism / component concepts.
// Disclosure: the lexicon was written by people who had read the 5 case decks, so it is not independent of them.

const MECHANISMS: Record<string, RegExp> = {
  misalignment: /misalign|alignment|soft[- ]?foot|coupling/i,
  looseness: /\bloose(ness)?\b/i,
  lubrication_degradation: /grease|lubricat|re-?lube|relube/i,
  oil_contamination: /water[- ]in[- ]oil|water ingress|oil contamination|contaminat|oil[- ]?film|cooler/i,
  fouling: /foul|coke|polymer|deposit/i,
  dry_running_cavitation: /dry[- ]?run|cavitation|npsh|seal[- ]flush|flush flow/i,
  overheating: /overheat/i,
  wear_fatigue: /\bworn\b|wear|fatigue|crack/i,
};
const COMPONENTS: Record<string, RegExp> = {
  bearing: /bearing|babbitt/i,
  seal: /\bseal\b/i,
  tube_bundle: /\btube/i,
  impeller: /impeller/i,
};

export interface ConceptSet {
  mechanisms: string[];
  components: string[];
  primaryMechanism: string | null; // the mechanism mentioned first in the text
}

export function concepts(text: string): ConceptSet {
  const hits = Object.entries(MECHANISMS)
    .map(([k, re]) => ({ k, idx: text.search(re) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  return {
    mechanisms: hits.map((h) => h.k),
    components: Object.entries(COMPONENTS)
      .filter(([, re]) => re.test(text))
      .map(([k]) => k),
    primaryMechanism: hits[0]?.k ?? null,
  };
}

export type Verdict = "match" | "partial" | "no-match";

/** match: the candidate names the reference's primary mechanism; partial: any shared mechanism or component; else no-match. */
export function compareConcepts(candidate: string, reference: string) {
  const c = concepts(candidate);
  const r = concepts(reference);
  const sharedMech = c.mechanisms.filter((m) => r.mechanisms.includes(m));
  const sharedComp = c.components.filter((m) => r.components.includes(m));
  const verdict: Verdict = r.primaryMechanism && c.mechanisms.includes(r.primaryMechanism) ? "match" : sharedMech.length || sharedComp.length ? "partial" : "no-match";
  return {
    verdict,
    candidate: c,
    reference: r,
    shared: [...sharedMech, ...sharedComp],
    rationale:
      verdict === "match"
        ? `Names the reference's primary mechanism (${r.primaryMechanism}).`
        : verdict === "partial"
          ? `Shares ${[...sharedMech, ...sharedComp].join(", ")} but not the primary mechanism (${r.primaryMechanism ?? "none found"}).`
          : `No shared mechanism or component (candidate: ${[...c.mechanisms, ...c.components].join(", ") || "none"}; reference: ${[...r.mechanisms, ...r.components].join(", ") || "none"}).`,
  };
}
