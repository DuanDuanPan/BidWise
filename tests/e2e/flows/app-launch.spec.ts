import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'

test('@smoke should launch Electron app and show main window', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js')],
  })

  await expect.poll(() => electronApp.windows().length, { timeout: 30000 }).toBeGreaterThan(0)

  const [window] = electronApp.windows()
  await window.waitForLoadState('domcontentloaded')

  const title = await window.title()
  expect(title).toBe('BidWise')

  const projectKanban = window.locator('[data-testid="project-kanban"]')
  await expect(projectKanban).toBeVisible()

  await electronApp.close()
})
