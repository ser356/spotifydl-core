import SpotifyAPI from 'spotify-web-api-node'
import axios from 'axios'
import { URLSearchParams } from 'url'
import Artist from './details/Atrist'
import Playlist from './details/Playlist'
import TrackDetails from './details/Track'

const MAX_LIMIT_DEFAULT = 50
const REFRESH_ACCESS_TOKEN_SECONDS = 55 * 60
const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 1000

export default class SpotifyApi {
    private spotifyAPI: SpotifyAPI

    nextTokenRefreshTime!: Date

    constructor(private auth: IAuth) {
        // Initialize SpotifyAPI with available client credentials when present
        const initOptions: Partial<{ clientId: string; clientSecret: string }> = {}
        if ('clientId' in this.auth && 'clientSecret' in this.auth) {
            initOptions.clientId = this.auth.clientId
            initOptions.clientSecret = this.auth.clientSecret
        }
        this.spotifyAPI = new SpotifyAPI(initOptions)

        // If an access token was provided (PKCE/user auth), set it now
        if ('accessToken' in this.auth && this.auth.accessToken) {
            this.spotifyAPI.setAccessToken(this.auth.accessToken)
            if (this.auth.refreshToken) this.spotifyAPI.setRefreshToken(this.auth.refreshToken)
            // Proactively set next refresh time if using user tokens
            this.nextTokenRefreshTime = new Date()
            this.nextTokenRefreshTime.setSeconds(this.nextTokenRefreshTime.getSeconds() + REFRESH_ACCESS_TOKEN_SECONDS)
        }
    }

    verifyCredentials = async (): Promise<void> => {
        if (!this.nextTokenRefreshTime || this.nextTokenRefreshTime < new Date()) {
            this.nextTokenRefreshTime = new Date()
            this.nextTokenRefreshTime.setSeconds(this.nextTokenRefreshTime.getSeconds() + REFRESH_ACCESS_TOKEN_SECONDS)
            await this.checkCredentials()
        }
    }

    private sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

    private withRateLimit = async <T>(fn: () => Promise<T>, attempt = 0): Promise<T> => {
        try {
            return await fn()
        } catch (err: any) {
            const status = err?.statusCode || err?.status
            if (status === 429 && attempt < MAX_RETRIES) {
                const headers = err?.headers || err?.response?.headers || {}
                const retryAfterHeader = headers['retry-after'] || headers['Retry-After']
                const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : null
                const backoffMs = retryAfterSec && !Number.isNaN(retryAfterSec)
                    ? retryAfterSec * 1000
                    : BASE_BACKOFF_MS * Math.pow(2, attempt)
                await this.sleep(backoffMs)
                return this.withRateLimit(fn, attempt + 1)
            }
            throw err
        }
    }

    checkCredentials = async (): Promise<void> => {
        // If we have a user access token (PKCE) set, prefer refreshing via refresh token when provided
        const hasUserAccessToken = !!this.spotifyAPI.getAccessToken()
        const hasRefreshToken = !!this.spotifyAPI.getRefreshToken()

        if (hasUserAccessToken) {
            if (hasRefreshToken) {
                await this.refreshUserAccessToken()
            }
            // If no refresh token, assume frontend manages token rotation and just proceed
            return
        }

        // Fallback: client credentials grant
        if (!(await this.spotifyAPI.getRefreshToken())) return void (await this.requestTokens())
        await this.refreshToken()
    }

    requestTokens = async (): Promise<void> => {
        const data = (await this.spotifyAPI.clientCredentialsGrant()).body
        this.spotifyAPI.setAccessToken(data['access_token'])
        // Client Credentials flow does not provide a refresh token; keep behavior safe
        const maybeRefresh = (data as ClientCredentialsGrantResponseEX)['refresh_token']
        if (maybeRefresh) this.spotifyAPI.setRefreshToken(maybeRefresh)
    }

    refreshToken = async (): Promise<void> => {
        const data = (await this.spotifyAPI.refreshAccessToken()).body
        this.spotifyAPI.setAccessToken(data['access_token'])
    }

    // Refresh user access token using PKCE-compatible endpoint (no client secret required)
    private refreshUserAccessToken = async (): Promise<void> => {
        // Only attempt manual refresh when we have refreshToken and clientId available
        const refreshToken = this.spotifyAPI.getRefreshToken()
        const clientId = 'accessToken' in this.auth ? this.auth.clientId : undefined
        if (!refreshToken || !clientId) return

        const params = new URLSearchParams()
        params.append('grant_type', 'refresh_token')
        params.append('refresh_token', refreshToken as string)
        params.append('client_id', clientId as string)

        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        const data = response.data as PKCERefreshResponse
        if (data.access_token) this.spotifyAPI.setAccessToken(data.access_token)
    }

    extractTrack = async (trackId: string): Promise<TrackDetails> => {
        const data = (await this.withRateLimit(() => this.spotifyAPI.getTrack(trackId))).body
        const details = new TrackDetails()
        details.name = data.name
        data.artists.forEach((artist) => {
            details.artists.push(artist.name)
        })
        details.album_name = data.album.name
        details.release_date = data.album.release_date
        details.cover_url = data.album.images[0].url
        return details
    }

    extractPlaylist = async (playlistId: string): Promise<Playlist> => {
        const data = (await this.withRateLimit(() => this.spotifyAPI.getPlaylist(playlistId))).body
        const details = new Playlist(
            '',
            0,
            data.tracks.items.map((item) => item.track!.id)
        )

        details.name = data.name + ' - ' + data.owner.display_name
        details.total_tracks = data.tracks.total
        if (data.tracks.next) {
            let offset = details.tracks.length
            while (details.tracks.length < details.total_tracks) {
                const playlistTracksData = (
                    await this.withRateLimit(() =>
                        this.spotifyAPI.getPlaylistTracks(playlistId, { limit: MAX_LIMIT_DEFAULT, offset: offset })
                    )
                ).body
                details.tracks = details.tracks.concat(playlistTracksData.items.map((item) => item.track!.id))
                offset += MAX_LIMIT_DEFAULT
            }
        }
        return details
    }

    extractAlbum = async (albumId: string): Promise<Playlist> => {
        const data = (await this.withRateLimit(() => this.spotifyAPI.getAlbum(albumId))).body
        const details = new Playlist(
            '',
            0,
            data.tracks.items.map((item) => item.id)
        )
        details.name = data.name + ' - ' + data.label
        details.total_tracks = data.tracks.total
        if (data.tracks.next) {
            let offset = details.tracks.length
            while (details.tracks.length < data.tracks.total) {
                const albumTracks = (
                    await this.withRateLimit(() =>
                        this.spotifyAPI.getAlbumTracks(albumId, { limit: MAX_LIMIT_DEFAULT, offset: offset })
                    )
                ).body
                details.tracks = details.tracks.concat(albumTracks.items.map((item) => item.id))
                offset += MAX_LIMIT_DEFAULT
            }
        }
        return details
    }

    extractArtist = async (artistId: string): Promise<Artist> => {
        const data = (await this.withRateLimit(() => this.spotifyAPI.getArtist(artistId))).body
        return new Artist(data.id, data.name, data.href)
    }

    extractArtistAlbums = async (artistId: string): Promise<SpotifyApi.AlbumObjectSimplified[]> => {
        const artistAlbums = (
            await this.withRateLimit(() => this.spotifyAPI.getArtistAlbums(artistId, { limit: MAX_LIMIT_DEFAULT }))
        ).body
        let albums = artistAlbums.items
        if (artistAlbums.next) {
            let offset = albums.length
            while (albums.length < artistAlbums.total) {
                const additionalArtistAlbums = (
                    await this.withRateLimit(() =>
                        this.spotifyAPI.getArtistAlbums(artistId, { limit: MAX_LIMIT_DEFAULT, offset: offset })
                    )
                ).body

                albums = albums.concat(additionalArtistAlbums.items)
                offset += MAX_LIMIT_DEFAULT
            }
        }
        return albums
    }

    getUser = async (id: string): Promise<UserObjectPublic> => {
        await this.verifyCredentials()
        return (await this.withRateLimit(() => this.spotifyAPI.getUser(id))) as UserObjectPublic
    }
}

export interface IAuth {
    // One of the following must be provided:
    // 1) Client credentials (service-level access)
    // 2) User access token (PKCE/Authorization Code) optionally with refresh token
    clientId?: string
    clientSecret?: string

    accessToken?: string
    refreshToken?: string
}

interface ClientCredentialsGrantResponseEX {
    access_token: string
    expires_in: number
    token_type: string
    refresh_token: string
}

interface PKCERefreshResponse {
    access_token: string
    token_type: string
    expires_in: number
    scope?: string
}

export interface UserObjectPublic {
    display_name?: string
    external_urls?: {
        spotify: string
    }
    followers?: {
        href?: null
        total: string
    }
    href?: string
    id?: string
    images?: ImageObject[]
    type?: 'user'
    uri?: string
}

export interface ImageObject {
    height?: number
    url: string
    width?: number
}
