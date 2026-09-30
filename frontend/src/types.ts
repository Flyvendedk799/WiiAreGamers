export type Shelf = 'motion' | 'party' | 'racing' | 'platform' | 'adventure'
export type Controls = 'motion' | 'platform' | 'racing' | 'party'
export type Motif = 'lanes' | 'orbit' | 'coins' | 'burst' | 'ridge' | 'grid'

export type Game = {
  id: string
  title: string
  year: number
  players: string
  genre: string
  shelf: Shelf
  controls: Controls
  blurb: string
  playNote: string
  palette: [string, string, string]
  motif: Motif
  fileHint: string
  installed: boolean
}

export type CouchPlayer = {
  id: string
  name: string
  accent: string
}

export type PlayRecord = {
  gameId: string
  startedAt: number
  endedAt: number | null
}

export type Profile = {
  id: string
  username: string
  displayName: string
  tagline: string
  accent: string
  favorites: string[]
  couch: CouchPlayer[]
  createdAt: number
  stats: {
    plays: number
    minutes: number
    lastGameId: string | null
  }
  recent: PlayRecord[]
}

export type StreamStatus = {
  running: boolean
  gameId: string | null
  partyCode: string | null
  players: number
}

export const ACCENTS = ['#e4c27a', '#e07a5f', '#81b29a', '#7eb6d6', '#c986b0', '#f3efe6'] as const
