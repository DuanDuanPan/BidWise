# Story 1.1: [Enabler] 项目初始化与工程配置

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want BidWise 项目正确初始化并完成工程配置,
so that 开发团队可以在规范化的工程基础上开始构建功能。

## Acceptance Criteria (验收标准)

1. **AC-1: 项目骨架生成**
   - Given 项目尚未创建
   - When 初始化执行
   - Then 生成包含 main/preload/renderer 三层分离的 Electron + React + TypeScript 项目

2. **AC-2: 开发服务器可用**
   - Given 项目已创建
   - When 运行开发服务器 (`pnpm dev`)
   - Then Electron 窗口正常启动，HMR 热更新工作正常

3. **AC-3: 冷启动性能**
   - Given 已生成当前平台生产包并启用主进程冷启动计时
   - When 主进程在应用启动入口执行 `console.time('cold-start')`，并在首个 `BrowserWindow` 触发 `ready-to-show` 时执行 `console.timeEnd('cold-start')`
   - Then 自动化验证读取该耗时并断言 `< 5000ms`（NFR1）

4. **AC-4: 路径别名**
   - Given 路径别名已配置
   - When 代码中使用跨目录 import
   - Then 路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*` 正确解析，不使用超过 1 层的相对路径

5. **AC-5: 代码规范**
   - Given 已配置 `pnpm lint`、`pnpm format`、`pnpm format:check`、`pnpm verify:structure`，并接入 Husky `pre-commit` + `lint-staged`
   - When 开发者执行 `git commit`
   - Then 钩子自动运行 ESLint、Prettier 检查和目录结构校验，任一失败都会阻止提交

6. **AC-6: 测试框架**
   - Given `package.json` 已将 `pnpm test` 编排为 `pnpm test:unit && pnpm test:e2e`
   - When 运行测试命令 (`pnpm test`)
   - Then `pnpm test:unit` 执行 Vitest main/renderer 测试，`pnpm test:e2e` 通过 Playwright `_electron.launch()` 启动 Electron，并验证主进程类型骨架可导入、渲染根组件可渲染、首个窗口与应用壳成功打开

## Tasks / Subtasks (任务分解)

- [ ] **Task 1: 项目脚手架初始化** (AC: #1)
  - [ ] 1.1 运行 `pnpm create @quick-start/electron bidwise -- --template react-ts` 生成项目骨架
  - [ ] 1.2 配置 `.npmrc`：`shamefully-hoist=true`（解决 pnpm + electron-builder + better-sqlite3 原生模块兼容）
  - [ ] 1.3 运行 `pnpm install` 验证依赖安装成功
  - [ ] 1.4 验证 `pnpm dev` 启动 Electron 窗口 + HMR 正常 (AC: #2)

- [ ] **Task 2: 目录结构创建** (AC: #1)
  - [ ] 2.1 创建 `src/main/` 完整子目录：`ipc/`, `services/`, `db/`, `db/migrations/`, `db/repositories/`, `prompts/`, `utils/`, `config/`
  - [ ] 2.2 创建 `src/shared/`：`models/`, `ipc-types.ts`, `constants.ts`
  - [ ] 2.3 创建 `src/renderer/src/` 子目录：`stores/`, `modules/`, `shared/components/`, `shared/hooks/`, `shared/lib/`
  - [ ] 2.4 创建 Alpha 模块目录并与 architecture 详细结构保持一致：`modules/project/`, `modules/analysis/`, `modules/editor/` 各含 `components/`, `hooks/`, `types.ts`；`modules/export/` 含 `components/`, `types.ts`
  - [ ] 2.5 创建测试目录：`tests/unit/main/`, `tests/unit/renderer/`, `tests/integration/ipc/`, `tests/integration/docx-bridge/`, `tests/e2e/flows/`, `tests/fixtures/rfp-samples/`, `tests/fixtures/proposal-samples/`, `tests/fixtures/template-samples/`, `tests/fixtures/baseline-samples/`
  - [ ] 2.6 创建资源目录：`resources/`, `resources/templates/`
  - [ ] 2.7 创建 `data/` 运行时目录结构占位：`data/db/`, `data/projects/`, `data/config/`, `data/logs/ai-trace/`, `data/backups/`
  - [ ] 2.8 更新 `.gitignore`：排除 `data/`、`*.sqlite`、`bidwise.config.enc`、`dist/`、`out/`

- [ ] **Task 3: 路径别名配置** (AC: #4)
  - [ ] 3.1 配置 `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` 的 `paths` 映射
  - [ ] 3.2 配置 `electron.vite.config.ts` 的 `resolve.alias`（注意 electron-vite 5 不再需要 `externalizeDepsPlugin`，已内置）
  - [ ] 3.3 创建验证文件：从 `@shared/constants` 导入到 main 和 renderer 各一个文件，确认编译通过

- [ ] **Task 4: Tailwind CSS v4 + Ant Design 5.x 集成** (AC: #1, #5)
  - [ ] 4.1 安装 Tailwind CSS v4：`pnpm add -D tailwindcss @tailwindcss/postcss`
  - [ ] 4.2 安装 Ant Design 5.x：`pnpm add antd@5.29.3 @ant-design/icons@^5.6.1 @ant-design/cssinjs@^1.23.0`
  - [ ] 4.3 配置 PostCSS（`postcss.config.js`）：使用 `@tailwindcss/postcss` 插件
  - [ ] 4.4 配置 `globals.css`：CSS 层级顺序解决 Ant Design + Tailwind 优先级冲突（见 Dev Notes 中的关键代码片段）
  - [ ] 4.5 在 `App.tsx` 中用 `<StyleProvider layer>` 包裹应用（Ant Design CSS 层级兼容）
  - [ ] 4.6 配置 Ant Design ConfigProvider Design Token 覆盖（品牌色 `#1677FF`、减少边框阴影、加大留白）
  - [ ] 4.7 配置字体系统：中文 `PingFang SC` / `Microsoft YaHei`，代码 `JetBrains Mono`

- [ ] **Task 5: 代码质量工具链** (AC: #5)
  - [ ] 5.1 安装并配置 ESLint（`.eslintrc.cjs`）：TypeScript + React + 路径别名规则
  - [ ] 5.2 安装并配置 Prettier（`.prettierrc`）
  - [ ] 5.3 在 `package.json` 中补齐脚本：`lint`, `format`, `format:check`, `verify:structure`, `test:unit`, `test:e2e`, `test`（`verify:structure` 可用轻量 Node 脚本或等价命令实现）
  - [ ] 5.4 安装并配置 Husky + lint-staged：`pre-commit` 钩子执行 `pnpm exec lint-staged`，并串联 `pnpm verify:structure`
  - [ ] 5.5 配置 `lint-staged` 规则：对暂存的 TS/TSX/JS/CSS/JSON/MD 文件运行 ESLint 与 `prettier --check`
  - [ ] 5.6 验证 `pnpm lint`、`pnpm format:check`、`pnpm verify:structure` 通过，并确认提交失败时能阻止 commit

- [ ] **Task 6: 测试框架配置** (AC: #6)
  - [ ] 6.1 安装 Vitest 与 renderer 组件测试依赖：`pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom`
  - [ ] 6.2 配置 `vitest.config.ts`：主进程用 `environment: 'node'`，渲染进程用 `environment: 'jsdom'`（需要 workspace 或 projects 配置分离）
  - [ ] 6.3 安装 Playwright：`pnpm add -D @playwright/test`，配置 `playwright.config.ts`
  - [ ] 6.4 配置 Playwright Electron 启动 harness：通过 `_electron.launch()` 启动 Electron 进程并等待首个窗口
  - [ ] 6.5 编写首个冒烟测试：主进程单元测试验证共享类型/别名骨架，渲染进程组件测试验证 `App` 可渲染，E2E 测试验证窗口启动与应用壳可见
  - [ ] 6.6 验证 `pnpm test` 按 `pnpm test:unit && pnpm test:e2e` 编排执行并全部通过

- [ ] **Task 7: 核心基础设施代码** (AC: #1)
  - [ ] 7.1 创建 `src/main/utils/errors.ts`：`BidWiseError` 类型化错误体系（错误码枚举 + 继承结构）
  - [ ] 7.2 创建 `src/shared/ipc-types.ts`：IPC 频道类型定义骨架（`{domain}:{action}` 命名，统一 Response Wrapper 类型）
  - [ ] 7.3 创建 `src/shared/models/index.ts`：共享模型类型占位
  - [ ] 7.4 创建 `src/shared/constants.ts`：错误码枚举、全局常量
  - [ ] 7.5 创建 `src/main/utils/logger.ts`：基础日志工具
  - [ ] 7.6 创建 `src/preload/index.ts`：contextBridge 安全 API 暴露骨架
  - [ ] 7.7 创建 `src/preload/index.d.ts`：TypeScript 类型声明
  - [ ] 7.8 创建 architecture 对齐的文件级占位：`src/main/services/index.ts`, `src/main/db/client.ts`, `src/main/db/index.ts`, `src/main/prompts/index.ts`, `src/main/config/app-config.ts`

- [ ] **Task 8: 打包验证** (AC: #3)
  - [ ] 8.1 运行 `pnpm build` 确认打包成功
  - [ ] 8.2 在 `src/main/index.ts` 增加冷启动计时：启动入口 `console.time('cold-start')`，窗口 `ready-to-show` 时 `console.timeEnd('cold-start')`
  - [ ] 8.3 运行打包产物并记录日志，断言冷启动时间 `< 5000ms`

## Dev Notes (开发指南)

### 版本锁定（2026-03 研究结果）

| 技术 | 推荐版本 | 关键风险/注意事项 |
|------|---------|-----------------|
| electron-vite | 5.x | `externalizeDepsPlugin` 已移除（功能内置于 `build.externalizeDeps`）；不支持函数式嵌套配置 |
| Electron | 41.x | V8 变更，native 模块须兼容；renderer 中 clipboard 模块已废弃 |
| better-sqlite3 | ≥12.8.0 | **必须** 12.8.0+ 才兼容 Electron 41 的 V8 变更 |
| Kysely | 0.28.x | 稳定，CamelCasePlugin 和 Migrator 无 breaking change |
| Tailwind CSS | 4.x | **重大变更**：CSS 配置代替 `tailwind.config.ts`，详见下方 |
| Node.js | ^20.19.0 \|\| >=22.12.0 | electron-vite@5.0.0 和 vitest@4.1.0 要求此最低版本 |
| Ant Design | 5.29.x | 5.x 维护模式但稳定；6.x 已发布但架构文档指定 5.x |
| Vitest | 4.x | 无内置 Electron 环境，主进程用 `node`，渲染进程用 `jsdom` |
| Playwright | 1.58.x | Electron 支持仍为 experimental，使用 `_electron.launch()` |
| Zustand | 5.x | `subscribeWithSelector` 无变化；`create` 不再支持自定义 equality（需要时用 `createWithEqualityFn`） |

### 关键代码片段

#### Tailwind v4 + Ant Design 5.x CSS 层级兼容

**`src/renderer/src/globals.css`:**
```css
/* Tailwind v4: CSS-based config, no tailwind.config.ts */
@layer theme, base, antd, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);

/* Design Token: 自定义主题变量 */
@theme {
  --color-brand: #1677FF;
  --color-brand-light: #F0F5FF;
  --color-success: #52C41A;
  --color-warning: #FAAD14;
  --color-danger: #FF4D4F;
  --color-info: #1677FF;

  --color-bg-global: #FAFAFA;
  --color-bg-content: #FFFFFF;
  --color-bg-sidebar: #F5F5F5;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  --font-sans: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Consolas", monospace;
}
```

**`src/renderer/src/App.tsx`:**
```tsx
import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'

const theme = {
  token: {
    colorPrimary: '#1677FF',
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#FAFAFA',
    borderRadius: 6,
    // 减少边框和阴影深度，趋向极简
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.05)',
    // 中文排版优化
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
  },
}

function App() {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={theme}>
        <AntApp>
          {/* 应用内容 */}
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}
```

#### electron-vite 5.x 配置（路径别名）

**`electron.vite.config.ts`:**
```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@modules': resolve('src/renderer/src/modules'),
      },
    },
    plugins: [react()],
  },
})
// 注意: electron-vite 5 不再需要 externalizeDepsPlugin，build.externalizeDeps 默认启用
```

#### BidWiseError 类型体系

**`src/main/utils/errors.ts`:**
```ts
export class BidWiseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'BidWiseError'
  }
}

// 禁止 throw 裸字符串，所有错误必须使用 BidWiseError
```

#### 统一 Response Wrapper 类型

**`src/shared/ipc-types.ts`:**
```ts
// 统一响应格式（IPC + FastAPI 共用）
export type SuccessResponse<T> = {
  success: true
  data: T
}

export type ErrorResponse = {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

export type ProjectRecord = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type ProjectListItem = Pick<ProjectRecord, 'id' | 'name' | 'updatedAt'>

export type CreateProjectInput = {
  name: string
  rootPath: string
}

export type UpdateProjectInput = Partial<Pick<ProjectRecord, 'name'>>

// IPC 频道按 {domain}:{action} 命名
export const IPC_CHANNELS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',
} as const
```

#### contextBridge 安全隔离

**`src/preload/index.ts`:**
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResponse,
  CreateProjectInput,
  ProjectListItem,
  ProjectRecord,
  UpdateProjectInput,
} from '@shared/ipc-types'
import { IPC_CHANNELS } from '@shared/ipc-types'

type ProjectApi = {
  projectCreate: (input: CreateProjectInput) => Promise<ApiResponse<ProjectRecord>>
  projectList: () => Promise<ApiResponse<ProjectListItem[]>>
  projectGet: (projectId: string) => Promise<ApiResponse<ProjectRecord>>
  projectUpdate: (projectId: string, input: UpdateProjectInput) => Promise<ApiResponse<ProjectRecord>>
  projectDelete: (projectId: string) => Promise<ApiResponse<void>>
  projectArchive: (projectId: string) => Promise<ApiResponse<void>>
}

const api: ProjectApi = {
  projectCreate: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input) as Promise<ApiResponse<ProjectRecord>>,
  projectList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST) as Promise<ApiResponse<ProjectListItem[]>>,
  projectGet: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, projectId) as Promise<ApiResponse<ProjectRecord>>,
  projectUpdate: (projectId, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, { projectId, input }) as Promise<ApiResponse<ProjectRecord>>,
  projectDelete: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, projectId) as Promise<ApiResponse<void>>,
  projectArchive: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ARCHIVE, projectId) as Promise<ApiResponse<void>>,
}

// 严格隔离：每个 IPC channel 暴露成单独方法，禁止泛型 invoke 透传
contextBridge.exposeInMainWorld('api', api)
```

**`src/preload/index.d.ts`:**
```ts
import type {
  ApiResponse,
  CreateProjectInput,
  ProjectListItem,
  ProjectRecord,
  UpdateProjectInput,
} from '@shared/ipc-types'

declare global {
  interface Window {
    api: {
      projectCreate: (input: CreateProjectInput) => Promise<ApiResponse<ProjectRecord>>
      projectList: () => Promise<ApiResponse<ProjectListItem[]>>
      projectGet: (projectId: string) => Promise<ApiResponse<ProjectRecord>>
      projectUpdate: (projectId: string, input: UpdateProjectInput) => Promise<ApiResponse<ProjectRecord>>
      projectDelete: (projectId: string) => Promise<ApiResponse<void>>
      projectArchive: (projectId: string) => Promise<ApiResponse<void>>
    }
  }
}
```

#### Vitest Workspace 配置（分离主进程和渲染进程）

**`vitest.config.ts`:**
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/unit/main/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@main': resolve('src/main'),
            '@shared': resolve('src/shared'),
          },
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/unit/renderer/**/*.test.ts', 'tests/unit/renderer/**/*.test.tsx'],
        },
        resolve: {
          alias: {
            '@renderer': resolve('src/renderer/src'),
            '@shared': resolve('src/shared'),
            '@modules': resolve('src/renderer/src/modules'),
          },
        },
      },
    ],
  },
})
```

#### package.json 脚本与测试编排

**`package.json`:**
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "lint": "eslint . --ext .ts,.tsx --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "verify:structure": "node scripts/verify-structure.mjs",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:e2e"
  }
}
```

**提交钩子约束：**
- Husky `pre-commit` 执行 `pnpm exec lint-staged` 和 `pnpm verify:structure`
- `lint-staged` 对暂存文件运行 `eslint --max-warnings=0` 与 `prettier --check`
- `verify:structure` 校验 Story 1.1 范围内的架构目录占位是否存在

#### 冷启动与 Electron 冒烟测试约束

- 冷启动计时：在 `src/main/index.ts` 启动入口记录 `console.time('cold-start')`，在首个窗口 `ready-to-show` 时 `console.timeEnd('cold-start')`
- main 冒烟测试：验证 `@shared/ipc-types` 与 `@shared/constants` 可在主进程测试中导入
- renderer 冒烟测试：使用 `@testing-library/react` + `@testing-library/jest-dom` 验证 `App` 在 `jsdom` 中完成首次渲染
- Playwright E2E：使用 `_electron.launch()` 启动 Electron，断言首个窗口成功打开且应用壳根节点可见

### 架构偏差说明

| 架构文档描述 | 实际情况（2026-03） | 处理方式 |
|-------------|-------------------|---------|
| 根目录含 `tailwind.config.ts` | Tailwind v4 使用 CSS-based 配置，不再需要 JS/TS 配置文件 | 用 `globals.css` 中的 `@theme` 指令替代 |
| 根目录含 `postcss.config.js` | 仍然需要，但配置更简洁（只需 `@tailwindcss/postcss` 插件） | 保留，配置简化 |
| 未提及 `@ant-design/cssinjs` | Tailwind v4 的 CSS `@layer` 与 Ant Design 冲突，需要 `StyleProvider layer` | 必须安装 `@ant-design/cssinjs` 并用 `StyleProvider layer` 包裹 |

### 命名规范速查

| 类别 | 规则 | 示例 |
|------|------|------|
| SQLite 表名 | snake_case 复数 | `projects`, `scoring_models` |
| SQLite 列名 | snake_case | `project_id`, `created_at` |
| 外键 | `{表名单数}_id` | `project_id` |
| IPC 频道 | `{domain}:{action}` | `project:create` |
| Zustand Store | camelCase + Store | `projectStore` |
| React 组件 | PascalCase | `ProjectBoard` |
| 组件文件 | PascalCase.tsx | `ProjectBoard.tsx` |
| Hooks | camelCase, `use` 前缀 | `useProject` |
| 工具函数 | camelCase | `parseRfpDocument` |
| 模块目录 | kebab-case | `project/`, `analysis/` |
| Prompt 文件 | `{name}.prompt.ts` | `parse-rfp.prompt.ts` |

### 禁止事项（Anti-Patterns）

- **禁止** 渲染进程直接 import Node.js 模块
- **禁止** IPC handler 中包含业务逻辑（必须分发到 service 层）
- **禁止** 在业务代码中硬编码 prompt（统一放入 `src/main/prompts/*.prompt.ts`）
- **禁止** 相对路径超过 1 层（`../../` 违规）
- **禁止** throw 裸字符串（必须用 BidWiseError）
- **禁止** 手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 负责）
- **禁止** 在 Action 内同步调用其他 store 的 Action（跨 store 读写必须经 `subscribeWithSelector` + 组件 hooks）
- **禁止** 白名单异步操作绕过 `task-queue`（AI/OCR/导入/导出/Git 同步/语义检索必须入队）
- **禁止** Loading 状态用 `isLoading` / `fetching` / `pending`（统一用 `loading: boolean`）
- **禁止** 将整个 `ipcRenderer` 通过 contextBridge 暴露（会得到空对象）

### Project Structure Notes

**Story 1.1 创建的是架构定义中的 bootstrap 子集；下列目录需在本故事内落位，占位目录/占位文件也算完成：**

```
bidwise/
├── .npmrc                          ← shamefully-hoist=true
├── .gitignore                      ← 排除 data/, *.sqlite, *.enc, dist/, out/
├── .eslintrc.cjs
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── electron-builder.yml
├── vitest.config.ts
├── playwright.config.ts
├── postcss.config.js
│
├── src/
│   ├── shared/                     ← 跨进程共享类型
│   │   ├── ipc-types.ts
│   │   ├── models/
│   │   │   └── index.ts
│   │   └── constants.ts
│   │
│   ├── main/                       ← Electron 主进程
│   │   ├── index.ts                ← 入口：窗口创建 + IPC 注册
│   │   ├── ipc/                    ← IPC Handler（薄分发层）
│   │   │   └── index.ts
│   │   ├── services/               ← 业务服务层（占位）
│   │   │   └── index.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── migrations/
│   │   │   ├── repositories/
│   │   │   └── index.ts
│   │   ├── prompts/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── errors.ts           ← BidWiseError
│   │   │   └── logger.ts
│   │   └── config/
│   │       └── app-config.ts
│   │
│   ├── preload/
│   │   ├── index.ts                ← contextBridge 安全 API
│   │   └── index.d.ts              ← TypeScript 类型声明
│   │
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── globals.css         ← Tailwind v4 CSS 配置 + Design Token
│           ├── stores/             ← Zustand stores（占位）
│           │   └── index.ts
│           ├── modules/
│           │   ├── project/        ← Alpha
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   ├── analysis/       ← Alpha
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   ├── editor/         ← Alpha
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   └── export/         ← Alpha
│           │       ├── components/
│           │       └── types.ts
│           └── shared/
│               ├── components/
│               ├── hooks/
│               └── lib/
│
├── tests/
│   ├── fixtures/
│   │   ├── rfp-samples/
│   │   ├── proposal-samples/
│   │   ├── template-samples/
│   │   └── baseline-samples/
│   ├── unit/
│   │   ├── main/
│   │   └── renderer/
│   ├── integration/
│   │   ├── ipc/
│   │   └── docx-bridge/
│   └── e2e/
│       └── flows/
│
├── resources/
│   ├── icon.png                    ← 可先放占位图标
│   └── templates/
│
└── data/                           ← 运行时数据 (.gitignore)
    ├── db/
    ├── projects/
    ├── config/
    ├── logs/
    │   └── ai-trace/
    └── backups/
```

**后续故事范围（本故事不创建，仅保留说明以对齐 architecture.md）：**
- `python/` 属于 docx 渲染桥接实现范围，留给后续导出能力故事
- `company-data/` 属于公司级共享资产仓库范围，留给后续资产/管理能力故事

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — 代码组织结构、路径别名、命名规范、实现模式强制规则]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 Story 1.1 AC + Implementation Notes + Additional Requirements]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 设计系统架构、Design Token、色彩系统、字体系统、间距系统]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR1 冷启动 <5秒, NFR12 IPC contextBridge 隔离]
- [Web Research 2026-03: electron-vite 5.x, Electron 41, Tailwind v4 + Ant Design CSS layer 兼容方案]

## Dev Agent Record

### Agent Model Used

(待开发时填写)

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-19: Story 文件创建，comprehensive context engine 分析完成
- 2026-03-19: 修复 AC-3/5/6 可测试性，补齐 scripts/Husky/lint-staged/Testing Library/Playwright Electron harness 任务，替换为 typed preload API，锁定 Ant Design 5.27.6 依赖，补充目录结构与架构反模式要求
- 2026-03-19: Ant Design 版本从 5.27.x 更新至 5.29.x（npm 最新 5.29.3）；版本锁定表增加 Node.js ^20.19.0 || >=22.12.0 前置条件
