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
