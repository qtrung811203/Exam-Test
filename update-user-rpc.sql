-- Chạy lệnh này trong SQL Editor của Supabase để cấp quyền cho giáo viên đổi mật khẩu và thông tin tài khoản

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION admin_update_user(
  target_user_id UUID,
  new_full_name TEXT,
  new_role TEXT,
  new_password TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  -- Ensure the caller is a teacher
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher') THEN
    RAISE EXCEPTION 'Unauthorized: Only teachers can update accounts';
  END IF;

  -- Update public.profiles
  UPDATE public.profiles 
  SET full_name = new_full_name, role = new_role
  WHERE id = target_user_id;

  -- Update auth.users password if provided
  IF new_password IS NOT NULL AND new_password <> '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf'))
    WHERE id = target_user_id;
  END IF;

  -- Update auth.users raw_user_meta_data
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
      'full_name', new_full_name,
      'role', new_role
  )
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
