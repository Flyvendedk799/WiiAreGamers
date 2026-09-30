import { useAuth } from './auth.tsx'
import Controller from './Controller.tsx'
import { Frame } from './Frame.tsx'
import { Gate } from './Gate.tsx'
import { Library } from './Library.tsx'
import { ProfilePage } from './ProfilePage.tsx'
import { Theater } from './Theater.tsx'
import { Title } from './Title.tsx'
import { useRoute } from './router.ts'

export function Console() {
  const path = useRoute()
  const { profile, ready } = useAuth()

  if (path === '/controller') return <Controller />
  if (!ready) {
    return (
      <div className="boot">
        <p className="kicker">Wii Are Gamers</p>
        <p className="boot-line">Warming the room</p>
      </div>
    )
  }
  if (!profile) return <Gate />

  let page = <Library />
  if (path === '/profile') page = <ProfilePage />
  else if (path.startsWith('/title/')) page = <Title id={decodeURIComponent(path.slice('/title/'.length))} />
  else if (path.startsWith('/play/')) page = <Theater id={decodeURIComponent(path.slice('/play/'.length))} />

  return <Frame>{page}</Frame>
}
