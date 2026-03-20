/**
 * Parse RFP (招标文件解析) prompt template.
 * Alpha placeholder — full implementation in Story 2.3.
 */
export function parseRfpPrompt(context: { rfpContent: string; language?: string }): string {
  const lang = context.language ?? '中文'
  return `请分析以下招标文件内容，提取关键信息并以结构化格式输出。

要求：
1. 提取项目名称、预算金额、投标截止日期、技术要求等关键字段
2. 识别评分标准和权重
3. 标注合规性要求
4. 使用${lang}输出

招标文件内容：
${context.rfpContent}`
}
