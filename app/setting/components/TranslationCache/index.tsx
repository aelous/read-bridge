'use client'
import { useEffect, useState } from 'react'
import { Card, Button, Statistic, Row, Col, Space, message, Popconfirm } from 'antd'
import { DatabaseOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { getTranslationStats, clearAllTranslations } from '@/utils/db'

export default function TranslationCache() {
  const [stats, setStats] = useState({
    totalTranslations: 0,
    totalBooks: 0
  })
  const [loading, setLoading] = useState(false)

  // 加载统计信息
  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await getTranslationStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to load translation stats:', error)
      message.error('加载缓存统计失败')
    } finally {
      setLoading(false)
    }
  }

  // 清空所有缓存
  const clearAllCache = async () => {
    setLoading(true)
    try {
      await clearAllTranslations()
      message.success('翻译缓存已清空')
      await loadStats()
    } catch (error) {
      console.error('Failed to clear cache:', error)
      message.error('清空缓存失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  return (
    <Card 
      title={
        <Space>
          <DatabaseOutlined />
          <span>翻译缓存管理</span>
        </Space>
      }
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadStats}
            loading={loading}
          >
            刷新
          </Button>
          <Popconfirm
            title="清空缓存"
            description="确定要清空所有翻译缓存吗？此操作不可恢复。"
            onConfirm={clearAllCache}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              danger 
              icon={<DeleteOutlined />}
              loading={loading}
            >
              清空缓存
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Row gutter={16}>
        <Col span={12}>
          <Statistic 
            title="缓存的翻译数量" 
            value={stats.totalTranslations} 
            suffix="条"
          />
        </Col>
        <Col span={12}>
          <Statistic 
            title="涉及书籍数量" 
            value={stats.totalBooks} 
            suffix="本"
          />
        </Col>
      </Row>
      
      <div className="mt-4 text-gray-500 text-sm">
        <p>• 翻译结果会自动保存到本地数据库</p>
        <p>• 下次阅读相同句子时会直接使用缓存</p>
        <p>• 缓存数据存储在浏览器的 IndexedDB 中</p>
        <p>• 清空缓存不会影响当前的阅读进度</p>
      </div>
    </Card>
  )
}