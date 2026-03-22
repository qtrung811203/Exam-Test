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
  const [uploadAvailableFrom, setUploadAvailableFrom] = useState('')
  const [uploadAvailableUntil, setUploadAvailableUntil] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Edit assignment state
  const [showEdit, setShowEdit] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDuration, setEditDuration] = useState(60)
  const [editAvailableFrom, setEditAvailableFrom] = useState('')
  const [editAvailableUntil, setEditAvailableUntil] = useState('')
  const [editFile, setEditFile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')

  // Monitor filters state
  const [filterStudent, setFilterStudent] = useState('')
  const [filterExam, setFilterExam] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Accounts list state
  const [accountsList, setAccountsList] = useState([])

  // Account update state
  const [showEditAcc, setShowEditAcc] = useState(false)
  const [editAccId, setEditAccId] = useState(null)
  const [editAccFullName, setEditAccFullName] = useState('')
  const [editAccRole, setEditAccRole] = useState('student')
  const [editAccPassword, setEditAccPassword] = useState('')
  const [editAccLoading, setEditAccLoading] = useState(false)
  const [editAccError, setEditAccError] = useState('')
  const [editAccSuccess, setEditAccSuccess] = useState('')

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
      } else {
        setSessions([])
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      
      setAccountsList(profilesData || [])
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
          available_from: uploadAvailableFrom ? new Date(uploadAvailableFrom).toISOString() : null,
          available_until: uploadAvailableUntil ? new Date(uploadAvailableUntil).toISOString() : null,
          pdf_url: urlData.publicUrl,
        })

      if (insertErr) throw insertErr

      setUploadTitle('')
      setUploadDesc('')
      setUploadDuration(60)
      setUploadAvailableFrom('')
      setUploadAvailableUntil('')
      setUploadFile(null)
      setShowUpload(false)
      await fetchData()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const formatForInput = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }

  const openEditModal = (a) => {
    setEditingAssignment(a)
    setEditTitle(a.title)
    setEditDesc(a.description || '')
    setEditDuration(a.duration_minutes || 60)
    setEditAvailableFrom(formatForInput(a.available_from))
    setEditAvailableUntil(formatForInput(a.available_until))
    setEditFile(null)
    setEditError('')
    setShowEdit(true)
    setShowUpload(false) // Close upload if open
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editingAssignment) return

    setEditing(true)
    setEditError('')

    try {
      let finalPdfUrl = editingAssignment.pdf_url

      if (editFile) {
        const fileExt = editFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `pdfs/${fileName}`

        const { error: uploadErr } = await supabase.storage
          .from('assignments')
          .upload(filePath, editFile)

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage
          .from('assignments')
          .getPublicUrl(filePath)

        finalPdfUrl = urlData.publicUrl

        const oldPath = editingAssignment.pdf_url.split('/assignments/')[1]
        if (oldPath) {
          await supabase.storage.from('assignments').remove([oldPath])
        }
      }

      const { error: updateErr } = await supabase
        .from('assignments')
        .update({
          title: editTitle,
          description: editDesc,
          duration_minutes: parseInt(editDuration),
          available_from: editAvailableFrom ? new Date(editAvailableFrom).toISOString() : null,
          available_until: editAvailableUntil ? new Date(editAvailableUntil).toISOString() : null,
          pdf_url: finalPdfUrl,
        })
        .eq('id', editingAssignment.id)

      if (updateErr) throw updateErr

      setShowEdit(false)
      setEditingAssignment(null)
      await fetchData()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditing(false)
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

      await fetchData()

      setTimeout(() => setAccSuccess(''), 5000)
    } catch (err) {
      setAccError(err.message)
    } finally {
      setAccLoading(false)
    }
  }

  const openEditAccModal = (acc) => {
    setEditAccId(acc.id)
    setEditAccFullName(acc.full_name || '')
    setEditAccRole(acc.role || 'student')
    setEditAccPassword('')
    setEditAccError('')
    setEditAccSuccess('')
    setShowEditAcc(true)
  }

  const handleUpdateAcc = async (e) => {
    e.preventDefault()
    setEditAccLoading(true)
    setEditAccError('')
    setEditAccSuccess('')

    try {
      const { error } = await supabase.rpc('admin_update_user', {
        target_user_id: editAccId,
        new_full_name: editAccFullName,
        new_role: editAccRole,
        new_password: editAccPassword || null
      })

      if (error) {
        throw error
      }

      setEditAccSuccess(`Cập nhật thành công cho ${editAccFullName}!`)
      await fetchData()

      setTimeout(() => {
        setEditAccSuccess('')
        setShowEditAcc(false)
        setEditAccId(null)
      }, 3000)
    } catch (err) {
      setEditAccError(err.message)
    } finally {
      setEditAccLoading(false)
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

  // Compute monitor filters
  const uniqueStudents = [...new Map(sessions.map(s => [s.student_id, s.profiles?.full_name])).entries()]
  const uniqueExams = [...new Map(sessions.map(s => [s.assignment_id, s.assignments?.title])).entries()]

  const filteredSessions = sessions.filter(s => {
    const matchStudent = filterStudent ? s.student_id === filterStudent : true
    const matchExam = filterExam ? s.assignment_id === filterExam : true
    
    let matchStatus = true
    if (filterStatus) {
      if (filterStatus === 'completed') matchStatus = s.status === 'completed'
      else if (filterStatus === 'locked') matchStatus = s.is_locked || s.status === 'locked'
      else if (filterStatus === 'in_progress') matchStatus = s.status !== 'completed' && !(s.is_locked || s.status === 'locked')
    }
    
    return matchStudent && matchExam && matchStatus
  })

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
            onClick={() => {
              setShowUpload(!showUpload)
              setShowEdit(false) // toggle off edit modal
            }}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Mở đề lúc (tùy chọn)</label>
                  <input
                    type="datetime-local"
                    value={uploadAvailableFrom}
                    onChange={(e) => setUploadAvailableFrom(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Đóng đề lúc (tùy chọn)</label>
                  <input
                    type="datetime-local"
                    value={uploadAvailableUntil}
                    onChange={(e) => setUploadAvailableUntil(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
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

        {/* Edit Modal */}
        {showEdit && (
          <div className="mb-10 bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in">
            <h3 className="text-lg font-semibold text-white mb-6">Chỉnh sửa bài tập</h3>
            {editError && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {editError}
              </div>
            )}
            <form onSubmit={handleUpdate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tiêu đề</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="VD: Đề kiểm tra Toán học kỳ 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Mô tả (tuỳ chọn)</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  placeholder="Mô tả ngắn về bài tập..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Thời gian làm bài (phút)</label>
                <input
                  type="number"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Ví dụ: 60"
                  min="1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Mở đề lúc (tùy chọn)</label>
                  <input
                    type="datetime-local"
                    value={editAvailableFrom}
                    onChange={(e) => setEditAvailableFrom(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Đóng đề lúc (tùy chọn)</label>
                  <input
                    type="datetime-local"
                    value={editAvailableUntil}
                    onChange={(e) => setEditAvailableUntil(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Thay đổi File PDF (tùy chọn, để trống nếu giữ nguyên)</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setEditFile(e.target.files[0])}
                  className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer cursor-pointer"
                />
              </div>
              <div className="flex gap-4 pt-3">
                <button
                  type="submit"
                  disabled={editing}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {editing ? 'Đang lưu...' : 'Lưu cập nhật'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEdit(false)
                    setEditingAssignment(null)
                  }}
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
                      <div className="flex flex-col gap-1 mt-3">
                        <p className={`text-xs font-medium ${a.available_from ? 'text-indigo-400' : 'text-emerald-400'}`}>
                          {a.available_from ? `Mở: ${new Date(a.available_from).toLocaleString('vi-VN')}` : 'Mùa thi tự do (không giới hạn)'}
                        </p>
                        {a.available_until && (
                          <p className="text-red-400 text-xs font-medium">
                            Đóng: {new Date(a.available_until).toLocaleString('vi-VN')}
                          </p>
                        )}
                        <p className="text-gray-600 text-xs mt-1">
                          📅 {new Date(a.created_at).toLocaleDateString('vi-VN', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
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
                        onClick={() => openEditModal(a)}
                        className="p-2.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all cursor-pointer"
                        title="Chỉnh sửa bài tập"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
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
          <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden p-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <select 
                value={filterStudent} 
                onChange={e => setFilterStudent(e.target.value)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Tất cả học sinh</option>
                {uniqueStudents.map(([id, name]) => (
                  <option key={id} value={id}>{name || 'Unknown'}</option>
                ))}
              </select>

              <select 
                value={filterExam} 
                onChange={e => setFilterExam(e.target.value)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Tất cả bài tập</option>
                {uniqueExams.map(([id, title]) => (
                  <option key={id} value={id}>{title || 'Unknown'}</option>
                ))}
              </select>

              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="in_progress">⏳ Đang làm</option>
                <option value="completed">✅ Đã nộp</option>
                <option value="locked">🔒 Đã khóa</option>
              </select>
            </div>

            {filteredSessions.length === 0 ? (
              <div className="text-center py-20 bg-gray-900/40 border border-gray-800 rounded-2xl">
                <p className="text-gray-500 text-lg">Không tìm thấy phiên thi nào</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-800 rounded-xl">
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
                    {filteredSessions.map((s) => (
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Form Column */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl lg:col-span-1">
              {showEditAcc ? (
                // Edit Account Form
                <>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Chỉnh sửa tài khoản</h3>
                      <p className="text-gray-500 text-sm">Cập nhật thông tin và mật khẩu</p>
                    </div>
                    <button onClick={() => setShowEditAcc(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                  </div>

                  {editAccError && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-3">
                      {editAccError}
                    </div>
                  )}

                  {editAccSuccess && (
                    <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
                      {editAccSuccess}
                    </div>
                  )}

                  <form onSubmit={handleUpdateAcc} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Họ và tên</label>
                      <input
                        type="text"
                        value={editAccFullName}
                        onChange={(e) => setEditAccFullName(e.target.value)}
                        required
                        className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Mật khẩu mới (bỏ trống nếu không đổi)</label>
                      <input
                        type="text"
                        value={editAccPassword}
                        onChange={(e) => setEditAccPassword(e.target.value)}
                        minLength={6}
                        className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        placeholder="Nhập mật khẩu mới"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Vai trò</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setEditAccRole('student')}
                          className={`p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-center ${editAccRole === 'student'
                            ? 'border-indigo-500 bg-indigo-500/10 text-white'
                            : 'border-gray-700 bg-gray-800/30 text-gray-400 hover:border-gray-600'
                            }`}
                        >
                          <span className="text-2xl block mb-2">🎓</span>
                          <span className="text-sm font-medium">Học sinh</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditAccRole('teacher')}
                          className={`p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-center ${editAccRole === 'teacher'
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
                      disabled={editAccLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
                    >
                      {editAccLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </form>
                </>
              ) : (
                // Create Account Form
                <>
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
            </>
          )}
        </div>

        {/* List Accounts */}
            <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden lg:col-span-2">
               <div className="p-6 border-b border-gray-800">
                  <h3 className="text-lg font-semibold text-white">Danh sách tài khoản ({accountsList.length})</h3>
               </div>
               <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                 <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800 sticky top-0 bg-gray-900/90 backdrop-blur-md z-10">
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">Họ và tên</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">Vai trò</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">Ngày tạo</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {accountsList.map(acc => (
                         <tr key={acc.id} className="hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-4 text-white text-sm font-medium">{acc.full_name || 'Unknown'}</td>
                            <td className="px-6 py-4">
                               <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border ${acc.role === 'teacher' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                 {acc.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                               </span>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-sm">
                               {new Date(acc.created_at).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button 
                                  onClick={() => openEditAccModal(acc)}
                                  className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-all cursor-pointer"
                                  title="Chỉnh sửa tài khoản"
                               >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                               </button>
                            </td>
                         </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
