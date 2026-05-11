/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import events from '@common/events'
import { TextInput } from '@mantine/core'
import Trashcan from '@renderer/components/LeftPanel/Trashcan'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { useEffect, useRef, useState } from 'react'
import { IoCloseCircle, IoSearch } from 'react-icons/io5'
import styles from './index.module.scss'

interface Props {
  width: number
}

const Index = (_props: Props) => {
  const { lang } = useI18n()
  const { hosts_data } = useHostsData()
  const [filter_query, setFilterQuery] = useState('')
  const input_ref = useRef<HTMLInputElement>(null)

  // Auto-focus on initial mount.
  useEffect(() => {
    input_ref.current?.focus()
  }, [])

  // Refocus whenever the main window becomes visible (re-shown from tray, etc.).
  // Main process broadcasts this event from `win.on('show')`.
  useOnBroadcast(events.open_quick_open, () => {
    input_ref.current?.focus()
  })

  const menu = new PopupMenu([
    {
      label: lang.hosts_add,
      click() {
        agent.broadcast(events.add_new)
      },
    },
  ])

  return (
    <div className={styles.list} onContextMenu={() => menu.show()}>
      <div className={styles.search_wrap}>
        <TextInput
          ref={input_ref}
          value={filter_query}
          onChange={(e) => setFilterQuery(e.currentTarget.value)}
          placeholder={lang.search ?? 'Filter…'}
          size="xs"
          leftSection={<IoSearch />}
          rightSection={
            filter_query ? (
              <IoCloseCircle
                role="button"
                tabIndex={-1}
                title="Clear"
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setFilterQuery('')
                  input_ref.current?.focus()
                }}
              />
            ) : null
          }
        />
      </div>
      <div className={styles.tree_wrap}>
        <List filter_query={filter_query} />
        {hosts_data.trashcan.length > 0 ? <Trashcan /> : null}
      </div>
    </div>
  )
}

export default Index
