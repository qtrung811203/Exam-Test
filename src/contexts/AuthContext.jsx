import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// Helper to get cached data synchronously
const getProjectID = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  return url?.split('//')[1]?.split('.')[0]
}

const getCachedSession = () => {
  try {
    const projectId = getProjectID()
    if (!projectId) return null
    const item = localStorage.getItem(`sb-${projectId}-auth-token`)
    return item ? JSON.parse(item) : null
  } catch (e) {
    return null
  }
}

const getCachedProfile = () => {
  try {
    const item = localStorage.getItem('exampro-profile')
    return item ? JSON.parse(item) : null
  } catch (e) {
    return null
  }
}

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  // Synchronous initialization from localStorage
  const initialSession = getCachedSession()
  const initialProfile = getCachedProfile()
  
  const [user, setUser] = useState(initialSession?.user ?? null)
  const [profile, setProfile] = useState(initialProfile)
  
  // Only show full-page loading if we have NO cached user
  const [loading, setLoading] = useState(!initialSession?.user)

  const lastFetchedId = useRef(initialSession?.user?.id ?? null)
  const isInitializing = useRef(false)

  useEffect(() => {
    let mounted = true
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth initialization timed out after 5s')
        setLoading(false)
      }
    }, 5000)

    const handleAuthStateChange = async (event, session) => {
      if (!mounted) return
      console.log('Auth event processing:', event, session?.user?.id)

      const currentUser = session?.user ?? null
      
      // If no user, reset and stop loading
      if (!currentUser) {
        setUser(null)
        setProfile(null)
        localStorage.removeItem('exampro-profile')
        lastFetchedId.current = null
        setLoading(false)
        return
      }

      // If user ID changed, reset profile and set loading=true BEFORE fetching
      if (lastFetchedId.current !== currentUser.id) {
        setLoading(true)
        setProfile(null)
        setUser(currentUser)
        lastFetchedId.current = currentUser.id
        await fetchProfile(currentUser.id)
      } else {
        // Same user (e.g. TOKEN_REFRESHED), just sync user object
        setUser(currentUser)
        // If we don't have a profile yet (initial load in progress), it will be handled by the original fetchProfile
        if (profile) {
          setLoading(false)
        }
      }
    }

    const init = async () => {
      if (isInitializing.current) return
      isInitializing.current = true
      
      console.time('AuthFlow')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await handleAuthStateChange('INITIAL_SESSION', session)
      } catch (err) {
        console.error('Auth init error:', err)
        if (mounted) setLoading(false)
      } finally {
        if (mounted) {
          clearTimeout(timeout)
          console.timeEnd('AuthFlow')
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip INITIAL_SESSION as we handle it in init()
        if (event === 'INITIAL_SESSION') return
        await handleAuthStateChange(event, session)
      }
    )

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const fetchProfile = async (userId, retryCount = 0) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        // If profile doesn't exist yet, retry once after 500ms (trigger might be slow for new accounts)
        if (error.code === 'PGRST116' && retryCount < 1) {
          console.log(`Profile not found, retrying... (${retryCount + 1})`)
          setTimeout(() => fetchProfile(userId, retryCount + 1), 500)
          return
        }
        throw error
      }
      setProfile(data)
      localStorage.setItem('exampro-profile', JSON.stringify(data))
      setLoading(false)
    } catch (error) {
      console.error('Error fetching profile:', error)
      // Check if it's a "relation doesn't exist" error (SQL schema not run)
      if (error.code === '42P01') {
        alert('LỖI: Bảng "profiles" không tồn tại. Vui lòng chạy file "supabase-schema.sql" trong giao diện SQL của Supabase!')
      }
      setLoading(false)
    }
  }

  const signUp = async (email, password, fullName, role) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    })
    return { data, error }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setUser(null)
      setProfile(null)
      localStorage.removeItem('exampro-profile')
    }
    return { error }
  }

  const refreshAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user ?? null
      
      if (currentUser) {
        console.log('Refreshing profile for:', currentUser.id)
        await fetchProfile(currentUser.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    } catch (err) {
      console.error('Auth refresh error:', err)
      setLoading(false)
    }
  }

  const value = {
    user,
    profile,
    loading,
    refreshAuth,
    signUp,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
