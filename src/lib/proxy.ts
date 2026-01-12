import axios from 'axios'

/**
 * Fetches a fresh HTTP proxy from Proxifly's free proxy list via jsDelivr.
 * Returns a value suitable for yt-dlp's `--proxy` flag, e.g. "http://IP:PORT".
 */
export const getProxiflyHttpProxy = async (): Promise<string | undefined> => {
  try {
    const url = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt'
    const { data } = await axios.get<string>(url, { responseType: 'text', timeout: 10000 })
    const lines = String(data)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && /^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/.test(l))
    if (lines.length === 0) return undefined
    const pick = lines[Math.floor(Math.random() * lines.length)]
    return `http://${pick}`
  } catch (_err) {
    return undefined
  }
}

/**
 * Initialize yt-dlp proxy from Proxifly when ENABLE_PROXY is set and no YTDLP_PROXY present.
 */
export const initYtdlpProxy = async (): Promise<void> => {
  const enable = String(process.env.ENABLE_PROXY || '').trim()
  if (!enable || enable === '0' || enable.toLowerCase() === 'false') return
  if (process.env.YTDLP_PROXY) return
  const proxy = await getProxiflyHttpProxy()
  if (proxy) {
    process.env.YTDLP_PROXY = proxy
    // eslint-disable-next-line no-console
    console.log(`[proxy] Using yt-dlp proxy: ${proxy}`)
  } else {
    // eslint-disable-next-line no-console
    console.log('[proxy] Unable to fetch proxy from Proxifly')
  }
}

/**
 * Resolve a proxy to use for a single yt-dlp download.
 * Priority:
 *  - If `YTDLP_PROXY_ROTATE` is truthy → fetch a fresh proxy
 *  - Else if `YTDLP_PROXY` is set → use it
 *  - Else if `ENABLE_PROXY` is truthy → fetch a fresh proxy
 *  - Else → undefined (no proxy)
 */
export const resolveProxyForYtdlp = async (): Promise<string | undefined> => {
  const rotateRaw = String(process.env.YTDLP_PROXY_ROTATE || '').trim()
  const rotateEnabled = !!rotateRaw && rotateRaw !== '0' && rotateRaw.toLowerCase() !== 'false'
  if (rotateEnabled) {
    return await getProxiflyHttpProxy()
  }
  if (process.env.YTDLP_PROXY) {
    return process.env.YTDLP_PROXY
  }
  const enableRaw = String(process.env.ENABLE_PROXY || '').trim()
  const enable = !!enableRaw && enableRaw !== '0' && enableRaw.toLowerCase() !== 'false'
  if (enable) {
    return await getProxiflyHttpProxy()
  }
  return undefined
}
