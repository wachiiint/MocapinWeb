import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

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

export default defineConfig(({ command, mode, isPreview }) => {
  const secureDev = command === 'serve' && mode === 'https' && !isPreview
  let https: { cert: Buffer; key: Buffer } | undefined
  if (secureDev) {
    const env = loadEnv(mode, projectRoot, 'DEV_HTTPS_')
    const readTlsFile = (value: string | undefined, fallback: string) => {
      const filename = path.resolve(projectRoot, value || fallback)
      const withinPublic = path.relative(path.join(projectRoot, 'public'), filename)
      if (!withinPublic || (!withinPublic.startsWith(`..${path.sep}`) && withinPublic !== '..' && !path.isAbsolute(withinPublic))) {
        throw new Error('Keep HTTPS certificates and private keys outside frontend/public.')
      }
      try { return readFileSync(filename) }
      catch { throw new Error(`Could not read HTTPS file: ${filename}. Run npm run prepare:https -- -Address YOUR_WIFI_IP. See frontend/README.md.`) }
    }
    https = { cert: readTlsFile(env.DEV_HTTPS_CERT, 'dev-https.local.pem'), key: readTlsFile(env.DEV_HTTPS_KEY, 'dev-https-key.local.pem') }
    try { createSecureContext(https) }
    catch { throw new Error('The HTTPS certificate/key is invalid or does not match. Regenerate it with npm run prepare:https -- -Address YOUR_WIFI_IP.') }
  }
  return {
    cacheDir: path.join(tmpdir(), 'mocapin-vite', cacheId),
    plugins: [react(), tailwindcss()],
    server: { https, ...(secureDev ? { port: 5173, strictPort: true } : {}) },
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, './src'),
      },
    },
  }
})
