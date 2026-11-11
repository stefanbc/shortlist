/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type VercelConfig = { headers: { source: string; headers: { key: string; value: string }[] }[] }

const config = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../vercel.json'), 'utf8'),
) as VercelConfig

function directive(name: string): string[] {
  const csp = config.headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')!.value
  const found = csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
  return found ? found.slice(1) : []
}

describe('production Content-Security-Policy (vercel.json)', () => {
  it("lets the PDF export compile WebAssembly (react-pdf's yoga layout engine)", () => {
    expect(directive('script-src')).toContain("'wasm-unsafe-eval'")
  })

  it('lets that module load from its inlined data: URL without a CSP violation', () => {
    expect(directive('connect-src')).toContain('data:')
  })

  it('still forbids plain eval', () => {
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
  })
})
