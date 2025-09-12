import Dexie, { Table } from 'dexie';

// 翻译记录的接口定义
export interface TranslationRecord {
  id?: number;
  bookId: string;           // 书籍ID
  sentenceHash: string;     // 句子的唯一标识（使用hash避免存储过长的原文）
  originalText: string;     // 原文
  translatedText: string;   // 译文
  sourceLanguage?: string;  // 源语言
  targetLanguage?: string;  // 目标语言
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间
}

// 创建数据库类
class TranslationDatabase extends Dexie {
  translations!: Table<TranslationRecord>;

  constructor() {
    super('ReadBridgeDB');
    
    // 定义数据库版本和表结构
    this.version(1).stores({
      // 索引：id自增主键，bookId+sentenceHash组合索引用于快速查询
      translations: '++id, [bookId+sentenceHash], bookId, createdAt'
    });
  }
}

// 创建数据库实例
export const db = new TranslationDatabase();

// 工具函数：生成句子的唯一hash
export function generateSentenceHash(text: string): string {
  // 简单的hash函数，用于生成句子的唯一标识
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// 查询翻译记录
export async function getTranslation(
  bookId: string, 
  sentenceText: string
): Promise<TranslationRecord | undefined> {
  try {
    const sentenceHash = generateSentenceHash(sentenceText);
    const record = await db.translations
      .where(['bookId', 'sentenceHash'])
      .equals([bookId, sentenceHash])
      .first();
    return record;
  } catch (error) {
    console.error('Error getting translation from DB:', error);
    return undefined;
  }
}

// 保存翻译记录
export async function saveTranslation(
  bookId: string,
  originalText: string,
  translatedText: string,
  sourceLanguage?: string,
  targetLanguage?: string
): Promise<number | undefined> {
  try {
    const sentenceHash = generateSentenceHash(originalText);
    const now = new Date();
    
    // 先检查是否存在
    const existing = await db.translations
      .where(['bookId', 'sentenceHash'])
      .equals([bookId, sentenceHash])
      .first();
    
    if (existing) {
      // 更新现有记录
      await db.translations.update(existing.id!, {
        translatedText,
        sourceLanguage,
        targetLanguage,
        updatedAt: now
      });
      return existing.id;
    } else {
      // 创建新记录
      const id = await db.translations.add({
        bookId,
        sentenceHash,
        originalText,
        translatedText,
        sourceLanguage,
        targetLanguage,
        createdAt: now,
        updatedAt: now
      });
      return id;
    }
  } catch (error) {
    console.error('Error saving translation to DB:', error);
    return undefined;
  }
}

// 批量查询翻译记录
export async function getBatchTranslations(
  bookId: string,
  sentences: string[]
): Promise<Map<string, string>> {
  try {
    const hashes = sentences.map(s => generateSentenceHash(s));
    const records = await db.translations
      .where('bookId').equals(bookId)
      .and(record => hashes.includes(record.sentenceHash))
      .toArray();
    
    // 创建原文到译文的映射
    const translationMap = new Map<string, string>();
    records.forEach(record => {
      translationMap.set(record.originalText, record.translatedText);
    });
    
    return translationMap;
  } catch (error) {
    console.error('Error getting batch translations from DB:', error);
    return new Map();
  }
}

// 删除某本书的所有翻译记录
export async function deleteBookTranslations(bookId: string): Promise<void> {
  try {
    await db.translations.where('bookId').equals(bookId).delete();
  } catch (error) {
    console.error('Error deleting book translations:', error);
  }
}

// 清空所有翻译记录
export async function clearAllTranslations(): Promise<void> {
  try {
    await db.translations.clear();
    console.log('All translations cleared');
  } catch (error) {
    console.error('Error clearing all translations:', error);
  }
}

// 获取数据库统计信息
export async function getTranslationStats() {
  try {
    const total = await db.translations.count();
    const books = await db.translations.orderBy('bookId').uniqueKeys();
    return {
      totalTranslations: total,
      totalBooks: books.length
    };
  } catch (error) {
    console.error('Error getting translation stats:', error);
    return {
      totalTranslations: 0,
      totalBooks: 0
    };
  }
}