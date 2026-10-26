import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF so Excel reads Thai correctly', () => {
    expect(toCsv([['ชื่อ', 'หน่วย'], ['สมชาย', 'บำนาญ']])).toBe('﻿ชื่อ,หน่วย\r\nสมชาย,บำนาญ\r\n');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny']])).toBe('﻿"a,b","say ""hi""","x\ny"\r\n');
  });

  it('keeps leading zeros of text cells', () => {
    expect(toCsv([[{ text: '00123' }]])).toBe('﻿"=""00123"""\r\n');
  });

  it('neutralises values Excel would run as formulas', () => {
    expect(toCsv([['=HYPERLINK("x")', '-1+1', '@SUM']])).toBe(`﻿"'=HYPERLINK(""x"")",'-1+1,'@SUM\r\n`);
  });

  it('writes numbers and empty cells', () => {
    expect(toCsv([[1, null, undefined, '']])).toBe('﻿1,,,\r\n');
  });
});
