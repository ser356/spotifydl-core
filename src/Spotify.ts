import { promises, unlink } from 'fs-extra'
import SpotifyApi, { IAuth, UserObjectPublic } from './lib/API'
import Artist from './lib/details/Atrist'
import Playlist from './lib/details/Playlist'
import SongDetails from './lib/details/Track'
import { downloadYT, downloadYTAndSave } from './lib/download'
import SpotifyDlError from './lib/Error'
import getYtlink from './lib/getYtlink'
import metadata from './lib/metadata'

export default class SpotifyFetcher extends SpotifyApi {
    constructor(auth: IAuth) {
        super(auth)
    }

    /**
     * Get the track details of the given track URL
     * @param url
     * @returns {SongDetails} Track
     */
    getTrack = async (url: string): Promise<SongDetails> => {
        await this.verifyCredentials()
        return await this.extractTrack(this.getID(url))
    }

    /**
     * Gets the info the given album URL
     * @param url
     * @returns {Playlist} Album
     */
    getAlbum = async (url: string): Promise<Playlist> => {
        await this.verifyCredentials()
        return await this.extractAlbum(this.getID(url))
    }

    /**
     * Gets the info of the given Artist URL
     * @param url
     * @returns {Artist} Artist
     */
    getArtist = async (url: string): Promise<Artist> => {
        await this.verifyCredentials()
        return await this.extractArtist(this.getID(url))
    }

    /**
     * Gets the list of albums from the given Artists URL
     * @param url
     * @returns {Playlist[]} Albums
     */
    getArtistAlbums = async (
        url: string
    ): Promise<{
        albums: Playlist[]
        artist: Artist
    }> => {
        await this.verifyCredentials()
        const artistResult = await this.getArtist(url)
        const albumsResult = await this.extractArtistAlbums(artistResult.id)
        const albumIds = albumsResult.map((album) => album.id)
        const albumInfos = []
        for (let x = 0; x < albumIds.length; x++) {
            albumInfos.push(await this.extractAlbum(albumIds[x]))
        }
        return {
            albums: albumInfos,
            artist: artistResult
        }
    }

    /**
     * Gets the playlist info from URL
     * @param url URL of the playlist
     * @returns
     */
    getPlaylist = async (url: string): Promise<Playlist> => {
        await this.verifyCredentials()
        return await this.extractPlaylist(this.getID(url))
    }

    getID = (url: string): string => {
        if (!url) return ''
        // Handle Spotify URIs like "spotify:playlist:ID"
        if (url.startsWith('spotify:')) {
            const parts = url.split(':').filter(Boolean)
            return parts[parts.length - 1]
        }
        // Strip query string and hash fragments from web URLs
        const clean = url.split('?')[0].split('#')[0]
        const segments = clean.split('/').filter(Boolean)
        return segments[segments.length - 1] || ''
    }

    /**
     * Downloads the given spotify track
     * @param url Url to download
     * @param filename file to save to
     * @returns `buffer` if no filename is provided and `string` if it is
     */
    downloadTrack = async <T extends undefined | string>(
        url: string,
        filename?: T
    ): Promise<T extends undefined ? Buffer : string> => {
        await this.verifyCredentials()
        const info = await this.getTrack(url)
        const link = await getYtlink(`${info.name} ${info.artists[0]}`)
        if (!link) throw new SpotifyDlError(`Couldn't get a download URL for the track: ${info.name}`)
        const data = await downloadYTAndSave(link, filename)
        await metadata(info, data)
        if (!filename) {
            const buffer = await promises.readFile(data)
            unlink(data)
            /* eslint-disable @typescript-eslint/no-explicit-any */
            return buffer as any
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        return data as any
    }

    /**
     * Gets the Buffer of track from the info
     * @param info info of the track got from `spotify.getTrack()`
     * @returns
     */
    downloadTrackFromInfo = async (info: SongDetails): Promise<Buffer> => {
        const link = await getYtlink(`${info.name} ${info.artists[0]}`)
        if (!link) throw new SpotifyDlError(`Couldn't get a download URL for the track: ${info.name}`)
        return await downloadYT(link)
    }

    private downloadBatch = async (url: string, type: 'album' | 'playlist'): Promise<(string | Buffer)[]> => {
        await this.verifyCredentials()
        const playlist = await this[type === 'album' ? 'getAlbum' : 'getPlaylist'](url)
        return Promise.all(
            playlist.tracks.map(async (track) => {
                try {
                    return await this.downloadTrack(track)
                } catch (err) {
                    return ''
                }
            })
        )
    }

    /**
     * Downloads the tracks of a playlist
     * @param url URL of the playlist
     * @returns `Promise<(string|Buffer)[]>`
     */
    downloadPlaylist = async (url: string): Promise<(string | Buffer)[]> => await this.downloadBatch(url, 'playlist')

    /**
     * Downloads the tracks of a Album
     * @param url URL of the Album
     * @returns `Promise<(string|Buffer)[]>`
     */
    downloadAlbum = async (url: string): Promise<(string | Buffer)[]> => await this.downloadBatch(url, 'album')

    /**
     * Downloads tracks for multiple playlists
     * @param urls Array of playlist URLs
     * @returns Array of per-playlist downloads
     */
    downloadPlaylists = async (urls: string[]): Promise<(string | Buffer)[][]> => {
        await this.verifyCredentials()
        return Promise.all(urls.map((u) => this.downloadPlaylist(u)))
    }

    /**
     * Gets the info of tracks from playlist URL
     * @param url URL of the playlist
     */
    getTracksFromPlaylist = async (
        url: string
    ): Promise<{ name: string; total_tracks: number; tracks: SongDetails[] }> => {
        await this.verifyCredentials()
        const playlist = await this.getPlaylist(url)
        const tracks = await this.mapWithConcurrency(playlist.tracks, 5, (track) => this.getTrack(track))
        return {
            name: playlist.name,
            total_tracks: playlist.total_tracks,
            tracks
        }
    }

    /**
     * Gets the info of tracks from Album URL
     * @param url URL of the playlist
     */
    getTracksFromAlbum = async (
        url: string
    ): Promise<{ name: string; total_tracks: number; tracks: SongDetails[] }> => {
        await this.verifyCredentials()
        const playlist = await this.getAlbum(url)
        const tracks = await this.mapWithConcurrency(playlist.tracks, 5, (track) => this.getTrack(track))
        return {
            name: playlist.name,
            total_tracks: playlist.total_tracks,
            tracks
        }
    }

    /**
     * Gets track info from multiple playlists
     * @param urls Array of playlist URLs
     */
    getTracksFromPlaylists = async (
        urls: string[]
    ): Promise<Array<{ name: string; total_tracks: number; tracks: SongDetails[] }>> => {
        await this.verifyCredentials()
        return Promise.all(urls.map((u) => this.getTracksFromPlaylist(u)))
    }

    getSpotifyUser = async (id: string): Promise<UserObjectPublic> => await this.getUser(id)

    private mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
        const results: R[] = []
        let index = 0
        const workers = Array(Math.max(1, limit)).fill(0).map(async () => {
            while (index < items.length) {
                const i = index++
                const res = await fn(items[i])
                results[i] = res
            }
        })
        await Promise.all(workers)
        return results
    }
}
