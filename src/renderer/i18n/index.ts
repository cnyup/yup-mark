import i18next from 'i18next'
import type { i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './zh-CN'
import enUS from './en-US'
import { readPersisted, resolveLocale } from '../app/store/settingsPersist'

const instance: I18nInstance = i18next.createInstance()

void instance.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  // 初始语言取持久化设置（auto → 跟随系统），避免初始化竞态
  lng: resolveLocale(readPersisted().localeMode),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

export default instance
