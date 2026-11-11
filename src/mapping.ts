/**
 * PlaceholderMappingManager — the temporary placeholder-to-original mapping.
 *
 * The mapping is the sensitive core of a Sentry session. It lives in memory
 * only, is kept separate from sanitised output, and is discarded when the
 * session ends (see session.ts).
 */

export type Replacement = {
  id: string;
  label: string;
  original: string;
  placeholder: string;
};

export type PlaceholderMapping = {
  replacements: Replacement[];
  size: number;
  has(placeholder: string): boolean;
  /** Exact match first, then case-insensitive (AI output may change letter case). */
  findByPlaceholder(placeholder: string): Replacement | undefined;
};

export function createPlaceholderMapping(replacements: Replacement[]): PlaceholderMapping {
  const exact = new Map(replacements.map((replacement) => [replacement.placeholder, replacement]));
  const folded = new Map(
    replacements.map((replacement) => [replacement.placeholder.toLocaleLowerCase(), replacement]),
  );

  return {
    replacements,
    size: replacements.length,
    has(placeholder) {
      return exact.has(placeholder);
    },
    findByPlaceholder(placeholder) {
      return exact.get(placeholder) ?? folded.get(placeholder.toLocaleLowerCase());
    },
  };
}
