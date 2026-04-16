#!/usr/bin/env node
/**
 * Style-driven SVG diagram generator — Node.js port of generate-from-template.py
 *
 * Usage:
 *   node generate-from-template.js <template-type> <output-path> [data-json]
 *   node generate-from-template.js <template-type> <output-path>   # reads JSON from stdin
 */

'use strict'

const fs = require('fs')
const path = require('path')
const process = require('process')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = __dirname
const TEMPLATE_DIR = path.join(SCRIPT_DIR, '..', 'templates')

const DEFAULT_VIEWBOX = {
  architecture: [960, 600],
  'data-flow': [960, 600],
  flowchart: [960, 640],
  sequence: [960, 700],
  comparison: [960, 620],
  timeline: [960, 520],
  'mind-map': [960, 620],
  agent: [960, 700],
  memory: [960, 720],
  'use-case': [960, 600],
  class: [960, 700],
  'state-machine': [960, 620],
  'er-diagram': [960, 680],
  'network-topology': [960, 620],
}

const FLOW_ALIASES = {
  main: 'control',
  api: 'control',
  control: 'control',
  write: 'write',
  read: 'read',
  data: 'data',
  async: 'async',
  feedback: 'feedback',
  neutral: 'neutral',
}

const MARKER_IDS = {
  control: 'arrowA',
  write: 'arrowB',
  read: 'arrowC',
  data: 'arrowE',
  async: 'arrowF',
  feedback: 'arrowG',
  neutral: 'arrowH',
}

/** @type {Object.<number, Object>} */
const STYLE_PROFILES = {
  1: {
    name: 'Flat Icon',
    font_family: "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    background: '#ffffff',
    shadow: true,
    title_align: 'center',
    title_fill: '#111827',
    title_size: 30,
    subtitle_fill: '#6b7280',
    subtitle_size: 14,
    node_fill: '#ffffff',
    node_stroke: '#d1d5db',
    node_radius: 10,
    node_shadow: 'url(#shadowSoft)',
    section_fill: 'none',
    section_stroke: '#dbe5f1',
    section_dash: '6 5',
    section_label_fill: '#2563eb',
    section_sub_fill: '#94a3b8',
    title_divider: false,
    section_upper: true,
    arrow_width: 2.4,
    arrow_colors: {
      control: '#7c3aed',
      write: '#10b981',
      read: '#2563eb',
      data: '#f97316',
      async: '#7c3aed',
      feedback: '#ef4444',
      neutral: '#6b7280',
    },
    arrow_label_bg: '#ffffff',
    arrow_label_opacity: 0.94,
    arrow_label_fill: '#6b7280',
    type_label_fill: '#9ca3af',
    type_label_size: 12,
    text_primary: '#111827',
    text_secondary: '#6b7280',
    text_muted: '#94a3b8',
    legend_fill: '#6b7280',
  },
  2: {
    name: 'Dark Terminal',
    font_family: "'SF Mono', 'Fira Code', Menlo, monospace",
    background: '#0f172a',
    shadow: false,
    title_align: 'center',
    title_fill: '#e2e8f0',
    title_size: 30,
    subtitle_fill: '#94a3b8',
    subtitle_size: 14,
    node_fill: '#111827',
    node_stroke: '#334155',
    node_radius: 10,
    node_shadow: '',
    section_fill: 'rgba(15,23,42,0.28)',
    section_stroke: '#334155',
    section_dash: '7 6',
    section_label_fill: '#38bdf8',
    section_sub_fill: '#64748b',
    title_divider: false,
    section_upper: true,
    arrow_width: 2.3,
    arrow_colors: {
      control: '#a855f7',
      write: '#22c55e',
      read: '#38bdf8',
      data: '#fb7185',
      async: '#f59e0b',
      feedback: '#f97316',
      neutral: '#94a3b8',
    },
    arrow_label_bg: '#0f172a',
    arrow_label_opacity: 0.92,
    arrow_label_fill: '#cbd5e1',
    type_label_fill: '#64748b',
    type_label_size: 12,
    text_primary: '#e2e8f0',
    text_secondary: '#94a3b8',
    text_muted: '#64748b',
    legend_fill: '#94a3b8',
  },
  3: {
    name: 'Blueprint',
    font_family: "'SF Mono', 'Fira Code', Menlo, monospace",
    background: '#082f49',
    shadow: false,
    title_align: 'center',
    title_fill: '#e0f2fe',
    title_size: 30,
    subtitle_fill: '#7dd3fc',
    subtitle_size: 14,
    node_fill: '#0b3b5e',
    node_stroke: '#67e8f9',
    node_radius: 8,
    node_shadow: '',
    section_fill: 'none',
    section_stroke: '#0ea5e9',
    section_dash: '6 4',
    section_label_fill: '#67e8f9',
    section_sub_fill: '#7dd3fc',
    title_divider: false,
    section_upper: true,
    arrow_width: 2.1,
    arrow_colors: {
      control: '#67e8f9',
      write: '#22d3ee',
      read: '#38bdf8',
      data: '#fde047',
      async: '#c084fc',
      feedback: '#fb7185',
      neutral: '#bae6fd',
    },
    arrow_label_bg: '#082f49',
    arrow_label_opacity: 0.9,
    arrow_label_fill: '#e0f2fe',
    type_label_fill: '#7dd3fc',
    type_label_size: 11,
    text_primary: '#e0f2fe',
    text_secondary: '#bae6fd',
    text_muted: '#7dd3fc',
    legend_fill: '#bae6fd',
  },
  4: {
    name: 'Notion Clean',
    font_family:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    background: '#ffffff',
    shadow: false,
    title_align: 'left',
    title_fill: '#111827',
    title_size: 18,
    subtitle_fill: '#9ca3af',
    subtitle_size: 13,
    node_fill: '#f9fafb',
    node_stroke: '#e5e7eb',
    node_radius: 4,
    node_shadow: '',
    section_fill: 'none',
    section_stroke: '#e5e7eb',
    section_dash: '',
    section_label_fill: '#9ca3af',
    section_sub_fill: '#d1d5db',
    title_divider: true,
    section_upper: true,
    arrow_width: 1.8,
    arrow_colors: {
      control: '#3b82f6',
      write: '#3b82f6',
      read: '#3b82f6',
      data: '#3b82f6',
      async: '#9ca3af',
      feedback: '#9ca3af',
      neutral: '#d1d5db',
    },
    arrow_label_bg: '#ffffff',
    arrow_label_opacity: 0.96,
    arrow_label_fill: '#6b7280',
    type_label_fill: '#9ca3af',
    type_label_size: 11,
    text_primary: '#111827',
    text_secondary: '#374151',
    text_muted: '#9ca3af',
    legend_fill: '#6b7280',
  },
  5: {
    name: 'Glassmorphism',
    font_family: "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    background: '#0f172a',
    shadow: true,
    title_align: 'center',
    title_fill: '#f8fafc',
    title_size: 30,
    subtitle_fill: '#cbd5e1',
    subtitle_size: 14,
    node_fill: 'rgba(255,255,255,0.12)',
    node_stroke: 'rgba(255,255,255,0.28)',
    node_radius: 18,
    node_shadow: 'url(#shadowGlass)',
    section_fill: 'rgba(255,255,255,0.05)',
    section_stroke: 'rgba(255,255,255,0.18)',
    section_dash: '7 6',
    section_label_fill: '#e2e8f0',
    section_sub_fill: '#94a3b8',
    title_divider: false,
    section_upper: true,
    arrow_width: 2.2,
    arrow_colors: {
      control: '#c084fc',
      write: '#34d399',
      read: '#60a5fa',
      data: '#fb923c',
      async: '#f472b6',
      feedback: '#f59e0b',
      neutral: '#cbd5e1',
    },
    arrow_label_bg: 'rgba(15,23,42,0.7)',
    arrow_label_opacity: 1,
    arrow_label_fill: '#e2e8f0',
    type_label_fill: '#cbd5e1',
    type_label_size: 12,
    text_primary: '#f8fafc',
    text_secondary: '#cbd5e1',
    text_muted: '#94a3b8',
    legend_fill: '#cbd5e1',
  },
  6: {
    name: 'Claude Official',
    font_family: "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    background: '#f8f6f3',
    shadow: false,
    title_align: 'left',
    title_fill: '#141413',
    title_size: 24,
    subtitle_fill: '#8f8a80',
    subtitle_size: 13,
    node_fill: '#fffcf7',
    node_stroke: '#d9d0c3',
    node_radius: 10,
    node_shadow: '',
    section_fill: 'none',
    section_stroke: '#ded8cf',
    section_dash: '5 4',
    section_label_fill: '#8b7355',
    section_sub_fill: '#b4aba0',
    title_divider: true,
    section_upper: true,
    arrow_width: 2.0,
    arrow_colors: {
      control: '#d97757',
      write: '#7b8b5c',
      read: '#8c6f5a',
      data: '#b45309',
      async: '#9a6fb0',
      feedback: '#d97757',
      neutral: '#8f8a80',
    },
    arrow_label_bg: '#f8f6f3',
    arrow_label_opacity: 0.96,
    arrow_label_fill: '#6b6257',
    type_label_fill: '#a29a8f',
    type_label_size: 11,
    text_primary: '#141413',
    text_secondary: '#6b6257',
    text_muted: '#a29a8f',
    legend_fill: '#6b6257',
  },
  7: {
    name: 'OpenAI',
    font_family: "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    background: '#ffffff',
    shadow: false,
    title_align: 'left',
    title_fill: '#0f172a',
    title_size: 24,
    subtitle_fill: '#64748b',
    subtitle_size: 13,
    node_fill: '#ffffff',
    node_stroke: '#dce5e3',
    node_radius: 14,
    node_shadow: '',
    section_fill: 'none',
    section_stroke: '#e2e8f0',
    section_dash: '5 4',
    section_label_fill: '#10a37f',
    section_sub_fill: '#94a3b8',
    title_divider: true,
    section_upper: true,
    arrow_width: 2.0,
    arrow_colors: {
      control: '#10a37f',
      write: '#0f766e',
      read: '#0891b2',
      data: '#f59e0b',
      async: '#64748b',
      feedback: '#10a37f',
      neutral: '#94a3b8',
    },
    arrow_label_bg: '#ffffff',
    arrow_label_opacity: 0.96,
    arrow_label_fill: '#475569',
    type_label_fill: '#94a3b8',
    type_label_size: 11,
    text_primary: '#0f172a',
    text_secondary: '#475569',
    text_muted: '#94a3b8',
    legend_fill: '#475569',
  },
}

// ---------------------------------------------------------------------------
// Node "class" (plain object factory)
// ---------------------------------------------------------------------------

/**
 * @param {string} nodeId
 * @param {string} kind
 * @param {string} shape
 * @param {Object} data
 * @param {[number,number,number,number]} bounds  [left, top, right, bottom]
 * @param {number} cx
 * @param {number} cy
 */
function makeNode(nodeId, kind, shape, data, bounds, cx, cy) {
  return { nodeId, kind, shape, data, bounds, cx, cy }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * XML-escape a string for safe embedding in SVG text content / attributes.
 * Escapes &, <, >, ", '
 * @param {string} str
 * @returns {string}
 */
function xmlEscape(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * @param {*} value
 * @param {number} [defaultVal=0]
 * @returns {number}
 */
function toFloat(value, defaultVal = 0.0) {
  const n = parseFloat(value)
  return isNaN(n) ? defaultVal : n
}

/**
 * @param {*} value
 * @returns {string}
 */
function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return xmlEscape(String(value))
}

/**
 * Deep-clone a plain object/array (no Map/Set/Date support needed).
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// ---------------------------------------------------------------------------
// Style / profile helpers
// ---------------------------------------------------------------------------

/**
 * @param {*} raw
 * @returns {[number, Object]}
 */
function parseStyle(raw) {
  let index
  if (raw === null || raw === undefined) {
    index = 1
  } else if (typeof raw === 'number') {
    index = raw
  } else {
    const text = String(raw).trim().toLowerCase()
    if (/^\d+$/.test(text)) {
      index = parseInt(text, 10)
    } else {
      const names = {}
      for (const [k, p] of Object.entries(STYLE_PROFILES)) {
        names[p.name.toLowerCase()] = parseInt(k, 10)
      }
      index = names[text] !== undefined ? names[text] : 1
    }
  }
  if (!STYLE_PROFILES[index]) {
    throw new Error(`Unsupported style: ${raw}`)
  }
  return [index, deepClone(STYLE_PROFILES[index])]
}

// ---------------------------------------------------------------------------
// Template viewBox resolution
// ---------------------------------------------------------------------------

/**
 * @param {string} templateType
 * @returns {[number, number]}
 */
function parseTemplateViewbox(templateType) {
  const templatePath = path.join(TEMPLATE_DIR, `${templateType}.svg`)
  if (fs.existsSync(templatePath)) {
    const content = fs.readFileSync(templatePath, 'utf8')
    const match = content.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])]
    }
  }
  return DEFAULT_VIEWBOX[templateType] || [960, 600]
}

// ---------------------------------------------------------------------------
// SVG <defs> — markers, filters, CSS
// ---------------------------------------------------------------------------

/**
 * @param {number} styleIndex
 * @param {Object} style
 * @returns {string}
 */
function renderDefs(styleIndex, style) {
  const markerSize = styleIndex === 4 ? '8' : '10'
  const markerHeight = styleIndex === 4 ? '6' : '7'
  const refX = styleIndex === 4 ? '7' : '9'
  const refY = styleIndex === 4 ? '3' : '3.5'
  const colorMap = style.arrow_colors

  const markerLines = []
  for (const [key, color] of Object.entries(colorMap)) {
    const markerId = MARKER_IDS[key] || 'arrowA'
    markerLines.push(
      `    <marker id="${markerId}" markerWidth="${markerSize}" markerHeight="${markerHeight}" ` +
        `refX="${refX}" refY="${refY}" orient="auto">`
    )
    if (styleIndex === 4) {
      markerLines.push(`      <polygon points="0 0, 8 3, 0 6" fill="${color}"/>`)
    } else {
      markerLines.push(`      <polygon points="0 0, 10 3.5, 0 7" fill="${color}"/>`)
    }
    markerLines.push('    </marker>')
  }

  const filters = []
  if (style.shadow) {
    filters.push(
      '    <filter id="shadowSoft" x="-20%" y="-20%" width="140%" height="160%">',
      '      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.12"/>',
      '    </filter>',
      '    <filter id="shadowGlass" x="-20%" y="-20%" width="140%" height="160%">',
      '      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#020617" flood-opacity="0.28"/>',
      '    </filter>'
    )
  }

  if (styleIndex === 3) {
    filters.push(
      '    <pattern id="blueprintGrid" width="32" height="32" patternUnits="userSpaceOnUse">',
      '      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0ea5e9" stroke-opacity="0.12" stroke-width="1"/>',
      '    </pattern>'
    )
  }

  if (styleIndex === 2) {
    filters.push(
      '    <linearGradient id="terminalGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" stop-color="#0f0f1a"/>',
      '      <stop offset="100%" stop-color="#1a1a2e"/>',
      '    </linearGradient>',
      '    <filter id="glowBlue" x="-30%" y="-30%" width="160%" height="160%">',
      '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#3b82f6" flood-opacity="0.65"/>',
      '    </filter>',
      '    <filter id="glowPurple" x="-30%" y="-30%" width="160%" height="160%">',
      '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#a855f7" flood-opacity="0.72"/>',
      '    </filter>',
      '    <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">',
      '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#22c55e" flood-opacity="0.62"/>',
      '    </filter>',
      '    <filter id="glowOrange" x="-30%" y="-30%" width="160%" height="160%">',
      '      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#f97316" flood-opacity="0.62"/>',
      '    </filter>'
    )
  }

  const styles = [
    `    text { font-family: ${style.font_family}; }`,
    `    .title { font-size: ${style.title_size}px; font-weight: 700; fill: ${style.title_fill}; }`,
    `    .subtitle { font-size: ${style.subtitle_size}px; font-weight: 500; fill: ${style.subtitle_fill}; }`,
    `    .section { font-size: 13px; font-weight: 700; fill: ${style.section_label_fill}; letter-spacing: 1.4px; }`,
    `    .section-sub { font-size: 12px; font-weight: 500; fill: ${style.section_sub_fill}; }`,
    `    .node-title { font-size: 18px; font-weight: 700; fill: ${style.text_primary}; }`,
    `    .node-sub { font-size: 12px; font-weight: 500; fill: ${style.text_secondary}; }`,
    `    .node-type { font-size: ${style.type_label_size}px; font-weight: 700; fill: ${style.type_label_fill}; letter-spacing: 0.08em; }`,
    `    .arrow-label { font-size: 12px; font-weight: 600; fill: ${style.arrow_label_fill}; }`,
    `    .legend { font-size: 12px; font-weight: 500; fill: ${style.legend_fill}; }`,
    `    .footnote { font-size: 12px; font-weight: 500; fill: ${style.text_muted}; }`,
  ]

  return [
    '  <defs>',
    ...markerLines,
    ...filters,
    '    <style>',
    ...styles,
    '    </style>',
    '  </defs>',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Canvas background
// ---------------------------------------------------------------------------

/**
 * @param {number} styleIndex
 * @param {Object} style
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function renderCanvas(styleIndex, style, width, height) {
  if (styleIndex === 2) {
    return `  <rect width="${width}" height="${height}" fill="url(#terminalGradient)"/>`
  }
  return `  <rect width="${width}" height="${height}" fill="${style.background}"/>`
}

// ---------------------------------------------------------------------------
// Title block
// ---------------------------------------------------------------------------

/**
 * @param {Object} style
 * @param {number} width
 * @returns {[number, string]}  [x, anchor]
 */
function titlePosition(style, width) {
  if (style.title_align === 'left') {
    return [48.0, 'start']
  }
  return [width / 2.0, 'middle']
}

/**
 * @param {Object} style
 * @param {Object} data
 * @param {number} width
 * @returns {[string, number]}  [svgString, contentStartY]
 */
function renderTitleBlock(style, data, width) {
  const title = normalizeText(data.title !== undefined ? data.title : 'Diagram')
  const subtitle = normalizeText(data.subtitle !== undefined ? data.subtitle : '')
  const [x, anchor] = titlePosition(style, width)

  if (anchor === 'middle') {
    const parts = [`  <text x="${x}" y="56" text-anchor="${anchor}" class="title">${title}</text>`]
    let cursorY = 82
    if (subtitle) {
      parts.push(
        `  <text x="${x}" y="${cursorY}" text-anchor="${anchor}" class="subtitle">${subtitle}</text>`
      )
      cursorY += 24
    }
    return [parts.join('\n'), cursorY + 10]
  }

  // left-aligned
  const parts = [`  <text x="${x}" y="48" text-anchor="${anchor}" class="title">${title}</text>`]
  let cursorY = 72
  if (subtitle) {
    parts.push(
      `  <text x="${x}" y="${cursorY}" text-anchor="${anchor}" class="subtitle">${subtitle}</text>`
    )
    cursorY += 18
  }
  if (style.title_divider) {
    parts.push(
      `  <line x1="48" y1="${cursorY + 10}" x2="${width - 48}" y2="${cursorY + 10}" ` +
        `stroke="${style.section_stroke}" stroke-width="1"/>`
    )
    cursorY += 26
  }
  return [parts.join('\n'), cursorY + 8]
}

// ---------------------------------------------------------------------------
// Window controls (style 2 only)
// ---------------------------------------------------------------------------

/**
 * @param {Object} data
 * @param {number} styleIndex
 * @param {number} width
 * @returns {string}
 */
function renderWindowControls(data, styleIndex, width) {
  let controls = data.window_controls
  if (!controls) return ''
  if (controls === true) controls = ['#ef4444', '#f59e0b', '#10b981']
  if (styleIndex !== 2) return ''
  let cursorX = 20.0
  const lines = []
  for (const color of controls) {
    lines.push(`  <circle cx="${cursorX}" cy="20" r="5.5" fill="${color}"/>`)
    cursorX += 18
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Header meta
// ---------------------------------------------------------------------------

/**
 * @param {Object} data
 * @param {Object} style
 * @param {number} width
 * @returns {string}
 */
function renderHeaderMeta(data, style, width) {
  const metaLeft = normalizeText(data.meta_left !== undefined ? data.meta_left : '')
  const metaCenter = normalizeText(data.meta_center !== undefined ? data.meta_center : '')
  const metaRight = normalizeText(data.meta_right !== undefined ? data.meta_right : '')
  if (!metaLeft && !metaCenter && !metaRight) return ''
  const fill = String(data.meta_fill !== undefined ? data.meta_fill : style.text_muted)
  const size = toFloat(data.meta_size !== undefined ? data.meta_size : 11)
  const lines = []
  if (metaLeft) {
    lines.push(
      `  <text x="28" y="24" font-size="${size}" font-weight="600" fill="${fill}">${metaLeft}</text>`
    )
  }
  if (metaCenter) {
    lines.push(
      `  <text x="${width / 2}" y="24" text-anchor="middle" font-size="${size}" font-weight="600" fill="${fill}">${metaCenter}</text>`
    )
  }
  if (metaRight) {
    lines.push(
      `  <text x="${width - 28}" y="24" text-anchor="end" font-size="${size}" font-weight="600" fill="${fill}">${metaRight}</text>`
    )
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Blueprint title block (style 3 only)
// ---------------------------------------------------------------------------

/**
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {[number, number, number, number]}
 */
function rectangleBounds(x, y, w, h) {
  return [x, y, x + w, y + h]
}

/**
 * @param {Object} data
 * @param {Object} style
 * @param {number} styleIndex
 * @param {number} width
 * @param {number} height
 * @returns {[string, [number,number,number,number]|null]}
 */
function renderBlueprintTitleBlock(data, style, styleIndex, width, height) {
  if (styleIndex !== 3) return ['', null]
  const block = data.blueprint_title_block
  if (!block) return ['', null]

  const blockWidth = toFloat(block.width !== undefined ? block.width : 256)
  const blockHeight = toFloat(block.height !== undefined ? block.height : 92)
  const x = toFloat(block.x !== undefined ? block.x : width - blockWidth - 28)
  const y = toFloat(block.y !== undefined ? block.y : height - blockHeight - 18)

  const titleText = normalizeText(block.title !== undefined ? block.title : data.title || '')
  const subtitleText = normalizeText(
    block.subtitle !== undefined ? block.subtitle : 'SYSTEM ARCHITECTURE'
  )
  const leftCaption = normalizeText(
    block.left_caption !== undefined ? block.left_caption : 'REV: 1.0'
  )
  const centerCaption = normalizeText(
    block.center_caption !== undefined ? block.center_caption : 'AUTO-GENERATED'
  )
  const rightCaption = normalizeText(
    block.right_caption !== undefined ? block.right_caption : 'DWG: ARCH-001'
  )

  const stroke = String(block.stroke !== undefined ? block.stroke : style.section_stroke)
  const fill = String(block.fill !== undefined ? block.fill : '#0b3552')
  const titleFill = String(block.title_fill !== undefined ? block.title_fill : style.text_primary)
  const subFill = String(
    block.subtitle_fill !== undefined ? block.subtitle_fill : style.section_label_fill
  )
  const mutedFill = String(block.muted_fill !== undefined ? block.muted_fill : style.text_muted)

  const lines = [
    `  <rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`,
    `  <line x1="${x}" y1="${y + 18}" x2="${x + blockWidth}" y2="${y + 18}" stroke="${stroke}" stroke-width="1"/>`,
    `  <line x1="${x}" y1="${y + 54}" x2="${x + blockWidth}" y2="${y + 54}" stroke="${stroke}" stroke-width="1"/>`,
    `  <text x="${x + blockWidth / 2}" y="${y + 13}" text-anchor="middle" font-size="10" font-weight="600" fill="${mutedFill}">${subtitleText}</text>`,
    `  <text x="${x + blockWidth / 2}" y="${y + 42}" text-anchor="middle" font-size="18" font-weight="700" fill="${titleFill}">${titleText}</text>`,
    `  <text x="${x + 12}" y="${y + 75}" font-size="9.5" font-weight="600" fill="${mutedFill}">${leftCaption}</text>`,
    `  <text x="${x + blockWidth / 2}" y="${y + 75}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${subFill}">${centerCaption}</text>`,
    `  <text x="${x + blockWidth - 12}" y="${y + 75}" text-anchor="end" font-size="9.5" font-weight="600" fill="${mutedFill}">${rightCaption}</text>`,
  ]

  return [lines.join('\n'), rectangleBounds(x - 6, y - 6, blockWidth + 12, blockHeight + 12)]
}

// ---------------------------------------------------------------------------
// Node normalisation
// ---------------------------------------------------------------------------

/**
 * @param {string} kind
 * @returns {string}
 */
function inferShape(kind) {
  const mapping = {
    rect: 'rect',
    double_rect: 'rect',
    cylinder: 'rect',
    document: 'rect',
    folder: 'rect',
    terminal: 'rect',
    hexagon: 'rect',
    circle_cluster: 'cluster',
    user_avatar: 'rect',
    bot: 'rect',
    speech: 'rect',
    icon_box: 'rect',
  }
  return mapping[kind] || 'rect'
}

/**
 * @param {Object} data
 * @returns {[number,number,number,number]}
 */
function nodeBounds(data) {
  const kind = String(
    data.kind !== undefined ? data.kind : data.shape !== undefined ? data.shape : 'rect'
  )
  const x = toFloat(data.x)
  const y = toFloat(data.y)
  if (kind === 'circle') {
    const r = toFloat(data.r !== undefined ? data.r : 50)
    return [x - r, y - r, x + r, y + r]
  }
  const w = toFloat(data.width !== undefined ? data.width : 180)
  const h = toFloat(data.height !== undefined ? data.height : 76)
  return [x, y, x + w, y + h]
}

/**
 * @param {Object} nodeData
 * @param {string} fallbackId
 * @returns {Object}  Node
 */
function normalizeNode(nodeData, fallbackId) {
  const kind = String(
    nodeData.kind !== undefined
      ? nodeData.kind
      : nodeData.shape !== undefined
        ? nodeData.shape
        : 'rect'
  )
  const bounds = nodeBounds(nodeData)
  const [left, top, right, bottom] = bounds
  return makeNode(
    String(nodeData.id !== undefined ? nodeData.id : fallbackId),
    kind,
    inferShape(kind),
    nodeData,
    bounds,
    (left + right) / 2,
    (top + bottom) / 2
  )
}

// ---------------------------------------------------------------------------
// Anchor / port helpers
// ---------------------------------------------------------------------------

/**
 * @param {Object} node
 * @param {string} side
 * @returns {[number,number]}
 */
function anchorOnSide(node, side) {
  const [left, top, right, bottom] = node.bounds
  const { cx, cy } = node
  const s = side.toLowerCase()
  if (s === 'left') return [left, cy]
  if (s === 'right') return [right, cy]
  if (s === 'top') return [cx, top]
  if (s === 'bottom') return [cx, bottom]
  if (s === 'top-left') return [left, top]
  if (s === 'top-right') return [right, top]
  if (s === 'bottom-left') return [left, bottom]
  if (s === 'bottom-right') return [right, bottom]
  return [cx, cy]
}

/**
 * @param {Object} node
 * @param {[number,number]} toward
 * @param {string|null} port
 * @returns {[number,number]}
 */
function anchorPoint(node, toward, port) {
  if (port) return anchorOnSide(node, port)
  const [left, top, right, bottom] = node.bounds
  const dx = toward[0] - node.cx
  const dy = toward[1] - node.cy
  const w = right - left
  const h = bottom - top
  if (Math.abs(dx) * h >= Math.abs(dy) * w) {
    return dx >= 0 ? [right, node.cy] : [left, node.cy]
  }
  return dy >= 0 ? [node.cx, bottom] : [node.cx, top]
}

/**
 * @param {[number,number,number,number]} bounds
 * @param {number} padding
 * @returns {[number,number,number,number]}
 */
function expandBounds(bounds, padding) {
  const [left, top, right, bottom] = bounds
  return [left - padding, top - padding, right + padding, bottom + padding]
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

/**
 * @param {[number,number]} p1
 * @param {[number,number]} p2
 * @param {[number,number,number,number]} bounds
 * @returns {boolean}
 */
function segmentHitsBounds(p1, p2, bounds) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [left, top, right, bottom] = bounds
  const eps = 1e-6

  if (Math.abs(y1 - y2) < eps) {
    const y = y1
    if (!(top + eps < y && y < bottom - eps)) return false
    const segLeft = Math.min(x1, x2)
    const segRight = Math.max(x1, x2)
    const overlapLeft = Math.max(segLeft, left)
    const overlapRight = Math.min(segRight, right)
    if (overlapRight - overlapLeft <= eps) return false
    if (Math.abs(overlapLeft - x1) < eps && Math.abs(overlapRight - x1) < eps) return false
    if (Math.abs(overlapLeft - x2) < eps && Math.abs(overlapRight - x2) < eps) return false
    return true
  }

  if (Math.abs(x1 - x2) < eps) {
    const x = x1
    if (!(left + eps < x && x < right - eps)) return false
    const segTop = Math.min(y1, y2)
    const segBottom = Math.max(y1, y2)
    const overlapTop = Math.max(segTop, top)
    const overlapBottom = Math.min(segBottom, bottom)
    if (overlapBottom - overlapTop <= eps) return false
    if (Math.abs(overlapTop - y1) < eps && Math.abs(overlapBottom - y1) < eps) return false
    if (Math.abs(overlapTop - y2) < eps && Math.abs(overlapBottom - y2) < eps) return false
    return true
  }

  return false
}

/**
 * @param {[number,number]} p1
 * @param {[number,number]} p2
 * @returns {'horizontal'|'vertical'|'other'}
 */
function segmentAxis(p1, p2) {
  if (Math.abs(p1[1] - p2[1]) < 1e-6) return 'horizontal'
  if (Math.abs(p1[0] - p2[0]) < 1e-6) return 'vertical'
  return 'other'
}

/**
 * @param {string|null} port
 * @returns {'horizontal'|'vertical'|null}
 */
function portAxis(port) {
  if (!port) return null
  const p = port.toLowerCase()
  if (p === 'left' || p === 'right') return 'horizontal'
  if (p === 'top' || p === 'bottom') return 'vertical'
  return null
}

/**
 * @param {[number,number]} point
 * @param {string|null} port
 * @param {number} distance
 * @returns {[number,number]}
 */
function offsetPoint(point, port, distance) {
  if (!port) return point
  const [x, y] = point
  const p = port.toLowerCase()
  if (p === 'left') return [x - distance, y]
  if (p === 'right') return [x + distance, y]
  if (p === 'top') return [x, y - distance]
  if (p === 'bottom') return [x, y + distance]
  return point
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * @param {Array<[number,number]>} points
 * @returns {number}
 */
function routeLength(points) {
  let len = 0
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.abs(points[i][0] - points[i + 1][0]) + Math.abs(points[i][1] - points[i + 1][1])
  }
  return len
}

/**
 * @param {Array<[number,number]>} points
 * @param {number} value
 * @param {'x'|'y'} axis
 * @param {number} [tolerance=1]
 * @returns {boolean}
 */
function routeUsesLane(points, value, axis, tolerance = 1.0) {
  if (axis === 'x') return points.some(([x]) => Math.abs(x - value) <= tolerance)
  return points.some(([, y]) => Math.abs(y - value) <= tolerance)
}

/**
 * @param {Array<[number,number]>} points
 * @param {number[]} hintX
 * @param {number[]} hintY
 * @param {string|null} sourcePort
 * @param {string|null} targetPort
 * @returns {number}
 */
function routeScore(points, hintX, hintY, sourcePort, targetPort) {
  const length = routeLength(points)
  const bends = Math.max(0, points.length - 2)
  let score = length + bends * 22
  if (points.length >= 2 && sourcePort) {
    const firstAxis = segmentAxis(points[0], points[1])
    if (firstAxis !== portAxis(sourcePort)) score += 180
  }
  if (points.length >= 2 && targetPort) {
    const lastAxis = segmentAxis(points[points.length - 2], points[points.length - 1])
    if (lastAxis !== portAxis(targetPort)) score += 180
  }
  for (const lane of hintX) {
    if (routeUsesLane(points, lane, 'x')) score -= 28
  }
  for (const lane of hintY) {
    if (routeUsesLane(points, lane, 'y')) score -= 28
  }
  return score
}

/**
 * @param {Array<[number,number]>} points
 * @returns {Array<[number,number]>}
 */
function simplifyPoints(points) {
  // Step 1: deduplicate consecutive identical points (rounded to 2 dp)
  const simplified = []
  for (const [x, y] of points) {
    const pt = [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]
    if (simplified.length > 0) {
      const prev = simplified[simplified.length - 1]
      if (pt[0] === prev[0] && pt[1] === prev[1]) continue
    }
    simplified.push(pt)
  }

  // Step 2: collapse collinear segments
  const collapsed = []
  for (const point of simplified) {
    if (collapsed.length < 2) {
      collapsed.push(point)
      continue
    }
    const [x0, y0] = collapsed[collapsed.length - 2]
    const [x1, y1] = collapsed[collapsed.length - 1]
    const [x2, y2] = point
    if ((x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2)) {
      collapsed[collapsed.length - 1] = point
    } else {
      collapsed.push(point)
    }
  }
  return collapsed
}

/**
 * @param {Array<[number,number]>} points
 * @param {Array<[number,number,number,number]>} obstacles
 * @returns {boolean}
 */
function routeCollides(points, obstacles) {
  for (let i = 0; i < points.length - 1; i++) {
    for (const obstacle of obstacles) {
      if (segmentHitsBounds(points[i], points[i + 1], obstacle)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Orthogonal routing
// ---------------------------------------------------------------------------

/**
 * @param {[number,number]} start
 * @param {[number,number]} end
 * @param {Array<[number,number,number,number]>} obstacles
 * @param {Object} arrowData
 * @returns {Array<[number,number]>}
 */
function buildOrthogonalRoute(start, end, obstacles, arrowData) {
  if (arrowData.route_points) {
    const rawPoints = arrowData.route_points.map(([x, y]) => [parseFloat(x), parseFloat(y)])
    return simplifyPoints([start, ...rawPoints, end])
  }

  const [sx, sy] = start
  const [ex, ey] = end
  const routingPadding = toFloat(
    arrowData.routing_padding !== undefined ? arrowData.routing_padding : 24
  )
  const portClearance = toFloat(
    arrowData.port_clearance !== undefined
      ? arrowData.port_clearance
      : Math.max(18, routingPadding * 0.85)
  )
  const sourcePort =
    String(arrowData.source_port || '')
      .trim()
      .toLowerCase() || null
  const targetPort =
    String(arrowData.target_port || '')
      .trim()
      .toLowerCase() || null

  const innerStart = offsetPoint(start, sourcePort, portClearance)
  const innerEnd = offsetPoint(end, targetPort, portClearance)
  const [ssx, ssy] = innerStart
  const [eex, eey] = innerEnd

  const expanded = obstacles.map((b) => expandBounds(b, routingPadding))

  const hintX = (arrowData.corridor_x || []).map((v) => toFloat(v))
  const hintY = (arrowData.corridor_y || []).map((v) => toFloat(v))

  // Build candidate lane values
  const laneXSet = new Set([
    ssx,
    eex,
    parseFloat(((ssx + eex) / 2).toFixed(2)),
    ...hintX,
    ...expanded.map((b) => b[0]),
    ...expanded.map((b) => b[2]),
  ])
  const laneYSet = new Set([
    ssy,
    eey,
    parseFloat(((ssy + eey) / 2).toFixed(2)),
    ...hintY,
    ...expanded.map((b) => b[1]),
    ...expanded.map((b) => b[3]),
  ])
  const laneX = [...laneXSet].sort((a, b) => a - b)
  const laneY = [...laneYSet].sort((a, b) => a - b)

  let leftRail, rightRail, topRail, bottomRail
  if (expanded.length > 0) {
    leftRail = Math.min(...expanded.map((b) => b[0])) - 24
    rightRail = Math.max(...expanded.map((b) => b[2])) + 24
    topRail = Math.min(...expanded.map((b) => b[1])) - 24
    bottomRail = Math.max(...expanded.map((b) => b[3])) + 24
  } else {
    leftRail = Math.min(ssx, eex) - 48
    rightRail = Math.max(ssx, eex) + 48
    topRail = Math.min(ssy, eey) - 48
    bottomRail = Math.max(ssy, eey) + 48
  }

  const candidates = [
    [start, innerStart, innerEnd, end],
    [start, innerStart, [eex, ssy], innerEnd, end],
    [start, innerStart, [ssx, eey], innerEnd, end],
    [start, innerStart, [(ssx + eex) / 2, ssy], [(ssx + eex) / 2, eey], innerEnd, end],
    [start, innerStart, [ssx, (ssy + eey) / 2], [eex, (ssy + eey) / 2], innerEnd, end],
    [start, innerStart, [leftRail, ssy], [leftRail, eey], innerEnd, end],
    [start, innerStart, [rightRail, ssy], [rightRail, eey], innerEnd, end],
    [start, innerStart, [ssx, topRail], [eex, topRail], innerEnd, end],
    [start, innerStart, [ssx, bottomRail], [eex, bottomRail], innerEnd, end],
  ]

  for (const lx of laneX) {
    candidates.push([start, innerStart, [lx, ssy], [lx, eey], innerEnd, end])
  }
  for (const ly of laneY) {
    candidates.push([start, innerStart, [ssx, ly], [eex, ly], innerEnd, end])
  }
  for (const lx of hintX) {
    for (const ly of hintY) {
      candidates.push([start, innerStart, [lx, ssy], [lx, ly], [eex, ly], innerEnd, end])
    }
  }

  let bestRoute = null
  let bestScore = Infinity

  for (const candidate of candidates) {
    const simplified = simplifyPoints(candidate)
    if (routeCollides(simplified, expanded)) continue
    const score = routeScore(simplified, hintX, hintY, sourcePort, targetPort)
    if (score < bestScore) {
      bestScore = score
      bestRoute = simplified
    }
  }

  if (bestRoute !== null) return bestRoute
  return simplifyPoints([start, innerStart, [eex, ssy], innerEnd, end])
}

// ---------------------------------------------------------------------------
// Label positioning
// ---------------------------------------------------------------------------

/**
 * @param {Array<[number,number]>} points
 * @returns {[number,number]}
 */
function chooseLabelPosition(points) {
  const segments = []
  for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]])
  if (!segments.length) return points[0]
  const best = segments.reduce((b, seg) => {
    const lenSeg = Math.abs(seg[0][0] - seg[1][0]) + Math.abs(seg[0][1] - seg[1][1])
    const lenB = Math.abs(b[0][0] - b[1][0]) + Math.abs(b[0][1] - b[1][1])
    return lenSeg > lenB ? seg : b
  })
  return [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2]
}

/**
 * @param {Array<[number,number]>} points
 * @returns {Array<[number,number]>}
 */
function labelPositionCandidates(points) {
  const segments = []
  for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]])
  if (!segments.length) return [points[0]]

  const ranked = [...segments].sort(
    (a, b) =>
      Math.abs(b[0][0] - b[1][0]) +
      Math.abs(b[0][1] - b[1][1]) -
      (Math.abs(a[0][0] - a[1][0]) + Math.abs(a[0][1] - a[1][1]))
  )

  const candidates = []
  for (const [[x1, y1], [x2, y2]] of ranked) {
    const length = Math.abs(x1 - x2) + Math.abs(y1 - y2)
    if (length < 34) continue
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    if (Math.abs(y1 - y2) < 1e-6) {
      candidates.push([mx, my - 16], [mx, my + 16], [mx, my - 28], [mx, my + 28], [mx, my])
    } else if (Math.abs(x1 - x2) < 1e-6) {
      candidates.push([mx - 18, my], [mx + 18, my], [mx - 30, my], [mx + 30, my], [mx, my])
    } else {
      candidates.push([mx, my - 16], [mx, my + 16], [mx, my])
    }
  }
  return candidates.length > 0 ? candidates : [chooseLabelPosition(points)]
}

/**
 * @param {[number,number,number,number]} a
 * @param {[number,number,number,number]} b
 * @param {number} [padding=0]
 * @returns {boolean}
 */
function boundsIntersect(a, b, padding = 0) {
  const [ax1, ay1, ax2, ay2] = a
  const [bx1, by1, bx2, by2] = b
  return !(
    ax2 + padding <= bx1 ||
    bx2 + padding <= ax1 ||
    ay2 + padding <= by1 ||
    by2 + padding <= ay1
  )
}

/**
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @returns {[number,number,number,number]}
 */
function estimateLabelBounds(x, y, text) {
  const w = Math.max(36, text.length * 7 + 14)
  return rectangleBounds(x - w / 2, y - 10, w, 20)
}

/**
 * @param {Array<[number,number]>} points
 * @param {string} text
 * @param {Array<[number,number,number,number]>} occupied
 * @returns {[number,number]}
 */
function chooseLabelPositionAvoiding(points, text, occupied) {
  for (const candidate of labelPositionCandidates(points)) {
    const labelBox = estimateLabelBounds(candidate[0], candidate[1], text)
    if (!occupied.some((other) => boundsIntersect(labelBox, other, 4))) {
      return candidate
    }
  }
  return chooseLabelPosition(points)
}

// ---------------------------------------------------------------------------
// Legend & footer layout
// ---------------------------------------------------------------------------

/**
 * @param {Object} data
 * @param {Array<Object>} legend
 * @param {number} width
 * @param {number} height
 * @returns {[number, number, [number,number,number,number]]|null}
 */
function legendLayout(data, legend, width, height) {
  if (!legend || !legend.length) return null
  const position = String(data.legend_position !== undefined ? data.legend_position : 'bottom-left')
  const maxLabel = Math.max(...legend.map((item) => String(item.label || '').length), 12)
  const blockWidth = 40 + maxLabel * 7 + 12
  const blockHeight = legend.length * 22 + 6

  let x, y
  if (position === 'bottom-right') {
    x = toFloat(data.legend_x !== undefined ? data.legend_x : width - blockWidth - 42)
    y = toFloat(data.legend_y !== undefined ? data.legend_y : height - (legend.length * 22 + 34))
  } else if (position === 'top-right') {
    x = toFloat(data.legend_x !== undefined ? data.legend_x : width - blockWidth - 42)
    y = toFloat(data.legend_y !== undefined ? data.legend_y : 96)
  } else if (position === 'top-left') {
    x = toFloat(data.legend_x !== undefined ? data.legend_x : 42)
    y = toFloat(data.legend_y !== undefined ? data.legend_y : 96)
  } else {
    // bottom-left (default)
    x = toFloat(data.legend_x !== undefined ? data.legend_x : 42)
    y = toFloat(data.legend_y !== undefined ? data.legend_y : height - (legend.length * 22 + 34))
  }

  return [x, y, rectangleBounds(x - 4, y - 10, blockWidth + 8, blockHeight + 12)]
}

/**
 * @param {Object} data
 * @param {number} width
 * @param {number} height
 * @returns {[number, number, [number,number,number,number]]|null}
 */
function footerLayout(data, width, height) {
  const text = String(data.footer || '').trim()
  if (!text) return null
  const footerWidth = Math.max(140, text.length * 7)
  const position = String(data.footer_position !== undefined ? data.footer_position : 'bottom-left')
  let x = toFloat(data.footer_x !== undefined ? data.footer_x : 42)
  const y = toFloat(data.footer_y !== undefined ? data.footer_y : height - 16)
  if (position === 'bottom-right') {
    x = toFloat(data.footer_x !== undefined ? data.footer_x : width - footerWidth - 42)
  }
  return [x, y, rectangleBounds(x, y - 12, footerWidth, 16)]
}

// ---------------------------------------------------------------------------
// Section (container) rendering
// ---------------------------------------------------------------------------

/**
 * @param {Object} container
 * @param {Object} style
 * @returns {string}
 */
function sectionHeaderText(container, style) {
  let text
  if (container.header_text) {
    text = String(container.header_text)
  } else {
    const label = String(container.label || '')
    const prefix = String(container.header_prefix || '').trim()
    const separator = String(
      container.header_separator !== undefined ? container.header_separator : prefix ? ' // ' : ''
    )
    text = prefix ? `${prefix}${separator}${label}` : label
  }
  if (style.section_upper && !container.preserve_case) {
    text = text.toUpperCase()
  }
  return text
}

/**
 * @param {Object} container
 * @param {Object} style
 * @returns {string}
 */
function renderSection(container, style) {
  const x = toFloat(container.x)
  const y = toFloat(container.y)
  const width = toFloat(container.width)
  const height = toFloat(container.height)
  const rx = toFloat(
    container.rx !== undefined ? container.rx : style.name !== 'Notion Clean' ? 16 : 4
  )
  const fill = String(container.fill !== undefined ? container.fill : style.section_fill)
  const stroke = String(container.stroke !== undefined ? container.stroke : style.section_stroke)
  const dash = String(
    container.stroke_dasharray !== undefined ? container.stroke_dasharray : style.section_dash
  )
  const label = sectionHeaderText(container, style)
  const subtitle = String(container.subtitle || '')
  const sideLabel = String(container.side_label || '').trim()
  const sideLabelFill = String(
    container.side_label_fill !== undefined ? container.side_label_fill : style.text_secondary
  )
  const sideLabelSize = toFloat(
    container.side_label_size !== undefined ? container.side_label_size : 14
  )
  const sideLabelWeight = String(
    container.side_label_weight !== undefined ? container.side_label_weight : '600'
  )
  const sideLabelAnchor = String(
    container.side_label_anchor !== undefined ? container.side_label_anchor : 'end'
  )

  const lines = [
    `  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"` +
      (dash ? ` stroke-dasharray="${dash}"` : '') +
      '/>',
  ]

  if (label) {
    lines.push(`  <text x="${x + 18}" y="${y + 24}" class="section">${normalizeText(label)}</text>`)
  }
  if (subtitle) {
    lines.push(
      `  <text x="${x + 18}" y="${y + 44}" class="section-sub">${normalizeText(subtitle)}</text>`
    )
  }
  if (sideLabel) {
    const sideX = toFloat(
      container.side_label_x !== undefined ? container.side_label_x : Math.max(28, x - 18)
    )
    const sideY = toFloat(
      container.side_label_y !== undefined ? container.side_label_y : y + height / 2
    )
    lines.push(
      `  <text x="${sideX}" y="${sideY}" text-anchor="${sideLabelAnchor}" dominant-baseline="middle" ` +
        `font-size="${sideLabelSize}" font-weight="${sideLabelWeight}" fill="${sideLabelFill}">${normalizeText(sideLabel)}</text>`
    )
  }
  return lines.join('\n')
}

/**
 * @param {Object} container
 * @returns {[number,number,number,number]|null}
 */
function containerHeaderBounds(container) {
  const label = String(container.header_text || container.label || '').trim()
  const subtitle = String(container.subtitle || '').trim()
  if (!label && !subtitle) return null
  const x = toFloat(container.x)
  const y = toFloat(container.y)
  const width = toFloat(container.width)
  const headerHeight = toFloat(
    container.header_height !== undefined ? container.header_height : subtitle ? 54 : 30
  )
  return rectangleBounds(x + 6, y + 6, width - 12, headerHeight)
}

// ---------------------------------------------------------------------------
// Node rendering helpers
// ---------------------------------------------------------------------------

/**
 * @param {Object} node
 * @param {number} x
 * @param {number} y
 * @param {Object} style
 * @returns {string[]}
 */
function renderTags(node, x, y, style) {
  const tags = node.tags || []
  if (!tags.length) return []
  let cursorX = x
  const lines = []
  for (const tag of tags) {
    const label = normalizeText(tag.label || '')
    const tagWidth = Math.max(62, String(tag.label || '').length * 8 + 18)
    const fill = tag.fill || '#eff6ff'
    const stroke = tag.stroke || '#bfdbfe'
    const textFill = tag.text_fill || style.arrow_colors.read
    lines.push(
      `  <rect x="${cursorX}" y="${y}" width="${tagWidth}" height="16" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
    )
    lines.push(
      `  <text x="${cursorX + tagWidth / 2}" y="${y + 11.5}" text-anchor="middle" font-size="11" font-weight="500" fill="${textFill}">${label}</text>`
    )
    cursorX += tagWidth + 8
  }
  return lines
}

// ---------------------------------------------------------------------------
// render_rect_node
// ---------------------------------------------------------------------------

/**
 * @param {Object} node
 * @param {Object} style
 * @param {string} kind
 * @returns {string}
 */
function renderRectNode(node, style, kind) {
  const x = toFloat(node.x)
  const y = toFloat(node.y)
  const width = toFloat(node.width !== undefined ? node.width : 180)
  const height = toFloat(node.height !== undefined ? node.height : 76)
  const rx = toFloat(node.rx !== undefined ? node.rx : style.node_radius)
  const fill = String(node.fill !== undefined ? node.fill : style.node_fill)
  const stroke = String(node.stroke !== undefined ? node.stroke : style.node_stroke)
  const strokeWidth = toFloat(
    node.stroke_width !== undefined ? node.stroke_width : kind !== 'rect' ? 2.0 : 1.8
  )

  const glowMap = {
    blue: 'glowBlue',
    purple: 'glowPurple',
    green: 'glowGreen',
    orange: 'glowOrange',
  }

  let filterAttr = ''
  if (node.filter) {
    filterAttr = ` filter="url(#${node.filter})"`
  } else if (node.glow && glowMap[String(node.glow)]) {
    filterAttr = ` filter="url(#${glowMap[String(node.glow)]})"`
  } else if (style.node_shadow && !node.flat) {
    filterAttr = ` filter="${style.node_shadow}"`
  }

  const title = normalizeText(node.label !== undefined ? node.label : '')
  const subtitle = normalizeText(node.sublabel !== undefined ? node.sublabel : '')
  const typeLabel = normalizeText(node.type_label !== undefined ? node.type_label : '')
  const accentFill = node.accent_fill
  const lines = []

  if (kind === 'double_rect') {
    lines.push(
      `  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
    lines.push(
      `  <rect x="${x + 6}" y="${y + 6}" width="${width - 12}" height="${height - 12}" rx="${Math.max(rx - 3, 4)}" fill="none" stroke="${stroke}" stroke-width="1.2" opacity="0.65"/>`
    )
  } else if (kind === 'terminal') {
    lines.push(
      `  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
    lines.push(
      `  <rect x="${x}" y="${y}" width="${width}" height="18" rx="${rx}" fill="${node.header_fill || '#1f2937'}" opacity="0.95"/>`
    )
    const headerDots = node.header_dots || ['#ef4444', '#f59e0b', '#10b981']
    headerDots.forEach((color, idx) => {
      lines.push(`  <circle cx="${x + 16 + idx * 14}" cy="${y + 9}" r="4" fill="${color}"/>`)
    })
    lines.push(
      `  <text x="${x + 18}" y="${y + 44}" font-size="28" font-weight="700" fill="${node.prompt_fill || '#10b981'}">$</text>`
    )
    lines.push(
      `  <text x="${x + 38}" y="${y + 44}" font-size="22" font-weight="500" fill="${style.text_secondary}">_</text>`
    )
  } else if (kind === 'document') {
    const fold = Math.min(18, width * 0.18, height * 0.22)
    const pathD = `M ${x} ${y} L ${x + width - fold} ${y} L ${x + width} ${y + fold} L ${x + width} ${y + height} L ${x} ${y + height} Z`
    lines.push(
      `  <path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
    lines.push(
      `  <path d="M ${x + width - fold} ${y} L ${x + width - fold} ${y + fold} L ${x + width} ${y + fold}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
    )
    for (let idx = 0; idx < 4; idx++) {
      const lineY = y + 26 + idx * 14
      lines.push(
        `  <line x1="${x + 18}" y1="${lineY}" x2="${x + width - 28}" y2="${lineY}" stroke="${node.line_stroke || '#c4b5fd'}" stroke-width="1.2"/>`
      )
    }
  } else if (kind === 'folder') {
    const tabW = Math.min(54, width * 0.34)
    const tabH = 18
    const pathD =
      `M ${x} ${y + tabH} L ${x + tabW * 0.4} ${y + tabH} L ${x + tabW * 0.58} ${y} ` +
      `L ${x + tabW} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
    lines.push(
      `  <path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
    for (let idx = 0; idx < 3; idx++) {
      const lineY = y + 42 + idx * 14
      lines.push(
        `  <line x1="${x + 22}" y1="${lineY}" x2="${x + width - 22}" y2="${lineY}" stroke="${node.line_stroke || stroke}" stroke-opacity="0.35" stroke-width="1.2"/>`
      )
    }
  } else if (kind === 'hexagon') {
    const inset = 22
    const pathD =
      `M ${x + inset} ${y} L ${x + width - inset} ${y} L ${x + width} ${y + height / 2} ` +
      `L ${x + width - inset} ${y + height} L ${x + inset} ${y + height} L ${x} ${y + height / 2} Z`
    lines.push(
      `  <path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
  } else if (kind === 'speech') {
    const tail = 18
    const pathD =
      `M ${x + rx} ${y} L ${x + width - rx} ${y} Q ${x + width} ${y} ${x + width} ${y + rx} ` +
      `L ${x + width} ${y + height - rx} Q ${x + width} ${y + height} ${x + width - rx} ${y + height} ` +
      `L ${x + 26} ${y + height} L ${x + 12} ${y + height + tail} L ${x + 16} ${y + height} ` +
      `L ${x + rx} ${y + height} Q ${x} ${y + height} ${x} ${y + height - rx} ` +
      `L ${x} ${y + rx} Q ${x} ${y} ${x + rx} ${y} Z`
    lines.push(
      `  <path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
  } else {
    lines.push(
      `  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr}/>`
    )
  }

  if (accentFill && kind === 'icon_box') {
    lines.push(
      `  <rect x="${x + 12}" y="${y + 12}" width="${width - 24}" height="${height - 24}" rx="${Math.max(rx - 4, 4)}" fill="${accentFill}" opacity="0.9"/>`
    )
  }

  if (kind === 'user_avatar') {
    const circleFill = node.icon_fill || '#dbeafe'
    const iconStroke = node.icon_stroke || stroke
    const cx = x + 26
    const cy = y + height / 2
    lines.push(
      `  <circle cx="${cx}" cy="${cy}" r="18" fill="${circleFill}" stroke="${iconStroke}" stroke-width="1.6"/>`
    )
    lines.push(`  <circle cx="${cx}" cy="${cy - 6}" r="5" fill="${iconStroke}"/>`)
    lines.push(
      `  <path d="M ${cx - 10} ${cy + 11} Q ${cx} ${cy + 2} ${cx + 10} ${cy + 11}" fill="none" stroke="${iconStroke}" stroke-width="2"/>`
    )
  }

  if (kind === 'bot') {
    const cx = x + width / 2
    const cy = y + height / 2 + 2
    const bodyFill = node.body_fill || '#1e293b'
    const accent = node.accent_fill || '#34d399'
    lines.push(
      `  <rect x="${cx - 42}" y="${cy - 32}" width="84" height="84" rx="18" fill="${bodyFill}" stroke="#334155" stroke-width="1.8"${filterAttr}/>`
    )
    lines.push(
      `  <rect x="${cx - 26}" y="${cy - 16}" width="52" height="22" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1.2"/>`
    )
    lines.push(`  <circle cx="${cx - 12}" cy="${cy - 5}" r="5" fill="${accent}"/>`)
    lines.push(`  <circle cx="${cx + 12}" cy="${cy - 5}" r="5" fill="${accent}"/>`)
    lines.push(
      `  <rect x="${cx - 14}" y="${cy + 14}" width="28" height="6" rx="3" fill="#334155"/>`
    )
    lines.push(
      `  <line x1="${cx}" y1="${cy - 36}" x2="${cx}" y2="${cy - 50}" stroke="${accent}" stroke-width="3"/>`
    )
    lines.push(`  <circle cx="${cx}" cy="${cy - 54}" r="5" fill="${accent}"/>`)
  }

  if (kind === 'circle_cluster') {
    const r = Math.min(width, height) / 4.0
    const centers = [
      [x + width * 0.36, y + height * 0.56],
      [x + width * 0.58, y + height * 0.45],
      [x + width * 0.74, y + height * 0.58],
    ]
    for (const [cx, cy] of centers) {
      lines.push(
        `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      )
    }
  }

  // Text positions
  const typeOffset = y + 18
  let titleY = y + height / 2 - (typeLabel && !['terminal', 'bot'].includes(kind) ? 4 : 0)
  if (['document', 'folder'].includes(kind)) {
    titleY = y + height + 26
  } else if (kind === 'circle_cluster') {
    titleY = y + height / 2 + 8
  } else if (kind === 'bot') {
    titleY = y + height + 22
  } else if (kind === 'user_avatar') {
    titleY = y + height / 2 + 6
  }

  if (typeLabel) {
    lines.push(
      `  <text x="${x + (kind === 'user_avatar' ? 54 : width / 2)}" y="${typeOffset}" text-anchor="middle" class="node-type">${typeLabel}</text>`
    )
    if (!['document', 'folder', 'circle_cluster', 'bot'].includes(kind)) titleY += 10
  }

  let titleX = x + width / 2
  let textAnchor = 'middle'
  if (kind === 'user_avatar') {
    titleX = x + 64
    textAnchor = 'start'
  }
  if (kind === 'terminal') {
    titleY = y + height - 14
  }
  if (kind === 'bot') {
    titleX = x + width / 2
    textAnchor = 'middle'
  }

  lines.push(
    `  <text x="${titleX}" y="${titleY}" text-anchor="${textAnchor}" class="node-title">${title}</text>`
  )

  if (subtitle) {
    let subY = titleY + 22
    if (kind === 'document') {
      subY = y + height + 44
      // note: Python also re-assigns titleY here, but JS titleY is local — matches behaviour
    }
    if (kind === 'folder') subY = y + height + 44
    if (kind === 'circle_cluster') subY = y + height / 2 + 28
    if (kind === 'bot') subY = y + height + 42
    if (kind === 'terminal') subY = y + height + 20
    if (kind === 'user_avatar') subY = titleY + 22
    lines.push(
      `  <text x="${titleX}" y="${subY}" text-anchor="${textAnchor}" class="node-sub">${subtitle}</text>`
    )
  }

  if (node.tags) {
    const tagX = x + 18
    let tagY = y + height - 20
    if (['document', 'folder', 'circle_cluster', 'bot', 'terminal'].includes(kind)) {
      tagY = y + height + 52
    }
    lines.push(...renderTags(node, tagX, tagY, style))
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// render_node (dispatcher)
// ---------------------------------------------------------------------------

/**
 * @param {Object} node
 * @param {Object} style
 * @returns {string}
 */
function renderNode(node, style) {
  const kind = String(
    node.kind !== undefined ? node.kind : node.shape !== undefined ? node.shape : 'rect'
  )
  if (kind === 'cylinder') {
    const x = toFloat(node.x)
    const y = toFloat(node.y)
    const width = toFloat(node.width !== undefined ? node.width : 160)
    const height = toFloat(node.height !== undefined ? node.height : 120)
    const rx = width / 2
    const ry = Math.min(18, height / 8)
    const fill = String(node.fill !== undefined ? node.fill : '#ecfdf5')
    const stroke = String(node.stroke !== undefined ? node.stroke : '#10b981')
    const strokeWidth = toFloat(node.stroke_width !== undefined ? node.stroke_width : 2.2)
    const label = normalizeText(node.label !== undefined ? node.label : '')
    const subtitle = normalizeText(node.sublabel !== undefined ? node.sublabel : '')
    const clines = [
      `  <ellipse cx="${x + width / 2}" cy="${y + ry}" rx="${rx / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
      `  <rect x="${x}" y="${y + ry}" width="${width}" height="${height - 2 * ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
      `  <ellipse cx="${x + width / 2}" cy="${y + height - ry}" rx="${rx / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
      `  <ellipse cx="${x + width / 2}" cy="${y + height * 0.38}" rx="${rx / 2}" ry="${ry}" fill="none" stroke="${stroke}" stroke-opacity="0.45" stroke-width="1.2"/>`,
      `  <ellipse cx="${x + width / 2}" cy="${y + height * 0.6}" rx="${rx / 2}" ry="${ry}" fill="none" stroke="${stroke}" stroke-opacity="0.25" stroke-width="1.2"/>`,
      `  <text x="${x + width / 2}" y="${y + height / 2 - 6}" text-anchor="middle" class="node-title">${label}</text>`,
    ]
    if (subtitle) {
      clines.push(
        `  <text x="${x + width / 2}" y="${y + height / 2 + 18}" text-anchor="middle" class="node-sub">${subtitle}</text>`
      )
    }
    return clines.join('\n')
  }
  return renderRectNode(node, style, kind)
}

// ---------------------------------------------------------------------------
// Arrow rendering
// ---------------------------------------------------------------------------

/**
 * @param {Object} style
 * @param {Object} arrowData
 * @returns {string}
 */
function colorForFlow(style, arrowData) {
  if (arrowData.color) return String(arrowData.color)
  const flow = FLOW_ALIASES[String(arrowData.flow || 'control').toLowerCase()] || 'control'
  return style.arrow_colors[flow]
}

/**
 * @param {Object} style
 * @param {string} color
 * @param {Object} arrowData
 * @returns {string}
 */
function markerForColor(style, color, arrowData) {
  if (arrowData.marker) return `url(#${arrowData.marker})`
  const colors = style.arrow_colors
  for (const [name, token] of Object.entries(colors)) {
    if (token === color) return `url(#${MARKER_IDS[name] || 'arrowA'})`
  }
  return 'url(#arrowA)'
}

/**
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {Object} style
 * @returns {string}
 */
function renderLabelBadge(x, y, text, style) {
  const w = Math.max(36, text.length * 7 + 14)
  const bg = style.arrow_label_bg
  const opacity = style.arrow_label_opacity
  return [
    `  <rect x="${(x - w / 2).toFixed(2)}" y="${(y - 10).toFixed(2)}" width="${w}" height="20" rx="6" fill="${bg}" opacity="${opacity}"/>`,
    `  <text x="${x.toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="middle" class="arrow-label">${normalizeText(text)}</text>`,
  ].join('\n')
}

/**
 * @param {Object} arrow
 * @param {Object} style
 * @param {Object.<string, Object>} nodeMap
 * @param {Array<[number,number,number,number]>} routeObstacles
 * @param {Array<[number,number,number,number]>} labelObstacles
 * @returns {[string, string, [number,number,number,number]|null]}
 */
function renderArrow(arrow, style, nodeMap, routeObstacles, labelObstacles) {
  const startHint = [toFloat(arrow.x1), toFloat(arrow.y1)]
  const endHint = [toFloat(arrow.x2), toFloat(arrow.y2)]

  const sourceNode = arrow.source ? nodeMap[String(arrow.source)] || null : null
  const targetNode = arrow.target ? nodeMap[String(arrow.target)] || null : null
  const sourcePort = arrow.source_port ? String(arrow.source_port) : null
  const targetPort = arrow.target_port ? String(arrow.target_port) : null

  let start, end
  if (sourceNode) {
    const toward = targetNode ? [targetNode.cx, targetNode.cy] : endHint
    start = anchorPoint(sourceNode, toward, sourcePort)
  } else {
    start = startHint
  }
  if (targetNode) {
    const toward = sourceNode ? [sourceNode.cx, sourceNode.cy] : startHint
    end = anchorPoint(targetNode, toward, targetPort)
  } else {
    end = endHint
  }

  let obstacles = [...routeObstacles]
  if (sourceNode)
    obstacles = obstacles.filter(
      (b) =>
        !(
          b[0] === sourceNode.bounds[0] &&
          b[1] === sourceNode.bounds[1] &&
          b[2] === sourceNode.bounds[2] &&
          b[3] === sourceNode.bounds[3]
        )
    )
  if (targetNode)
    obstacles = obstacles.filter(
      (b) =>
        !(
          b[0] === targetNode.bounds[0] &&
          b[1] === targetNode.bounds[1] &&
          b[2] === targetNode.bounds[2] &&
          b[3] === targetNode.bounds[3]
        )
    )

  const route = buildOrthogonalRoute(start, end, obstacles, arrow)
  const pathD = 'M ' + route.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' L ')
  const color = colorForFlow(style, arrow)
  const width = toFloat(arrow.stroke_width !== undefined ? arrow.stroke_width : style.arrow_width)

  let dash = arrow.stroke_dasharray !== undefined ? arrow.stroke_dasharray : null
  if (dash === null && arrow.dashed) dash = '6,4'

  const marker = markerForColor(style, color, arrow)
  let pathSvg = `  <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${width}" marker-end="${marker}"`
  if (dash) pathSvg += ` stroke-dasharray="${dash}"`
  if (arrow.opacity !== undefined) pathSvg += ` opacity="${arrow.opacity}"`
  pathSvg += '/>'

  let labelSvg = ''
  let labelBounds = null
  const label = String(arrow.label || '').trim()
  if (label) {
    let [labelX, labelY] = chooseLabelPositionAvoiding(route, label, labelObstacles)
    labelX += toFloat(arrow.label_dx !== undefined ? arrow.label_dx : 0)
    labelY += toFloat(arrow.label_dy !== undefined ? arrow.label_dy : -4)
    labelSvg = renderLabelBadge(labelX, labelY, label, style)
    labelBounds = estimateLabelBounds(labelX, labelY, label)
  }

  return [pathSvg, labelSvg, labelBounds]
}

// ---------------------------------------------------------------------------
// Legend & footer rendering
// ---------------------------------------------------------------------------

/**
 * @param {Array<Object>} legend
 * @param {Object} style
 * @param {number} width
 * @param {number} height
 * @param {Object} data
 * @returns {string}
 */
function renderLegend(legend, style, width, height, data) {
  const layout = legendLayout(data, legend, width, height)
  if (!layout) return ''
  const [legendX, legendY] = layout
  const lines = []
  legend.forEach((item, idx) => {
    const y = legendY + idx * 22
    let color = item.color
    if (!color) {
      const flow = FLOW_ALIASES[String(item.flow || 'control').toLowerCase()] || 'control'
      color = style.arrow_colors[flow]
    }
    const marker = markerForColor(style, String(color), { flow: item.flow || 'control' })
    lines.push(
      `  <line x1="${legendX}" y1="${y}" x2="${legendX + 30}" y2="${y}" stroke="${color}" stroke-width="${style.arrow_width}" marker-end="${marker}"/>`
    )
    lines.push(
      `  <text x="${legendX + 40}" y="${y + 4}" class="legend">${normalizeText(item.label || '')}</text>`
    )
  })

  if (data.legend_box) {
    const maxLabel = Math.max(...legend.map((item) => String(item.label || '').length), 12)
    const blockWidth = 40 + maxLabel * 7 + 12
    const blockHeight = legend.length * 22 + 6
    const bg = data.legend_box_fill !== undefined ? data.legend_box_fill : style.arrow_label_bg
    const opacity = data.legend_box_opacity !== undefined ? data.legend_box_opacity : 0.88
    lines.unshift(
      `  <rect x="${legendX - 10}" y="${legendY - 14}" width="${blockWidth + 20}" height="${blockHeight + 18}" rx="10" fill="${bg}" opacity="${opacity}"/>`
    )
  }

  return lines.join('\n')
}

/**
 * @param {Object} data
 * @param {Object} style
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function renderFooter(data, style, width, height) {
  const layout = footerLayout(data, width, height)
  if (!layout) return ''
  const [x, y] = layout
  const text = String(data.footer || '').trim()
  return `  <text x="${x}" y="${y}" class="footnote">${normalizeText(text)}</text>`
}

// ---------------------------------------------------------------------------
// build_svg — main assembler
// ---------------------------------------------------------------------------

/**
 * @param {string} templateType
 * @param {Object} data
 * @returns {string}
 */
function buildSvg(templateType, data) {
  const [styleIndex, style] = parseStyle(data.style)
  if (data.style_overrides) {
    Object.assign(style, data.style_overrides)
  }

  let [width, height] = parseTemplateViewbox(templateType)
  width = toFloat(data.width !== undefined ? data.width : width)
  height = toFloat(data.height !== undefined ? data.height : height)
  if (data.viewBox) {
    const m = String(data.viewBox).match(/^0 0 ([0-9.]+) ([0-9.]+)$/)
    if (m) {
      width = parseFloat(m[1])
      height = parseFloat(m[2])
    }
  }

  const containers = data.containers || []
  const nodesData = data.nodes || []
  const arrowsData = data.arrows || []
  const legend = data.legend || []

  const normalizedNodes = nodesData.map((n, idx) => normalizeNode(n, `node-${idx}`))
  const nodeMap = {}
  for (const n of normalizedNodes) nodeMap[n.nodeId] = n

  const defs = renderDefs(styleIndex, style)
  const canvas = renderCanvas(styleIndex, style, width, height)
  const [titleBlock, contentStartY] = renderTitleBlock(style, data, width)
  const windowControls = renderWindowControls(data, styleIndex, width)
  const headerMeta = renderHeaderMeta(data, style, width)

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.trunc(width)} ${Math.trunc(height)}" width="${Math.trunc(width)}" height="${Math.trunc(height)}">`,
    defs,
    canvas,
  ]
  if (windowControls) lines.push(windowControls)
  if (headerMeta) lines.push(headerMeta)
  lines.push(titleBlock)

  for (const container of containers) {
    lines.push(renderSection(container, style))
  }

  // Compute obstacles
  const sectionObstacles = containers.map((c) => containerHeaderBounds(c)).filter((b) => b !== null)

  const legendReserved = legendLayout(data, legend, width, height)
  const footerReserved = footerLayout(data, width, height)
  const [blueprintBlockSvg, blueprintBlockBounds] = renderBlueprintTitleBlock(
    data,
    style,
    styleIndex,
    width,
    height
  )

  const reservedBounds = [...sectionObstacles]
  if (legendReserved) reservedBounds.push(legendReserved[2])
  if (footerReserved) reservedBounds.push(footerReserved[2])
  if (blueprintBlockBounds) reservedBounds.push(blueprintBlockBounds)

  const nodeObstacles = normalizedNodes.map((n) => n.bounds)
  const routeObstacles = [...nodeObstacles, ...reservedBounds]
  let labelObstacles = [...nodeObstacles, ...reservedBounds]

  const arrowPaths = []
  const arrowLabels = []
  for (const arrow of arrowsData) {
    const [pathSvg, labelSvg, labelBounds] = renderArrow(
      arrow,
      style,
      nodeMap,
      routeObstacles,
      labelObstacles
    )
    arrowPaths.push(pathSvg)
    if (labelSvg) arrowLabels.push(labelSvg)
    if (labelBounds) labelObstacles.push(labelBounds)
  }

  for (const p of arrowPaths) if (p) lines.push(p)

  for (const nodeData of nodesData) {
    if (nodeData.y === undefined && nodeData.auto_place) {
      nodeData.y = contentStartY + toFloat(nodeData.offset_y !== undefined ? nodeData.offset_y : 0)
    }
    lines.push(renderNode(nodeData, style))
  }

  for (const lbl of arrowLabels) if (lbl) lines.push(lbl)

  const legendSvg = renderLegend(legend, style, width, height, data)
  if (legendSvg) lines.push(legendSvg)

  if (blueprintBlockSvg) lines.push(blueprintBlockSvg)

  const footerSvg = renderFooter(data, style, width, height)
  if (footerSvg) lines.push(footerSvg)

  lines.push('</svg>')
  return lines.filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    process.stderr.write(
      'Usage: node generate-from-template.js <template-type> <output-path> [data-json]\n'
    )
    process.exit(1)
  }

  const templateType = args[0]
  const outputPath = args[1]

  let data
  try {
    if (args.length > 2) {
      data = JSON.parse(args[2])
    } else {
      const stdin = fs.readFileSync('/dev/stdin', 'utf8')
      data = JSON.parse(stdin)
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      process.stderr.write(`Error: Invalid JSON: ${err.message}\n`)
      process.exit(1)
    }
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }

  let svgContent
  try {
    svgContent = buildSvg(templateType, data)
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }

  try {
    fs.writeFileSync(outputPath, svgContent, 'utf8')
    process.stdout.write(`SVG generated: ${outputPath}\n`)
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }
}

main()
