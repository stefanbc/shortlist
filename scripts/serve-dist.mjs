// Serves the production build (dist/) the way Vercel does with vercel.json -- SPA rewrite
// plus its security headers -- so the CSP can be checked against a real build locally:
//
//   npm run build && node scripts/serve-dist.mjs [port]      # default port 4183
//
// The one deviation from production: connect-src also allows the Supabase origin the build
// was made against (VITE_SUPABASE_URL from .env.local, i.e. the local stack), because the
// production policy only allows https://*.supabase.co.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.argv[2] ?? 4183)

function envValue(name) {
  const file = path.join(root, '.env.local')
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, '')
}

const supabaseOrigin = new URL(envValue('VITE_SUPABASE_URL') ?? 'http://127.0.0.1:54321').origin
const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const headers = Object.fromEntries(
  config.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]),
)
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
  'connect-src',
  `connect-src ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, 'ws')}`,
)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  let file = path.join(dist, pathname)
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html') // the SPA rewrite
  }
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(port, () => {
  console.log(`Serving dist/ on http://localhost:${port}`)
  console.log(`Content-Security-Policy: ${headers['Content-Security-Policy']}`)
})
