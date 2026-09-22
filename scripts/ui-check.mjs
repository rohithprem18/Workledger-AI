/**
 * Visual and behavioural check of every page, at desktop and phone sizes.
 *
 *   node scripts/ui-check.mjs [baseUrl] [outDir]
 *   node scripts/ui-check.mjs http://localhost:5173 ui-shots
 *   UI_ONLY=/contracts node scripts/ui-check.mjs    # just the matching pages
 *
 * Signs in through the real login screen as each role, visits every route that
 * role can reach, and records per page:
 *   - console errors and uncaught exceptions
 *   - failed API calls (4xx/5xx)
 *   - horizontal overflow — the page must never scroll sideways on a phone
 *   - a full-page screenshot, for eyeballing the result
 *
 * It also exercises the interactions a layout change most often breaks: the
 * mobile navigation drawer and a form drawer (a bottom sheet on phones).
 * Exits non-zero if any page has a problem.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/+$/, '')
const OUT = process.argv[3] ?? 'ui-shots'
// UI_ONLY=/contracts,/finance limits the run to pages whose path contains one of these.
const ONLY = (process.env.UI_ONLY ?? '').split(',').filter(Boolean)
const wanted = (path) => !ONLY.length || ONLY.some((p) => path.includes(p))
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
}

async function api(path, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const body = await res.json()
  return body.data
}

async function tokenFor(username, password = 'password') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return (await res.json()).data?.token
}

// Real ids, so detail pages render with data rather than a 404.
const managerToken = await tokenFor('manager')
const contracts = (await api('/contracts', managerToken)) ?? []
const contractId =
  contracts.find((c) => (c.requirements ?? []).some((r) => r.fulfilledCount > 0))?.id ?? contracts[0]?.id
const invoices = (await api('/invoices', await tokenFor('finance'))) ?? []
const invoiceId = invoices[0]?.id

const ROLES = [
  {
    user: 'manager',
    pages: [
      '/dashboard',
      '/contracts',
      contractId && `/contracts/${contractId}`,
      '/contracts/intake',
      '/clients',
      '/employees',
      '/worklogs/pending',
    ],
  },
  {
    user: 'finance',
    pages: [
      '/finance/invoices',
      '/finance/audit',
      invoiceId && `/finance/audit?invoice=${invoiceId}`,
      '/finance/milestones',
      '/finance/worklogs',
    ],
  },
  { user: 'hr', pages: ['/hr/employees', '/hr/skills', '/hr/users', '/hr/roles'] },
  {
    user: 'employee1',
    pages: ['/my-assignments', '/my-worklogs', '/my-worklogs/new', '/my-availability'],
  },
  { user: 'auditor', pages: ['/contracts', '/finance/audit'] },
  { user: 'admin', pages: ['/dashboard'] },
]

const results = []
// Report as each check finishes, so a long run shows progress.
const record = (r) => {
  results.push(r)
  const mark = r.issues.length ? '✗' : '✓'
  console.log(`${mark} ${r.device.padEnd(7)} ${r.user.padEnd(10)} ${r.path}${r.heading ? `  — ${r.heading}` : ''}`)
  for (const issue of r.issues) console.log(`      ${issue}`)
}
const browser = await chromium.launch()

function slug(path) {
  return path.replace(/^\//, '').replace(/[/?=&]+/g, '_').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'root'
}

async function inspect(page, label, path, issues) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  // Skeletons fade out once data lands.
  await page
    .waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, null, { timeout: 15_000 })
    .catch(() => issues.push('still showing loading skeletons after 15s'))

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - window.innerWidth
  })
  if (overflow > 1) {
    const culprits = await page.evaluate(() => {
      const width = window.innerWidth
      return [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.right > width + 1 && getComputedStyle(el).position !== 'fixed'
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
    })
    issues.push(`horizontal overflow of ${overflow}px (${culprits.join(', ')})`)
  }

  // "Standing" text: a label squeezed into so narrow a column that it stacks
  // a letter or a word per line. Three or more lines averaging under seven
  // characters is never an intended layout.
  const squeezed = await page.evaluate(() => {
    const found = []
    for (const el of document.querySelectorAll('body *')) {
      const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
      const own = textNodes
        .map((n) => n.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      if (own.length < 10) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      // Distinct line tops of the element's own text, not its child blocks.
      const tops = new Set()
      for (const node of textNodes) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top))
      }
      const lines = tops.size
      if (lines >= 3 && own.length / lines < 7) {
        const r = el.getBoundingClientRect()
        found.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${own.slice(0, 30)}" ${lines} lines in ${Math.round(r.width)}px`,
        )
      }
    }
    return found.slice(0, 4)
  })
  for (const s of squeezed) issues.push(`squeezed text: ${s}`)

  const heading = await page.locator('h1').first().textContent().catch(() => null)
  const file = join(OUT, `${label}__${slug(path)}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return { heading: heading?.trim() ?? null, file }
}

for (const [device, options] of Object.entries(VIEWPORTS)) {
  // ------------------------------------------------------------ login page
  {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    const issues = []
    page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`))
    await page.goto(`${BASE}/login`)
    const { file } = await inspect(page, `${device}__anon`, '/login', issues)

    // A wrong password must show an error and stay on the page.
    await page.fill('#username', 'manager')
    await page.fill('#password', 'not-the-password')
    await page.click('button[type=submit]')
    const shown = await page
      .locator('.alert-error')
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (!shown) issues.push('wrong password did not show an error on the login form')

    record({ device, user: 'anonymous', path: '/login', issues, file })
    await context.close()
  }

  // ------------------------------------------------------------ each role
  for (const role of ROLES) {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    let issues = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') issues.push(`console: ${msg.text().slice(0, 200)}`)
    })
    page.on('pageerror', (e) => issues.push(`pageerror: ${e.message.slice(0, 200)}`))
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/api/') && res.status() >= 400) {
        issues.push(`HTTP ${res.status()} ${res.request().method()} ${url.replace(BASE, '')}`)
      }
    })

    // Sign in through the UI, using the demo-account buttons.
    await page.goto(`${BASE}/login`)
    await page.locator('.demo-btn', { hasText: role.user }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })

    for (const path of role.pages.filter(Boolean).filter(wanted)) {
      issues = []
      await page.goto(`${BASE}${path}`)
      const { heading, file } = await inspect(page, `${device}__${role.user}`, path, issues)
      if (!heading) issues.push('no page heading rendered')
      record({ device, user: role.user, path, heading, issues: [...issues], file })
    }

    // ---- interaction checks on the first page for this role
    issues = []
    await page.goto(`${BASE}${role.pages[0]}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    if (device === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const open = await page
        .locator('.sidebar.open')
        .waitFor({ timeout: 4000 })
        .then(() => true)
        .catch(() => false)
      if (!open) issues.push('mobile menu did not open')
      await page.waitForTimeout(350) // let the slide-in finish before the screenshot
      await page.screenshot({ path: join(OUT, `${device}__${role.user}__menu.png`) })
      // Navigating from the menu must close it.
      const second = role.pages.filter(Boolean)[1]
      if (second) {
        await page.locator('.sidebar .nav-link').nth(1).click()
        await page.waitForTimeout(400)
        if (await page.locator('.sidebar.open').count()) issues.push('mobile menu stayed open after navigating')
      }
      record({ device, user: role.user, path: '(mobile menu)', issues: [...issues] })
    }

    await context.close()
  }

  // ------------------------------------------------ a form drawer (sheet)
  {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    const issues = []
    await page.goto(`${BASE}/login`)
    await page.locator('.demo-btn', { hasText: 'manager' }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'))
    await page.goto(`${BASE}/clients`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.getByRole('button', { name: 'Add client' }).click()
    await page.locator('.drawer.open').waitFor({ timeout: 4000 }).catch(() => issues.push('drawer did not open'))
    await page.waitForTimeout(350)
    const box = await page.locator('.drawer.open').boundingBox()
    const vw = options.viewport.width
    if (box && (box.x < -1 || box.x + box.width > vw + 1)) issues.push('drawer extends off-screen')
    await page.screenshot({ path: join(OUT, `${device}__manager__drawer.png`) })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
    if (await page.locator('.drawer.open').count()) issues.push('Escape did not close the drawer')
    record({ device, user: 'manager', path: '(client drawer)', issues })
    await context.close()
  }
}

await browser.close()

writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))

const failing = results.filter((r) => r.issues.length)
console.log(`\n${results.length - failing.length}/${results.length} checks clean. Screenshots in ${OUT}/`)
process.exit(failing.length ? 1 : 0)
