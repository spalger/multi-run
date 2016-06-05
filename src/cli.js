#!/usr/bin/env node

import blessed from 'blessed'
import { spawn } from 'child_process'
import h from 'highland'

const tasks = process.argv.slice(2)

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
    height: `${Math.round(100 / tasks.length)}%`,
    border: 'line',
    label: t,
  })

  const proc = spawn('npm', ['run', t], {
    stdio: 'pipe',
  })

  box.insertBottom('started')

  h([
    h([
      h(proc.stdout),
      h(proc.stderr),
    ])
    .merge()
    .split(),

    h((push) => {
      proc.once('close', status => {
        box.setLabel(` ${statusLabel(status)} ${t}`)
        push(null, `exitted with status ${status}`)
        push(null, h.nil)
      })
    }),
  ])
  .merge()
  .each(l => {
    box.insertBottom(l)
    screen.render()
  })
})

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], () => {
  process.exit(0)
})

// Render the screen.
screen.render()
