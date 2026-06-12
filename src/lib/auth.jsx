import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState([])
  const [activeLocation, setActiveLocationState] = useState(localStorage.getItem('pos.activeLocation') || 'Iloilo')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let active = true
    Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('locations').select('name').order('name'),
    ]).then(([{ data: prof }, { data: locs }]) => {
      if (!active) return
      setProfile(prof ?? null)
      setLocations((locs ?? []).map((l) => l.name))
      // Staff are locked to their assigned branch; admin keeps last choice
      if (prof && !prof.is_admin && prof.location) setActiveLocationState(prof.location)
      setLoading(false)
    })
    return () => { active = false }
  }, [session?.user?.id])

  function setActiveLocation(loc) {
    // Only admins may switch branches
    if (!profile?.is_admin) return
    localStorage.setItem('pos.activeLocation', loc)
    setActiveLocationState(loc)
  }

  const value = {
    session,
    profile,
    loading,
    isAdmin: !!profile?.is_admin,
    location: profile?.location ?? null,
    tags: profile?.tags ?? [],
    // Can the current user write to a module? Admin always; else must hold the tag.
    // Pass one tag or an array (any-match).
    canWrite: (mods) => {
      if (profile?.is_admin) return true
      const have = profile?.tags ?? []
      const need = Array.isArray(mods) ? mods : [mods]
      return need.some((m) => have.includes(m))
    },
    locations,
    activeLocation,
    setActiveLocation,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
