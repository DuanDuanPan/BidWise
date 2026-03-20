import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'

test('@smoke should launch Electron app and show main window', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js')],
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const title = await window.title()
  expect(title).toBe('BidWise')

  const appRoot = window.locator('[data-testid="app-root"]')
  await expect(appRoot).toBeVisible()

  await electronApp.close()
})
