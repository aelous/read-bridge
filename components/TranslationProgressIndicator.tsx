'use client'
import { useEffect, useState } from 'react'
import { Progress, Card, Tag, Button, Space } from 'antd'
import { PauseOutlined, PlayCircleOutlined, StopOutlined, CloseOutlined } from '@ant-design/icons'
import translationTaskService, { TranslationTask } from '@/services/TranslationTaskService'

interface TranslationProgressIndicatorProps {
  className?: string
  style?: React.CSSProperties
  showClose?: boolean
  onClose?: () => void
}

export default function TranslationProgressIndicator({
  className = '',
  style = {},
  showClose = false,
  onClose
}: TranslationProgressIndicatorProps) {
  const [task, setTask] = useState<TranslationTask | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 订阅任务状态变化
    const unsubscribe = translationTaskService.subscribe((currentTask) => {
      setTask(currentTask)
      setIsVisible(!!currentTask)
    })

    // 获取当前任务
    const currentTask = translationTaskService.getCurrentTask()
    setTask(currentTask)
    setIsVisible(!!currentTask)

    return () => {
      unsubscribe()
    }
  }, [])

  const handlePause = () => {
    translationTaskService.pauseTranslation()
  }

  const handleResume = () => {
    translationTaskService.resumeTranslation()
  }

  const handleStop = () => {
    translationTaskService.stopTranslation()
  }

  const handleClose = () => {
    setIsVisible(false)
    onClose?.()
  }

  if (!isVisible || !task) {
    return null
  }

  return (
    <Card 
      className={`shadow-lg ${className}`}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 400,
        zIndex: 1000,
        ...style
      }}
      size="small"
      title={
        <div className="flex items-center justify-between">
          <span>翻译进度</span>
          {showClose && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={handleClose}
            />
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {/* 书籍信息和状态 */}
        <div className="flex items-center justify-between">
          <span className="font-medium">《{task.bookTitle}》</span>
          {task.status === 'running' && (
            <Tag color="processing">翻译中</Tag>
          )}
          {task.status === 'paused' && (
            <Tag color="warning">已暂停</Tag>
          )}
          {task.status === 'completed' && (
            <Tag color="success">已完成</Tag>
          )}
          {task.status === 'error' && (
            <Tag color="error">失败</Tag>
          )}
        </div>

        {/* 进度信息 */}
        <div className="text-sm text-gray-600">
          已完成: {task.completedSentences} / {task.totalSentences} 个句子
        </div>

        {/* 进度条 */}
        <Progress
          percent={Math.round(task.progress)}
          status={
            task.status === 'running' ? 'active' :
            task.status === 'completed' ? 'success' :
            task.status === 'error' ? 'exception' :
            'normal'
          }
          strokeColor={
            task.status === 'running' ? { '0%': '#e3f2fd', '100%': '#90caf9' } :
            task.status === 'completed' ? '#a5d6a7' :
            task.status === 'error' ? '#ef9a9a' :
            { '0%': '#fff3e0', '100%': '#ffcc80' }
          }
          trailColor="#f5f5f5"
        />

        {/* 控制按钮 */}
        <Space>
          {task.status === 'running' && (
            <Button
              size="small"
              icon={<PauseOutlined />}
              onClick={handlePause}
            >
              暂停
            </Button>
          )}
          {task.status === 'paused' && (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleResume}
            >
              继续
            </Button>
          )}
          {(task.status === 'running' || task.status === 'paused') && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
            >
              停止
            </Button>
          )}
          {task.status === 'completed' && (
            <Button
              size="small"
              type="primary"
              onClick={() => {
                translationTaskService.clearCompletedTask()
                handleClose()
              }}
            >
              关闭
            </Button>
          )}
        </Space>

        {/* 提示信息 */}
        {task.status === 'running' && (
          <div className="text-xs text-gray-500">
            翻译任务正在后台运行，您可以自由切换页面
          </div>
        )}
        {task.status === 'error' && task.error && (
          <div className="text-xs text-red-500">
            错误: {task.error}
          </div>
        )}
      </div>
    </Card>
  )
}