export interface ParsedLine {
  line_no: number
  ip: string
  hostnames: string
  raw: string
}

const LINE_RE = /^[ \t]*([^\s#][^\s]*)[ \t]+([^#\n]+?)[ \t]*(?:#.*)?$/

export function parseLines(content: string): ParsedLine[] {
  const out: ParsedLine[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw_line = lines[i]
    const stripped = raw_line.replace(/\s+$/, '')
    if (!stripped || stripped.trimStart().startsWith('#')) continue

    const m = stripped.match(LINE_RE)
    if (!m) continue

    const [, ip, hostnames_raw] = m
    if (!ip.includes('.') && !ip.includes(':')) continue
    const hostnames = hostnames_raw.trim().split(/\s+/).join(' ')
    if (!hostnames) continue

    out.push({
      line_no: i + 1,
      ip,
      hostnames,
      raw: stripped,
    })
  }
  return out
}
