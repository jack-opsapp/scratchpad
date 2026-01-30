-- =============================================================================
-- FIX: Allow user creation from auth trigger
-- =============================================================================

-- Option 1: Add INSERT policy for service role / trigger
-- The trigger runs with SECURITY DEFINER but may still need this

-- Allow the auth trigger to insert users (service_role bypasses RLS, but just in case)
CREATE POLICY users_insert_trigger ON users
  FOR INSERT
  WITH CHECK (true);

-- Option 2: Recreate the trigger function to explicitly bypass RLS
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, last_sign_in)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NEW.last_sign_in_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    last_sign_in = EXCLUDED.last_sign_in;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant necessary permissions
GRANT INSERT ON users TO service_role;
GRANT INSERT ON users TO postgres;
