import { useState, useEffect } from 'react'
import { supabase, createAccountClient } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Navbar from '../../components/Navbar'

export default function TeacherDashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('assignments')

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadDuration, setUploadDuration] = useState(60) // Default 60 mins
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Account creation state
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [accEmail, setAccEmail] = useState('')
  const [accPassword, setAccPassword] = useState('')
  const [accFullName, setAccFullName] = useState('')
  const [accRole, setAccRole] = useState('student')
  const [accLoading, setAccLoading] = useState(false)
  const [accError, setAccError] = useState('')
  const [accSuccess, setAccSuccess] = useState('')

  useEffect(() => {
    if (profile?.id) {
      console.log('TeacherDashboard: profile ready, fetching data...', profile.id)
      fetchData()
    } else {
      console.log('TeacherDashboard: profile not ready yet')
    }
  }, [profile?.id])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: assignData } = await supabase
        .from('assignments')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('created_at', { ascending: false })

      setAssignments(assignData || [])

      if (assignData && assignData.length > 0) {
        const assignmentIds = assignData.map(a => a.id)
        const { data: sessionData } = await supabase
          .from('exam_sessions')
          .select(`
            *,
            profiles:student_id(full_name),
            assignments:assignment_id(title)
          `)
          .in('assignment_id', assignmentIds)
          .order('started_at', { ascending: false })

        setSessions(sessionData || [])
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!uploadFile) return

    setUploading(true)
    setUploadError('')

    try {
      const fileExt = uploadFile.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `pdfs/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('assignments')
        .upload(filePath, uploadFile)

      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('assignments')
        .getPublicUrl(filePath)

      const { error: insertErr } = await supabase
        .from('assignments')
        .insert({
          teacher_id: profile.id,
          title: uploadTitle,
          description: uploadDesc,
          duration_minutes: parseInt(uploadDuration),
          pdf_url: urlData.publicUrl,
        })

      if (insertErr) throw insertErr

      setUploadTitle('')
      setUploadDesc('')
      setUploadDuration(60)
      setUploadFile(null)
      setShowUpload(false)
      await fetchData()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleCreateAccount = async (e) => {
    e.preventDefault()
    setAccLoading(true)
    setAccError('')
    setAccSuccess('')

    try {
      // Internal email format for Supabase auth - use a robust dummy format
      const cleanUsername = accEmail.trim().replace(/\s+/g, '')
      const internalEmail = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@student.exam`

      const accountClient = createAccountClient()
      const { error } = await accountClient.auth.signUp({
        email: internalEmail,
        password: accPassword,
        options: {
          data: {
            full_name: accFullName,
            role: accRole,
          },
        },
      })

      if (error) {
        if (error.code === 'over_email_send_rate_limit') {
          throw new Error('Hệ thống đang yêu cầu xác nhận email. Bạn cần vào Supabase Dashboard -> Authentication -> Settings -> Tắt "Confirm Email" để tạo tài khoản không cần email.')
        }
        throw error
      }

      setAccSuccess(`Tạo tài khoản thành công cho ${accFullName} (${accRole === 'student' ? 'Học sinh' : 'Giáo viên'})`)
      setAccEmail('')
      setAccPassword('')
      setAccFullName('')
      setAccRole('student')

      setTimeout(() => setAccSuccess(''), 5000)
    } catch (err) {
      setAccError(err.message)
    } finally {
      setAccLoading(false)
    }
  }

  const deleteAssignment = async (id, pdfUrl) => {
    if (!confirm('Bạn có chắc muốn xóa bài tập này?')) return

    try {
      const path = pdfUrl.split('/assignments/')[1]
      if (path) {
        await supabase.storage.from('assignments').remove([path])
      }
      await supabase.from('assignments').delete().eq('id', id)
      await fetchData()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const getViolationBadge = (count, isLocked, status) => {
    if (isLocked || status === 'locked') return 'bg-red-500/20 text-red-400 border-red-500/30'
    if (count >= 3) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    if (count >= 1) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
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
        <div className="flex items-center justify-between mb-14">
          <div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight">Dashboard Giáo viên</h1>
            <p className="text-gray-400 mt-4 text-lg">Quản lý bài tập, tài khoản và giám sát học sinh</p>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all duration-200 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Đăng bài tập
          </button>
        </div>

        {/* Upload Modal */}
        {showUpload && (
          <div className="mb-10 bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in">
            <h3 className="text-lg font-semibold text-white mb-6">Đăng bài tập mới</h3>
            {uploadError && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {uploadError}
              </div>
            )}
            <form onSubmit={handleUpload} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tiêu đề</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="VD: Đề kiểm tra Toán học kỳ 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Mô tả (tuỳ chọn)</label>
                <textarea
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  placeholder="Mô tả ngắn về bài tập..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Thời gian làm bài (phút)</label>
                <input
                  type="number"
                  value={uploadDuration}
                  onChange={(e) => setUploadDuration(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Ví dụ: 60"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">File PDF</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  required
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer cursor-pointer"
                />
              </div>
              <div className="flex gap-4 pt-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? 'Đang tải lên...' : 'Đăng bài'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-all cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-2.5 mb-16 w-fit">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'assignments'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            📄 Bài tập ({assignments.length})
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'monitor'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            👁️ Giám sát ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'accounts'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            👤 Tài khoản
          </button>
        </div>

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div className="grid gap-7">
            {assignments.length === 0 ? (
              <div className="text-center py-20 bg-gray-900/40 border border-gray-800 rounded-2xl">
                <p className="text-gray-500 text-lg">Chưa có bài tập nào</p>
                <p className="text-gray-600 text-sm mt-2">Nhấn "Đăng bài tập" để thêm bài mới</p>
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg group-hover:text-indigo-400 transition-colors">
                        {a.title}
                      </h3>
                      {a.description && (
                        <p className="text-gray-500 text-sm mt-2">{a.description}</p>
                      )}
                      <p className="text-gray-600 text-xs mt-3">
                        📅 {new Date(a.created_at).toLocaleDateString('vi-VN', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-6">
                      <a
                        href={a.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                        title="Xem PDF"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </a>
                      <button
                        onClick={() => deleteAssignment(a.id, a.pdf_url)}
                        className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                        title="Xóa bài tập"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Monitor Tab */}
        {activeTab === 'monitor' && (
          <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden">
            {sessions.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-500 text-lg">Chưa có phiên thi nào</p>
                <p className="text-gray-600 text-sm mt-2">Học sinh sẽ xuất hiện khi bắt đầu làm bài</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-8 py-6 text-xs font-semibold text-gray-400 uppercase tracking-widest">Học sinh</th>
                      <th className="text-left px-8 py-6 text-xs font-semibold text-gray-400 uppercase tracking-widest">Bài tập</th>
                      <th className="text-center px-8 py-6 text-xs font-semibold text-gray-400 uppercase tracking-widest">Lỗi chuyển tab</th>
                      <th className="text-center px-8 py-6 text-xs font-semibold text-gray-400 uppercase tracking-widest">Trạng thái</th>
                      <th className="text-left px-8 py-6 text-xs font-semibold text-gray-400 uppercase tracking-widest">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                              {s.profiles?.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-white font-medium text-sm">{s.profiles?.full_name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-gray-400 text-sm">{s.assignments?.title || '—'}</td>
                        <td className="px-8 py-6 text-center">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${getViolationBadge(s.tab_switch_count, s.is_locked, s.status)}`}>
                            {s.tab_switch_count} lần
                          </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                          {s.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
                              ✅ Đã nộp
                            </span>
                          ) : s.is_locked || s.status === 'locked' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full text-xs font-medium border border-red-500/20">
                              🔒 Đã khóa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-full text-xs font-medium border border-blue-500/20">
                              ⏳ Đang làm
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-gray-500 text-sm">
                          {new Date(s.started_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          {s.locked_at && (
                            <span className="text-red-400 ml-2">
                              → {new Date(s.locked_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div>
            {/* Create Account Form */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl max-w-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Tạo tài khoản mới</h3>
              <p className="text-gray-500 text-sm mb-8">Tạo tài khoản cho học sinh hoặc giáo viên khác</p>

              {accError && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {accError}
                </div>
              )}

              {accSuccess && (
                <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {accSuccess}
                </div>
              )}

              <form onSubmit={handleCreateAccount} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Họ và tên</label>
                  <input
                    type="text"
                    value={accFullName}
                    onChange={(e) => setAccFullName(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Tên đăng nhập</label>
                  <input
                    type="text"
                    value={accEmail}
                    onChange={(e) => setAccEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="VD: hocsinh01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Mật khẩu</label>
                  <input
                    type="text"
                    value={accPassword}
                    onChange={(e) => setAccPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Vai trò</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setAccRole('student')}
                      className={`p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-center ${accRole === 'student'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-gray-700 bg-gray-800/30 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                      <span className="text-2xl block mb-2">🎓</span>
                      <span className="text-sm font-medium">Học sinh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccRole('teacher')}
                      className={`p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-center ${accRole === 'teacher'
                        ? 'border-purple-500 bg-purple-500/10 text-white'
                        : 'border-gray-700 bg-gray-800/30 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                      <span className="text-2xl block mb-2">👨‍🏫</span>
                      <span className="text-sm font-medium">Giáo viên</span>
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={accLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
                >
                  {accLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Đang tạo...
                    </span>
                  ) : (
                    'Tạo tài khoản'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
