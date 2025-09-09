'use client'

import { Card, Form, Input, InputNumber, Switch, Button, ColorPicker, Space } from 'antd'
import { useTranslationStore } from '@/store/useTranslationStore'
import ExpandableDescription from '../ExpandableDescription'
import { useState, useEffect } from 'react'
import type { Color } from 'antd/es/color-picker'

export default function TranslationSection() {
  const { 
    cardStyle, 
    setCardStyle, 
    resetCardStyle,
    enableBatchTranslation,
    setEnableBatchTranslation,
    batchTranslationLines,
    setBatchTranslationLines
  } = useTranslationStore()
  
  const [isDarkMode, setIsDarkMode] = useState(false)
  
  useEffect(() => {
    // 检测当前是否为深色模式
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    }
    
    checkDarkMode()
    
    // 监听主题变化
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    
    return () => observer.disconnect()
  }, [])

  const handleColorChange = (colorType: string, color: Color | string) => {
    const hexColor = typeof color === 'string' ? color : color.toHexString()
    
    const styleUpdate: any = {
      useCustomColors: true
    }
    
    switch(colorType) {
      case 'bgColor':
        styleUpdate.customBgColor = hexColor
        break
      case 'darkBgColor':
        styleUpdate.customDarkBgColor = hexColor
        break
      case 'borderColor':
        styleUpdate.customBorderColor = hexColor
        break
      case 'darkBorderColor':
        styleUpdate.customDarkBorderColor = hexColor
        break
      case 'textColor':
        styleUpdate.customTextColor = hexColor
        break
      case 'darkTextColor':
        styleUpdate.customDarkTextColor = hexColor
        break
    }
    
    setCardStyle(styleUpdate)
  }

  const presetThemes = [
    { 
      name: '蓝色主题', 
      style: {
        backgroundColor: 'bg-blue-50',
        darkBackgroundColor: 'dark:bg-blue-950',
        borderColor: 'border-blue-200',
        darkBorderColor: 'dark:border-blue-800',
        textColor: 'text-gray-700',
        darkTextColor: 'dark:text-gray-300',
        useCustomColors: false
      }
    },
    { 
      name: '黄色主题', 
      style: {
        backgroundColor: 'bg-yellow-50',
        darkBackgroundColor: 'dark:bg-yellow-950',
        borderColor: 'border-yellow-200',
        darkBorderColor: 'dark:border-yellow-800',
        textColor: 'text-gray-700',
        darkTextColor: 'dark:text-gray-300',
        useCustomColors: false
      }
    },
    { 
      name: '绿色主题', 
      style: {
        backgroundColor: 'bg-green-50',
        darkBackgroundColor: 'dark:bg-green-950',
        borderColor: 'border-green-200',
        darkBorderColor: 'dark:border-green-800',
        textColor: 'text-gray-700',
        darkTextColor: 'dark:text-gray-300',
        useCustomColors: false
      }
    },
    { 
      name: '粉色主题', 
      style: {
        backgroundColor: 'bg-pink-50',
        darkBackgroundColor: 'dark:bg-pink-950',
        borderColor: 'border-pink-200',
        darkBorderColor: 'dark:border-pink-800',
        textColor: 'text-gray-700',
        darkTextColor: 'dark:text-gray-300',
        useCustomColors: false
      }
    },
    { 
      name: '灰色主题', 
      style: {
        backgroundColor: 'bg-gray-50',
        darkBackgroundColor: 'dark:bg-gray-950',
        borderColor: 'border-gray-200',
        darkBorderColor: 'dark:border-gray-800',
        textColor: 'text-gray-700',
        darkTextColor: 'dark:text-gray-300',
        useCustomColors: false
      }
    }
  ]
  
  // 获取预览样式
  const getPreviewStyle = () => {
    if (cardStyle.useCustomColors) {
      // 使用自定义颜色
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
      }
    } else {
      // 使用预设主题类名，返回空对象让类名生效
      return {}
    }
  }
  
  const getPreviewClassName = () => {
    if (cardStyle.useCustomColors) {
      return 'p-2 rounded-lg border'
    } else {
      return `p-2 rounded-lg border ${cardStyle.backgroundColor} ${cardStyle.darkBackgroundColor} ${cardStyle.borderColor} ${cardStyle.darkBorderColor}`
    }
  }
  
  const getTextClassName = () => {
    if (cardStyle.useCustomColors) {
      return 'text-sm'
    } else {
      return `text-sm ${cardStyle.textColor} ${cardStyle.darkTextColor}`
    }
  }

  return (
    <Card
      title="翻译设置"
      className="mb-4"
    >
      <ExpandableDescription 
        text="配置阅读界面中句子翻译功能的显示样式和行为。您可以自定义翻译卡片的颜色主题，选择是否启用批量翻译，以及设置批量翻译的行数。"
        maxLength={50}
      />

      <Form layout="vertical" className="mt-4">
        <Form.Item label="批量翻译">
          <Space direction="vertical" className="w-full">
            <Space>
              <span>启用批量翻译：</span>
              <Switch
                checked={enableBatchTranslation}
                onChange={setEnableBatchTranslation}
              />
            </Space>
            {enableBatchTranslation && (
              <Space>
                <span>批量翻译行数：</span>
                <InputNumber
                  min={1}
                  max={10}
                  value={batchTranslationLines}
                  onChange={(value) => setBatchTranslationLines(value || 5)}
                />
              </Space>
            )}
          </Space>
        </Form.Item>

        <Form.Item label="翻译卡片主题">
          <Space wrap>
            {presetThemes.map(theme => (
              <Button
                key={theme.name}
                onClick={() => setCardStyle(theme.style)}
              >
                {theme.name}
              </Button>
            ))}
            <Button onClick={resetCardStyle} type="default">
              恢复默认
            </Button>
          </Space>
        </Form.Item>

        <Form.Item label="自定义颜色">
          <Space direction="vertical" className="w-full">
            <Space>
              <span className="w-32 inline-block">浅色背景：</span>
              <ColorPicker
                value={cardStyle.customBgColor || '#eff6ff'}
                onChange={(color) => handleColorChange('bgColor', color)}
              />
            </Space>
            <Space>
              <span className="w-32 inline-block">深色背景：</span>
              <ColorPicker
                value={cardStyle.customDarkBgColor || '#172554'}
                onChange={(color) => handleColorChange('darkBgColor', color)}
              />
            </Space>
            <Space>
              <span className="w-32 inline-block">浅色边框：</span>
              <ColorPicker
                value={cardStyle.customBorderColor || '#bfdbfe'}
                onChange={(color) => handleColorChange('borderColor', color)}
              />
            </Space>
            <Space>
              <span className="w-32 inline-block">深色边框：</span>
              <ColorPicker
                value={cardStyle.customDarkBorderColor || '#1e3a8a'}
                onChange={(color) => handleColorChange('darkBorderColor', color)}
              />
            </Space>
            <Space>
              <span className="w-32 inline-block">浅色文字：</span>
              <ColorPicker
                value={cardStyle.customTextColor || '#374151'}
                onChange={(color) => handleColorChange('textColor', color)}
              />
            </Space>
            <Space>
              <span className="w-32 inline-block">深色文字：</span>
              <ColorPicker
                value={cardStyle.customDarkTextColor || '#d1d5db'}
                onChange={(color) => handleColorChange('darkTextColor', color)}
              />
            </Space>
          </Space>
        </Form.Item>

        <Form.Item label="预览">
          <div 
            className={getPreviewClassName()}
            style={getPreviewStyle()}
          >
            <div 
              className={getTextClassName()}
              style={cardStyle.useCustomColors ? { color: 'inherit' } : {}}
            >
              这是翻译卡片的预览效果。This is a preview of the translation card.
            </div>
          </div>
        </Form.Item>
      </Form>
    </Card>
  )
}