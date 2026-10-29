// Temporary Windows probe: run the real playground via the Vite CLI, let Electron quit by itself,
// and sample the process table to see which processes survive.
import { execFileSync, spawn } from 'node:child_process'

const auto = process.argv[2] ?? 'quit'
const headless = process.argv[3] === 'headless'

function table() {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'electron|node' } | ForEach-Object { '' + $_.ProcessId + '|' + $_.ParentProcessId + '|' + $_.Name + '|' + $_.CommandLine }",
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, name, ...cmd] = line.split('|')
      return { pid: Number(pid), ppid: Number(ppid), name, cmd: cmd.join('|').slice(0, 160) }
    })
    .filter((p) => p.pid !== process.pid && !p.cmd.includes('Get-CimInstance'))
}

const before = new Set(table().map((p) => p.pid))
const host = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PROBE_AUTO: auto,
    SHUTDOWN_HEADLESS: headless ? '1' : '0',
    VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
  },
})
let hostExit = null
host.on('exit', (code, signal) => {
  hostExit = { code, signal, at: Date.now() }
  console.log(`[probe-runner] vite host exited code=${code} signal=${signal}`)
})
const started = Date.now()
const dump = (label) => {
  const rows = table().filter((p) => !before.has(p.pid))
  console.log(`[probe-runner] t=${Date.now() - started}ms ${label} new processes=${rows.length}`)
  for (const row of rows) {
    console.log(`  pid=${row.pid} ppid=${row.ppid} ${row.name} ${row.cmd}`)
  }
  return rows
}
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  dump(hostExit ? 'after host exit' : 'host alive')
}
const leftovers = dump('final')
console.log(`[probe-runner] RESULT auto=${auto} headless=${headless} hostExit=${JSON.stringify(hostExit)} leftovers=${leftovers.length}`)
for (const row of leftovers) {
  try {
    execFileSync('taskkill', ['/PID', String(row.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}
try {
  host.kill()
} catch {}
process.exit(0)
