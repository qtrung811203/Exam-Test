import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Navbar from '../../components/Navbar'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [sessions, setSessions] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) {
      console.log('StudentDashboard: profile ready, fetching data...', profile.id)
      fetchData()
    } else {
      console.log('StudentDashboard: profile not ready yet')
    }
  }, [profile?.id])

  const fetchData = async () => {
    try {
      const { data: assignData } = await supabase
        .from('assignments')
        .select('*, profiles:teacher_id(full_name)')
        .order('created_at', { ascending: false })

      setAssignments(assignData || [])

      const { data: sessionData } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('student_id', profile.id)

      const sessionMap = {}
      sessionData?.forEach(s => {
        sessionMap[s.assignment_id] = s
      })
      setSessions(sessionMap)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 py-16">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Xin chào, {profile?.full_name} 👋</h1>
          <p className="text-gray-400 mt-4 text-lg">Danh sách bài tập của bạn</p>
        </div>

        {/* Assignment Grid */}
        {assignments.length === 0 ? (
          <div className="text-center py-24 bg-gray-900/40 border border-gray-800 rounded-3xl">
            <p className="text-gray-500 text-lg">Chưa có bài tập nào</p>
            <p className="text-gray-600 text-sm mt-2">Giáo viên sẽ đăng bài tập tại đây</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-9">
            {assignments.map((a) => {
              const session = sessions[a.id]
              const isLocked = session?.is_locked || session?.status === 'locked'
              const isCompleted = session?.status === 'completed'
              const isTerminated = isLocked || isCompleted

              const now = new Date()
              const availableFrom = a.available_from ? new Date(a.available_from) : null
              const availableUntil = a.available_until ? new Date(a.available_until) : null
              
              const isUpcoming = availableFrom && now < availableFrom
              const isExpired = availableUntil && now > availableUntil

              return (
                <div key={a.id} className={`bg-gray-900/60 backdrop-blur-xl border rounded-3xl p-9 transition-all duration-300 group ${isTerminated
                  ? (isCompleted ? 'border-emerald-500/30 opacity-90' : 'border-red-500/30 opacity-75')
                  : 'border-gray-800 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10'
                  }`}>
                  {/* PDF Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                    isCompleted ? 'bg-emerald-500/10' :
                    isLocked ? 'bg-red-500/10' :
                    'bg-indigo-500/10 group-hover:bg-indigo-500/20'
                    } transition-colors`}>
                    {isCompleted ? (
                      <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isLocked ? (
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>

                  <h3 className="text-white font-semibold text-lg mb-2">{a.title}</h3>
                  {a.description && (
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2">{a.description}</p>
                  )}

                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-5">
                    <span className="truncate">👨‍🏫 {a.profiles?.full_name}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {a.duration_minutes || 60}'
                    </span>
                    <span>•</span>
                    <span>{new Date(a.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>

                  {/* Session status */}
                  {session && (
                    <div className="mb-5 flex items-center gap-2">
                      {isCompleted ? (
                        <span className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
                          ✅ Đã hoàn thành ({session.tab_switch_count}/4 lần chuyển tab)
                        </span>
                      ) : isLocked ? (
                        <span className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-medium">
                          🔒 Đã bị khóa ({session.tab_switch_count} lần chuyển tab)
                        </span>
                      ) : (
                        <span className="text-xs px-3 py-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full font-medium">
                          ⚠️ {session.tab_switch_count}/4 lần chuyển tab
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action button */}
                  {isCompleted ? (
                    <div className="w-full py-3.5 bg-emerald-500/10 text-emerald-400 text-sm font-medium rounded-xl text-center border border-emerald-500/20">
                      Đã nộp bài
                    </div>
                  ) : isLocked ? (
                    <div className="w-full py-3.5 bg-red-500/10 text-red-400 text-sm font-medium rounded-xl text-center border border-red-500/20">
                      Không thể xem bài
                    </div>
                  ) : isUpcoming ? (
                    <div className="w-full py-3.5 bg-yellow-500/10 text-yellow-400 text-sm font-medium rounded-xl text-center border border-yellow-500/20">
                      Sẽ mở lúc {availableFrom.toLocaleString('vi-VN')}
                    </div>
                  ) : isExpired ? (
                    <div className="w-full py-3.5 bg-gray-800 text-gray-400 text-sm font-medium rounded-xl text-center border border-gray-700">
                      Đã kết thúc lúc {availableUntil.toLocaleString('vi-VN')}
                    </div>
                  ) : (
                    <Link
                      to={`/student/exam/${a.id}`}
                      className="block w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-sm font-medium rounded-xl text-center shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
                    >
                      {session ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
