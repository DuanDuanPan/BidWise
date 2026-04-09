export interface AnnotationFeedbackContext {
  originalAnnotationContent: string
  originalAnnotationType: 'ai-suggestion' | 'adversarial' | 'score-warning'
  userFeedback: string
  sectionContent: string
}

export function annotationFeedbackPrompt(context: AnnotationFeedbackContext): string {
  const typeLabel =
    context.originalAnnotationType === 'ai-suggestion'
      ? 'AI 建议'
      : context.originalAnnotationType === 'adversarial'
        ? '对抗检测'
        : '评分预警'

  const sectionNote = context.sectionContent
    ? `\n\n## 当前章节内容\n\n${context.sectionContent}`
    : '\n\n（当前章节内容不可用，请基于批注上下文进行推理）'

  return `你是一位资深投标文档审核专家。用户针对一条 ${typeLabel} 批注提出了反馈，请根据用户反馈对原始建议进行迭代改进。

## 原始批注

${context.originalAnnotationContent}

## 用户反馈

${context.userFeedback}${sectionNote}

## 要求

1. 结合用户反馈，给出改进后的建议
2. 保持专业、简洁的语言风格
3. 如果用户反馈是认可性质，在原建议基础上补充实操建议
4. 如果用户反馈是质疑性质，给出修正后的建议并说明修改原因
5. 直接输出改进后的建议内容，不要重复用户反馈`
}
