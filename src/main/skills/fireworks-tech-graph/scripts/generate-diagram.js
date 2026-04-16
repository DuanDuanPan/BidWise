#!/usr/bin/env node
/**
 * SVG Diagram Generation (Node.js port of generate-diagram.sh)
 * Validates and exports SVG diagrams with PNG export.
 *
 * Usage: node generate-diagram.js [OPTIONS]
 *   -t, --type TYPE        Diagram type
 *   -s, --style STYLE      Style number (1-7, default: 1)
 *   -o, --output PATH      Output path (default: current directory)
 *   -w, --width WIDTH      PNG width in pixels (default: 1920)
 *   --no-validate          Skip validation
 *   -h, --help             Show help
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const RED = '\x1b[0;31m'
const GREEN = '\x1b[0;32m'
const YELLOW = '\x1b[1;33m'
const BLUE = '\x1b[0;34m'
const NC = '\x1b[0m'

const VALID_TYPES = [
  'architecture',
  'data-flow',
  'flowchart',
  'sequence',
  'comparison',
  'timeline',
  'mind-map',
  'agent',
  'memory',
  'use-case',
  'class',
  'state-machine',
  'er-diagram',
  'network-topology',
]

function usage() {
  console.log(`Usage: node generate-diagram.js [OPTIONS]

Options:
    -t, --type TYPE        Diagram type (${VALID_TYPES.join('|')})
    -s, --style STYLE      Style number (1-7, default: 1)
    -o, --output PATH      Output path (default: current directory)
    -w, --width WIDTH      PNG width in pixels (default: 1920)
    --no-validate          Skip validation
    -h, --help             Show this help

Examples:
    node generate-diagram.js -t architecture -s 1 -o ./output/arch.svg
    node generate-diagram.js -t class -s 2 -w 2400`)
  process.exit(0)
}

// Parse arguments
const args = process.argv.slice(2)
let type = null
let style = '1'
let outputPath = null
let width = '1920'
let validate = true

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-t':
    case '--type':
      type = args[++i]
      break
    case '-s':
    case '--style':
      style = args[++i]
      break
    case '-o':
    case '--output':
      outputPath = args[++i]
      break
    case '-w':
    case '--width':
      width = args[++i]
      break
    case '--no-validate':
      validate = false
      break
    case '-h':
    case '--help':
      usage()
      break
    default:
      console.log(`${RED}Unknown option: ${args[i]}${NC}`)
      usage()
  }
}

if (!type) {
  console.log(`${RED}Error: Diagram type is required${NC}`)
  usage()
}

if (!VALID_TYPES.includes(type)) {
  console.log(`${RED}Error: Invalid diagram type '${type}'${NC}`)
  console.log(`Valid types: ${VALID_TYPES.join('|')}`)
  process.exit(1)
}

// Determine output paths
let svgFile, pngFile
if (!outputPath) {
  const basename = `${type}-style${style}`
  svgFile = `./${basename}.svg`
  pngFile = `./${basename}.png`
} else {
  svgFile = outputPath
  pngFile = outputPath.replace(/\.svg$/, '.png')
}

console.log(`${BLUE}Generating ${type} diagram (style ${style})...${NC}`)
console.log(`Output: ${svgFile}`)

// Load style reference
const skillDir = path.resolve(__dirname, '..')
const refsDir = path.join(skillDir, 'references')

let styleFile = null
try {
  const entries = fs.readdirSync(refsDir)
  styleFile = entries.find((f) => f.startsWith(`style-${style}-`) && f.endsWith('.md'))
} catch {
  /* ignore */
}

if (!styleFile) {
  console.log(`${RED}Error: Style file not found for style ${style}${NC}`)
  console.log('Available styles: 1-7')
  process.exit(1)
}

console.log(`${YELLOW}Note: SVG content generation requires AI agent${NC}`)
console.log(`${YELLOW}This script provides validation and export only${NC}`)

// Validate if SVG exists
if (fs.existsSync(svgFile)) {
  if (validate) {
    console.log(`\n${BLUE}Validating SVG...${NC}`)
    const validateScript = path.join(__dirname, 'validate-svg.js')
    try {
      execSync(`node "${validateScript}" "${svgFile}"`, { stdio: 'inherit' })
      console.log(`${GREEN}Validation passed${NC}`)
    } catch {
      console.log(`${RED}Validation failed${NC}`)
      process.exit(1)
    }
  }

  // Export PNG
  console.log(`\n${BLUE}Exporting PNG (width: ${width}px)...${NC}`)
  try {
    execSync(`rsvg-convert -w ${width} "${svgFile}" -o "${pngFile}" 2>/dev/null`, { stdio: 'pipe' })
    const stats = fs.statSync(pngFile)
    const sizeKb = Math.round(stats.size / 1024)
    console.log(`${GREEN}PNG exported: ${pngFile} (${sizeKb}KB)${NC}`)
  } catch (err) {
    if (err.status === 127) {
      console.log(`${RED}Error: rsvg-convert not found${NC}`)
      console.log('Install with: brew install librsvg')
    } else {
      console.log(`${RED}PNG export failed${NC}`)
    }
    process.exit(1)
  }
} else {
  console.log(`${YELLOW}SVG file not found. Generate it first with AI agent.${NC}`)
  process.exit(1)
}

console.log(`\n${GREEN}Done${NC}`)
