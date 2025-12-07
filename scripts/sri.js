#!/usr/bin/env node
/**
 * Compute SHA-384 SRI for the built IIFE bundle.
 * Usage: node scripts/sri.js [path], defaults to dist/inops.min.js
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const arg = process.argv[2]
let target = arg
  ? path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg)
  : path.join(process.cwd(), 'dist', 'inops.min.js')

// fallback to common alternative name
if (!fs.existsSync(target)) {
  const alt = path.join(process.cwd(), 'dist', 'index.global.js')
  if (fs.existsSync(alt)) target = alt
}

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`)
  process.exit(1)
}
const buf = fs.readFileSync(target)
const hash = crypto.createHash('sha384').update(buf).digest('base64')
const sri = `sha384-${hash}`
console.log(sri)

