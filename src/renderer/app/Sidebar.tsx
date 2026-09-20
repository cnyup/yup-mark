import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { basename, dirname } from '@yupmark/live-cm/paths'
import type { FileSortMode } from '@shared/ipc'
import { useWorkspaceStore } from './store/workspaceStore'
import { useAppSettings } from './store/appSettings'
import { FileTree } from './FileTree'
import { OutlinePanel } from './OutlinePanel'
import { PromptModal } from './PromptModal'
import { Tip } from './ui/Tip'
import {
  IconAZ,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconClockPlus,
  IconFolder,
  IconList,
  IconOutline,
  IconPanel,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTree,
  IconX,
  IconZA,
} from './icons'

interface FooterPrompt {
  title: string
  onConfirm: (value: string) => void
}

/** 排序模式 → 图标 + 提示文案 key */
const SORT_OPTIONS: ReadonlyArray<{ mode: FileSortMode; tipKey: string; icon: React.ReactNode }> = [
  { mode: 'folder', tipKey: 'sidebar.sortFolder', icon: <IconFolder size={15} /> },
  { mode: 'natural-desc', tipKey: 'sidebar.sortNatural', icon: <IconZA size={15} /> },
  { mode: 'name', tipKey: 'sidebar.sortName', icon: <IconAZ size={15} /> },
  { mode: 'created', tipKey: 'sidebar.sortCreated', icon: <IconClockPlus size={15} /> },
  { mode: 'mtime', tipKey: 'sidebar.sortMtime', icon: <IconClock size={15} /> },
]

/** 左侧栏（Typora 式）：顶部 面板切换 + 标题 + 文件搜索；文件面板底部悬浮功能栏 */
export function Sidebar() {
  const { t } = useTranslation()
  const panel = useWorkspaceStore((s) => s.sidebarPanel)
  const view = useWorkspaceStore((s) => s.fileView)
  const sort = useWorkspaceStore((s) => s.fileSort)
  const root = useWorkspaceStore((s) => s.workspaceRoot)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [opsOpen, setOpsOpen] = useState(false)
  const [prompt, setPrompt] = useState<FooterPrompt | null>(null)
  const [recentDirs, setRecentDirs] = useState<string[]>([])

  // 打开操作菜单时拉取最近目录
  useEffect(() => {
    if (!opsOpen) return
    void window.yupmark.recentDirs().then((dirs) => setRecentDirs(dirs))
  }, [opsOpen])

  /** 新建的默认目录：当前文档所在目录，无则工作区根 */
  function defaultDir(): string {
    const s = useWorkspaceStore.getState()
    const active = s.tabs.find((x) => x.id === s.activeId)
    const dir = active?.path ? dirname(active.path) : ''
    return dir || (root ?? '')
  }

  async function openFile(path: string): Promise<void> {
    const res = await window.yupmark.readFile(path)
    if (res.ok) useWorkspaceStore.getState().openDoc(path, res.data)
  }

  function askNewFile(): void {
    setPrompt({
      title: t('tree.newFile'),
      onConfirm: async (name) => {
        if (!name.trim()) return
        const res = await window.yupmark.createFile(defaultDir(), name.trim())
        if (res.ok) {
          void useWorkspaceStore.getState().refreshTree()
          void openFile(res.data.path)
        }
      },
    })
  }

  function closeSearch(): void {
    setQuery('')
    setSearchOpen(false)
  }

  // 文件面板底部工具栏：单文件模式也保留（设置/侧栏开关），
  // 工作区专属项（目录操作弹层/树列表切换）仅在打开目录后出现
  const filesActive = panel === 'files'

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <Tip text={panel === 'files' ? t('sidebar.toOutline') : t('sidebar.toFiles')} side="bottom">
          <button
            type="button"
            className="sidebar__icon-btn"
            aria-label={panel === 'files' ? t('sidebar.toOutline') : t('sidebar.toFiles')}
            onClick={() => useWorkspaceStore.getState().setPanel(panel === 'files' ? 'outline' : 'files')}
          >
            {panel === 'files' ? <IconOutline /> : <IconFolder />}
          </button>
        </Tip>

        <div className="sidebar__title">{panel === 'files' ? t('sidebar.files') : t('sidebar.outline')}</div>

        {panel === 'files' && root ? (
          searchOpen ? (
            <div className="sidebar__search">
              <input
                autoFocus
                value={query}
                placeholder={t('sidebar.searchPlaceholder')}
                aria-label={t('sidebar.search')}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch()
                }}
              />
              <Tip text={t('sidebar.searchClose')} side="bottom">
                <button
                  type="button"
                  className="sidebar__icon-btn"
                  aria-label={t('sidebar.searchClose')}
                  onClick={closeSearch}
                >
                  <IconX size={13} />
                </button>
              </Tip>
            </div>
          ) : (
            <Tip text={t('sidebar.search')} side="bottom">
              <button
                type="button"
                className="sidebar__icon-btn sidebar__icon-btn--end"
                aria-label={t('sidebar.search')}
                onClick={() => setSearchOpen(true)}
              >
                <IconSearch />
              </button>
            </Tip>
          )
        ) : null}
      </div>

      <div className="sidebar__body">
        {panel === 'files' ? <FileTree query={query} view={view} sort={sort} /> : <OutlinePanel />}
      </div>

      {filesActive ? (
        <div className={`sidebar__dock${opsOpen ? ' sidebar__dock--pinned' : ''}`}>
          <Tip text={t('sidebar.opNewFile')}>
            <button
              type="button"
              className="sidebar__icon-btn"
              aria-label={t('sidebar.opNewFile')}
              onClick={askNewFile}
            >
              <IconPlus />
            </button>
          </Tip>

          {root ? (
          <div className="sidebar__dock-ops">
            {opsOpen ? (
              <>
                <div className="ctx-overlay" onClick={() => setOpsOpen(false)} onContextMenu={(e) => e.preventDefault()} />
                <div className="sidebar-popover">
                  <div className="sidebar-popover__head">
                    <span>{t('sidebar.ops')}</span>
                    <button
                      type="button"
                      className="sidebar-popover__close"
                      aria-label={t('prompt.cancel')}
                      onClick={() => setOpsOpen(false)}
                    >
                      <IconX size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="sidebar-popover__row"
                    onClick={() => {
                      setOpsOpen(false)
                      askNewFile()
                    }}
                  >
                    {t('sidebar.opNewFile')}
                  </button>
                  <button
                    type="button"
                    className="sidebar-popover__row"
                    onClick={() => {
                      setOpsOpen(false)
                      setSearchOpen(true)
                    }}
                  >
                    {t('sidebar.opSearch')}
                  </button>
                  <button
                    type="button"
                    className="sidebar-popover__row"
                    onClick={() => {
                      setOpsOpen(false)
                      if (root) void window.yupmark.revealInFileManager(root)
                    }}
                  >
                    {t('sidebar.opReveal')}
                  </button>
                  <button
                    type="button"
                    className="sidebar-popover__row"
                    onClick={() => {
                      setOpsOpen(false)
                      void useWorkspaceStore.getState().openWorkspace()
                    }}
                  >
                    {t('sidebar.openFolder')}
                  </button>
                  <button
                    type="button"
                    className="sidebar-popover__row"
                    onClick={() => {
                      setOpsOpen(false)
                      void useWorkspaceStore.getState().refreshTree()
                    }}
                  >
                    {t('sidebar.refresh')}
                  </button>

                  <div className="sidebar-popover__sep" />
                  <div className="sidebar-popover__label">{t('sidebar.sort')}</div>
                  <div className="sidebar-popover__sorts">
                    {SORT_OPTIONS.map((opt) => (
                      <Tip key={opt.mode} text={t(opt.tipKey)}>
                      <button
                        type="button"
                        className={`sidebar-popover__sort${sort === opt.mode ? ' sidebar-popover__sort--active' : ''}`}
                        aria-label={t(opt.tipKey)}
                        aria-pressed={sort === opt.mode}
                        onClick={() => useWorkspaceStore.getState().setFileSort(opt.mode)}
                      >
                        {opt.icon}
                        {sort === opt.mode ? <IconCheck size={11} className="sidebar-popover__sort-check" /> : null}
                      </button>
                      </Tip>
                    ))}
                  </div>

                  <div className="sidebar-popover__sep" />
                  <div className="sidebar-popover__label">{t('sidebar.recentDirs')}</div>
                  {recentDirs.length > 0 ? (
                    recentDirs.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className="sidebar-popover__row sidebar-popover__row--dir"
                        title={dir}
                        onClick={() => {
                          setOpsOpen(false)
                          void useWorkspaceStore.getState().restoreWorkspace(dir)
                        }}
                      >
                        <IconFolder size={14} />
                        <span className="sidebar-popover__dir-name">{basename(dir)}</span>
                        <span className="sidebar-popover__dir-path">{dir}</span>
                      </button>
                    ))
                  ) : (
                    <div className="sidebar-popover__empty">{t('sidebar.noRecentDirs')}</div>
                  )}

                </div>
              </>
            ) : null}
            <Tip text={t('sidebar.ops')}>
              <button
                type="button"
                className="sidebar__dock-name"
                aria-label={t('sidebar.ops')}
                aria-expanded={opsOpen}
                onClick={() => setOpsOpen((v) => !v)}
              >
                <span className="sidebar__dock-name-text">{basename(root!)}</span>
                <IconChevronDown size={13} />
              </button>
            </Tip>
          </div>
          ) : null}

          {root ? (
          <Tip text={view === 'tree' ? t('sidebar.listView') : t('sidebar.treeView')}>
            <button
              type="button"
              className="sidebar__icon-btn"
              aria-label={view === 'tree' ? t('sidebar.listView') : t('sidebar.treeView')}
              onClick={() => useWorkspaceStore.getState().setFileView(view === 'tree' ? 'list' : 'tree')}
            >
              {view === 'tree' ? <IconList /> : <IconTree />}
            </button>
          </Tip>
          ) : null}

          <Tip text={t('settings.title')}>
            <button
              type="button"
              className="sidebar__icon-btn"
              aria-label={t('settings.title')}
              onClick={() => useAppSettings.getState().openSettingsPage()}
            >
              <IconSettings />
            </button>
          </Tip>


          <Tip text={t('sidebar.toggle')}>
            <button
              type="button"
              className="sidebar__icon-btn"
              aria-label={t('sidebar.toggle')}
              aria-pressed={useWorkspaceStore.getState().sidebarOpen}
              onClick={() => useWorkspaceStore.getState().toggleSidebar()}
            >
              <IconPanel />
            </button>
          </Tip>
        </div>
      ) : null}

      {prompt ? (
        <PromptModal
          title={prompt.title}
          initial=""
          onCancel={() => setPrompt(null)}
          onConfirm={(value) => {
            setPrompt(null)
            prompt.onConfirm(value)
          }}
        />
      ) : null}
    </aside>
  )
}
