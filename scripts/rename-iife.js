#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const dist = path.join(process.cwd(), 'dist')
const from = path.join(dist, 'index.global.js')
const fromMap = path.join(dist, 'index.global.js.map')
const to = path.join(dist, 'inops.min.js')
const toMap = path.join(dist, 'inops.min.js.map')

if (fs.existsSync(from)) {
  fs.copyFileSync(from, to)
  if (fs.existsSync(fromMap)) fs.copyFileSync(fromMap, toMap)
}

