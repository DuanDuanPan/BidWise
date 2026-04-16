#!/usr/bin/env node
/**
 * SVG Validation Script (Node.js port of validate-svg.sh)
 * Checks SVG syntax and reports detailed errors.
 *
 * Usage: node validate-svg.js <svg-file>
 */

'use strict'

const fs = require('fs')
const { execSync } = require('child_process')
const path = require('path')

const RED = '\x1b[0;31m'
const GREEN = '\x1b[0;32m'
const YELLOW = '\x1b[1;33m'
const NC = '\x1b[0m'

const svgFile = process.argv[2]
if (!svgFile) {
  console.log('Usage: node validate-svg.js <svg-file>')
  process.exit(1)
}

if (!fs.existsSync(svgFile)) {
  console.log(`${RED}Error: File not found: ${svgFile}${NC}`)
  process.exit(1)
}

console.log(`Validating SVG: ${svgFile}`)
console.log('----------------------------------------')

let failures = 0
const content = fs.readFileSync(svgFile, 'utf-8')

// Check 0: XML syntax (via xmllint if available)
process.stdout.write('Checking XML syntax... ')
try {
  execSync(`xmllint --noout "${svgFile}" 2>/dev/null`, { stdio: 'pipe' })
  console.log(`${GREEN}✓ Pass${NC}`)
} catch (err) {
  if (err.status === 127) {
    console.log(`${YELLOW}⚠ Skipped${NC} (xmllint not found)`)
  } else {
    console.log(`${RED}✗ Fail${NC}`)
    failures++
  }
}

// Check 1: Tag balance
process.stdout.write('Checking tag balance... ')
const openTags = (content.match(/<[A-Za-z][A-Za-z0-9:-]*/g) || []).filter(
  (t) => !t.startsWith('</')
).length
const selfClosing = (content.match(/\/>/g) || []).length
const closeTags = (content.match(/<\/[A-Za-z][A-Za-z0-9:-]*>/g) || []).length
const totalClose = selfClosing + closeTags

if (openTags === totalClose) {
  console.log(`${GREEN}✓ Pass${NC} (${openTags} tags)`)
} else {
  console.log(`${RED}✗ Fail${NC} (${openTags} open, ${totalClose} close)`)
  failures++
}

// Check 2: Quote check
process.stdout.write('Checking attribute quotes... ')
const unquoted = (content.match(/[a-z-]+=[^"'> ]/g) || []).length
if (unquoted === 0) {
  console.log(`${GREEN}✓ Pass${NC}`)
} else {
  console.log(`${RED}✗ Fail${NC} (${unquoted} unquoted attributes)`)
  failures++
}

// Check 3: Unescaped entities in text
process.stdout.write('Checking text entities... ')
const textChunks = content.match(/>([^<]*)</g) || []
let entityIssues = 0
for (const chunk of textChunks) {
  const inner = chunk.slice(1, -1)
  const cleaned = inner.replace(/&(amp|lt|gt|quot|apos);/g, '')
  if (cleaned.includes('&')) entityIssues++
}
if (entityIssues === 0) {
  console.log(`${GREEN}✓ Pass${NC}`)
} else {
  console.log(`${YELLOW}⚠ Warning${NC} (${entityIssues} potential unescaped entities)`)
}

// Check 4: Marker references
process.stdout.write('Checking marker references... ')
const markerRefs = new Set(
  (content.match(/marker-end="url\(#([^)]+)\)"/g) || []).map((m) => {
    const match = m.match(/#([^)]+)/)
    return match ? match[1] : ''
  })
)
const markerDefs = new Set(
  (content.match(/<marker id="([^"]+)"/g) || []).map((m) => {
    const match = m.match(/id="([^"]+)"/)
    return match ? match[1] : ''
  })
)

let missingMarkers = 0
for (const ref of markerRefs) {
  if (ref && !markerDefs.has(ref)) {
    console.log(`${RED}✗ Missing marker: ${ref}${NC}`)
    missingMarkers++
  }
}
if (missingMarkers === 0) {
  console.log(`${GREEN}✓ Pass${NC}`)
} else {
  console.log(`${RED}✗ Fail${NC} (${missingMarkers} missing markers)`)
  failures++
}

// Check 5: Arrow-component collision detection
process.stdout.write('Checking arrow collisions... ')
const collisions = checkArrowCollisions(content)
if (collisions === 0) {
  console.log(`${GREEN}✓ Pass${NC}`)
} else {
  console.log(`${RED}✗ Fail${NC} (${collisions} arrow path collision(s))`)
  failures++
}

// Check 6: Closing </svg> tag
process.stdout.write('Checking closing tag... ')
if (content.includes('</svg>')) {
  console.log(`${GREEN}✓ Pass${NC}`)
} else {
  console.log(`${RED}✗ Fail${NC} (missing </svg>)`)
  failures++
}

// Check 7: rsvg-convert validation
process.stdout.write('Running rsvg-convert validation... ')
try {
  execSync(`rsvg-convert "${svgFile}" -o /tmp/test-output.png 2>/dev/null`, { stdio: 'pipe' })
  console.log(`${GREEN}✓ Pass${NC}`)
  try {
    fs.unlinkSync('/tmp/test-output.png')
  } catch {
    /* ignore */
  }
} catch (err) {
  if (err.status === 127) {
    console.log(`${YELLOW}⚠ Skipped${NC} (rsvg-convert not found)`)
  } else {
    console.log(`${RED}✗ Fail${NC}`)
    failures++
  }
}

console.log('----------------------------------------')
if (failures === 0) {
  console.log('Validation complete')
  process.exit(0)
}

console.log(`${RED}Validation failed (${failures} error(s))${NC}`)
process.exit(1)

// ─── Arrow-Component Collision Detection ───

function toFloat(value, defaultVal = 0) {
  const n = parseFloat(value)
  return isNaN(n) ? defaultVal : n
}

function isContainerRect(attrs) {
  if (attrs['stroke-dasharray']) return true
  const w = toFloat(attrs.width)
  const h = toFloat(attrs.height)
  if (w > 700 || h > 500) return true
  if (w < 70 || h < 30) return true
  return false
}

function extractAttrs(tag) {
  const attrs = {}
  const re = /(\w[\w-]*)="([^"]*)"/g
  let m
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

function parsePathPoints(d) {
  if (!d) return []
  const tokens = d.match(/[ML]|-?\d+(?:\.\d+)?/g)
  if (!tokens) return []
  const points = []
  let cmd = null
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] === 'M' || tokens[i] === 'L') {
      cmd = tokens[i]
      i++
      continue
    }
    if ((cmd !== 'M' && cmd !== 'L') || i + 1 >= tokens.length) return []
    points.push([parseFloat(tokens[i]), parseFloat(tokens[i + 1])])
    i += 2
  }
  return points
}

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
    const oLeft = Math.max(segLeft, left)
    const oRight = Math.min(segRight, right)
    if (oRight - oLeft <= eps) return false
    if (Math.abs(oLeft - x1) < eps || Math.abs(oRight - x2) < eps) return false
    if (Math.abs(oLeft - x2) < eps || Math.abs(oRight - x1) < eps) return false
    return true
  }

  if (Math.abs(x1 - x2) < eps) {
    const x = x1
    if (!(left + eps < x && x < right - eps)) return false
    const segTop = Math.min(y1, y2)
    const segBot = Math.max(y1, y2)
    const oTop = Math.max(segTop, top)
    const oBot = Math.min(segBot, bottom)
    if (oBot - oTop <= eps) return false
    if (Math.abs(oTop - y1) < eps || Math.abs(oBot - y2) < eps) return false
    if (Math.abs(oTop - y2) < eps || Math.abs(oBot - y1) < eps) return false
    return true
  }

  return false
}

function checkArrowCollisions(svgContent) {
  // Extract obstacle rects, circles, ellipses
  const obstacles = []

  const rectRe = /<rect\s[^>]*>/g
  let m
  while ((m = rectRe.exec(svgContent)) !== null) {
    const attrs = extractAttrs(m[0])
    if (isContainerRect(attrs)) continue
    const x = toFloat(attrs.x)
    const y = toFloat(attrs.y)
    const w = toFloat(attrs.width)
    const h = toFloat(attrs.height)
    if (w > 0 && h > 0) obstacles.push([x, y, x + w, y + h])
  }

  const circleRe = /<circle\s[^>]*>/g
  while ((m = circleRe.exec(svgContent)) !== null) {
    const attrs = extractAttrs(m[0])
    const r = toFloat(attrs.r)
    if (r < 20) continue
    const cx = toFloat(attrs.cx)
    const cy = toFloat(attrs.cy)
    obstacles.push([cx - r, cy - r, cx + r, cy + r])
  }

  const ellipseRe = /<ellipse\s[^>]*>/g
  while ((m = ellipseRe.exec(svgContent)) !== null) {
    const attrs = extractAttrs(m[0])
    const rx = toFloat(attrs.rx)
    const ry = toFloat(attrs.ry)
    if (rx < 20 || ry < 20) continue
    const cx = toFloat(attrs.cx)
    const cy = toFloat(attrs.cy)
    obstacles.push([cx - rx, cy - ry, cx + rx, cy + ry])
  }

  // Check arrows (lines and paths with marker-end)
  let collisionCount = 0
  const arrowRe = /<(line|path)\s[^>]*marker-end[^>]*>/g
  while ((m = arrowRe.exec(svgContent)) !== null) {
    const attrs = extractAttrs(m[0])
    let points
    if (m[1] === 'line') {
      points = [
        [toFloat(attrs.x1), toFloat(attrs.y1)],
        [toFloat(attrs.x2), toFloat(attrs.y2)],
      ]
    } else {
      points = parsePathPoints(attrs.d)
    }
    if (points.length < 2) continue

    let collides = false
    for (let i = 0; i < points.length - 1; i++) {
      if (obstacles.some((b) => segmentHitsBounds(points[i], points[i + 1], b))) {
        collides = true
        break
      }
    }
    if (collides) collisionCount++
  }

  return collisionCount
}
