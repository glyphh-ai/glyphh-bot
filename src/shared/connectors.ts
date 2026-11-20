// Which service a Claude connector is, so the Connections tab can show its
// icon the way Claude does. Claude's connectors arrive as names
// ("claude.ai Gmail", "plugin:stripe:stripe", "slack") and, for http
// servers, a url; a known name maps to the service's own site, otherwise the
// server's host is used. The icon itself is that site's favicon, fetched once
// by the main process and cached on disk (main/icons.ts).

const KNOWN: ReadonlyArray<[RegExp, string]> = [
  [/gmail/, 'mail.google.com'],
  [/google ?calendar|gcal/, 'calendar.google.com'],
  [/google ?drive|gdrive/, 'drive.google.com'],
  [/google ?docs/, 'docs.google.com'],
  [/google ?sheets/, 'sheets.google.com'],
  [/microsoft ?365|outlook|office ?365|sharepoint|teams/, 'microsoft365.com'],
  [/claude ?docs|claude\.ai$/, 'claude.ai'],
  [/glyphh|rrotor/, 'glyphh.ai'],
  [/slack/, 'slack.com'],
  [/github/, 'github.com'],
  [/gitlab/, 'gitlab.com'],
  [/stripe/, 'stripe.com'],
  [/canva/, 'canva.com'],
  [/notion/, 'notion.so'],
  [/linear/, 'linear.app'],
  [/figma/, 'figma.com'],
  [/asana/, 'asana.com'],
  [/atlassian|jira|confluence/, 'atlassian.com'],
  [/hubspot/, 'hubspot.com'],
  [/salesforce/, 'salesforce.com'],
  [/vercel/, 'vercel.com'],
  [/netlify/, 'netlify.com'],
  [/cloudflare/, 'cloudflare.com'],
  [/sentry/, 'sentry.io'],
  [/supabase/, 'supabase.com'],
  [/zapier/, 'zapier.com'],
  [/intercom/, 'intercom.com'],
  [/box\b/, 'box.com'],
  [/dropbox/, 'dropbox.com'],
  [/monday/, 'monday.com'],
  [/airtable/, 'airtable.com'],
  [/paypal/, 'paypal.com'],
  [/square/, 'squareup.com'],
  [/shopify/, 'shopify.com'],
  [/webflow/, 'webflow.com'],
  [/wix/, 'wix.com'],
  [/fly\.io|\bfly\b/, 'fly.io'],
  [/elevenlabs/, 'elevenlabs.io'],
  [/drip/, 'glyphh.ai']
]

/** Hosts that say nothing about the service: Claude's own proxy, this Mac. */
const NOT_A_SERVICE = /(^|\.)(anthropic\.com|localhost)$|^127\.|^0\.0\.0\.0$|^\[?::1\]?$/

/** A connector's name as people read it: "claude.ai Gmail" -> "Gmail", "plugin:stripe:stripe" -> "stripe". */
export function connectorLabel(name: string): string {
  const n = name.replace(/^claude\.ai /, '')
  const plugin = n.match(/^plugin:([^:]+):(.+)$/)
  return plugin ? plugin[2]! : n
}

/** The site whose icon stands for this connector, or null for the neutral one. */
export function connectorDomain(name: string, url?: string): string | null {
  const key = connectorLabel(name).toLowerCase()
  const full = name.toLowerCase()
  for (const [re, domain] of KNOWN) if (re.test(key) || re.test(full)) return domain
  if (url) {
    try {
      const host = new URL(url).hostname.toLowerCase()
      if (host && !NOT_A_SERVICE.test(host)) return host.split('.').slice(-2).join('.')
    } catch {
      // not a url
    }
  }
  return null
}

/** A domain safe to use as a cache file name. */
export const iconFile = (domain: string): string => domain.replace(/[^a-z0-9.-]/gi, '_') + '.png'
