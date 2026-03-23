DO $$
DECLARE
  trigger_record record;
BEGIN
  FOR trigger_record IN
    SELECT
      t.tgname AS trigger_name,
      pn.nspname AS function_schema,
      p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c
      ON c.oid = t.tgrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_proc p
      ON p.oid = t.tgfoid
    JOIN pg_namespace pn
      ON pn.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
      AND (
        p.proname = 'handle_new_user'
        OR pg_get_functiondef(p.oid) ILIKE '%public.app_user%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users;', trigger_record.trigger_name);
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I() CASCADE;', trigger_record.function_schema, trigger_record.function_name);
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_plan_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();
