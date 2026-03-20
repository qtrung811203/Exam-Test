import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const MAX_TAB_SWITCHES = 4

export default function ExamView() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  
  const [assignment, setAssignment] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfWidth, setPdfWidth] = useState(800)
  const [timeLeft, setTimeLeft] = useState(null)
  
  const sessionRef = useRef(null)
  const containerRef = useRef(null)
  const MAX_TAB_SWITCHES = 4

  const formatTime = (seconds) => {
    if (seconds <= 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Responsive PDF width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 48
        setPdfWidth(Math.min(w, 900))
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Load assignment and session
  useEffect(() => {
    const loadData = async () => {
      if (!profile?.id) return

      try {
        setLoading(true)
        // Fetch assignment
        const { data: assignData, error: assignErr } = await supabase
          .from('assignments')
          .select('*')
          .eq('id', assignmentId)
          .single()

        if (assignErr) throw assignErr
        setAssignment(assignData)

        // 1. Try to fetch existing session first
        let { data: sessionData, error: fetchErr } = await supabase
          .from('exam_sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('assignment_id', assignmentId)
          .single()

        // 2. If not found (PGRST116), create a new one
        if (fetchErr && fetchErr.code === 'PGRST116') {
          console.log('[ExamPro] No existing session found, creating new one...')
          const { data: newData, error: insertErr } = await supabase
            .from('exam_sessions')
            .insert({ 
              student_id: profile.id, 
              assignment_id: assignmentId,
              tab_switch_count: 0,
              is_locked: false
            })
            .select()
            .single()

          if (insertErr) throw insertErr
          sessionData = newData
        } else if (fetchErr) {
          throw fetchErr
        } else {
          console.log('[ExamPro] Existing session found, restoring state:', sessionData.tab_switch_count)
        }
        
        setSession(sessionData)
        sessionRef.current = sessionData
        setTabSwitchCount(sessionData.tab_switch_count)
        
        // Initialize timer
        if (assignData.duration_minutes) {
          const startTime = new Date(sessionData.started_at).getTime()
          const durationMs = assignData.duration_minutes * 60 * 1000
          const endTime = startTime + durationMs
          const remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
          setTimeLeft(remainingSeconds)
        }

        if (sessionData.is_locked) {
          setIsLocked(true)
        }
      } catch (err) {
        console.error('Error loading exam:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [assignmentId, profile?.id])

  // Centralized lock function
  const lockExam = async (shouldRedirect = false) => {
    if (isLocked || !sessionRef.current) return

    console.log('[ExamPro] Locking exam...')
    
    const updateData = { 
      is_locked: true, 
      tab_switch_count: MAX_TAB_SWITCHES,
      locked_at: new Date().toISOString()
    }

    const { data: updatedSession, error: updateErr } = await supabase
      .from('exam_sessions')
      .update(updateData)
      .eq('id', sessionRef.current.id)
      .select()
      .single()

    if (!updateErr) {
      sessionRef.current = updatedSession
      setTabSwitchCount(MAX_TAB_SWITCHES)
      setIsLocked(true)
      if (shouldRedirect) navigate('/student')
    }
  }

  const handleBackClick = () => {
    if (window.confirm('CẢNH BÁO: Nếu bạn quay lại, bài thi sẽ bị KHÓA ngay lập tức và không thể tiếp tục. Bạn có chắc chắn muốn thoát?')) {
      lockExam()
    }
  }

  const handleComplete = () => {
    if (window.confirm('Xác nhận nộp bài và kết thúc bài thi?')) {
      lockExam(true) // Lock and redirect to dashboard
    }
  }

  useEffect(() => {
    if (timeLeft === null || isLocked) return

    if (timeLeft <= 0) {
      console.log('[ExamPro] Time is up! Locking exam.')
      lockExam(true) // Auto-submit/redirect
      return
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, isLocked])

  // Navigation and back button prevention
  useEffect(() => {
    if (isLocked) return

    // 1. Browser Back Button: Add dummy state to history
    window.history.pushState(null, '', window.location.href)

    const handlePopState = () => {
      // Browsers don't allow custom confirm dialogs easily inside popstate without re-pushing
      // So we'll lock immediately as per "Zero Tolerance" but stay on page
      if (!isLocked) {
        console.warn('[ExamPro] Back button detected! Locking exam.')
        lockExam()
        window.history.pushState(null, '', window.location.href)
      }
    }

    // 2. Tab Close/Reload: Warn user
    const handleBeforeUnload = (e) => {
      if (!isLocked) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isLocked, sessionRef.current])

  // Tab visibility detection
  const handleVisibilityChange = useCallback(async () => {
    // Only count when the tab BECOMES hidden
    if (document.visibilityState === 'hidden' && sessionRef.current && !sessionRef.current.is_locked) {
      const currentCount = sessionRef.current.tab_switch_count
      const newCount = currentCount + 1
      
      console.log(`[ExamPro] Tab switched! Current: ${currentCount}, New: ${newCount}`)

      // Update session in Supabase
      const updateData = { tab_switch_count: newCount }
      if (newCount >= MAX_TAB_SWITCHES) {
        updateData.is_locked = true
        updateData.locked_at = new Date().toISOString()
      }

      const { data: updatedSession, error: updateErr } = await supabase
        .from('exam_sessions')
        .update(updateData)
        .eq('id', sessionRef.current.id)
        .select()
        .single()

      if (updateErr) {
        console.error('[ExamPro] Error updating session:', updateErr)
        return
      }

      // Insert violation record (don't wait for it to update UI)
      supabase
        .from('tab_violations')
        .insert({ session_id: sessionRef.current.id })
        .then(({ error }) => {
          if (error) console.error('[ExamPro] Error logging violation:', error)
        })

      // Update local state and Ref with fresh data from DB
      sessionRef.current = updatedSession
      setTabSwitchCount(newCount)

      if (updatedSession.is_locked) {
        setIsLocked(true)
      } else {
        setWarningMessage(`⚠️ Cảnh báo! Bạn đã chuyển tab ${newCount}/${MAX_TAB_SWITCHES} lần. Quá ${MAX_TAB_SWITCHES} lần sẽ bị khóa bài!`)
        setShowWarning(true)
        setTimeout(() => setShowWarning(false), 5000)
      }
    }
  }, [isLocked])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleVisibilityChange])

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400">Đang tải bài thi...</p>
        </div>
      </div>
    )
  }

  // Locked screen
  if (isLocked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/60 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-red-400 mb-3">Bài thi đã bị khóa</h2>
          <p className="text-gray-400 mb-2">
            Bạn đã chuyển tab <span className="text-red-400 font-bold">{tabSwitchCount}</span> lần.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Vượt quá giới hạn cho phép ({MAX_TAB_SWITCHES} lần). Bạn không thể tiếp tục bài thi này.
          </p>
          <button
            onClick={() => navigate('/student')}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-all cursor-pointer"
          >
            ← Quay lại trang chủ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={handleBackClick}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">Quay lại</span>
            </button>

            <h3 className="text-white font-medium text-sm truncate max-w-md">{assignment?.title}</h3>

            <div className="flex items-center gap-3">
              {/* Timer */}
              {timeLeft !== null && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  timeLeft < 60 
                    ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' 
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatTime(timeLeft)}</span>
                </div>
              )}

              <button
                onClick={handleComplete}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-500/20 transition-all cursor-pointer mr-2"
              >
                Hoàn thành
              </button>
              
              {/* Violation counter */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                tabSwitchCount === 0
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : tabSwitchCount < 3
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {tabSwitchCount}/{MAX_TAB_SWITCHES}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning toast */}
      {showWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-bounce">
          <div className="bg-red-500/90 backdrop-blur-xl text-white px-6 py-4 rounded-2xl shadow-2xl shadow-red-500/30 flex items-center gap-3 max-w-lg">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium">{warningMessage}</p>
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      <div ref={containerRef} className="flex-1 flex flex-col items-center py-6 px-4 overflow-auto">
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 max-w-full overflow-hidden">
          <Document
            file={assignment?.pdf_url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            }
            error={
              <div className="text-center py-20">
                <p className="text-red-400">Không thể tải file PDF</p>
                <p className="text-gray-500 text-sm mt-1">Vui lòng kiểm tra lại đường dẫn</p>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={pdfWidth}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>

        {/* Page navigation */}
        {numPages && numPages > 1 && (
          <div className="flex items-center gap-4 mt-6 bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-xl px-4 py-2">
            <button
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-gray-300">
              Trang <span className="text-white font-medium">{pageNumber}</span> / {numPages}
            </span>
            <button
              onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
