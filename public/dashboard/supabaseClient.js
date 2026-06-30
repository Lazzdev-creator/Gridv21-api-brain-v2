import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  'https://YOUR-PROJECT.supabase.co',
  'YOUR-ANON-KEY'
);
