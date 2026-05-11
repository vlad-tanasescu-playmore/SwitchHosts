import { describe, expect, it } from 'vitest'
import { parseLines, ParsedLine } from '../../../../src/renderer/components/QuickOpen/parseLines'

describe('parseLines', () => {
  it('parses a basic IP + hostname line', () => {
    const out = parseLines('10.0.52.232 tonica.ro\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 1, ip: '10.0.52.232', hostnames: 'tonica.ro', raw: '10.0.52.232 tonica.ro' },
    ])
  })

  it('captures multiple hostnames on one line', () => {
    const out = parseLines('10.0.52.232   www.foo  foo  bar\n')
    expect(out).toEqual<ParsedLine[]>([
      {
        line_no: 1,
        ip: '10.0.52.232',
        hostnames: 'www.foo foo bar',
        raw: '10.0.52.232   www.foo  foo  bar',
      },
    ])
  })

  it('strips trailing inline comments', () => {
    const out = parseLines('127.0.0.1 dev # local override\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 1, ip: '127.0.0.1', hostnames: 'dev', raw: '127.0.0.1 dev # local override' },
    ])
  })

  it('skips comment-only and blank lines', () => {
    const out = parseLines('# a comment\n\n   \n10.0.0.1 a\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 4, ip: '10.0.0.1', hostnames: 'a', raw: '10.0.0.1 a' },
    ])
  })

  it('handles CRLF line endings', () => {
    const out = parseLines('10.0.0.1 a\r\n10.0.0.2 b\r\n')
    expect(out.map((l) => l.line_no)).toEqual([1, 2])
    expect(out[1]).toMatchObject({ ip: '10.0.0.2', hostnames: 'b' })
  })

  it('rejects malformed lines (single token, no IP)', () => {
    const out = parseLines('justone\nalso bad-line-no-real-ip-shape\n')
    expect(out).toEqual([])
  })

  it('uses 1-based line numbering matching editor convention', () => {
    const out = parseLines('\n10.0.0.1 a\n')
    expect(out[0].line_no).toBe(2)
  })
})
