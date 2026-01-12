import os from 'os'
import SpotifyDlError from './Error'
import { readFile, unlink, writeFile, pathExists } from 'fs-extra'
import axios from 'axios'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveProxyForYtdlp } from './proxy'
const execFileAsync = promisify(execFile)

/**
 * Function to download the give `YTURL`
 * @param {string} url The youtube URL to download
 * @returns `Buffer`
 * @throws Error if the URL is invalid
 */
const isYoutubeUrl = (url: string): boolean => /youtu\.be|youtube\.com/.test(url)

export const downloadYT = async (url: string): Promise<Buffer> => {
    if (!isYoutubeUrl(url)) throw new SpotifyDlError('Invalid YT URL', 'SpotifyDlError')
    const filename = `${os.tmpdir()}/${Math.random().toString(36).slice(-5)}.mp3`
    const youtubeDlCmd = (await pathExists('/usr/bin/youtube-dl'))
        ? '/usr/bin/youtube-dl'
        : (await pathExists('/usr/local/bin/youtube-dl'))
            ? '/usr/local/bin/youtube-dl'
            : 'youtube-dl'
    const ytDlpCmd = process.env.YTDLP_BIN
        ? process.env.YTDLP_BIN
        : (await pathExists('/usr/local/bin/yt-dlp_linux'))
            ? '/usr/local/bin/yt-dlp_linux'
            : (await pathExists('/usr/bin/yt-dlp'))
                ? '/usr/bin/yt-dlp'
                : (await pathExists('/usr/local/bin/yt-dlp'))
                    ? '/usr/local/bin/yt-dlp'
                    : 'yt-dlp'

    let tmpCookiesPath: string | undefined
    const cookiesPathEnv = process.env.YTDLP_COOKIES_PATH
    const cookiesB64Env = process.env.YTDLP_COOKIES_B64
    if (!cookiesPathEnv && cookiesB64Env) {
        const tmpPath = `${os.tmpdir()}/yt_cookies_${Math.random().toString(36).slice(-8)}.txt`
        const buf = Buffer.from(cookiesB64Env, 'base64')
        await writeFile(tmpPath, buf)
        tmpCookiesPath = tmpPath
    }
    const effectiveCookiesPath = cookiesPathEnv || tmpCookiesPath
    const cookiesArg = effectiveCookiesPath ? ['--cookies', effectiveCookiesPath] as string[] : []
    const proxyStr = cookiesArg.length === 0 ? await resolveProxyForYtdlp() : undefined
    const proxyArg = proxyStr ? ['--proxy', proxyStr] as string[] : []
    const commonArgs = [
        url,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', filename,
        '--format', 'bestaudio/best',
        '--no-check-certificate',
        '--add-metadata',
        '--prefer-free-formats',
        '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.youtube.com/',
        '--geo-bypass',
        '--ignore-errors',
        '--no-playlist',
        '--force-ipv4',
        ...proxyArg,
        ...cookiesArg
    ]

    // Try youtube-dl first
    try {
        await execFileAsync(youtubeDlCmd, commonArgs, { maxBuffer: 128 * 1024 * 1024 })
    } catch (_err) {
        // Fallback: attempt yt-dlp with different client profiles to dodge 403s
        const clients = ['web', 'web_safari', 'mweb', 'web_embed', 'ios', 'android', 'tv']
        let lastErr: unknown = _err
        for (const client of clients) {
            const args = [...commonArgs, '--extractor-args', `youtube:player_client=${client}`]
            try {
                await execFileAsync(ytDlpCmd, args, { maxBuffer: 128 * 1024 * 1024 })
                lastErr = undefined
                break
            } catch (e) {
                lastErr = e
                continue
            }
        }
        if (lastErr) throw lastErr
    }
    const buffer = await readFile(filename)
    unlink(filename)
    if (tmpCookiesPath) {
        unlink(tmpCookiesPath)
    }
    return buffer
}

/**
 * Function to download and save audio from youtube
 * @param url URL to download
 * @param filename the file to save to
 * @returns filename
 */
export const downloadYTAndSave = async (url: string, filename = (Math.random() + 1).toString(36).substring(7) + '.mp3'): Promise<string> => {
    const audio = await downloadYT(url)
    try {
        await writeFile(filename, new Uint8Array(audio))
        return filename
    } catch (err) {
        throw new SpotifyDlError(`Error While writing to File: ${filename}`)
    }
}


/**
 * Function to get buffer of files with their URLs
 * @param url URL to get Buffer of
 * @returns Buffer
 */
export const getBufferFromUrl = async (url: string): Promise<Buffer> =>
    (await axios.get(url, { responseType: 'arraybuffer' })).data
