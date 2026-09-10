/**
 * 运行平台检测：快捷键与菜单提示按 Typora 官方 macOS / Windows+Linux 两套对照。
 * jsdom（测试）里 platform 为空 → 走 Windows 分支。
 */
export const IS_MAC: boolean =
  typeof navigator !== 'undefined' &&
  (/mac/i.test(navigator.platform || '') || /Mac OS X/i.test(navigator.userAgent))
