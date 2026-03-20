import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Đang tải ứng dụng...</p>
        </div>
      </div>
    )
  }

  // If loading is done, user exists, but profile is missing
  if (user && !profile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900/60 backdrop-blur-xl border border-red-500/20 rounded-3xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Không tìm thấy hồ sơ</h2>
          <p className="text-gray-400 mb-8">
            Tài khoản của bạn đã được đăng nhập nhưng không tìm thấy thông tin hồ sơ (profile). 
            Vui lòng liên hệ quản trị viên.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors mb-3"
          >
            Thử lại
          </button>
          <button 
            onClick={() => {
              supabase.auth.signOut().then(() => {
                window.location.href = '/login'
              })
            }}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRole && profile?.role !== allowedRole) {
    const redirectPath = profile?.role === 'teacher' ? '/teacher' : '/student'
    return <Navigate to={redirectPath} replace />
  }

  return children
}
