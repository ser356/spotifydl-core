<div align=center>

# Spotifydl-Core

<img src="https://img.icons8.com/nolan/256/spotify.png" alt="Never gonna give up, never gonna let you down"/>

### A simple package to download music tracks from spotify 🎵
</div>

## Installation 

```sh
> npm i spotifydl-core
```

## Intialization 

You need to intialize the `Spotify` Class before acessing the methods inside it.

```js
const Spotify = require('spotifydl-core').default
//import Spotify from 'spotifydl-core'

const credentials = {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret'
}
const spotify = new Spotify(credentials)
```

## Methods 
> **NOTE: Only some methods are shown here. Checkout the [docs](https://alensaito1.github.io/spotifydl-core/) for a more in-depth documentation**

**Get Track ⏭️**
```JS
await spotify.getTrack(track_url) 

// For Example: track_url = 'https://open.spotify.com/track/1Ub6VfiTXgyV8HnsfzrZzC?si=4412ef4ebd8141ab'

// Input: url of the track, Type: string
```
**Download Track/Song ⬇️**
```JS
await spotify.downloadTrack(track_url, file_name)

// For Example: track_url = 'https://open.spotify.com/track/1Ub6VfiTXgyV8HnsfzrZzC?si=4412ef4ebd8141ab' & file_name = 'song.mp3'

// Input: url of the track and name of the filename, Both Type: string

// It'll return buffer (promise) if you don't provide any filename

```

**Get Artist 👩‍🎤🧑‍🎤**
```JS
await spotify.getArtist(artist_url)

// For Example: artist_url = 'https://open.spotify.com/artist/3B9O5mYYw89fFXkwKh7jCS'

// Input: url of the artist, Type: string
```

**Get Album 💽**
```JS
await spotify.getAlbum(album_url)

// For Example: album_url = 'https://open.spotify.com/album/3u3WsbVPLT0fXiClx9GYD9?si=pfGAdL3VRiid0M3Ln_0DNg'

// Input: url of the album, Type: string
```

**Get Playlist 🎧**

```JS
await spotify.getPlylist(playlist_url)

// Input: url of the playlist, Type: string
```

**Download an Entire playlist**

```JS
await spotify.downloadPlaylist(playlist_url)

//It'll return an array containing the Buffer of the songs in the playlist
```

## Usage Example
```JS
const fs = require('fs-extra') 
// Initialization and Authentication 
const Spotify = require('spotifydl-core').default // Import the library 
const spotify = new Spotify({ // Authentication
    clientId: 'acc6302297e040aeb6e4ac1fbdfd62c3', // <-- add your own clientId 
    clientSecret: '0e8439a1280a43aba9a5bc0a16f3f009', // <-- add your own clientSecret 
})
/* To learn more about clientId and Secret  , 
visit https://developer.spotify.com/documentation/general/guides/app-settings/ 
*/

// Declaring the respective url in 'links' object 
const links = {
    artist: 'https://open.spotify.com/artist/7ky9g1jEjCsjNjZbYuflUJ?si=2To3fmc-T9KuyyrQ-Qp5KQ', // Url of the artist you want to gather info about
    album: 'https://open.spotify.com/album/3u3WsbVPLT0fXiClx9GYD9?si=pfGAdL3VRiid0M3Ln_0DNg', // Url of the album you want to gather info about
    song: 'https://open.spotify.com/track/1Ub6VfiTXgyV8HnsfzrZzC?si=4412ef4ebd8141ab' // Url of the song you want to gather info about or download
};

// Engine 
(async () => {
    const data = await spotify.getTrack(links.song) // Waiting for the data 🥱
    console.log('Downloading: ', data.name, 'by:', data.artists.join(' ')) // Keep an eye on the progress
    const song = await spotify.downloadTrack(links.song) // Downloading goes brr brr 
    fs.writeFileSync('song.mp3', song) // Let's write the buffer to the woofer (i mean file, hehehe) 
})()

//spotify.verifyCredentials().then(() => Promise.all([spotify.getTrack(links.song), spotify.getAlbum(links.album), spotify.getArtistAlbums(links.artist)]).then(console.log))
```

# 🙇‍ Special Thanks

- Swapnil Soni: [Spotify-dl](https://github.com/SwapnilSoni1999/spotify-dl)
- Fent: [Ytdl-core](https://github.com/fent/node-ytdl-core)

## Deployment

- **Docker:** Build and run the web service.

    1. Build the image

         ```bash
         docker build -t spotifydl-core:latest .
         ```

    2. Run the container

         ```bash
         docker run --rm -p 3000:3000 -e PORT=3000 spotifydl-core:latest
         ```

    3. Health check

         ```bash
         curl http://localhost:3000/health
         ```

- **Railway / Fly.io / Render:** Create a Docker-based web service using the provided `Dockerfile`.
    - Expose port `3000`.
    - The service requires `ffmpeg` (installed in the image) and downloads `yt-dlp` binary at runtime.
    - Use `POST /playlists/process` with `accessToken`, optional `refreshToken`, `clientId`, and `playlists` array.

- **Environment Notes:**
    - `ffmpeg` is required for audio conversion.
    - `PORT` defaults to `3000` if not set.

### Proxy & yt-dlp configuration

- `YTDLP_BIN`: Optional absolute path to `yt-dlp` (or `youtube-dl`).
- `YTDLP_COOKIES_PATH`: Optional path to a cookies file for YouTube (mitigates auth prompts).
- `YTDLP_COOKIES_B64`: Optional base64-encoded contents of a Netscape-format cookies file. If set, a temporary file is created and used. When cookies are provided, proxy resolution is skipped.
- `YTDLP_PROXY`: Static proxy used by `yt-dlp` (e.g. `http://IP:PORT`).
- `ENABLE_PROXY`: When truthy and `YTDLP_PROXY` is not set, auto-fetches a proxy at startup.
- `YTDLP_PROXY_ROTATE`: When truthy, fetches a fresh proxy for each download.

Examples:

```bash
# Use a fixed proxy
export YTDLP_PROXY=http://203.0.113.10:8080

# Auto-pick a proxy once at startup
export ENABLE_PROXY=1

# Rotate proxy per track download
export YTDLP_PROXY_ROTATE=1

# Provide YouTube cookies to avoid bot checks
export YTDLP_COOKIES_PATH=/app/cookies.txt

# Alternatively, pass cookies via base64 (Heroku-friendly)
# The value should be base64 of a Netscape HTTP Cookie File
export YTDLP_COOKIES_B64="$(base64 -w0 /path/to/cookies.txt)"
```

Notes:

- When `YTDLP_COOKIES_PATH` or `YTDLP_COOKIES_B64` is set, the service will not use proxies for YouTube downloads.
- To generate a cookies file, export cookies from your browser in Netscape format (e.g. using an extension), or use `yt-dlp` with `--cookies-from-browser` locally to produce one.
```
