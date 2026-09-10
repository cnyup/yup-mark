/** 智能粘贴：选中文字 + 粘贴纯 URL → [文字](URL)（纯函数，可单测） */
export function smartPasteUrl(selectedText: string, clipboardText: string): string | null {
  const url = clipboardText.trim()
  if (!selectedText || selectedText.includes('\n')) return null
  if (!/^https?:\/\/\S+$/i.test(url)) return null
  return `[${selectedText}](${url})`
}
