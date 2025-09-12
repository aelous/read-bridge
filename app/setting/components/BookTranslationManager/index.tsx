'use client'
import { useState, useEffect } from 'react'
import { Card, Button, Select, Space, message, Progress, Tag } from 'antd'
import { DownloadOutlined, CloudDownloadOutlined, BookOutlined, PauseOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import db from '@/services/DB'
import { Book } from '@/types/book'
import { getBatchTranslations } from '@/utils/db'
import translationTaskService, { TranslationTask } from '@/services/TranslationTaskService'

export default function BookTranslationManager() {
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [batchSize, setBatchSize] = useState(5) // 批量翻译的句子数
  const [currentTask, setCurrentTask] = useState<TranslationTask | null>(null)

  // 加载书籍列表和订阅任务状态
  useEffect(() => {
    loadBooks()
    
    // 订阅任务状态变化
    const unsubscribe = translationTaskService.subscribe((task) => {
      setCurrentTask(task)
    })
    
    return () => {
      unsubscribe()
    }
  }, [])

  const loadBooks = async () => {
    try {
      const allBooks = await db.getAllBooks()
      setBooks(allBooks)
      if (allBooks.length > 0 && !selectedBookId) {
        setSelectedBookId(allBooks[0].id)
      }
    } catch (error) {
      console.error('Failed to load books:', error)
      message.error('加载书籍列表失败')
    }
  }

  // 计算书籍的所有句子
  const getAllSentences = async (bookId: string): Promise<{ text: string; chapterIndex: number; sentenceIndex: number }[]> => {
    const book = await db.getBook(bookId)
    if (!book) throw new Error('Book not found')

    const allSentences: { text: string; chapterIndex: number; sentenceIndex: number }[] = []
    
    // 获取阅读进度以获取处理过的句子
    const readingProgress = await db.getCurrentLocation(bookId)
    
    // 遍历所有章节
    for (let chapterIndex = 0; chapterIndex < book.chapterList.length; chapterIndex++) {
      const sentences = readingProgress.sentenceChapters[chapterIndex]
      if (sentences) {
        // 使用已处理的句子
        sentences.forEach((sentence, sentenceIndex) => {
          if (sentence && sentence.trim()) {
            allSentences.push({
              text: sentence,
              chapterIndex,
              sentenceIndex
            })
          }
        })
      } else {
        // 如果章节还未处理，处理段落
        const chapter = book.chapterList[chapterIndex]
        let sentenceIndex = 0
        chapter.paragraphs.forEach(paragraph => {
          // 简单的句子分割
          const sentences = paragraph.match(/[^。！？.!?]+[。！？.!?]/g) || [paragraph]
          sentences.forEach(sentence => {
            if (sentence && sentence.trim()) {
              allSentences.push({
                text: sentence.trim(),
                chapterIndex,
                sentenceIndex: sentenceIndex++
              })
            }
          })
        })
      }
    }
    
    return allSentences
  }

  // 一键缓存整书翻译（使用后台任务服务）
  const translateWholeBook = async () => {
    if (!selectedBookId) {
      message.warning('请先选择一本书')
      return
    }

    try {
      const book = await db.getBook(selectedBookId)
      if (!book) {
        message.error('书籍不存在')
        return
      }

      const allSentences = await getAllSentences(selectedBookId)
      
      // 启动后台翻译任务
      await translationTaskService.startTranslation(
        selectedBookId,
        book.title,
        allSentences,
        batchSize
      )
    } catch (error) {
      console.error('Failed to start translation:', error)
      message.error('启动翻译失败：' + (error as Error).message)
    }
  }

  // 暂停翻译
  const pauseTranslation = () => {
    translationTaskService.pauseTranslation()
  }

  // 恢复翻译
  const resumeTranslation = () => {
    translationTaskService.resumeTranslation()
  }

  // 停止翻译
  const stopTranslation = () => {
    translationTaskService.stopTranslation()
  }

  // 导出含翻译的书籍为 EPUB
  const exportBookWithTranslations = async () => {
    if (!selectedBookId) {
      message.warning('请先选择一本书')
      return
    }

    setExporting(true)

    try {
      const book = await db.getBook(selectedBookId)
      if (!book) throw new Error('Book not found')

      const allSentences = await getAllSentences(selectedBookId)
      
      // 批量获取所有翻译
      const texts = allSentences.map(s => s.text)
      const translations = await getBatchTranslations(selectedBookId, texts)
      
      // 动态导入 jepub
      const jEpub = (await import('jepub')).default
      
      // 创建 EPUB 实例
      const epub = new jEpub()
      
      // 初始化 EPUB 信息
      epub.init({
        i18n: 'zh',
        title: book.title,
        author: book.author || '未知作者',
        publisher: 'ReadBridge',
        description: `《${book.title}》的双语对照版本`,
        tags: ['双语', '翻译', book.title].join(',')
      })
      
      // 设置信息
      epub.uuid(`readbridge-${book.id}-${Date.now()}`)
      epub.date(new Date())
      
      // 通过 notes 字段添加样式（jepub 没有直接的 css 方法）
      epub.notes(`
        <style>
          body {
            font-family: "Microsoft YaHei", "PingFang SC", "STSong", serif;
            line-height: 1.8;
            padding: 0 1em;
          }
          h1 {
            text-align: center;
            margin: 2em 0 1em 0;
            page-break-before: always;
          }
          p {
            text-indent: 2em;
            margin: 0.5em 0;
          }
          .original {
            color: #000;
            margin-bottom: 0.5em;
          }
          .translation {
            color: #555;
            font-style: italic;
            margin-bottom: 1em;
            padding-left: 2em;
            border-left: 3px solid #ccc;
          }
        </style>
      `)
      
      // 构建章节内容
      let currentChapter = -1
      let chapterContent = ''
      
      for (const sentence of allSentences) {
        // 检查是否需要开始新章节
        if (sentence.chapterIndex !== currentChapter) {
          // 保存上一章节（如果有）
          if (currentChapter !== -1 && chapterContent) {
            const chapterTitle = book.toc[currentChapter]?.title || `第 ${currentChapter + 1} 章`
            epub.add(chapterTitle, chapterContent)
          }
          
          // 开始新章节
          currentChapter = sentence.chapterIndex
          const newChapterTitle = book.toc[currentChapter]?.title || `第 ${currentChapter + 1} 章`
          chapterContent = `<h1>${newChapterTitle}</h1>`
        }

        // 添加原文
        chapterContent += `<p class="original">${sentence.text}</p>`
        
        // 添加译文（如果有）
        const translation = translations.get(sentence.text)
        if (translation) {
          chapterContent += `<p class="translation">${translation}</p>`
        }
      }
      
      // 保存最后一章
      if (currentChapter !== -1 && chapterContent) {
        const chapterTitle = book.toc[currentChapter]?.title || `第 ${currentChapter + 1} 章`
        epub.add(chapterTitle, chapterContent)
      }

      // 生成 EPUB
      const epubData = await epub.generate('blob')
      
      // 处理不同类型的返回值
      let blob: Blob
      if (epubData instanceof Blob) {
        blob = epubData
      } else if (epubData instanceof ArrayBuffer) {
        blob = new Blob([epubData], { type: 'application/epub+zip' })
      } else if (epubData instanceof Uint8Array) {
        blob = new Blob([new Uint8Array(epubData)], { type: 'application/epub+zip' })
      } else {
        // 如果是其他类型，尝试转换
        blob = new Blob([epubData as any], { type: 'application/epub+zip' })
      }
      
      // 创建下载
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${book.title}_含翻译.epub`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      message.success('EPUB 导出成功！文件包含完整目录，可在各类电子书阅读器中阅读。')
    } catch (error) {
      console.error('Failed to export book:', error)
      message.error('导出失败：' + (error as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card 
      title={
        <Space>
          <BookOutlined />
          <span>书籍翻译管理</span>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 书籍选择 */}
        <div>
          <div className="mb-2 text-gray-600">选择书籍：</div>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择一本书"
            value={selectedBookId}
            onChange={setSelectedBookId}
            options={books.map(book => ({
              label: `${book.title} ${book.author ? `- ${book.author}` : ''}`,
              value: book.id
            }))}
          />
        </div>

        {/* 批量设置 */}
        <div>
          <div className="mb-2 text-gray-600">批量翻译句子数（减少API调用）：</div>
          <Select
            style={{ width: 200 }}
            value={batchSize}
            onChange={setBatchSize}
            disabled={currentTask?.status === 'running'}
            options={[
              { label: '3 句/批', value: 3 },
              { label: '5 句/批（推荐）', value: 5 },
              { label: '10 句/批', value: 10 },
              { label: '15 句/批', value: 15 },
              { label: '20 句/批', value: 20 },
              { label: '30 句/批', value: 30 },
              { label: '40 句/批', value: 40 },
              { label: '50 句/批', value: 50 },
              { label: '60 句/批', value: 60 },
              { label: '70 句/批', value: 70 },
              { label: '80 句/批', value: 80 },
              { label: '90 句/批', value: 90 },
              { label: '100 句/批（最大）', value: 100 },
            ]}
          />
        </div>

        {/* 操作按钮 */}
        <Space wrap>
          {!currentTask ? (
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              onClick={translateWholeBook}
              disabled={!selectedBookId}
            >
              一键缓存整书翻译
            </Button>
          ) : (
            <>
              {currentTask.status === 'running' ? (
                <Button
                  icon={<PauseOutlined />}
                  onClick={pauseTranslation}
                >
                  暂停翻译
                </Button>
              ) : currentTask.status === 'paused' ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={resumeTranslation}
                >
                  恢复翻译
                </Button>
              ) : null}
              
              {currentTask.status !== 'completed' && (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={stopTranslation}
                >
                  停止翻译
                </Button>
              )}

              {currentTask.status === 'completed' && (
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => {
                    translationTaskService.clearCompletedTask()
                    translateWholeBook()
                  }}
                >
                  开始新翻译
                </Button>
              )}
            </>
          )}
          
          <Button
            icon={<DownloadOutlined />}
            onClick={exportBookWithTranslations}
            loading={exporting}
            disabled={!selectedBookId || exporting}
          >
            导出为 EPUB（含翻译）
          </Button>
        </Space>

        {/* 任务状态显示 */}
        {currentTask && (
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">《{currentTask.bookTitle}》</span>
                {currentTask.status === 'running' && (
                  <Tag color="processing">翻译中</Tag>
                )}
                {currentTask.status === 'paused' && (
                  <Tag color="warning">已暂停</Tag>
                )}
                {currentTask.status === 'completed' && (
                  <Tag color="success">已完成</Tag>
                )}
                {currentTask.status === 'error' && (
                  <Tag color="error">失败</Tag>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {currentTask.completedSentences} / {currentTask.totalSentences} 个句子
              </div>
            </div>
            <Progress
              percent={Math.round(currentTask.progress)}
              status={
                currentTask.status === 'running' ? 'active' :
                currentTask.status === 'completed' ? 'success' :
                currentTask.status === 'error' ? 'exception' :
                'normal'
              }
              strokeColor={{
                '0%': '#e3f2fd',
                '100%': '#90caf9'
              }}
              trailColor="#f5f5f5"
            />
            {currentTask.status === 'running' && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                任务正在后台运行，您可以切换到其他页面，翻译会继续进行
              </div>
            )}
          </div>
        )}

        {/* 说明 */}
        <div className="text-gray-500 text-sm">
          <p>• 一键缓存整书：自动翻译整本书的所有句子并保存到本地</p>
          <p>• 批量翻译：多个句子合并成一次API调用，大幅减少请求次数</p>
          <p>• 后台运行：翻译任务在后台运行，切换页面不会中断</p>
          <p>• 智能缓存：已有缓存的句子自动跳过，避免重复翻译</p>
          <p>• 导出格式：EPUB 电子书格式，原文和译文分段显示</p>
          <p>• 导出的 EPUB 文件可在各类电子书阅读器中打开</p>
        </div>
      </Space>
    </Card>
  )
}