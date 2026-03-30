import { describe, it, expect } from 'vitest'
import { countCharacters } from '@modules/editor/hooks/useWordCount'

describe('@story-3-2 useWordCount / countCharacters', () => {
  it('@p0 counts Chinese characters individually', () => {
    expect(countCharacters('你好世界')).toBe(4)
  })

  it('@p0 counts mixed Chinese and English', () => {
    // "Hello你好" = 7 characters (5 English + 2 Chinese)
    expect(countCharacters('Hello你好')).toBe(7)
  })

  it('@p0 strips heading markers', () => {
    // "# Title" → "Title" = 5
    expect(countCharacters('# Title')).toBe(5)
  })

  it('@p0 strips bold/italic markers', () => {
    // "**bold** *italic*" → "bold" + "italic" = 10
    expect(countCharacters('**bold** *italic*')).toBe(10)
  })

  it('@p0 strips inline code backticks', () => {
    // "`code`" → "code" = 4
    expect(countCharacters('`code`')).toBe(4)
  })

  it('@p0 strips entire fenced code blocks (markers and body)', () => {
    const md = '```js\nconsole.log("hi")\n```'
    expect(countCharacters(md)).toBe(0)
  })

  it('@p0 strips fenced code block body but keeps surrounding text', () => {
    const md = 'before\n```\ncode inside\n```\nafter'
    // "before" + "after" = 11
    expect(countCharacters(md)).toBe(11)
  })

  it('@p0 strips tilde fenced code blocks', () => {
    const md = '~~~\ncode body\n~~~'
    expect(countCharacters(md)).toBe(0)
  })

  it('@p1 strips link syntax keeping text', () => {
    // "[click here](http://url)" → "clickhere" = 9 (whitespace stripped)
    expect(countCharacters('[click here](http://url)')).toBe(9)
  })

  it('@p1 strips image syntax keeping alt text', () => {
    expect(countCharacters('![alt text](image.png)')).toBe(7) // "alttext" without spaces
  })

  it('@p1 strips blockquote markers', () => {
    expect(countCharacters('> quoted text')).toBe(10) // "quotedtext"
  })

  it('@p1 strips list markers', () => {
    expect(countCharacters('- item one\n- item two')).toBe(14) // "itemone" + "itemtwo"
  })

  it('@p1 strips numbered list markers', () => {
    expect(countCharacters('1. first\n2. second')).toBe(11) // "first" + "second"
  })

  it('@p1 strips table separators and pipes', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    // Strips pipes and separator row → "AB12"
    expect(countCharacters(md)).toBe(4)
  })

  it('@p1 returns 0 for empty string', () => {
    expect(countCharacters('')).toBe(0)
  })

  it('@p1 returns 0 for whitespace-only', () => {
    expect(countCharacters('   \n\n  ')).toBe(0)
  })

  it('@p1 strips strikethrough markers', () => {
    expect(countCharacters('~~deleted~~')).toBe(7) // "deleted"
  })
})
