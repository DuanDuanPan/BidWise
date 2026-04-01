import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

test('@smoke should launch Electron app and show main window', async () => {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-smoke-'))

  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js')],
    env: {
      ...process.env,
      HOME: sandboxHome,
      BIDWISE_USER_DATA_DIR: join(sandboxHome, 'bidwise-data'),
    },
  })

  try {
    await expect.poll(() => electronApp.windows().length, { timeout: 30000 }).toBeGreaterThan(0)

    const [window] = electronApp.windows()
    await window.waitForLoadState('domcontentloaded')

    const title = await window.title()
    expect(title).toBe('BidWise')

    const projectKanban = window.locator('[data-testid="project-kanban"]')
    await expect(projectKanban).toBeVisible()
  } finally {
    await electronApp.close()
    await rm(sandboxHome, { recursive: true, force: true })
  }
})
