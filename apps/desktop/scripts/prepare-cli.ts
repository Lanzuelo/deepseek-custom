/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Copy the platform launcher into the application's public command directory.
 *
 * The template names the installed executable; a renamed local build passes
 * `DSH_DESKTOP_PRODUCT_NAME` so the launcher points at the executable it ships
 * beside instead of the published product name.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32'): void {
  const name = platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const command = join(destination, 'bin', name)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  const template = readFileSync(join(import.meta.dirname, '..', 'cli', name), 'utf8')
  const productName = process.env.DSH_DESKTOP_PRODUCT_NAME?.trim() || 'DeepSeek Harness'
  writeFileSync(command, template.replaceAll('DeepSeek Harness', productName))
  if (platform === 'darwin') chmodSync(command, 0o755)
}
