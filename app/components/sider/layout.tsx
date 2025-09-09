'use client'
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSiderStore } from '@/store/useSiderStore';
import { theme } from 'antd';

const MIN_WIDTH = 400;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 500;

export default function SiderLayout({ children }: { children: React.ReactNode }) {
  const { siderWidth, setSiderWidth } = useSiderStore();
  const [width, setWidth] = useState(siderWidth || DEFAULT_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, [width, isCollapsed]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || isCollapsed) return;
    const diff = startX.current - e.clientX;
    const newWidth = Math.min(Math.max(startWidth.current + diff, MIN_WIDTH), MAX_WIDTH);
    setWidth(newWidth);
  }, [isCollapsed]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (!isCollapsed) {
        setSiderWidth(width);
      }
    }
  }, [setSiderWidth, width, isCollapsed]);

  // 切换折叠状态
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed]);

  // 事件监听
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const { token } = theme.useToken();
  
  return (
    <>
      {/* 侧边栏容器 */}
      <div
        className="fixed right-0 top-0 h-screen"
        style={{
          width: isCollapsed ? '40px' : `${width + 40}px`,
          transition: 'width 0.3s ease',
          zIndex: 1000
        }}
      >
        {/* 折叠按钮 - 始终在左侧边缘 */}
        <button
          onClick={toggleCollapse}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-50"
          style={{
            width: '32px',
            height: '80px',
            backgroundColor: token.colorPrimary || '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '8px 0 0 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 'bold',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
            transition: 'background-color 0.2s',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = token.colorPrimaryHover || '#40a9ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = token.colorPrimary || '#1890ff';
          }}
          title={isCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {isCollapsed ? '◀' : '▶'}
        </button>

        {/* 侧边栏内容区 */}
        <div
          className="absolute right-0 top-0 h-full overflow-hidden"
          style={{
            width: `${width}px`,
            backgroundColor: token.colorBgContainer || '#ffffff',
            borderLeft: `1px solid ${token.colorBorder || '#f0f0f0'}`,
            transform: isCollapsed ? `translateX(${width}px)` : 'translateX(0)',
            transition: 'transform 0.3s ease',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.08)'
          }}
        >
          {/* 拖拽条 */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400/30 transition-colors"
            onMouseDown={handleMouseDown}
            style={{
              opacity: isCollapsed ? 0 : 1,
              pointerEvents: isCollapsed ? 'none' : 'auto'
            }}
          />
          
          {/* 内容 */}
          <div 
            className="h-full w-full pl-2"
            style={{
              opacity: isCollapsed ? 0 : 1,
              transition: 'opacity 0.2s',
              pointerEvents: isCollapsed ? 'none' : 'auto'
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
