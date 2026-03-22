/**
 * Extract requirements & scoring model prompt template (Story 2.5)
 */

export interface ExtractRequirementsContext {
  sections: Array<{ title: string; content: string; pageStart: number; pageEnd: number }>
  rawText: string
  totalPages: number
  hasScannedContent?: boolean
}

export function extractRequirementsPrompt(context: ExtractRequirementsContext): string {
  const sectionsSummary = context.sections
    .map((s) => `[页${s.pageStart}-${s.pageEnd}] ${s.title}`)
    .join('\n')

  const scannedNote = context.hasScannedContent
    ? '\n注意：该文件包含扫描件内容，部分文字可能存在 OCR 识别误差，请结合上下文推断。'
    : ''

  return `你是一位资深售前工程师，精通招标文件分析。请从以下招标文件中抽取两类信息：

## 任务一：技术需求条目清单

从招标文件中提取所有可识别的技术需求、实施要求、服务要求、资质要求、商务要求等。

每条需求必须包含：
- sequenceNumber：从 1 开始的序号
- description：需求的完整描述
- sourcePages：该需求出现的页码数组，如 [23, 24]
- category：分类，取值范围为 "technical"（技术要求）、"implementation"（实施要求）、"service"（服务要求）、"qualification"（资质要求）、"commercial"（商务要求）、"other"（其他）
- priority：优先级，根据招标文件的强调程度判断，取值 "high"、"medium"、"low"

## 任务二：评分模型

从招标文件中提取评分标准，生成结构化评分模型。

每个评分大类必须包含：
- category：评分类别名称，如"技术方案"、"实施方案"、"商务报价"
- maxScore：该类别最高分值
- subItems：子评分项数组，每项包含 name（名称）、maxScore（分值）、description（评分要点）、sourcePages（来源页码）
- reasoning：你对该评分项的推理依据，说明为什么这样划分

## 输出格式

严格按以下 JSON 格式输出，不要添加任何多余文字：

\`\`\`json
{
  "requirements": [
    {
      "sequenceNumber": 1,
      "description": "系统应支持分布式微服务架构，单节点故障不影响整体服务",
      "sourcePages": [23, 24],
      "category": "technical",
      "priority": "high"
    }
  ],
  "scoringModel": {
    "totalScore": 100,
    "criteria": [
      {
        "category": "技术方案",
        "maxScore": 60,
        "subItems": [
          {
            "name": "系统架构设计",
            "maxScore": 15,
            "description": "系统整体架构的合理性和先进性",
            "sourcePages": [23, 24]
          }
        ],
        "reasoning": "招标文件第23页明确技术方案占60分"
      }
    ]
  }
}
\`\`\`
${scannedNote}
## 招标文件信息

- 总页数：${context.totalPages}
- 文档结构：
${sectionsSummary}

## 招标文件全文

${context.rawText}`
}
