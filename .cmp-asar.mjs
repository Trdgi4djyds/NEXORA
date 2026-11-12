import * as asar from '@electron/asar'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const pub = '/tmp/r5/x/resources/app.asar'
const out = '/tmp/r5/app'
if (!fs.existsSync(out)) asar.extractAll(pub, out)
const h = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const walk = (d, b = d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, b, acc); else acc.push(path.relative(b, p)) } return acc }
const A = new Set(walk(out)), L = new Set(walk('nexora/app'))
const diff = [], onlyPub = [], onlyLoc = []
for (const f of A) { if (!L.has(f)) onlyPub.push(f); else if (h(path.join(out, f)) !== h(path.join('nexora/app', f))) diff.push(f) }
for (const f of L) if (!A.has(f)) onlyLoc.push(f)
console.log('publies', A.size, 'locaux', L.size)
console.log('DIFFERENTS', diff.length, diff.join('\n'))
console.log('SEULEMENT PUBLIES', onlyPub.length, onlyPub.slice(0, 60).join('\n'))
console.log('SEULEMENT LOCAUX', onlyLoc.length, onlyLoc.slice(0, 60).join('\n'))
