import express from 'express'
import cors from 'cors'
import archiver from 'archiver'
import { Spotify } from './index'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/**
 * POST /playlists/process
 * Body: {
 *  accessToken: string,
 *  refreshToken?: string,
 *  clientId?: string,
 *  playlists: string[]
 * }
 * Returns playlist info with tracks
 */
// app.post('/playlists/process', async (req, res) => {
//   const { accessToken, refreshToken, clientId, playlists } = req.body || {}
//   if (!accessToken || !Array.isArray(playlists)) {
//     return res.status(400).json({ error: 'accessToken y playlists son requeridos' })
//   }
//   if (playlists.length === 0) {
//     return res.status(400).json({ error: 'La lista de playlists está vacía' })
//   }

//   try {
//     console.log('Procesando playlists:', { count: playlists.length })
//     const spotify = new Spotify({ accessToken, refreshToken, clientId })
//     const infos = await spotify.getTracksFromPlaylists(playlists)
//     const totalTracks = infos.reduce((acc, cur) => acc + (cur?.total_tracks || 0), 0)
//     console.log('Resultado playlists:', { playlists: infos.length, totalTracks })
//     if (totalTracks === 0) {
//       return res.status(200).json({ message: 'No se encontraron tracks en las playlists', result: infos })
//     }
//     return res.json({ result: infos })
//   } catch (err) {
//     const anyErr: any = err
//     const statusCode = anyErr?.statusCode || anyErr?.status || 500
//     const message = anyErr?.message || 'Fallo procesando playlists'
//     const body = anyErr?.body || anyErr?.response?.data
//     const headers = anyErr?.headers || anyErr?.response?.headers
//     return res.status(statusCode).json({ error: message, statusCode, body, headers })
//   }
// })

/**
 * POST /playlists/process
 * Body: {
 *  accessToken: string,
 *  refreshToken?: string,
 *  clientId?: string,
 *  playlists: string[],
 * }
 * Behavior:
 *  - If query param mode=download or Accept includes application/zip → streams ZIP
 *  - Otherwise → returns JSON with playlist tracks
 */
app.post('/playlists/process', async (req, res) => {
  const { accessToken, refreshToken, clientId, playlists } = req.body || {}
  if (!accessToken || !Array.isArray(playlists) || playlists.length === 0) {
    return res.status(400).json({ error: 'accessToken y playlists válidas son requeridos' })
  }

  const spotify = new Spotify({ accessToken, refreshToken, clientId })

  const sanitize = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_')

  try {
    const infos = await spotify.getTracksFromPlaylists(playlists)
    const wantsZip = (typeof req.query.mode === 'string' && req.query.mode.toLowerCase() === 'download')
      || (req.headers.accept || '').includes('application/zip')

    if (!wantsZip) {
      const totalTracks = infos.reduce((acc, cur) => acc + (cur?.total_tracks || 0), 0)
      console.log('Resultado playlists:', { playlists: infos.length, totalTracks })
      return res.json({ result: infos })
    }

    console.log('Descargando playlists:', { count: playlists.length })
    const zip = archiver('zip', { zlib: { level: 9 } })
    const zipName = `spotify-playlists-${Date.now()}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)

    zip.on('warning', (err) => {
      console.warn('Archiver warning:', err)
    })
    zip.on('error', (err) => {
      console.error('Archiver error:', err)
      try { res.status(500).end() } catch {}
    })

    zip.pipe(res)

    for (const info of infos) {
      const folderName = sanitize(info.name || 'playlist')
      console.log('Procesando playlist:', { name: info.name, tracks: info.tracks.length })
      const limit = 3
      let idx = 0
      const worker = async () => {
        while (idx < info.tracks.length) {
          const i = idx++
          const track = info.tracks[i]
          try {
            console.log('Procesando track:', `${track.name} - ${track.artists[0]}`)
            const buffer = await spotify.downloadTrackFromInfo(track)
            const fileName = sanitize(`${track.name} - ${track.artists[0]}.mp3`)
            zip.append(buffer, { name: `${folderName}/${fileName}` })
            console.log('Añadido al ZIP:', `${folderName}/${fileName}`)
          } catch (e) {
            console.warn('Fallo descargando track, se omite:', track.name, e)
          }
        }
      }
      await Promise.all(Array(limit).fill(0).map(() => worker()))
    }

    await zip.finalize()
  } catch (err) {
    const anyErr: any = err
    const statusCode = anyErr?.statusCode || anyErr?.status || 500
    const message = anyErr?.message || 'Fallo descargando playlists'
    const body = anyErr?.body || anyErr?.response?.data
    const headers = anyErr?.headers || anyErr?.response?.headers
    return res.status(statusCode).json({ error: message, statusCode, body, headers })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`spotifydl-core server listening on port ${port}`)
})
