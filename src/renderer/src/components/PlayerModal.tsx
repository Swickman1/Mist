import { useEffect } from 'react'
import { Player } from '../../../player'
import { episodeLabel, entryFor } from '../selectors'
import { api, useMist } from '../store'
import { Modal } from './Modal'

export function PlayerModal() {
  const { snapshot, playingEpisodeId, openPlayer } = useMist()
  const episode = snapshot.episodes.find((ep) => ep.id === playingEpisodeId)
  const entryId = episode && entryFor(snapshot, 'show', episode.showId)?.id

  // Opening the player counts as playing: it bumps the show's lastPlayedAt.
  useEffect(() => {
    if (entryId) void api.play(entryId)
  }, [playingEpisodeId, entryId])

  if (!episode) return null
  const show = snapshot.shows.find((s) => s.id === episode.showId)!

  return (
    <Modal title={show.title} onClose={() => openPlayer(null)} wide>
      <Player
        key={episode.id}
        title={`${show.title} · ${episodeLabel(episode)}`}
        subtitle={episode.title}
        filePath={episode.filePath}
        poster={episode.still}
        startAtSec={episode.positionSec}
        onPosition={(positionSec) => void api.setEpisodePosition(episode.id, positionSec)}
        onClose={() => openPlayer(null)}
      />
    </Modal>
  )
}
