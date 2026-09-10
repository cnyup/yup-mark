import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry, FileSortMode } from '@shared/ipc'
import { basename } from '@shared/paths'
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

interface MenuState {
  x: number
  y: number
  entry: FileEntry
}

interface PromptState {
  title: string
  initial: string
  onConfirm: (value: string) => void
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
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)

  const refresh = () => void useWorkspaceStore.getState().refreshTree()

  async function openFile(path: string): Promise<void> {
    const res = await window.soyupmark.readFile(path)
    if (res.ok) useWorkspaceStore.getState().openDoc(path, res.data)
  }

  function openMenu(e: React.MouseEvent, entry: FileEntry): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function closeMenu(): void {
    setMenu(null)
  }

  function askNewFile(dir: string): void {
    setPrompt({
      title: t('tree.newFile'),
      initial: '',
      onConfirm: async (name) => {
        if (!name.trim()) return
        const res = await window.soyupmark.createFile(dir, name.trim())
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
        const res = await window.soyupmark.createFolder(dir, name.trim())
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
        const res = await window.soyupmark.renameEntry(entry.path, name.trim())
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
    const res = await window.soyupmark.trashEntry(entry.path)
    if (res.ok) {
      const tab = useWorkspaceStore.getState().tabs.find((x) => x.path === entry.path)
      if (tab) void useWorkspaceStore.getState().closeTab(tab.id)
      refresh()
    }
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
            className="file-tree__open-btn file-tree__open-btn--secondary"
            onClick={() =>
              void window.soyupmark.openFileDialog().then((res) => {
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
            <CardRow key={f.path} file={f} showRelDir={false} onOpen={openFile} onMenu={openMenu} />
          ))}
        </div>
      ))
    } else {
      body = sortFlat(flat, sort).map((f) => (
        <CardRow key={f.path} file={f} showRelDir onOpen={openFile} onMenu={openMenu} />
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
            onMenu={openMenu}
          />
        ))
      ) : (
        <div className="file-tree__hint">{searching ? t('sidebar.noMatch') : null}</div>
      )
  }

  return (
    <div className="file-tree" onClick={closeMenu}>
      {view === 'tree' ? (
        <div
          className="file-tree__root"
          onContextMenu={(e) => openMenu(e, { name: basename(root), path: root, dir: true })}
        >
          {basename(root)}
        </div>
      ) : null}
      {loading ? <div className="file-tree__hint">{t('sidebar.loading')}</div> : null}
      {body}

      {menu ? (
        <>
          <div className="ctx-overlay" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.entry.dir ? (
              <>
                <button type="button" onClick={() => { closeMenu(); askNewFile(menu.entry.path) }}>{t('tree.newFile')}</button>
                <button type="button" onClick={() => { closeMenu(); askNewFolder(menu.entry.path) }}>{t('tree.newFolder')}</button>
              </>
            ) : null}
            <button type="button" onClick={() => { closeMenu(); askRename(menu.entry) }}>{t('tree.rename')}</button>
            <button type="button" onClick={() => { closeMenu(); void doDelete(menu.entry) }}>{t('tree.delete')}</button>
            <button type="button" onClick={() => { closeMenu(); void window.soyupmark.revealInFileManager(menu.entry.path) }}>
              {t('tree.reveal')}
            </button>
          </div>
        </>
      ) : null}

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

/** 列表视图卡片行：主名加粗 + 扩展名灰 + 预览第二行 */
function CardRow({
  file,
  showRelDir,
  onOpen,
  onMenu,
}: {
  file: FlatFile
  /** 非分组模式下在右侧显示相对目录提示 */
  showRelDir: boolean
  onOpen: (path: string) => void
  onMenu: (e: React.MouseEvent, entry: FileEntry) => void
}) {
  const activePath = useWorkspaceStore((s) => s.tabs.find((x) => x.id === s.activeId)?.path ?? null)
  const { stem, ext } = splitNameExt(file.name)
  return (
    <div
      className={`file-tree__card${file.path === activePath ? ' file-tree__card--active' : ''}`}
      onClick={() => onOpen(file.path)}
      onContextMenu={(e) => onMenu(e, { name: file.name, path: file.path, dir: false })}
    >
      <div className="file-tree__card-title">
        <span className="file-tree__card-stem">{stem}</span>
        {ext ? <span className="file-tree__card-ext">{ext}</span> : null}
        {showRelDir && file.relDir ? <span className="file-tree__reldir">{file.relDir}</span> : null}
      </div>
      {file.preview ? <div className="file-tree__card-preview">{file.preview}</div> : null}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  forceExpand,
  onOpen,
  onMenu,
}: {
  node: FileEntry
  depth: number
  /** 搜索态：忽略折叠状态，匹配分支全部展开 */
  forceExpand: boolean
  onOpen: (path: string) => void
  onMenu: (e: React.MouseEvent, entry: FileEntry) => void
}) {
  const expanded = useWorkspaceStore((s) => !!s.expandedDirs[node.path])
  const activePath = useWorkspaceStore((s) => s.tabs.find((x) => x.id === s.activeId)?.path ?? null)
  const open = forceExpand || expanded

  return (
    <>
      <div
        className={`file-tree__row${node.path === activePath ? ' file-tree__row--active' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => {
          if (node.dir) useWorkspaceStore.getState().toggleDir(node.path)
          else onOpen(node.path)
        }}
        onContextMenu={(e) => onMenu(e, node)}
      >
        <span className={`file-tree__chevron${node.dir ? '' : ' file-tree__chevron--leaf'}${open ? ' file-tree__chevron--open' : ''}`}>
          {node.dir ? '▸' : ''}
        </span>
        <span className={`file-tree__row-icon${node.dir ? ' file-tree__row-icon--dir' : ''}`}>
          {node.dir ? <IconFolder size={14} /> : <IconDoc size={14} />}
        </span>
        <span className={`file-tree__name${node.dir ? ' file-tree__name--dir' : ''}`}>{node.name}</span>
      </div>
      {node.dir && open
        ? (node.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              forceExpand={forceExpand}
              onOpen={onOpen}
              onMenu={onMenu}
            />
          ))
        : null}
    </>
  )
}
