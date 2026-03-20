-- ============================================
-- ExamPro Database Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Assignments table
CREATE TABLE public.assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Exam sessions table
CREATE TABLE public.exam_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  tab_switch_count INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ DEFAULT now(),
  locked_at TIMESTAMPTZ,
  UNIQUE(student_id, assignment_id)
);

-- 4. Tab violations log
CREATE TABLE public.tab_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE NOT NULL,
  violated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_violations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all profiles, insert/update their own
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Assignments: teachers can CRUD their own, students can read all
CREATE POLICY "Anyone can view assignments"
  ON public.assignments FOR SELECT
  USING (true);

CREATE POLICY "Teachers can insert assignments"
  ON public.assignments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Teachers can update own assignments"
  ON public.assignments FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own assignments"
  ON public.assignments FOR DELETE
  USING (teacher_id = auth.uid());

-- Exam sessions: students can manage their own, teachers can view all
CREATE POLICY "Students can view own sessions"
  ON public.exam_sessions FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Students can insert own sessions"
  ON public.exam_sessions FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own sessions"
  ON public.exam_sessions FOR UPDATE
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can delete sessions of their assignments"
  ON public.exam_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments 
      WHERE assignments.id = exam_sessions.assignment_id 
      AND assignments.teacher_id = auth.uid()
    )
  );

-- Tab violations: students can insert their own, teachers can view all
CREATE POLICY "View tab violations"
  ON public.tab_violations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions
      WHERE exam_sessions.id = tab_violations.session_id
      AND (exam_sessions.student_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher'))
    )
  );

CREATE POLICY "Teachers can delete tab violations of their assignments"
  ON public.tab_violations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions
      JOIN public.assignments ON assignments.id = exam_sessions.assignment_id
      WHERE exam_sessions.id = tab_violations.session_id
      AND assignments.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert tab violations"
  ON public.tab_violations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_sessions
      WHERE exam_sessions.id = tab_violations.session_id
      AND exam_sessions.student_id = auth.uid()
    )
  );

-- ============================================
-- Storage bucket for PDF assignments
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('assignments', 'assignments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Teachers can upload PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assignments'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Anyone can view assignment PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assignments');

CREATE POLICY "Teachers can delete own PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'assignments'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- ============================================
-- Auto-create profile on signup (trigger)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
