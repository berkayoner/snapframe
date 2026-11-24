/**
 * Finds personal and secret data in page text, so a capture can offer to
 * redact it. Runs inside the page at capture time on the DOM's own text -
 * no OCR, nothing leaves the device. Patterns are paired with validators
 * (Luhn, IBAN mod-97, TC Kimlik checksum, digit counts) to keep false
 * positives such as dates, prices and order numbers out.
 */

export type SensitiveKind = 'email' | 'phone' | 'card' | 'iban' | 'nationalId' | 'secret';

export interface SensitiveMatch {
  kind: SensitiveKind;
  start: number;
  end: number;
}

const digitsOf = (value: string) => value.replace(/\D/g, '');

export function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function isIbanValid(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const chunk = code >= 65 ? String(code - 55) : char;
    for (const digit of chunk) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/** Turkish national ID (TC Kimlik No) checksum. */
export function isTcknValid(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = Array.from(value, Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = d.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return d[9] === tenth && d[10] === eleventh;
}

interface Rule {
  kind: SensitiveKind;
  pattern: RegExp;
  /** Returns the length of the valid match (possibly trimmed), or 0 to reject. */
  validate?: (match: string) => number;
}

const RULES: Rule[] = [
  { kind: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // Stripe, AWS, GitHub, Slack, Google, JWT and common "sk-" style API keys.
  { kind: 'secret', pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: 'secret', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'secret', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'secret', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'secret', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'secret', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: 'secret', pattern: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g },
  {
    kind: 'iban',
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
    // The pattern can run on into following uppercase words; trim until the checksum holds.
    validate: (match) => {
      for (let end = match.length; end >= 15; end--) {
        const candidate = match.slice(0, end).trimEnd();
        if (candidate.length === end && isIbanValid(candidate)) return end;
      }
      return 0;
    },
  },
  {
    kind: 'card',
    pattern: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    validate: (match) => {
      const digits = digitsOf(match);
      return digits.length >= 13 && digits.length <= 19 && !/^(\d)\1+$/.test(digits) && isLuhnValid(digits)
        ? match.length
        : 0;
    },
  },
  {
    kind: 'nationalId',
    pattern: /(?<!\d)[1-9]\d{10}(?!\d)/g,
    validate: (match) => (isTcknValid(match) ? match.length : 0),
  },
  {
    kind: 'phone',
    pattern: /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g,
    validate: (match) => {
      const count = digitsOf(match).length;
      return count >= 10 && count <= 15 ? match.length : 0;
    },
  },
];

/** All non-overlapping matches in `text`, earliest first (longer wins on ties). */
export function findSensitive(text: string): SensitiveMatch[] {
  const found: SensitiveMatch[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const length = rule.validate ? rule.validate(match[0]) : match[0].length;
      if (length > 0 && match.index !== undefined) {
        found.push({ kind: rule.kind, start: match.index, end: match.index + length });
      }
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result: SensitiveMatch[] = [];
  let lastEnd = -1;
  for (const match of found) {
    if (match.start >= lastEnd) {
      result.push(match);
      lastEnd = match.end;
    }
  }
  return result;
}
