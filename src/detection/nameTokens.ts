/**
 * Words that must never be treated as a person name on their own.
 *
 * The list is shared by the name heuristic and the labelled-name recogniser:
 * a field label such as `Name: Engineer` or `Name: Email` introduces a role
 * or another field, not a person.
 */
export const NON_NAME_TOKENS = new Set([
  'a', 'an', 'and', 'at', 'best', 'building', 'city', 'client', 'close', 'company',
  'contact', 'court', 'customer', 'dear', 'department', 'drive', 'employee', 'example',
  'flat', 'friday', 'from', 'gardens', 'group', 'hello', 'house', 'inc', 'january',
  'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'lane', 'ltd', 'monday', 'office', 'organization',
  'organisation', 'park', 'place', 'please', 'project', 'regards', 'road', 'saturday',
  'sincerely', 'square', 'street', 'suite', 'sunday', 'team', 'thank', 'the', 'thursday',
  'tuesday', 'wednesday', 'welcome', 'yours', 'london', 'paris', 'berlin', 'york',
  'manchester', 'edinburgh', 'dublin', 'new',
  'senior', 'junior', 'engineer', 'manager', 'director', 'specialist', 'analyst',
  'consultant', 'developer', 'designer', 'professor', 'doctor', 'dr', 'mr', 'mrs',
  'ms', 'miss', 'prof', 'sir', 'madam', 'mx',
  'address', 'residential', 'home', 'passport', 'number', 'national', 'tax', 'social',
  'security', 'ssn', 'dob', 'date', 'birth', 'account', 'id', 'salary', 'annual',
  'pay', 'bank', 'email', 'phone', 'telephone', 'mobile', 'applicant', 'candidate',
  'author', 'patient', 'name',
  'program', 'reg', 'registration', 'no', 'state', 'origin', 'course', 'code',
  'corp', 'corporation', 'limited', 'plc', 'llc', 'gmbh', 'nig',
  'ventures', 'solutions', 'technologies', 'holdings', 'partners', 'associates',
  'enterprises', 'systems', 'services', 'international', 'global',
]);

/** True when a single token is a role, a field label or another common word. */
export function isExcludedNameToken(token: string): boolean {
  return NON_NAME_TOKENS.has(token.replace(/\.$/, '').toLocaleLowerCase());
}
