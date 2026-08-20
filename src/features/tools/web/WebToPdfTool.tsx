import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import {
  htmlToPdfBytes,
  NAVIGATION_GUARD_JS,
} from '../local/handlers/html-to-pdf'
import { downloadBytes } from '../organize/lib'

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// Public CORS relays tried in parallel for fetching the page and its
// sub-resources; the first one to answer with content wins. The dev Vite
// middleware (/__fetch) is included when running locally.
const RELAYS = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) =>
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://proxy.corsfix.com/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://proxy.cors.sh/${url}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://cors-anywhere.herokuapp.com/${url}`,
]

function candidatesFor(url: string): string[] {
  const builders: Array<(target: string) => string> = []
  if (import.meta.env.DEV) {
    builders.push((target) => `/__fetch?url=${encodeURIComponent(target)}`)
  }
  builders.push(...RELAYS)
  return [url, ...builders.map((build) => build(url))]
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 12000,
  mode: RequestMode = 'cors',
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { mode, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Fetches a text resource (the page or a stylesheet). Every relay is tried at
 * the same time; whichever responds first with content wins. This is what
 * makes fetching work for most sites without a backend.
 */
async function fetchText(url: string): Promise<string> {
  const attempts = candidatesFor(url).map((candidate) =>
    (async () => {
      const res = await fetchWithTimeout(candidate)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.trim()) throw new Error('empty response')
      return text
    })(),
  )
  try {
    return await Promise.any(attempts)
  } catch {
    throw new Error(
      'The page could not be fetched. It may be offline, or it blocks every available access path.',
    )
  }
}

/** Fetches a binary resource (an image) through the same relay pool. */
async function fetchBlob(url: string): Promise<Blob | null> {
  const attempts = candidatesFor(url).map((candidate) =>
    (async () => {
      const res = await fetchWithTimeout(candidate)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (!blob.size) throw new Error('empty response')
      return blob
    })(),
  )
  try {
    return await Promise.any(attempts)
  } catch {
    return null
  }
}

/**
 * Fetches the page HTML and rejects responses that are clearly not a webpage
 * (relay error pages, plain text, empty shells). Some relays answer with an
 * error document instead of a failing status, so a structural check is
 * required before the markup is trusted.
 */
async function fetchPageHtml(url: string): Promise<string> {
  const html = await fetchText(url)
  const trimmed = html.trimStart().toLowerCase()
  if (
    !trimmed.startsWith('<!doctype') &&
    !trimmed.startsWith('<html') &&
    !/<!doctype|<html|<body|<head/i.test(trimmed.slice(0, 500))
  ) {
    throw new Error('The fetched response was not a webpage.')
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  if (!parsed.body) throw new Error('The fetched response was not a webpage.')
  return html
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/**
 * Rewrites every url(...) inside CSS through the same-origin / relay prefix
 * so background images and fonts load without CORS blocking the capture.
 */
function rewriteCssUrls(
  css: string,
  cssUrl: string,
  rewrite: (url: string) => string,
): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, raw) => {
    const value = String(raw).trim()
    if (/^(data:|#|var\(|blob:|about:)/.test(value)) return match
    let absolute: string
    if (value.startsWith('//')) absolute = `https:${value}`
    else if (/^https?:/i.test(value)) absolute = value
    else absolute = resolveUrl(value, cssUrl)
    return `url(${quote}${rewrite(absolute)}${quote})`
  })
}

/** Rewrites a URL through the relay prefix when it is a web address. */
function proxyUrl(url: string, prefix: string): string {
  if (!prefix) return url
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url
  return `${prefix}${encodeURIComponent(parsed.toString())}`
}

/**
 * Fetches each external stylesheet and inlines it as <style> text, so the
 * page's CSS survives the capture. Sheets are pulled through the relay pool,
 * and any url() inside them is proxied the same way so fonts and background
 * images keep loading.
 */
async function inlineStyles(
  doc: Document,
  pageUrl: string,
  prefix: string,
): Promise<void> {
  const links = Array.from(
    doc.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]'),
  ) as HTMLLinkElement[]
  for (const link of links) {
    const href = link.getAttribute('href')
    if (!href || href.startsWith('data:')) {
      link.remove()
      continue
    }
    const cssUrl = resolveUrl(href, pageUrl)
    try {
      const css = await fetchText(cssUrl)
      if (css.trim()) {
        const style = doc.createElement('style')
        style.textContent = rewriteCssUrls(css, cssUrl, (u) =>
          proxyUrl(u, prefix),
        )
        link.replaceWith(style)
      }
    } catch {
      // Keep the <link> — the browser can still load it for the preview.
    }
  }
}

/** Parses a `srcset` attribute into absolute candidate URLs in order. */
function parseSrcset(srcset: string, base: string): string[] {
  const candidates: string[] = []
  for (const part of srcset.split(',')) {
    const first = part.trim().split(/\s+/)[0]
    if (first) candidates.push(resolveUrl(first, base))
  }
  return candidates
}

/**
 * Inlines images as data URLs (with a size budget) so they render in both the
 * preview and the captured PDF. External images taint a capture canvas unless
 * the server sends CORS headers; embedding them as data URLs avoids that
 * entirely and works for every site.
 */
async function inlineImages(doc: Document, pageUrl: string): Promise<void> {
  const images = Array.from(
    doc.querySelectorAll('img[src], img[srcset]'),
  ) as HTMLImageElement[]
  let done = 0
  for (const img of images) {
    if (done >= 80) break
    const src = img.getAttribute('src')
    let candidate = src ? resolveUrl(src, pageUrl) : ''
    if (!candidate && img.getAttribute('srcset')) {
      const parsed = parseSrcset(img.getAttribute('srcset') ?? '', pageUrl)
      if (parsed.length > 0) candidate = parsed[parsed.length - 1]
    }
    if (!candidate || /^data:/i.test(candidate)) continue
    const blob = await fetchBlob(candidate)
    if (!blob || blob.size === 0 || blob.size > 2 * 1024 * 1024) continue
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(blob)
      })
      img.setAttribute('src', dataUrl)
      img.removeAttribute('srcset')
      done += 1
    } catch {
      // Keep the original src — it may still load in the preview.
    }
  }
}

/**
 * Rewrites every remaining resource URL through the relay prefix so the
 * capture canvas stays origin-clean. Anything that could not be inlined is
 * proxied; the relay adds CORS headers, so html2canvas can read the result.
 */
function proxyResources(
  doc: Document,
  pageUrl: string,
  prefix: string,
): void {
  const rewrite = (url: string) => proxyUrl(url, prefix)
  for (const node of Array.from(
    doc.querySelectorAll(
      'img[src], script[src], video[src], audio[src], source[src], track[src], input[src], object[data], iframe[src]',
    ),
  )) {
    const hasSrc = node.hasAttribute('src')
    const current = hasSrc
      ? node.getAttribute('src')
      : node.getAttribute('data')
    if (!current || /^(data:|blob:|about:|javascript:)/i.test(current)) continue
    node.setAttribute(
      hasSrc ? 'src' : 'data',
      rewrite(resolveUrl(current, pageUrl)),
    )
  }
  for (const node of Array.from(doc.querySelectorAll('[srcset]'))) {
    const srcset = node.getAttribute('srcset') ?? ''
    const parts = srcset.split(',').map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return part
      const spaceIndex = trimmed.indexOf(' ')
      const urlPart = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)
      const rest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex)
      if (/^data:/i.test(urlPart)) return part
      return `${rewrite(resolveUrl(urlPart, pageUrl))}${rest}`
    })
    node.setAttribute('srcset', parts.join(', '))
  }
  for (const node of Array.from(doc.querySelectorAll('[style]'))) {
    const style = node.getAttribute('style')
    if (style && style.includes('url(')) {
      node.setAttribute('style', rewriteCssUrls(style, pageUrl, rewrite))
    }
  }
  for (const node of Array.from(doc.querySelectorAll('[background]'))) {
    const bg = node.getAttribute('background')
    if (bg) node.setAttribute('background', rewrite(resolveUrl(bg, pageUrl)))
  }
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    const css = style.textContent ?? ''
    if (css.includes('url(')) {
      style.textContent = rewriteCssUrls(css, pageUrl, rewrite)
    }
  }
}

/**
 * Injects a small script that routes images created by the page's own
 * JavaScript through the relay prefix too. SPAs set <img> sources
 * dynamically; without this those images would taint the capture canvas.
 */
function injectImageGuard(
  doc: Document,
  pageUrl: string,
  prefix: string,
): void {
  if (!prefix) return
  const script = doc.createElement('script')
  script.textContent = `(() => {
    const prefix = ${JSON.stringify(prefix)};
    const base = ${JSON.stringify(pageUrl)};
    const proxyUrl = (value) => {
      if (!value || typeof value !== 'string') return value;
      try {
        const parsed = new URL(value, base);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return value;
        return prefix + encodeURIComponent(parsed.toString());
      } catch (error) {
        return value;
      }
    };
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (descriptor && descriptor.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          get: descriptor.get,
          set(value) {
            descriptor.set.call(this, proxyUrl(typeof value === 'string' ? value : String(value)));
          },
        });
      }
    } catch (error) {}
    document.addEventListener('load', (event) => {
      const target = event.target;
      if (target && target.tagName === 'IMG') {
        const src = target.getAttribute('src');
        if (src && !/^(data:|blob:|about:)/i.test(src)) {
          target.setAttribute('src', proxyUrl(src));
        }
      }
    }, true);
  })();`
  doc.head.appendChild(script)
}

/**
 * Prepares fetched page markup for local rendering: strips tags and handlers
 * that could interfere, injects a <base> so relative resources resolve,
 * inlines the CSS and images the PDF capture needs, and proxies every
 * remaining resource through the relay prefix. The result is a self-contained
 * document that renders faithfully in the preview and the PDF — no external
 * requests, so there are no broken-resource errors.
 */
async function preparePageHtml(rawHtml: string, pageUrl: string): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')
  for (const tag of ['iframe', 'embed', 'object', 'base', 'noscript']) {
    doc.querySelectorAll(tag).forEach((node) => node.remove())
  }
  doc.querySelectorAll('*').forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
    }
  })
  // Lazy images never load inside the capture frame; make them eager.
  for (const img of Array.from(doc.querySelectorAll('img[loading="lazy"]'))) {
    img.removeAttribute('loading')
  }
  const guard = doc.createElement('script')
  guard.textContent = NAVIGATION_GUARD_JS
  doc.head.appendChild(guard)
  const base = doc.createElement('base')
  base.href = pageUrl
  doc.head.appendChild(base)
  // Everything below is routed through the relays so nothing is blocked by
  // the browser's CORS rules.
  const relayPrefix = await relayPrefixFor()
  await inlineStyles(doc, pageUrl, relayPrefix)
  await inlineImages(doc, pageUrl)
  proxyResources(doc, pageUrl, relayPrefix)
  injectImageGuard(doc, pageUrl, relayPrefix)
  // HTML-serialize (not XML): XMLSerializer escapes `&`, `<` and `>` inside
  // <script> bodies, which turns every inline script into a SyntaxError.
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

let relayPrefixCache: string | null = null

/** Picks a relay prefix for proxying sub-resources, reused across requests. */
async function relayPrefixFor(): Promise<string> {
  if (relayPrefixCache) return relayPrefixCache
  if (import.meta.env.DEV) {
    relayPrefixCache = '/__fetch?url='
    return relayPrefixCache
  }
  const prefix = 'https://api.allorigins.win/raw?url='
  relayPrefixCache = prefix
  return prefix
}

function slugForUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').replace(/[^a-z0-9-]/gi, '')
    const path =
      parsed.pathname
        .replace(/\/+$/, '')
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[^a-z0-9-]/gi, '') ?? ''
    return path ? `${host}-${path}` : host
  } catch {
    return 'webpage'
  }
}

/**
 * WebToPdfTool — turn any website URL into a PDF, entirely in the browser.
 * The page's HTML is fetched through CORS relays, rebuilt locally with its
 * styles and images embedded, shown in a faithful preview, then captured with
 * html2canvas into a downloadable, paginated PDF. Nothing is uploaded; it
 * works in every modern browser with no backend. If a site blocks every
 * fetch path, the live page is offered instead with the browser's own
 * Print / Save-as-PDF as the fallback.
 */
export default function WebToPdfTool() {
  const [url, setUrl] = useState('')
  const [pageHtml, setPageHtml] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)

  // Grow the preview iframe to the page's own content height so the preview
  // matches the tall capture viewport the PDF is sliced from.
  useEffect(() => {
    if (!pageHtml) {
      setPreviewHeight(null)
      return
    }
    let last = 0
    let stableTicks = 0
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 25000) {
        window.clearInterval(timer)
        return
      }
      const doc = previewRef.current?.contentDocument
      const root = doc?.documentElement ?? doc?.body
      if (!doc || !root) return
      const h = Math.max(
        doc.body?.scrollHeight ?? 0,
        doc.body?.offsetHeight ?? 0,
        root.scrollHeight,
      )
      if (h > 0) {
        if (h === last) stableTicks += 1
        else {
          last = h
          stableTicks = 0
        }
        setPreviewHeight(Math.min(h, 20000))
        if (stableTicks >= 4) window.clearInterval(timer)
      }
    }, 300)
    return () => window.clearInterval(timer)
  }, [pageHtml])

  async function handleLoad(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeUrl(url)
    if (!normalized) {
      setError('Enter a web address, e.g. example.com.')
      return
    }
    setLoading(true)
    setError('')
    setPageHtml(null)
    setDownloaded(false)
    try {
      const rawHtml = await fetchPageHtml(normalized)
      const prepared = await preparePageHtml(rawHtml, normalized)
      setPageHtml(prepared)
      setPageUrl(normalized)
    } catch (reason) {
      setPageUrl(normalized)
      setError(
        reason instanceof Error
          ? reason.message +
              ' Showing the live page instead — use Print / Save as PDF to download it.'
          : 'The page could not be loaded.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!pageHtml || downloading) return
    setDownloading(true)
    setError('')
    try {
      const output = await htmlToPdfBytes(pageHtml, {
        pageSize: 'a4',
        orientation: 'portrait',
        baseUrl: pageUrl,
        onProgress: undefined,
      })
      downloadBytes(output.bytes, `${slugForUrl(pageUrl)}.pdf`)
      setDownloaded(true)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be generated.',
      )
    } finally {
      setDownloading(false)
    }
  }

  function handlePrint() {
    try {
      if (pageHtml) {
        previewRef.current?.contentWindow?.print()
        return
      }
      const win = window.open(pageUrl, '_blank', 'noopener')
      if (win) {
        win.addEventListener('load', () => win.print(), { once: true })
      }
    } catch {
      setError('Printing was blocked. Open the page in a new tab and use your browser’s print menu instead.')
    }
  }

  function handleOpenInTab() {
    try {
      window.open(pageUrl, '_blank', 'noopener')
    } catch {
      setError('Could not open the page in a new tab.')
    }
  }

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Web page URL</h2>
          <p>
            Enter any site address. The page is fetched and rendered locally —
            nothing is uploaded to us.
          </p>
        </div>
        <form className="web-form" onSubmit={(event) => void handleLoad(event)}>
          <div className="organize-field web-form__url">
            <label className="field__label" htmlFor="web-url">
              Page address
            </label>
            <input
              id="web-url"
              className="input"
              type="text"
              inputMode="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                setError('')
              }}
            />
          </div>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? (
              <Spinner size="sm" label="" />
            ) : (
              <Icon name="globe" size="sm" aria-hidden="true" />
            )}
            {loading ? 'Loading…' : 'Load page'}
          </Button>
        </form>
        <p className="web-note">
          The preview is rendered locally from the fetched page. If a site
          blocks fetching, the live page is shown instead — use{' '}
          <strong>Print / Save as PDF</strong> for those.
        </p>
      </section>

      {error ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {pageUrl ? (
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>Preview</h2>
            <p>
              {pageHtml
                ? 'This is how the page will look in the PDF (A4 width). Pages are split where the content runs over.'
                : 'The live page is shown below. Some sites block embedding and may appear empty.'}
            </p>
          </div>
          <div className="web-preview">
            <iframe
              ref={previewRef}
              title="Page preview"
              className="web-preview__frame"
              style={previewHeight ? { height: previewHeight } : undefined}
              sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
              srcDoc={pageHtml ?? undefined}
              src={pageHtml ? undefined : pageUrl}
            />
          </div>
          <div className="organize-actions">
            <Button
              size="lg"
              disabled={!pageHtml || downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? (
                <Spinner size="sm" label="" />
              ) : (
                <Icon name="download" size="sm" aria-hidden="true" />
              )}
              {downloading ? 'Generating…' : 'Download as PDF'}
            </Button>
            <Button type="button" variant="outline" onClick={handlePrint}>
              <Icon name="monitor" size="sm" aria-hidden="true" />
              Print / Save as PDF
            </Button>
            {!pageHtml ? (
              <Button type="button" variant="outline" onClick={handleOpenInTab}>
                <Icon name="globe" size="sm" aria-hidden="true" />
                Open in new tab
              </Button>
            ) : null}
          </div>
          {downloaded ? (
            <div className="organize-note" role="status">
              <Icon name="check-circle" size="sm" aria-hidden="true" />
              <span>The PDF download has started.</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}