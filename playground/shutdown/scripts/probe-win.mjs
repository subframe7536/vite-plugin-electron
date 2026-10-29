// Temporary Windows probe: run the real playground, end Electron from the renderer buttons,
// and sample the process table to see which processes survive.
// usage: node probe-win.mjs <quit|exit> <direct|pnpm|console>
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'

const action = process.argv[2] ?? 'quit'
const launcher = process.argv[3] ?? 'direct'

function table() {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'electron|node|cmd|conhost' } | ForEach-Object { '' + $_.ProcessId + '|' + $_.ParentProcessId + '|' + $_.Name + '|' + $_.CommandLine }",
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, name, ...cmd] = line.split('|')
      return { pid: Number(pid), ppid: Number(ppid), name, cmd: cmd.join('|').slice(0, 140) }
    })
    .filter((p) => p.pid !== process.pid && !p.cmd.includes('Get-CimInstance'))
}

const before = new Set(table().map((p) => p.pid))
const env = {
  ...process.env,
  PROBE_CLICK: action,
  VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
}
let host
let hostExit = null
const logFile = `${process.cwd()}\\probe-console.log`
if (launcher === 'direct') {
  host = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: ['pipe', 'inherit', 'inherit'], env })
} else if (launcher === 'pnpm') {
  host = spawn('pnpm dev', { shell: true, stdio: ['pipe', 'inherit', 'inherit'], env })
} else {
  // Own console window (closest to a developer terminal); output tee'd to a file.
  Object.assign(process.env, env)
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath cmd.exe -ArgumentList '/c pnpm dev > "${logFile}" 2>&1' -WorkingDirectory '${process.cwd()}'`,
  ])
}
host?.on('exit', (code, signal) => {
  hostExit = { code, signal }
  console.log(`[probe-runner] launcher exited code=${code} signal=${signal}`)
})
const started = Date.now()
const dump = (label) => {
  const rows = table().filter((p) => !before.has(p.pid) && /electron|node/i.test(p.name))
  console.log(`[probe-runner] t=${Date.now() - started}ms ${label} new electron/node processes=${rows.length}`)
  for (const row of rows) {
    console.log(`  pid=${row.pid} ppid=${row.ppid} ${row.name} ${row.cmd}`)
  }
  return rows
}
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  dump(hostExit ? 'after launcher exit' : 'running')
}
const leftovers = dump('final')
if (launcher === 'console' && fs.existsSync(logFile)) {
  console.log('[probe-runner] console log:\n' + fs.readFileSync(logFile, 'utf8'))
}
console.log(`[probe-runner] RESULT action=${action} launcher=${launcher} launcherExit=${JSON.stringify(hostExit)} leftovers=${leftovers.length}`)
for (const row of leftovers) {
  try {
    execFileSync('taskkill', ['/PID', String(row.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}
try {
  host?.kill()
} catch {}
process.exit(0)
