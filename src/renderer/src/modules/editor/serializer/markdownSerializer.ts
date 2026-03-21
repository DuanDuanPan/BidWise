/** 将当前编辑器内容序列化为 Markdown */
export function serializeToMarkdown(editor: {
  api: { markdown: { serialize: () => string } }
}): string {
  return editor.api.markdown.serialize()
}

/** 将 Markdown 反序列化为 Plate 编辑器节点 */
export function deserializeFromMarkdown(
  editor: { api: { markdown: { deserialize: (md: string) => unknown[] } } },
  markdown: string
): unknown[] {
  return editor.api.markdown.deserialize(markdown)
}
