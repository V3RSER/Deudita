-- Agrega la columna created_by a la tabla profiles para guardar qué usuario creó cada amigo/perfil fantasma
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

-- Permitir a un usuario editar perfiles fantasmas que él haya creado
DROP POLICY IF EXISTS "update_profiles" ON public.profiles;
CREATE POLICY "update_profiles" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR created_by = auth.uid()
    OR (
      is_temp = true
      AND EXISTS (
        SELECT 1 FROM public.group_members gm1
        JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
        WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
      )
    )
  );

DROP POLICY IF EXISTS "delete_profiles" ON public.profiles;
CREATE POLICY "delete_profiles" ON public.profiles
  FOR DELETE USING (
    auth.uid() = id
    OR created_by = auth.uid()
    OR (
      is_temp = true
      AND EXISTS (
        SELECT 1 FROM public.group_members gm1
        JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
        WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
      )
    )
  );
