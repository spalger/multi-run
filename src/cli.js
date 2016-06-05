#!/usr/bin/env node

import blessed from 'blessed'
import { spawn } from 'child_process'
import { resolve, delimiter as pdelim } from 'path'
import h from 'highland'

const pkg = require(resolve(process.cwd(), 'package.json'))
const pkgBin = resolve(process.cwd(), 'node_modules/.bin')

const scripts = pkg.scripts || {}
const tasks = process.argv.slice(2).map(n => {
  if (!scripts[n]) {
    throw new Error(`missing script named ${n}`)
  }

  return scripts[n]
})

const running = new Set()
let exitAttempts = 0

if (!tasks.length) {
  process.stderr.write('usage: mrun task [...tasks]\n')
  process.exit(1)
}

const statusLabel = s => {
  if (s > 0) {
    return blessed.parseTags('{red-fg}𝘅{/red-fg}')
  }

  return blessed.parseTags('{green-fg}✔{/green-fg}')
}

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
  autoPadding: true,
  dockBorders: true,
  fullUnicode: true,
  title: `mrun: ${tasks.join(', ')}`,
})

const layout = blessed.layout({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
})

tasks.forEach(t => {
  const box = blessed.box({
    parent: layout,
    width: '100%',
    alwaysScroll: true,
    scrollable: true,
    mouse: true,
    keyable: true,
    clickable: true,
    scrollbar: {
      ch: '█',
      track: {
        ch: '▕',
      },
    },
    height: `${Math.round(100 / tasks.length)}%`,
    border: 'line',
    label: t,
  })

  const env = { ...process.env, FORCE_COLOR: true }
  env.PATH = env.PATH
    ? `${pkgBin}${pdelim}${env.PATH}`
    : pkgBin

  const proc = spawn(t, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: true,
    env,
  })

  running.add(proc)

  h([
    h(proc.stdout),
    h(proc.stderr),
    h((push) => {
      proc.once('close', status => {
        running.delete(proc)

        if (exitAttempts) {
          // we triggered the exit, no
          // need to log... it'd fail anyway
          return
        }

        box.setLabel(` ${statusLabel(status)} ${t}`)
        push(null, `exitted with status ${status}\n`)
        push(null, h.nil)
      })
    }),
  ])
  .merge()
  .split()
  .each(l => {
    const scrollPerc = box.getScrollPerc()
    const atTop = scrollPerc === 0
    const atBottom = scrollPerc === 100
    const lineCount = box._clines ? box._clines.length : 0
    const willOverflow = atTop && lineCount === box.getScrollHeight()
    const shouldScroll = atBottom || willOverflow

    box.insertBottom(l)
    if (shouldScroll) box.scroll(1)
    screen.render()
  })
})

// Render the screen.
screen.render()

function exit() {
  if (exitAttempts > 0) return

  const program = screen.program
  screen.destroy()
  program.destroy()

  ;(function gracefullExit() {
    if (!running.size) return
    if (exitAttempts >= 20 && exitAttempts % 20 === 0) {
      process.stdout.write('still trying to close tasks...\n')
    }

    exitAttempts += 1
    for (const proc of running) {
      process.kill(-proc.pid)
    }

    setTimeout(gracefullExit, 100)
  }())
}

process.on('SIGINT', exit)
process.on('SIGTERM', exit)
process.on('SIGHUP', exit)
process.on('exit', exit)
screen.key(['escape', 'q', 'C-c'], exit)
