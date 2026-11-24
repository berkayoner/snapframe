import { describe, expect, it } from 'vitest';
import { findSensitive, isIbanValid, isLuhnValid, isTcknValid } from '@/src/capture/snapshot/sensitive';
import { boxAtPoint, isCovered, snapRect } from '@/src/editor/smart/snap';
import { countByKind, toPageData } from '@/src/editor/smart/pageData';

const kinds = (text: string) => findSensitive(text).map((match) => match.kind);
const found = (text: string) => findSensitive(text).map((match) => text.slice(match.start, match.end));

describe('sensitive data detection', () => {
  it('finds emails', () => {
    expect(found('Contact ada.moreau@example.com today')).toEqual(['ada.moreau@example.com']);
  });

  it('finds phone numbers in Turkish and international formats', () => {
    expect(kinds('Tel: +90 532 123 45 67')).toEqual(['phone']);
    expect(kinds('Ara: 0532 123 45 67')).toEqual(['phone']);
    expect(kinds('Call (415) 555-0132')).toEqual(['phone']);
  });

  it('does not flag dates, prices, times or short numbers as phones', () => {
    expect(kinds('2026-11-20 14:32:05')).toEqual([]);
    expect(kinds('$48,290 · 12.400.000 TL · Order #123456')).toEqual([]);
  });

  it('finds Luhn-valid card numbers only', () => {
    expect(kinds('Card 4242 4242 4242 4242 on file')).toEqual(['card']);
    expect(kinds('Ref 4242 4242 4242 4241')).toEqual([]);
    expect(isLuhnValid('4111111111111111')).toBe(true);
  });

  it('finds valid IBANs, even when followed by uppercase words', () => {
    expect(isIbanValid('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(found('IBAN: TR33 0006 1005 1978 6457 8413 26 BANKA')).toEqual(['TR33 0006 1005 1978 6457 8413 26']);
    expect(kinds('TR33 0006 1005 1978 6457 8413 27')).toEqual([]);
  });

  it('validates Turkish national ID numbers', () => {
    expect(isTcknValid('10000000146')).toBe(true);
    expect(kinds('TCKN 10000000146')).toEqual(['nationalId']);
    expect(kinds('No 10000000147')).toEqual([]);
  });

  it('finds common API keys and tokens', () => {
    // Fake keys are assembled at runtime so secret scanners don't flag the test source.
    const fakeStripeKey = ['sk', 'live', '51Habcdefghijklmnopqrstuv'].join('_');
    const fakeAwsKey = 'AKIA' + 'IOSFODNN7EXAMPLE';
    expect(kinds(`key ${fakeStripeKey}`)).toEqual(['secret']);
    expect(kinds(fakeAwsKey)).toEqual(['secret']);
  });

  it('returns non-overlapping matches in order', () => {
    const matches = findSensitive('a@b.co, +90 532 123 45 67 and x@y.io');
    expect(matches.map((match) => match.kind)).toEqual(['email', 'phone', 'email']);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThanOrEqual(matches[i - 1]!.end);
    }
  });
});

describe('magnetic snapping', () => {
  const card = { x: 100, y: 100, width: 200, height: 120 };

  it('snaps edges within the threshold and reports guides', () => {
    const result = snapRect({ x: 104, y: 97, width: 190, height: 126 }, [card], 8);
    expect(result.rect).toEqual(card);
    expect(result.guides).toHaveLength(4);
  });

  it('leaves edges alone when nothing is close', () => {
    const rect = { x: 130, y: 130, width: 40, height: 40 };
    expect(snapRect(rect, [card], 8).rect).toEqual(rect);
  });

  it('ignores far-away elements that merely share a coordinate', () => {
    const far = { x: 102, y: 5000, width: 50, height: 50 };
    expect(snapRect({ x: 104, y: 300, width: 60, height: 60 }, [far], 8).rect.x).toBe(104);
  });

  it('finds the smallest element under the pointer', () => {
    const button = { x: 120, y: 180, width: 60, height: 24 };
    expect(boxAtPoint(130, 190, [card, button])).toEqual(button);
    expect(boxAtPoint(110, 110, [card, button])).toEqual(card);
    expect(boxAtPoint(10, 10, [card, button])).toBeNull();
  });

  it('knows when a region is already redacted', () => {
    expect(isCovered({ x: 10, y: 10, width: 100, height: 20 }, [{ x: 8, y: 8, width: 104, height: 24 }])).toBe(true);
    expect(isCovered({ x: 10, y: 10, width: 100, height: 20 }, [{ x: 8, y: 8, width: 50, height: 24 }])).toBe(false);
  });
});

describe('page data', () => {
  it('scales snapshot rects to screenshot pixels and counts kinds', () => {
    const data = toPageData(
      {
        boxes: [10, 20, 30, 40],
        sensitive: [
          { kind: 'email', x: 1, y: 2, width: 3, height: 4 },
          { kind: 'email', x: 5, y: 6, width: 7, height: 8 },
          { kind: 'phone', x: 9, y: 9, width: 9, height: 9 },
        ],
      },
      2,
    );
    expect(data?.boxes).toEqual([{ x: 20, y: 40, width: 60, height: 80 }]);
    expect(data?.sensitive[0]).toEqual({ kind: 'email', x: 2, y: 4, width: 6, height: 8 });
    expect(countByKind(data?.sensitive ?? [])).toEqual([
      { kind: 'email', count: 2 },
      { kind: 'phone', count: 1 },
    ]);
  });
});
