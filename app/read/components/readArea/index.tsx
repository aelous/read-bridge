import { Book, ReadingProgress } from "@/types/book"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import db from "@/services/DB"
import { EVENT_NAMES, EventEmitter } from "@/services/EventService"
import { Radio, Spin } from "antd"
import { createLLMClient } from "@/services/llm"
import { useLLMStore } from "@/store/useLLMStore"
import { LoadingOutlined } from "@ant-design/icons"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { INPUT_PROMPT } from "@/constants/prompt"
import { useTranslationStore } from "@/store/useTranslationStore"


export default function ReadArea({ book, readingProgress }: { book: Book, readingProgress: ReadingProgress }) {
  const title = useMemo(() => {
    return book.chapterList[readingProgress.currentLocation.chapterIndex]?.title || ''
  }, [book, readingProgress.currentLocation.chapterIndex])

  const lines = useMemo(() => {
    return readingProgress.sentenceChapters[readingProgress.currentLocation.chapterIndex] ?? []
  }, [readingProgress.sentenceChapters, readingProgress.currentLocation.chapterIndex])

  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedLine, setSelectedLine] = useState<number>(Infinity)
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(new Set())
  const [translations, setTranslations] = useState<Map<number, string>>(new Map())
  const [loadingTranslations, setLoadingTranslations] = useState<Set<number>>(new Set())
  const lineRefsMap = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 页面加载时滚动到上次阅读位置
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const savedLineIndex = readingProgress.currentLocation.lineIndex;
    if (savedLineIndex !== undefined && savedLineIndex !== Infinity && savedLineIndex > 0) {
      // 等待DOM
      setTimeout(() => {
        const lineElement = lineRefsMap.current.get(savedLineIndex);
        if (lineElement) {
          lineElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } else {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [lines, readingProgress.currentLocation.lineIndex]);

  // 滚动停止后保存当前阅读位置
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top + 10;

        // 找出视口中第一个可见的非空行
        let visibleLineIndex = Infinity;

        for (let i = 0; i < lines.length; i++) {
          if (!lines[i]) continue;

          const lineElement = lineRefsMap.current.get(i);
          if (!lineElement) continue;

          const lineRect = lineElement.getBoundingClientRect();

          if (lineRect.bottom >= containerTop &&
            lineRect.top <= (containerRect.top + containerRect.height)) {
            visibleLineIndex = i;
            break;
          }
        }

        // save
        if (visibleLineIndex !== Infinity && visibleLineIndex >= 0) {
          db.updateCurrentLocation(book.id, {
            chapterIndex: readingProgress.currentLocation.chapterIndex,
            lineIndex: visibleLineIndex
          });
        }
      }, 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [book.id, readingProgress.currentLocation.chapterIndex, lines]);

  // 获取单个句子的翻译
  const getTranslation = useCallback(async (sentence: string, index: number) => {
    const chatModel = useLLMStore.getState().chatModel;
    if (!chatModel) {
      console.warn('No chat model configured');
      return;
    }

    // 先检查是否已有翻译，使用回调函数确保获取最新状态
    const hasTranslation = await new Promise<boolean>((resolve) => {
      setTranslations(prev => {
        resolve(prev.has(index));
        return prev;
      });
    });

    if (hasTranslation) {
      return; // 已有翻译，直接返回
    }

    // 检查是否正在加载
    const isLoading = await new Promise<boolean>((resolve) => {
      setLoadingTranslations(prev => {
        if (prev.has(index)) {
          resolve(true);
          return prev;
        }
        resolve(false);
        return new Set(prev).add(index);
      });
    });

    if (isLoading) {
      return; // 正在加载，直接返回
    }

    try {
      const client = createLLMClient(chatModel);
      
      // 构建消息
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: INPUT_PROMPT.TRANSLATION_PROMPT
        },
        {
          role: 'user',
          content: sentence
        }
      ];

      // 获取翻译
      const translation = await client.completions(messages, '');

      // 保存翻译结果
      setTranslations(prev => new Map(prev).set(index, translation));
    } catch (error) {
      console.error(`Translation error for index ${index}:`, error);
    } finally {
      // 移除加载状态
      setLoadingTranslations(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  }, []);

  // 处理行点击
  const handleLineClick = useCallback((index: number) => {
    setSelectedLine((prev) => {
      EventEmitter.emit(EVENT_NAMES.SEND_LINE_INDEX, index);
      
      // 获取翻译配置
      const { enableBatchTranslation, batchTranslationLines } = useTranslationStore.getState();
      
      // 切换当前句子的翻译显示状态
      setVisibleTranslations(prevVisible => {
        const newVisible = new Set(prevVisible);
        if (newVisible.has(index)) {
          // 如果已经显示，则隐藏
          newVisible.delete(index);
        } else {
          // 如果未显示，则显示并翻译当前句子及下面的行
          newVisible.add(index);
          
          // 收集需要翻译的句子索引
          const indicesToTranslate: number[] = [];
          
          // 添加当前句子
          const sentence = lines[index];
          if (sentence && sentence.trim()) {
            indicesToTranslate.push(index);
          }
          
          // 如果启用批量翻译，添加下面的行
          if (enableBatchTranslation) {
            for (let i = 1; i <= batchTranslationLines; i++) {
              const nextIndex = index + i;
              if (nextIndex < lines.length) {
                const nextSentence = lines[nextIndex];
                if (nextSentence && nextSentence.trim()) {
                  newVisible.add(nextIndex);
                  indicesToTranslate.push(nextIndex);
                }
              }
            }
          }
          
          // 异步翻译所有句子
          Promise.all(
            indicesToTranslate.map(async (idx) => {
              const sentenceToTranslate = lines[idx];
              if (sentenceToTranslate && sentenceToTranslate.trim()) {
                await getTranslation(sentenceToTranslate, idx);
              }
            })
          ).catch(error => {
            console.error('Batch translation error:', error);
          });
        }
        return newVisible;
      });
      
      if (prev !== index) {
        db.updateCurrentLocation(book.id, {
          chapterIndex: readingProgress.currentLocation.chapterIndex,
          lineIndex: index
        });
      }
      return index;
    });
  }, [book.id, readingProgress.currentLocation.chapterIndex, lines, getTranslation]);

  // 清理 AbortController
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 记录每行DOM引用
  const setLineRef = useCallback((element: HTMLDivElement | null, index: number) => {
    if (element) {
      lineRefsMap.current.set(index, element);
    } else {
      lineRefsMap.current.delete(index);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className='w-full h-full overflow-auto p-2'
    >
      <div className="text-2xl font-bold mb-4 ml-8">{title}</div>
      <div className="text-lg">
        {lines.length > 0 && lines.map((sentence, index) => (
          <Line
            sentence={sentence}
            index={index}
            isSelected={selectedLine === index}
            key={index}
            handleLineClick={handleLineClick}
            setLineRef={setLineRef}
            translation={translations.get(index)}
            isLoadingTranslation={loadingTranslations.has(index)}
            isTranslationVisible={visibleTranslations.has(index)}
          />
        ))}
      </div>
    </div>
  )
}

// 单行组件，使用memo优化性能
const Line = React.memo(({ sentence, index, isSelected, handleLineClick, setLineRef, translation, isLoadingTranslation, isTranslationVisible }: {
  sentence: string,
  index: number,
  isSelected: boolean,
  handleLineClick: (index: number) => void,
  setLineRef: (element: HTMLDivElement | null, index: number) => void,
  translation?: string,
  isLoadingTranslation?: boolean,
  isTranslationVisible?: boolean
}) => {
  // 获取翻译卡片样式配置
  const cardStyle = useTranslationStore(state => state.cardStyle);
  
  // 检测是否为深色模式
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  
  React.useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  if (!sentence) {
    return <div className="h-4" />
  }
  
  // 获取翻译卡片的样式
  const getCardStyle = () => {
    if (cardStyle.useCustomColors) {
      return {
        backgroundColor: isDarkMode
          ? (cardStyle.customDarkBgColor || '#172554')
          : (cardStyle.customBgColor || '#eff6ff'),
        borderColor: isDarkMode
          ? (cardStyle.customDarkBorderColor || '#1e3a8a')
          : (cardStyle.customBorderColor || '#bfdbfe'),
        color: isDarkMode
          ? (cardStyle.customDarkTextColor || '#d1d5db')
          : (cardStyle.customTextColor || '#374151')
      };
    }
    return {};
  };
  
  const getCardClassName = () => {
    if (cardStyle.useCustomColors) {
      return 'ml-8 mt-1 p-2 rounded-lg border cursor-pointer';
    }
    return `ml-8 mt-1 p-2 rounded-lg border cursor-pointer ${cardStyle.backgroundColor} ${cardStyle.darkBackgroundColor} ${cardStyle.borderColor} ${cardStyle.darkBorderColor}`;
  };
  
  const getTextClassName = () => {
    if (cardStyle.useCustomColors) {
      return 'text-sm';
    }
    return `text-sm ${cardStyle.textColor} ${cardStyle.darkTextColor}`;
  };

  return (
    <div className="mb-2">
      <div
        className={`flex mb-1 group rounded-lg ${isSelected ? 'bg-[var(--ant-color-bg-text-hover)]' : ''} hover:bg-[var(--ant-color-bg-text-hover)]`}
        ref={(el) => setLineRef(el, index)}
      >
        <div
          className={`w-6 flex justify-end items-center`}
          onClick={() => handleLineClick(index)}
        >
          <Radio
            checked={isSelected}
            className={isSelected ? "" : "hidden group-hover:block"}
          />
        </div>
        <div className={`mx-1`} />
        <div className="flex-1">{sentence}</div>
      </div>
      
      {/* 翻译内容显示区域 */}
      {isTranslationVisible && (
        <div
          className={getCardClassName()}
          style={getCardStyle()}
          onClick={(e) => {
            e.stopPropagation();
            handleLineClick(index);
          }}>
          {isLoadingTranslation ? (
            <div className="flex items-center text-gray-500">
              <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />
              <span className="ml-2 text-sm">正在翻译...</span>
            </div>
          ) : translation ? (
            <div
              className={getTextClassName()}
              style={cardStyle.useCustomColors ? { color: 'inherit' } : {}}
            >
              {translation}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
})
Line.displayName = 'Line'
