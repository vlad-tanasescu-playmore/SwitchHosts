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
import Fuse from 'fuse.js'
import React, { useEffect, useMemo, useState } from 'react'
import { IoSearch } from 'react-icons/io5'
import { buildIndex, SearchEntry } from './buildIndex'
import styles from './QuickOpen.module.scss'

interface Group {
  item_id: string
  header: Extract<SearchEntry, { kind: 'item' }> | null
  header_matched: boolean
  lines: Extract<SearchEntry, { kind: 'line' }>[]
  best_score: number
}

const MAX_RESULTS = 50
const MAX_LINES_PER_ITEM_DEFAULT = 5

export default function QuickOpen() {
  const { lang } = useI18n()
  const { hosts_data } = useHostsData()
  const { configs } = useConfigs()
  const [contents, setContents] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const reload = async () => {
    try {
      const data = await actions.getAllContents()
      setContents(data)
    } catch (e) {
      console.error('QuickOpen: getAllContents failed', e)
    }
  }
  useEffect(() => {
    reload()
  }, [])
  useOnBroadcast(events.hosts_refreshed, reload)
  useOnBroadcast(events.hosts_refreshed_by_id, reload)
  useOnBroadcast(events.reload_list, reload)

  useOnBroadcast(events.open_quick_open, () => {
    if (!configs) return
    if (configs.quick_open_on_window_show === false) return
    spotlight.open()
  })

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

  const grouped: Group[] = useMemo(() => {
    const q = query.trim()
    let hits: { item: SearchEntry; score: number }[]
    if (!q) {
      hits = entries
        .filter((e) => e.kind === 'item')
        .slice(0, MAX_RESULTS)
        .map((item) => ({ item, score: 0 }))
    } else {
      // Strip Fuse extended-search operators; treat user spaces as AND tokens.
      const safe = q.replace(/[|!^=$']/g, ' ').trim()
      const expr = safe
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `'${t}`)
        .join(' ')
      const raw = fuse.search(expr, { limit: 500 })
      hits = raw.map((r) => ({ item: r.item, score: r.score ?? 1 }))
    }

    const by_item = new Map<string, Group>()
    for (const { item, score } of hits) {
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
        g.lines.push(item)
      }
      g.best_score = Math.min(g.best_score, score)
    }

    for (const g of by_item.values()) {
      if (!g.header) {
        const any_line = g.lines[0]
        if (any_line) {
          g.header = {
            kind: 'item',
            item_id: any_line.item_id,
            title: any_line.item_title,
            type: any_line.item_type,
            on: any_line.item_on,
            line_count: 0,
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
      // Small delay so the editor mounts the new content before we ask it to scroll.
      setTimeout(() => {
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
      }, 80)
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
        {grouped.map((g) => {
          const max_lines = expanded[g.item_id] ? g.lines.length : MAX_LINES_PER_ITEM_DEFAULT
          const visible = g.lines.slice(0, max_lines)
          const overflow = g.lines.length - visible.length
          const header = g.header!
          return (
            <Spotlight.ActionsGroup key={g.item_id}>
              <Spotlight.Action onClick={() => activate(header)}>
                <div className={styles.group_header}>
                  <span className={g.header_matched ? '' : styles.group_header_title_dim}>
                    {header.title || '(untitled)'}
                  </span>
                  <span className={header.on ? styles.badge_on : styles.badge_off}>
                    {header.on ? 'on' : 'off'}
                  </span>
                  <span className={styles.group_header_meta}>
                    {header.type} · {header.line_count} {header.line_count === 1 ? 'line' : 'lines'}
                  </span>
                </div>
              </Spotlight.Action>
              {visible.map((line) => (
                <Spotlight.Action
                  key={`${line.item_id}:${line.line_no}`}
                  onClick={() => activate(line)}
                >
                  <div className={styles.line_row}>
                    <span className={styles.line_no}>line {line.line_no}</span>
                    <span className={styles.line_text}>{line.raw}</span>
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
            </Spotlight.ActionsGroup>
          )
        })}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  )
}
