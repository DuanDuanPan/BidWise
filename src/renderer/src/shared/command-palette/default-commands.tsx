import {
  FileSearchOutlined,
  ProjectOutlined,
  ExportOutlined,
  HomeOutlined,
  MessageOutlined,
  UnorderedListOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import type { MessageInstance } from 'antd/es/message/interface'
import { SOP_STAGES } from '@modules/project/types'
import { formatShortcut } from '@renderer/shared/lib/platform'
import type { Command } from './types'

export function createDefaultCommands(
  navigate: (path: string) => void,
  messageApi: MessageInstance
): Command[] {
  const commands: Command[] = []

  // 导航类：SOP 阶段跳转（工作空间内由路由感知注册动态提供，此处仅提供通用导航）
  commands.push({
    id: 'command-palette:go-home',
    label: '返回项目看板',
    category: 'project',
    keywords: ['看板', '首页', '项目列表', 'kanban', 'home'],
    icon: <HomeOutlined />,
    action: () => navigate('/'),
  })

  // 操作类：导出预览（需在项目工作空间内使用，workspace 挂载时会用真实命令覆盖）
  commands.push({
    id: 'command-palette:export-document',
    label: '导出预览',
    category: 'action',
    keywords: ['导出', '预览', '文档', 'export', 'preview', 'docx'],
    icon: <ExportOutlined />,
    shortcut: formatShortcut('Ctrl+E'),
    action: () => messageApi.info('请先进入项目工作空间再使用导出预览', 2),
  })

  // 操作类：批注面板切换（Story 1-7 未合并，disabled 占位）
  commands.push({
    id: 'command-palette:toggle-sidebar',
    label: '切换批注面板',
    category: 'action',
    keywords: ['批注', '侧边栏', '面板', 'sidebar', 'annotation'],
    icon: <MessageOutlined />,
    shortcut: formatShortcut('Ctrl+B'),
    action: () => messageApi.info('面板切换功能将在 Story 1.7 合并后可用', 2),
    disabled: true,
    badge: '1.7 合并后可用',
  })

  // 操作类：大纲面板切换（Story 1-7 未合并，disabled 占位）
  commands.push({
    id: 'command-palette:toggle-outline',
    label: '切换大纲面板',
    category: 'action',
    keywords: ['大纲', '目录', '面板', 'outline', 'toc'],
    icon: <UnorderedListOutlined />,
    shortcut: formatShortcut('Ctrl+\\'),
    action: () => messageApi.info('面板切换功能将在 Story 1.7 合并后可用', 2),
    disabled: true,
    badge: '1.7 合并后可用',
  })

  // 章节跳转（Story 1-7 未合并，disabled 占位）
  commands.push({
    id: 'command-palette:jump-to-section',
    label: '跳转到章节',
    category: 'navigation',
    keywords: ['章节', '跳转', '标题', 'heading', 'section', 'jump'],
    icon: <OrderedListOutlined />,
    action: () => messageApi.info('章节跳转将在 Story 1.7 合并后可用', 2),
    disabled: true,
    badge: '1.7 合并后可用',
  })

  // 对抗评审（Epic 5 未实现，disabled）
  commands.push({
    id: 'command-palette:start-adversarial-review',
    label: '启动对抗评审',
    category: 'action',
    keywords: ['对抗', '评审', '审查', 'review', 'adversarial'],
    icon: <SafetyCertificateOutlined />,
    action: () => messageApi.info('对抗评审需要 Epic 5 模块就绪', 2),
    disabled: true,
    badge: '需要 Epic 5',
  })

  // 资产库搜索（Epic 6 未实现，disabled）
  commands.push({
    id: 'command-palette:search-assets',
    label: '搜索资产库',
    category: 'action',
    keywords: ['资产', '搜索', '素材', 'asset', 'search'],
    icon: <DatabaseOutlined />,
    action: () => messageApi.info('资产库搜索需要 Epic 6 模块就绪', 2),
    disabled: true,
    badge: '需要 Epic 6',
  })

  // 导航类：SOP 阶段跳转命令（供全局搜索用，不含快捷键 — 快捷键由 useSopKeyboardNav 独占）
  for (const stage of SOP_STAGES) {
    commands.push({
      id: `command-palette:stage-${stage.key}`,
      label: `${stage.label}阶段`,
      category: 'navigation',
      keywords: [stage.label, stage.shortLabel, stage.key, `阶段${stage.stageNumber}`],
      icon: <FileSearchOutlined />,
      shortcut: stage.altKey ? formatShortcut(`Alt+${stage.altKey}`) : undefined,
      action: () => {
        // SOP 阶段导航由工作空间路由感知命令覆盖
        messageApi.info(`请先进入项目工作空间再跳转到${stage.label}阶段`, 2)
      },
    })
  }

  return commands
}

export function createProjectSwitchCommands(
  projects: Array<{ id: string; name: string; customerName?: string | null }>,
  navigate: (path: string) => void
): Command[] {
  return projects.map((project) => ({
    id: `command-palette:switch-project:${project.id}`,
    label: project.name,
    category: 'project' as const,
    keywords: [
      project.name,
      project.customerName ?? '',
      '项目',
      '切换',
      'switch',
      'project',
    ].filter(Boolean),
    icon: <ProjectOutlined />,
    action: () => navigate(`/project/${project.id}`),
  }))
}
