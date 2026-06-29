import * as crypto from 'crypto';
import nlp from 'compromise';
import { loadConfig } from './config';

export interface PhiMap {
  [codename: string]: string;
}

interface Span {
  value: string;
  start: number;
  end: number;
}

function makeCodename(words: string[], counter: number): string {
  const word = words[counter % words.length];
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `<<${word}-${suffix}>>`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Shared exclusion sets — used in NER filtering and component expansion
const RELATIONSHIP_WORDS = new Set([
  'sister', 'brother', 'wife', 'husband', 'mother', 'father',
  'daughter', 'son', 'uncle', 'aunt', 'nephew', 'niece', 'cousin',
  'partner', 'carer', 'guardian', 'parent', 'sibling', 'spouse',
]);
const COMMON_WORDS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'the', 'and', 'for',
  'medical', 'center', 'centre', 'hospital', 'clinic', 'health',
  'care', 'general', 'university', 'memorial', 'regional', 'national',
  'community', 'saint', 'mount', 'royal', 'new', 'north', 'south',
  'east', 'west', 'upper', 'lower', 'institute', 'foundation',
]);
const MEDICAL_EPONYMS = new Set([
  'tokyo', 'charcot', 'reynold', 'glasgow', 'ottawa', 'wells', 'geneva',
  'sofa', 'apache', 'curb', 'nihss', 'nyha', 'cha2ds2', 'hasbled',
  'ranson', 'child', 'meld', 'bishop', 'apgar', 'braden',
]);

// Expand a set of PHI values with individual word components from multi-word /
// hyphenated names. This ensures standalone components (e.g. "Osei" from
// "Amara Osei-Bonsu") are caught by the consistency pass even when NER doesn't
// recognise the full name (common with non-Western names).
function expandWithComponents(values: Set<string>): Set<string> {
  const expanded = new Set(values);
  for (const value of values) {
    const parts = value.split(/[\s-]+/).filter(p =>
      p.length >= 3 &&
      !COMMON_WORDS.has(p.toLowerCase().replace(/\.$/, '')) &&
      !MEDICAL_EPONYMS.has(p.toLowerCase()) &&
      !RELATIONSHIP_WORDS.has(p.toLowerCase())
    );
    if (parts.length >= 2) parts.forEach(p => expanded.add(p));
  }
  return expanded;
}

// LAYER 1 — Regex for structured PHI (deterministic, pattern-based)
function regexSpans(text: string): Span[] {
  const patterns: Array<{ regex: RegExp }> = [
    // SSN
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    // Phone — US formats. Use lookbehind (not \b) so the optional "(" is captured too.
    { regex: /(?<![+\d(])\(?(?:\+?1[-.\s]?)?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g },
    // Email
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    // Date: DD/MM/YYYY or MM/DD/YYYY (1-2 digit parts — avoids BP like 148/92 which has 3-digit numerator)
    { regex: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g },
    // Date: YYYY-MM-DD
    { regex: /\b\d{4}-\d{2}-\d{2}\b/g },
    // Date: "09 June 2026" (DD Month YYYY)
    { regex: /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{4}\b/gi },
    // Date: "June 9, 2026" or "June 9 2026" (Month DD YYYY)
    { regex: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2},?\s+\d{4}\b/gi },
    // MRN value only (keeps the "MRN:" label in output)
    { regex: /(?<=\bMRN\s*[:#]?\s*)\d+/gi },
    // NPI value only (10 digits after "NPI")
    { regex: /(?<=\bNPI\s*:?\s*)\d{10}/gi },
    // Patient ID / Wristband number
    { regex: /(?<=\b(?:Patient\s+ID|wristband)\s*[:#]?\s*)\d+/gi },
    // Full patient name line (everything after "Patient:" or "Patient Name:" label)
    { regex: /(?<=\bPatient(?:\s+Name)?\s*:\s*)[^\n]+/gi },
    // Name following a family relationship word: "his sister Lara Khoury", "her daughter Kofi Osei"
    // Captures one or two capitalised words after the relationship term.
    { regex: /(?<=\b(?:daughter|son|sister|brother|wife|husband|mother|father|partner|carer|guardian)\s+)[A-Z][a-zA-Z-]+(?:\s+[A-Z][a-zA-Z-]+)*/g },
    // Full address line (everything after "Address:" label on the same line)
    { regex: /(?<=\bAddress\s*:\s*)[^\n]+/gi },
    // Full facility line (everything after "Facility:" or "Facility Contact:" label)
    { regex: /(?<=\bFacility(?:\s+\w+)?\s*:\s*)[^\n]+/gi },
    // Date after any "Date:" or "Visit Date:" label — catches footer dates missed by the DD Month YYYY regex
    { regex: /(?<=\bDate\s*:\s*)\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/gi },
    // Street address pattern: "NNN Street Name <Type>" e.g. "200 N. Main St"
    // No /i flag — street types must be properly capitalised. Without this,
    // clinical abbreviations like "CT" (scan) match "Ct" (Court) and eat
    // large chunks of imaging text.
    { regex: /\b\d+\s+[A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)*\s+(?:Drive|Dr|Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\b/g },
    // IP address
    { regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    // URL
    { regex: /https?:\/\/[^\s]+/g },
    // ZIP code — only after state abbreviation "IL 62701" or "IL, 62701"
    { regex: /(?<=\b[A-Z]{2}[,\s]+)\d{5}(?:-\d{4})?\b/g },
  ];

  const spans: Span[] = [];
  for (const { regex } of patterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      // Trim leading/trailing whitespace from the captured value and shift
      // the span boundaries accordingly. Without this, lookbehind patterns
      // like "Patient:\s*" (zero-width \s*) cause the match to start at the
      // space before the value, giving " Amara Osei-Bonsu" instead of
      // "Amara Osei-Bonsu" — which then fails to match the same name elsewhere.
      const raw = m[0];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const leadingSpaces = raw.length - raw.trimStart().length;
      const start = m.index + leadingSpaces;
      spans.push({ value: trimmed, start, end: start + trimmed.length });
    }
  }
  return spans;
}

// LAYER 2 — NER for unstructured PHI (names, orgs, places)
function nerSpans(text: string): Span[] {
  const doc = nlp(text);
  const entityStrings = new Set<string>();

  (doc.people().out('array') as string[]).forEach(p => {
    const trimmed = p.trim();
    if (trimmed.length > 2 && !RELATIONSHIP_WORDS.has(trimmed.toLowerCase())) {
      entityStrings.add(trimmed);
    }
  });
  (doc.organizations().out('array') as string[]).forEach(o => {
    if (o.trim().length > 2) entityStrings.add(o.trim());
  });
  (doc.places().out('array') as string[]).forEach(p => {
    const trimmed = p.trim();
    if (trimmed.length > 2 && !MEDICAL_EPONYMS.has(trimmed.toLowerCase())) {
      entityStrings.add(trimmed);
    }
  });

  // Explicit "Dr. Firstname Lastname" catch — some are missed by NER
  const drPattern = /\bDr\.?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = drPattern.exec(text)) !== null) {
    entityStrings.add(m[0].trim());
  }

  // Find character-level positions for each entity string
  const spans: Span[] = [];
  for (const entity of entityStrings) {
    const re = new RegExp(`\\b${escapeRegex(entity)}\\b`, 'gi');
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      spans.push({ value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  return spans;
}

// LAYER 3 — Consistency pass: find ALL occurrences of already-detected PHI values
// Catches things like an MRN number repeated mid-text under a different label
function consistencySpans(text: string, knownValues: Set<string>): Span[] {
  const spans: Span[] = [];
  for (const value of knownValues) {
    if (value.length < 3) continue;
    const lower = text.toLowerCase();
    const valueLower = value.toLowerCase();
    let pos = 0;
    while ((pos = lower.indexOf(valueLower, pos)) !== -1) {
      // Word boundary check — prevent "Smith" matching inside "Smithson"
      const before = pos > 0 ? text[pos - 1] : ' ';
      const after = pos + value.length < text.length ? text[pos + value.length] : ' ';
      if (!/\w/.test(before) && !/\w/.test(after)) {
        spans.push({ value: text.slice(pos, pos + value.length), start: pos, end: pos + value.length });
      }
      pos += 1;
    }
  }
  return spans;
}

// Remove overlapping spans — longest/earliest wins
function mergeOverlapping(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Span[] = [];
  let lastEnd = -1;
  for (const span of sorted) {
    if (span.start >= lastEnd) {
      result.push(span);
      lastEnd = span.end;
    }
  }
  return result;
}

export function detectAndReplace(text: string): { anonymizedText: string; phiMap: PhiMap } {
  const config = loadConfig();
  const words = config.deidentification.codenameWordlist;

  // Strip markdown bold/italic markers that arrive when the source note was
  // formatted in a rich-text editor (e.g. **Patient:** → Patient:).
  // Without this, "**Patient:** Amara Osei-Bonsu" captures "** Amara Osei-Bonsu"
  // (with asterisks), and the consistency pass then fails to find the plain-text
  // name elsewhere in the note.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');

  const layer1 = regexSpans(text);
  const layer2 = nerSpans(text);

  // Collect unique PHI values, then expand with name components so standalone
  // parts of multi-word/hyphenated names are caught by the consistency pass.
  // This must run AFTER both layers so it has access to regex-detected names
  // (e.g. "Amara Osei-Bonsu" from the Patient: header) that NER may have missed.
  const rawValues = new Set<string>([...layer1, ...layer2].map(s => s.value));
  const knownValues = expandWithComponents(rawValues);
  const layer3 = consistencySpans(text, knownValues);

  const allSpans = mergeOverlapping([...layer1, ...layer2, ...layer3]);

  // Assign codenames — same normalized value → same codename
  const valueToCodename = new Map<string, string>();
  let counter = 0;
  for (const span of allSpans) {
    const key = span.value.toLowerCase().trim();
    if (!valueToCodename.has(key)) {
      valueToCodename.set(key, makeCodename(words, counter++));
    }
  }

  // Replace right-to-left to preserve character indices
  const phiMap: PhiMap = {};
  let result = text;
  const sortedDesc = [...allSpans].sort((a, b) => b.start - a.start);
  for (const span of sortedDesc) {
    const key = span.value.toLowerCase().trim();
    const codename = valueToCodename.get(key)!;
    phiMap[codename] = span.value;
    result = result.slice(0, span.start) + codename + result.slice(span.end);
  }

  return { anonymizedText: result, phiMap };
}
