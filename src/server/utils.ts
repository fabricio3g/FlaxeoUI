import fs from 'fs'
import https from 'https'
import net from 'net'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import type { AppContext } from './types'

export function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function appendLog(ctx: AppContext, msg: string): void {
  ctx.state.serverLogs.push(msg)
  ctx.state.logBus.emit('log', msg)
}

export function listFiles(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return []

    const walk = (currentDir: string, relativeDir = ''): string[] =>
      fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name.startsWith('.')) return []

        const relativePath = path.join(relativeDir, entry.name)
        if (entry.isDirectory()) return walk(path.join(currentDir, entry.name), relativePath)
        return entry.isFile() ? [relativePath] : []
      })

    return walk(dir).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export function modelPath(ctx: AppContext, subdir: string, file?: string): string | undefined {
  if (!file) return undefined
  return path.join(ctx.paths.modelsDir, subdir, file)
}

export function roundTo(value: unknown, fallback: number, multiple: number): number {
  const parsed = Number(value)
  return Math.round((Number.isFinite(parsed) ? parsed : fallback) / multiple) * multiple
}

export function safeOutputPath(ctx: AppContext, filename: string): string | null {
  const resolved = path.resolve(ctx.paths.outputDir, filename)
  return resolved.startsWith(path.resolve(ctx.paths.outputDir)) ? resolved : null
}

export function getLocalIP(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const netInfo of nets[name] || []) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) return netInfo.address
    }
  }
  return 'localhost'
}

export function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(startPort, '0.0.0.0', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : startPort
      server.close(() => resolve(port))
    })
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(findAvailablePort(startPort + 1))
      else reject(error)
    })
  })
}

export function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'FlaxeoUI' } }, (response) => {
        if (
          (response.statusCode === 301 || response.statusCode === 302) &&
          response.headers.location
        ) {
          fetchJson<T>(response.headers.location).then(resolve).catch(reject)
          return
        }

        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })
}

export function downloadFile(
  url: string,
  destPath: string,
  options: {
    onProgress?: (receivedBytes: number, totalBytes: number | null) => void
    registerCancel?: (cancel: () => void) => void
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let file: fs.WriteStream | null = null
    let activeRequest: ReturnType<typeof https.get> | null = null
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      file?.destroy()
      fs.unlink(destPath, () => undefined)
      reject(error)
    }

    options.registerCancel?.(() => {
      activeRequest?.destroy(new Error('Download cancelled'))
      fail(new Error('Download cancelled'))
    })

    const doDownload = (downloadUrl: string): void => {
      activeRequest = https
        .get(
          downloadUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'application/octet-stream'
            }
          },
          (response) => {
            if (
              (response.statusCode === 301 || response.statusCode === 302) &&
              response.headers.location
            ) {
              doDownload(response.headers.location)
              return
            }
            if (response.statusCode !== 200) {
              fail(new Error(`Download failed: ${response.statusCode}`))
              return
            }

            const total = response.headers['content-length']
              ? parseInt(response.headers['content-length'], 10)
              : null
            let received = 0
            file = fs.createWriteStream(destPath)
            response.on('data', (chunk: Buffer) => {
              received += chunk.length
              options.onProgress?.(received, total)
            })
            response.pipe(file)
            file.on('finish', () => {
              file?.close()
              if (settled) return
              settled = true
              resolve(destPath)
            })
            file.on('error', (error) => {
              fail(error)
            })
          }
        )
        .on('error', fail)
    }

    console.log(`[Backend] Starting download from ${url} to ${destPath}`)
    doDownload(url)
  })
}

export function spawnLoggedProcess(
  ctx: AppContext,
  command: string,
  args: string[],
  label: string,
  options: { cwd?: string; shell?: boolean } = {}
): ChildProcess {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
  const header = [
    `\n${'='.repeat(80)}`,
    `[${timestamp}] [${label}] Command: ${command}`,
    `[${timestamp}] [${label}] Args: ${args.join(' ')}`,
    options.cwd ? `[${timestamp}] [${label}] Working directory: ${options.cwd}` : '',
    `${'='.repeat(80)}\n`
  ]
    .filter(Boolean)
    .join('\n')
  console.log(header)
  appendLog(ctx, `${header}\n`)

  const child = spawn(command, args, options)
  child.stdout?.on('data', (data) => {
    const msg = data.toString()
    process.stdout.write(msg)
    appendLog(ctx, msg)
  })
  child.stderr?.on('data', (data) => {
    const msg = data.toString()
    process.stderr.write(msg)
    appendLog(ctx, msg)
  })
  child.on('close', (code) => {
    const ts = new Date().toISOString().split('T')[1].split('.')[0]
    appendLog(ctx, `\n[${ts}] [${label}] EXIT: ${code}\n`)
  })
  return child
}

export function waitForProcess(
  child: ChildProcess,
  label: string
): Promise<{ cancelled: boolean }> {
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      const ts = new Date().toISOString().split('T')[1].split('.')[0]
      console.log(`\n${'='.repeat(80)}`)
      console.log(`[${ts}] [${label}] Process exited with code: ${code}`)
      console.log(`${'='.repeat(80)}\n`)
      if (code === 0) resolve({ cancelled: false })
      else if (code === null) resolve({ cancelled: true })
      else reject(new Error(`CLI exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

export function removeFile(filePath?: string): void {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (error) {
    console.error('Failed to remove file:', error)
  }
}

export function removeDir(dirPath?: string | null): void {
  if (!dirPath) return
  try {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true })
  } catch (error) {
    console.error('Failed to remove directory:', error)
  }
}

export interface ParsedStep {
  current: number
  total: number
  itPerSec: number
}

const RE_SAMPLING_STEP = /sampling\s+step\s+(\d+)\s*\/\s*(\d+)/i
const RE_STEP = /(?:^|\s)step\s+(\d+)\s*\/\s*(\d+)/i
const RE_BAR_STEP = /\|[^\r\n]*\|\s*(\d+)\s*\/\s*(\d+)\s*-\s*([\d.]+)\s*(s\/it|it\/s)/i
const RE_IT_PER_SEC = /(?:it\/s[:=]\s*([\d.]+)|([\d.]+)\s*it\/s)/i

export function parseStepLine(line: string): ParsedStep | null {
  const barMatch = line.match(RE_BAR_STEP)
  if (barMatch) {
    const current = parseInt(barMatch[1], 10)
    const total = parseInt(barMatch[2], 10)
    const speed = parseFloat(barMatch[3])
    const itPerSec = barMatch[4].toLowerCase() === 's/it' && speed > 0 ? 1 / speed : speed
    return { current, total, itPerSec }
  }

  const samplingMatch = line.match(RE_SAMPLING_STEP) || line.match(RE_STEP)
  if (!samplingMatch) return null
  const current = parseInt(samplingMatch[1], 10)
  const total = parseInt(samplingMatch[2], 10)
  const itMatch = line.match(RE_IT_PER_SEC)
  const itPerSec = itMatch ? parseFloat(itMatch[1] || itMatch[2]) : 0
  return { current, total, itPerSec }
}
