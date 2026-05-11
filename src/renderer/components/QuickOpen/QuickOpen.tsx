import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { IFindShowSourceParam } from '@common/types'
import { Spotlight, spotlight } from '@mantine/spotlight'
import '@mantine/spotlight/styles.css'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import Fuse, { FuseResultMatch } from 'fuse.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { IoSearch } from 'react-icons/io5'
import { buildIndex, SearchEntry } from './buildIndex'
import styles from './QuickOpen.module.scss'

type LineEntry = Extract<SearchEntry, { kind: 'line' }>
type ItemEntry = Extract<SearchEntry, { kind: 'item' }>

interface LineHit {
  entry: LineEntry
  raw_indices: ReadonlyArray<readonly [number, number]>
}

interface Group {
  item_id: string
  header: ItemEntry | null
  header_matched: boolean
  lines: LineHit[]
  best_score: number
}

const MAX_RESULTS = 50
const MAX_LINES_PER_ITEM_DEFAULT = 5

function rawIndicesFromMatches(
  matches: readonly FuseResultMatch[] | undefined,
): ReadonlyArray<readonly [number, number]> {
  if (!matches) return []
  for (const m of matches) {
    if (m.key === 'raw') return m.indices
  }
  return []
}

function HighlightedText({
  text,
  indices,
}: {
  text: string
  indices: ReadonlyArray<readonly [number, number]>
}) {
  if (indices.length === 0) return <>{text}</>
  // Merge overlapping/adjacent indices and emit spans.
  const sorted = [...indices].sort((a, b) => a[0] - b[0])
  const parts: React.ReactNode[] = []
  let pos = 0
  let i = 0
  for (const [start, end] of sorted) {
    if (end < pos) continue
    const real_start = Math.max(start, pos)
    if (real_start > pos) parts.push(text.slice(pos, real_start))
    parts.push(
      <span key={i++} className={styles.highlight}>
        {text.slice(real_start, end + 1)}
      </span>,
    )
    pos = end + 1
  }
  if (pos < text.length) parts.push(text.slice(pos))
  return <>{parts}</>
}

export default function QuickOpen() {
  const { lang } = useI18n()
  const { hosts_data } = useHostsData()
  const { configs } = useConfigs()
  const [contents, setContents] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const cold_start_opened_ref = useRef(false)

  const reload = async () => {
    try {
      const data = await actions.getAllContents()
      setContents(data)
    } catch (e) {
      console.error('QuickOpen: getAllContents failed', e)
    }
  }

  useEffect(() => {
    reload().catch((e) => console.error(e))
  }, [])

  // Dropped duplicate subscription on `hosts_refreshed`; the single-item event
  // covers user-driven changes and `reload_list` covers tree reloads.
  useOnBroadcast(events.hosts_refreshed_by_id, () => {
    reload().catch((e) => console.error(e))
  })
  useOnBroadcast(events.reload_list, () => {
    reload().catch((e) => console.error(e))
  })

  // Subsequent window shows: the main process broadcasts on `win.on('show')`.
  useOnBroadcast(events.open_quick_open, () => {
    if (configs?.quick_open_on_window_show === false) return
    spotlight.open()
  })

  // Cold-start auto-open: the very first `win.on('show')` broadcast lands
  // before the React tree mounts the listener above, so it's dropped. Compensate
  // by opening once when `configs` and `hosts_data` are both first ready.
  useEffect(() => {
    if (cold_start_opened_ref.current) return
    if (!configs || !hosts_data) return
    cold_start_opened_ref.current = true
    if (configs.quick_open_on_window_show === false) return
    spotlight.open()
  }, [configs, hosts_data])

  const list: IHostsListObject[] = hosts_data?.list ?? []
  const search_in_content = configs?.quick_open_search_in_content !== false

  const entries = useMemo<SearchEntry[]>(() => {
    const all = buildIndex(list, contents)
    return search_in_content ? all : all.filter((e) => e.kind === 'item')
  }, [list, contents, search_in_content])

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'item_title', weight: 2 },
          { name: 'ip', weight: 1.5 },
          { name: 'hostnames', weight: 1.5 },
          { name: 'raw', weight: 0.5 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeMatches: true,
        includeScore: true,
        useExtendedSearch: true,
        minMatchCharLength: 2,
      }),
    [entries],
  )

  // Reset per-group expansion when the query changes — stale expansions
  // bleed across unrelated result sets otherwise.
  useEffect(() => {
    setExpanded({})
  }, [query])

  const grouped: Group[] = useMemo(() => {
    const q = query.trim()
    type Hit = {
      item: SearchEntry
      score: number
      matches: readonly FuseResultMatch[] | undefined
    }
    let hits: Hit[]
    if (!q) {
      hits = entries
        .filter((e) => e.kind === 'item')
        .slice(0, MAX_RESULTS)
        .map((item) => ({ item, score: 0, matches: undefined }))
    } else {
      const safe = q.replace(/[|!^=$']/g, ' ').trim()
      const expr = safe
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `'${t}`)
        .join(' ')
      const raw = fuse.search(expr, { limit: 500 })
      hits = raw.map((r) => ({ item: r.item, score: r.score ?? 1, matches: r.matches }))
    }

    const by_item = new Map<string, Group>()
    for (const { item, score, matches } of hits) {
      const id = item.item_id
      let g = by_item.get(id)
      if (!g) {
        g = { item_id: id, header: null, header_matched: false, lines: [], best_score: 1 }
        by_item.set(id, g)
      }
      if (item.kind === 'item') {
        g.header = item
        g.header_matched = true
      } else {
        g.lines.push({ entry: item, raw_indices: rawIndicesFromMatches(matches) })
      }
      g.best_score = Math.min(g.best_score, score)
    }

    for (const g of by_item.values()) {
      if (!g.header) {
        const any_line = g.lines[0]?.entry
        if (any_line) {
          g.header = {
            kind: 'item',
            item_id: any_line.item_id,
            title: any_line.item_title,
            parent_titles: any_line.parent_titles,
            type: any_line.item_type,
            on: any_line.item_on,
            line_count: g.lines.length,
          }
        }
      }
    }

    return Array.from(by_item.values())
      .filter((g) => !!g.header)
      .sort((a, b) => a.best_score - b.best_score)
      .slice(0, MAX_RESULTS)
  }, [entries, fuse, query])

  const activate = (entry: SearchEntry) => {
    spotlight.close()
    agent.broadcast(events.select_hosts, entry.item_id)
    if (entry.kind === 'line') {
      // The editor (`HostsEditor.tsx`) stashes incoming show_source params
      // in a pending-find ref with a 3s window and applies them after the
      // new item's content loads — no client-side delay needed.
      const param: IFindShowSourceParam = {
        item_id: entry.item_id,
        start: 0,
        end: entry.raw.length,
        line: entry.line_no,
        line_pos: 0,
        end_line: entry.line_no,
        end_line_pos: entry.raw.length,
        before: '',
        match: entry.raw,
        after: '',
      }
      agent.broadcast(events.show_source, param)
    }
  }

  return (
    <Spotlight.Root
      shortcut="mod+P"
      onQueryChange={setQuery}
      query={query}
      scrollable
      maxHeight={480}
    >
      <Spotlight.Search
        placeholder={lang?.quick_open_placeholder ?? 'Search items, IPs, hostnames…'}
        leftSection={<IoSearch />}
      />
      <Spotlight.ActionsList>
        {grouped.length === 0 && (
          <Spotlight.Empty>{lang?.quick_open_empty ?? 'No matches'}</Spotlight.Empty>
        )}
        {grouped.map((g, group_idx) => {
          const max_lines = expanded[g.item_id] ? g.lines.length : MAX_LINES_PER_ITEM_DEFAULT
          const visible = g.lines.slice(0, max_lines)
          const overflow = g.lines.length - visible.length
          const header = g.header!
          const is_first = group_idx === 0
          return (
            <React.Fragment key={g.item_id}>
              <Spotlight.Action
                onClick={() => activate(header)}
                className={is_first ? styles.group_first : styles.group_separated}
              >
                <div className={styles.group_header}>
                  {header.parent_titles.length > 0 && (
                    <span className={styles.breadcrumb}>
                      {header.parent_titles.join(' / ')} /
                    </span>
                  )}
                  <span className={g.header_matched ? styles.group_header_title : styles.group_header_title_dim}>
                    {header.title || '(untitled)'}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    title={header.on ? 'Click to disable' : 'Click to enable'}
                    className={header.on ? styles.badge_on : styles.badge_off}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      agent.broadcast(events.toggle_item, header.item_id, !header.on)
                    }}
                  >
                    {header.on ? 'on' : 'off'}
                  </span>
                  <span className={styles.group_header_meta}>
                    {header.type} · {header.line_count} {header.line_count === 1 ? 'line' : 'lines'}
                  </span>
                </div>
              </Spotlight.Action>
              {visible.map((hit) => (
                <Spotlight.Action
                  key={`${hit.entry.item_id}:${hit.entry.line_no}`}
                  onClick={() => activate(hit.entry)}
                >
                  <div className={styles.line_row}>
                    <span className={styles.line_no}>line {hit.entry.line_no}</span>
                    <span className={styles.line_text}>
                      <HighlightedText text={hit.entry.raw} indices={hit.raw_indices} />
                    </span>
                  </div>
                </Spotlight.Action>
              ))}
              {overflow > 0 && (
                <Spotlight.Action
                  closeSpotlightOnTrigger={false}
                  onClick={() => setExpanded((e) => ({ ...e, [g.item_id]: true }))}
                >
                  <div className={styles.line_row}>
                    <span className={styles.line_no}>…</span>
                    <span className={styles.line_text}>show {overflow} more lines</span>
                  </div>
                </Spotlight.Action>
              )}
            </React.Fragment>
          )
        })}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  )
}
