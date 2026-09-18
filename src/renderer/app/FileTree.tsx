import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { FileEntry, FileSortMode } from '@shared/ipc'
import { basename } from '@yupmark/live-cm/paths'
import { useWorkspaceStore } from './store/workspaceStore'
import {
  filterFlat,
  filterTree,
  flattenFiles,
  groupFlat,
  sortFlat,
  sortTree,
  splitNameExt,
  type FlatFile,
} from './fileView'
import { PromptModal } from './PromptModal'
import { IconDoc, IconFolder } from './icons'

interface PromptState {
  title: string
  initial: string
  onConfirm: (value: string) => void
}

/** 右键动作集（树行/列表卡片/根目录头共用） */
interface EntryActions {
  onNewFile: (dir: string) => void
  onNewFolder: (dir: string) => void
  onRename: (entry: FileEntry) => void
  onDelete: (entry: FileEntry) => void
  onReveal: (path: string) => void
}

export interface FileTreeProps {
  /** 搜索关键词（空串 = 不过滤） */
  query: string
  /** tree = 树视图；list = 平铺列表 */
  view: 'tree' | 'list'
  sort: FileSortMode
}

/** 工作区文件面板：树/列表双视图、搜索过滤、点击打开、右键增删改名 */
export function FileTree({ query, view, sort }: FileTreeProps) {
  const { t } = useTranslation()
  const tree = useWorkspaceStore((s) => s.tree)
  const loading = useWorkspaceStore((s) => s.treeLoading)
  const root = useWorkspaceStore((s) => s.workspaceRoot)
  const [prompt, setPrompt] = useState<PromptState | null>(null)

  const refresh = () => void useWorkspaceStore.getState().refreshTree()

  async function openFile(path: string): Promise<void> {
    const res = await window.yupmark.readFile(path)
    if (res.ok) useWorkspaceStore.getState().openDoc(path, res.data)
  }

  function askNewFile(dir: string): void {
    setPrompt({
      title: t('tree.newFile'),
      initial: '',
      onConfirm: async (name) => {
        if (!name.trim()) return
        const res = await window.yupmark.createFile(dir, name.trim())
        if (res.ok) {
          refresh()
          void openFile(res.data.path)
        }
      },
    })
  }

  function askNewFolder(dir: string): void {
    setPrompt({
      title: t('tree.newFolder'),
      initial: '',
      onConfirm: async (name) => {
        if (!name.trim()) return
        const res = await window.yupmark.createFolder(dir, name.trim())
        if (res.ok) {
          useWorkspaceStore.getState().toggleDir(res.data.path)
          refresh()
        }
      },
    })
  }

  function askRename(entry: FileEntry): void {
    setPrompt({
      title: t('tree.rename'),
      initial: entry.name,
      onConfirm: async (name) => {
        if (!name.trim() || name === entry.name) return
        const res = await window.yupmark.renameEntry(entry.path, name.trim())
        if (res.ok) {
          // 打开中的 tab 路径跟随
          const store = useWorkspaceStore.getState()
          const tab = store.tabs.find((x) => x.path === entry.path)
          if (tab) {
            useWorkspaceStore.setState((s) => ({
              tabs: s.tabs.map((x) => (x.id === tab.id ? { ...x, path: res.data.path } : x)),
            }))
          }
          refresh()
        }
      },
    })
  }

  async function doDelete(entry: FileEntry): Promise<void> {
    if (!window.confirm(t('tree.deleteConfirm', { name: entry.name }))) return
    const res = await window.yupmark.trashEntry(entry.path)
    if (res.ok) {
      const tab = useWorkspaceStore.getState().tabs.find((x) => x.path === entry.path)
      if (tab) void useWorkspaceStore.getState().closeTab(tab.id)
      refresh()
    }
  }

  const actions: EntryActions = {
    onNewFile: askNewFile,
    onNewFolder: askNewFolder,
    onRename: askRename,
    onDelete: (entry) => void doDelete(entry),
    onReveal: (path) => void window.yupmark.revealInFileManager(path),
  }

  if (!root) {
    return (
      <div className="file-tree file-tree--empty">
        <div className="file-tree__empty-actions">
          <button
            type="button"
            className="file-tree__open-btn"
            onClick={() => void useWorkspaceStore.getState().openWorkspace()}
          >
            {t('sidebar.openFolder')}
          </button>
          <button
            type="button"
            className="file-tree__open-btn"
            onClick={() =>
              void window.yupmark.openFileDialog().then((res) => {
                if (res.ok) useWorkspaceStore.getState().openDoc(res.data.path, res.data.content)
              })
            }
          >
            {t('sidebar.openFile')}
          </button>
        </div>
      </div>
    )
  }

  const searching = query.trim() !== ''
  const sorted = sortTree(tree, sort)

  let body: React.ReactNode
  if (view === 'list') {
    const flat = filterFlat(flattenFiles(sorted, root), query)
    if (flat.length === 0) {
      body = <div className="file-tree__hint">{searching ? t('sidebar.noMatch') : null}</div>
    } else if (sort === 'folder') {
      // 分组模式：目录小标题 + 组内文件（自然升序）
      body = groupFlat(flat).map((g) => (
        <div key={g.dir || '.'} className="file-tree__group-wrap">
          <div className="file-tree__group">{g.dir === '' ? basename(root) : g.dir}</div>
          {g.files.map((f) => (
            <CardRow key={f.path} file={f} showRelDir={false} onOpen={openFile} actions={actions} />
          ))}
        </div>
      ))
    } else {
      body = sortFlat(flat, sort).map((f) => (
        <CardRow key={f.path} file={f} showRelDir onOpen={openFile} actions={actions} />
      ))
    }
  } else {
    const filtered = searching ? filterTree(sorted, query) : sorted
    body =
      filtered && filtered.length > 0 ? (
        filtered.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            forceExpand={searching}
            onOpen={openFile}
            actions={actions}
          />
        ))
      ) : (
        <div className="file-tree__hint">{searching ? t('sidebar.noMatch') : null}</div>
      )
  }

  return (
    <div className="file-tree">
      {view === 'tree' ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div className="file-tree__root">{basename(root)}</div>
          </ContextMenu.Trigger>
          <EntryMenuContent entry={{ name: basename(root), path: root, dir: true }} actions={actions} />
        </ContextMenu.Root>
      ) : null}
      {loading ? <div className="file-tree__hint">{t('sidebar.loading')}</div> : null}
      {body}

      {/* 空白区：工作区级菜单（新建/刷新/Finder） */}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="file-tree__blank" />
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="ctx-menu">
            <ContextMenu.Item asChild>
              <button type="button" onSelect={() => askNewFile(root)}>{t('tree.newFile')}</button>
            </ContextMenu.Item>
            <ContextMenu.Item asChild>
              <button type="button" onSelect={() => askNewFolder(root)}>{t('tree.newFolder')}</button>
            </ContextMenu.Item>
            <ContextMenu.Item asChild>
              <button type="button" onSelect={refresh}>{t('sidebar.refresh')}</button>
            </ContextMenu.Item>
            <ContextMenu.Item asChild>
              <button type="button" onSelect={() => void window.yupmark.revealInFileManager(root)}>
                {t('tree.reveal')}
              </button>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {prompt ? (
        <PromptModal
          title={prompt.title}
          initial={prompt.initial}
          onCancel={() => setPrompt(null)}
          onConfirm={(value) => {
            setPrompt(null)
            prompt.onConfirm(value)
          }}
        />
      ) : null}
    </div>
  )
}

/** 右键菜单内容（Radix ContextMenu：键盘导航/定位由库提供；选中即自动关闭） */
function EntryMenuContent({ entry, actions }: { entry: FileEntry; actions: EntryActions }) {
  const { t } = useTranslation()
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="ctx-menu">
        {entry.dir ? (
          <>
            <ContextMenu.Item asChild>
              <button type="button" onSelect={() => actions.onNewFile(entry.path)}>{t('tree.newFile')}</button>
            </ContextMenu.Item>
            <ContextMenu.Item asChild>
              <button type="button" onSelect={() => actions.onNewFolder(entry.path)}>{t('tree.newFolder')}</button>
            </ContextMenu.Item>
          </>
        ) : null}
        <ContextMenu.Item asChild>
          <button type="button" onSelect={() => actions.onRename(entry)}>{t('tree.rename')}</button>
        </ContextMenu.Item>
        <ContextMenu.Item asChild>
          <button type="button" onSelect={() => actions.onDelete(entry)}>{t('tree.delete')}</button>
        </ContextMenu.Item>
        <ContextMenu.Item asChild>
          <button type="button" onSelect={() => actions.onReveal(entry.path)}>{t('tree.reveal')}</button>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

/** 列表视图卡片行：主名加粗 + 扩展名灰 + 预览第二行 */
function CardRow({
  file,
  showRelDir,
  onOpen,
  actions,
}: {
  file: FlatFile
  /** 非分组模式下在右侧显示相对目录提示 */
  showRelDir: boolean
  onOpen: (path: string) => void
  actions: EntryActions
}) {
  const activePath = useWorkspaceStore((s) => s.tabs.find((x) => x.id === s.activeId)?.path ?? null)
  const { stem, ext } = splitNameExt(file.name)
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`file-tree__card${file.path === activePath ? ' file-tree__card--active' : ''}`}
          onClick={() => onOpen(file.path)}
        >
          <div className="file-tree__card-title">
            <span className="file-tree__card-stem">{stem}</span>
            {ext ? <span className="file-tree__card-ext">{ext}</span> : null}
            {showRelDir && file.relDir ? <span className="file-tree__reldir">{file.relDir}</span> : null}
          </div>
          {file.preview ? <div className="file-tree__card-preview">{file.preview}</div> : null}
        </div>
      </ContextMenu.Trigger>
      <EntryMenuContent entry={{ name: file.name, path: file.path, dir: false }} actions={actions} />
    </ContextMenu.Root>
  )
}

function TreeNode({
  node,
  depth,
  forceExpand,
  onOpen,
  actions,
}: {
  node: FileEntry
  depth: number
  /** 搜索态：忽略折叠状态，匹配分支全部展开 */
  forceExpand: boolean
  onOpen: (path: string) => void
  actions: EntryActions
}) {
  const expanded = useWorkspaceStore((s) => !!s.expandedDirs[node.path])
  const activePath = useWorkspaceStore((s) => s.tabs.find((x) => x.id === s.activeId)?.path ?? null)
  const open = forceExpand || expanded

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={`file-tree__row${node.path === activePath ? ' file-tree__row--active' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => {
              if (node.dir) useWorkspaceStore.getState().toggleDir(node.path)
              else onOpen(node.path)
            }}
          >
            <span className={`file-tree__chevron${node.dir ? '' : ' file-tree__chevron--leaf'}${open ? ' file-tree__chevron--open' : ''}`}>
              {node.dir ? '▸' : ''}
            </span>
            <span className={`file-tree__row-icon${node.dir ? ' file-tree__row-icon--dir' : ''}`}>
              {node.dir ? <IconFolder size={14} /> : <IconDoc size={14} />}
            </span>
            <span className={`file-tree__name${node.dir ? ' file-tree__name--dir' : ''}`}>{node.name}</span>
          </div>
        </ContextMenu.Trigger>
        <EntryMenuContent entry={node} actions={actions} />
      </ContextMenu.Root>
      {node.dir && open
        ? (node.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              forceExpand={forceExpand}
              onOpen={onOpen}
              actions={actions}
            />
          ))
        : null}
    </>
  )
}
