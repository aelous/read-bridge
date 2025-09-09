import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TranslationStyle {
  backgroundColor: string
  darkBackgroundColor: string
  borderColor: string
  darkBorderColor: string
  textColor: string
  darkTextColor: string
  useCustomColors: boolean
  customBgColor?: string
  customDarkBgColor?: string
  customBorderColor?: string
  customDarkBorderColor?: string
  customTextColor?: string
  customDarkTextColor?: string
}

interface TranslationStore {
  // 翻译卡片样式
  cardStyle: TranslationStyle
  setCardStyle: (style: Partial<TranslationStyle>) => void
  resetCardStyle: () => void
  
  // 是否启用批量翻译
  enableBatchTranslation: boolean
  setEnableBatchTranslation: (enable: boolean) => void
  
  // 批量翻译行数
  batchTranslationLines: number
  setBatchTranslationLines: (lines: number) => void
}

const defaultCardStyle: TranslationStyle = {
  backgroundColor: 'bg-blue-50',
  darkBackgroundColor: 'dark:bg-blue-950',
  borderColor: 'border-blue-200',
  darkBorderColor: 'dark:border-blue-800',
  textColor: 'text-gray-700',
  darkTextColor: 'dark:text-gray-300',
  useCustomColors: false
}

export const useTranslationStore = create<TranslationStore>()(
  persist(
    (set) => ({
      cardStyle: defaultCardStyle,
      setCardStyle: (style) => set((state) => ({
        cardStyle: { ...state.cardStyle, ...style }
      })),
      resetCardStyle: () => set({ cardStyle: defaultCardStyle }),
      
      enableBatchTranslation: true,
      setEnableBatchTranslation: (enable) => set({ enableBatchTranslation: enable }),
      
      batchTranslationLines: 5,
      setBatchTranslationLines: (lines) => set({ batchTranslationLines: lines })
    }),
    {
      name: 'translation-storage'
    }
  )
)