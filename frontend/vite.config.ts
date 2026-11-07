import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
let accountKey: string
try {
  accountKey = userInfo().username
} catch {
  // Restricted Windows accounts may not expose their identity to Node.
  accountKey = `restricted-process-${process.pid}`
}
// Windows users cannot delete optimizer files owned by a different sandbox account.
const cacheId = createHash('sha256')
  .update(`${projectRoot}:${accountKey}`)
  .digest('hex')
  .slice(0, 16)

export default defineConfig({
  cacheDir: path.join(tmpdir(), 'mocapin-vite', cacheId),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
})
