import { createLLMClient } from '@/services/llm'
import { useLLMStore } from '@/store/useLLMStore'
import { INPUT_PROMPT } from '@/constants/prompt'
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs'
import { 
  saveTranslation as saveTranslationToDB,
  getBatchTranslations 
} from '@/utils/db'
import { message } from 'antd'

export interface TranslationTask {
  bookId: string
  bookTitle: string
  sentences: { text: string; chapterIndex: number; sentenceIndex: number }[]
  batchSize: number
  totalSentences: number
  completedSentences: number
  progress: number
  status: 'running' | 'paused' | 'completed' | 'error'
  startTime: number
  endTime?: number
  error?: string
}

class TranslationTaskService {
  private currentTask: TranslationTask | null = null
  private abortController: AbortController | null = null
  private listeners: Set<(task: TranslationTask | null) => void> = new Set()

  // 订阅任务状态变化
  subscribe(listener: (task: TranslationTask | null) => void) {
    this.listeners.add(listener)
    // 立即通知当前状态
    listener(this.currentTask)
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener)
    }
  }

  // 通知所有监听器
  private notify() {
    this.listeners.forEach(listener => listener(this.currentTask))
  }

  // 获取当前任务
  getCurrentTask(): TranslationTask | null {
    return this.currentTask
  }

  // 批量翻译多个句子
  private async translateBatch(
    sentences: { text: string; chapterIndex: number; sentenceIndex: number }[],
    client: any
  ): Promise<Map<string, string>> {
    const translations = new Map<string, string>()
    
    // 构建批量翻译的提示
    const batchText = sentences.map((s, i) => `[${i + 1}] ${s.text}`).join('\n')
    
    // 构建消息
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${INPUT_PROMPT.TRANSLATION_PROMPT}
请翻译以下多个句子，每个句子独立翻译，用相同的编号标记返回。
格式要求：
[1] 翻译的第一句
[2] 翻译的第二句
...以此类推`
      },
      {
        role: 'user',
        content: batchText
      }
    ]

    try {
      // 获取批量翻译
      const response = await client.completions(messages, '')
      
      if (response) {
        // 解析返回的翻译结果
        const lines = response.split('\n')
        const translationMap = new Map<number, string>()
        
        lines.forEach(line => {
          const match = line.match(/^\[(\d+)\]\s*(.+)/)
          if (match) {
            const index = parseInt(match[1]) - 1
            const translation = match[2].trim()
            if (index >= 0 && index < sentences.length) {
              translationMap.set(index, translation)
            }
          }
        })
        
        // 将翻译结果映射到原句子
        sentences.forEach((sentence, index) => {
          const translation = translationMap.get(index)
          if (translation) {
            translations.set(sentence.text, translation)
          }
        })
      }
    } catch (error) {
      console.error('Batch translation error:', error)
      throw error
    }
    
    return translations
  }

  // 开始翻译任务
  async startTranslation(
    bookId: string,
    bookTitle: string,
    allSentences: { text: string; chapterIndex: number; sentenceIndex: number }[],
    batchSize: number
  ): Promise<void> {
    // 如果已有任务在运行，先停止
    if (this.currentTask && this.currentTask.status === 'running') {
      await this.stopTranslation()
    }

    const chatModel = useLLMStore.getState().chatModel
    if (!chatModel) {
      message.error('请先配置 LLM 模型')
      return
    }

    // 批量查询已有的翻译
    const texts = allSentences.map(s => s.text)
    const cachedTranslations = await getBatchTranslations(bookId, texts)
    
    // 找出需要翻译的句子
    const needTranslation = allSentences.filter(s => !cachedTranslations.has(s.text))
    
    if (needTranslation.length === 0) {
      message.success('该书籍的所有句子都已有翻译缓存')
      return
    }

    // 计算初始进度
    const alreadyCached = allSentences.length - needTranslation.length
    const initialProgress = Math.min(100, Math.round((alreadyCached / allSentences.length) * 100))
    
    // 创建新任务
    this.currentTask = {
      bookId,
      bookTitle,
      sentences: needTranslation,
      batchSize,
      totalSentences: allSentences.length,
      completedSentences: alreadyCached,
      progress: initialProgress,
      status: 'running',
      startTime: Date.now()
    }

    this.abortController = new AbortController()
    this.notify()

    console.log(`翻译任务开始 - 总句子数: ${allSentences.length}, 已缓存: ${alreadyCached}, 需翻译: ${needTranslation.length}, 初始进度: ${initialProgress}%`)
    message.info(`开始翻译《${bookTitle}》，共 ${needTranslation.length} 个句子需要翻译，已缓存 ${alreadyCached} 个句子`)

    // 异步执行翻译任务
    this.executeTranslation()
  }

  // 执行翻译任务（后台运行）
  private async executeTranslation() {
    if (!this.currentTask || this.currentTask.status !== 'running') return

    const { bookId, sentences, batchSize, totalSentences } = this.currentTask
    const client = createLLMClient(useLLMStore.getState().chatModel!)
    let completed = this.currentTask.completedSentences
    let translatedInThisSession = 0

    console.log(`开始执行翻译 - 从第 ${completed + 1} 个句子开始，共 ${totalSentences} 个句子`)

    try {
      // 按批次翻译
      for (let i = 0; i < sentences.length; i += batchSize) {
        // 检查是否被中止
        if (this.abortController?.signal.aborted || this.currentTask.status !== 'running') {
          break
        }

        const batch = sentences.slice(i, Math.min(i + batchSize, sentences.length))
        
        try {
          // 批量翻译
          const batchTranslations = await this.translateBatch(batch, client)
          
          // 逐个保存到数据库
          for (const sentence of batch) {
            const translation = batchTranslations.get(sentence.text)
            if (translation && translation !== sentence.text) {
              await saveTranslationToDB(bookId, sentence.text, translation)
            }
          }
          
          translatedInThisSession += batch.length
          completed += batch.length
          this.currentTask.completedSentences = completed
          this.currentTask.progress = Math.min(100, Math.round((completed / totalSentences) * 100))
          console.log(`批次翻译完成 - 本批次: ${batch.length}, 已完成: ${completed}/${totalSentences}, 进度: ${this.currentTask.progress}%`)
          this.notify()
        } catch (error) {
          console.error('Batch translation error:', error)
          
          // 批量失败时尝试逐个翻译
          for (const sentence of batch) {
            if (this.abortController?.signal.aborted || this.currentTask.status !== 'running') {
              break
            }

            try {
              const messages: ChatCompletionMessageParam[] = [
                {
                  role: 'system',
                  content: INPUT_PROMPT.TRANSLATION_PROMPT
                },
                {
                  role: 'user',
                  content: sentence.text
                }
              ]
              
              const translation = await client.completions(messages, '')
              
              if (translation && translation !== sentence.text) {
                await saveTranslationToDB(bookId, sentence.text, translation)
              }
            } catch (err) {
              console.error('Single translation error:', err)
            }
          }
          
          translatedInThisSession += batch.length
          completed += batch.length
          this.currentTask.completedSentences = completed
          this.currentTask.progress = Math.min(100, Math.round((completed / totalSentences) * 100))
          console.log(`降级翻译完成 - 本批次: ${batch.length}, 已完成: ${completed}/${totalSentences}, 进度: ${this.currentTask.progress}%`)
          this.notify()
        }
        
        // 添加小延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // 任务完成
      if (this.currentTask.status === 'running') {
        this.currentTask.status = 'completed'
        this.currentTask.endTime = Date.now()
        this.currentTask.progress = 100
        this.currentTask.completedSentences = totalSentences
        console.log(`翻译任务完成 - 本次翻译: ${translatedInThisSession}, 总完成: ${this.currentTask.completedSentences}/${totalSentences}`)
        message.success(`《${this.currentTask.bookTitle}》翻译完成！`)
        this.notify()
      }
    } catch (error) {
      console.error('Translation task error:', error)
      if (this.currentTask) {
        this.currentTask.status = 'error'
        this.currentTask.endTime = Date.now()
        this.currentTask.error = (error as Error).message
        message.error('翻译任务失败：' + (error as Error).message)
        this.notify()
      }
    }
  }

  // 暂停翻译
  pauseTranslation() {
    if (this.currentTask && this.currentTask.status === 'running') {
      this.currentTask.status = 'paused'
      this.abortController?.abort()
      this.notify()
      message.info('翻译任务已暂停')
    }
  }

  // 恢复翻译
  async resumeTranslation() {
    if (this.currentTask && this.currentTask.status === 'paused') {
      // 计算已经翻译了多少个需要翻译的句子
      const initialCached = this.currentTask.totalSentences - this.currentTask.sentences.length
      const translatedFromNeedList = this.currentTask.completedSentences - initialCached
      
      // 更新句子列表，移除已完成的部分
      const remainingSentences = this.currentTask.sentences.slice(translatedFromNeedList)
      
      console.log(`恢复翻译 - 原需翻译: ${this.currentTask.sentences.length}, 已翻译: ${translatedFromNeedList}, 剩余: ${remainingSentences.length}`)
      
      this.currentTask.sentences = remainingSentences
      this.currentTask.status = 'running'
      this.abortController = new AbortController()
      this.notify()
      
      message.info('翻译任务已恢复')
      this.executeTranslation()
    }
  }

  // 停止翻译
  stopTranslation() {
    if (this.currentTask) {
      this.currentTask.status = 'paused'
      this.currentTask.endTime = Date.now()
      this.abortController?.abort()
      this.currentTask = null
      this.notify()
      message.info('翻译任务已停止')
    }
  }

  // 清除已完成的任务
  clearCompletedTask() {
    if (this.currentTask && this.currentTask.status === 'completed') {
      this.currentTask = null
      this.notify()
    }
  }
}

// 创建单例
const translationTaskService = new TranslationTaskService()

export default translationTaskService