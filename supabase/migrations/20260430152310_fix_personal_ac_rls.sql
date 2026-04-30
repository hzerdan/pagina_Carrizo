-- Políticas para personal_ac_roles
CREATE POLICY "Permitir insertar personal_ac_roles a usuarios autenticados" 
ON "public"."personal_ac_roles" 
FOR INSERT 
TO "authenticated" 
WITH CHECK (true);

CREATE POLICY "Permitir actualizar personal_ac_roles a usuarios autenticados" 
ON "public"."personal_ac_roles" 
FOR UPDATE 
TO "authenticated" 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Permitir eliminar personal_ac_roles a usuarios autenticados" 
ON "public"."personal_ac_roles" 
FOR DELETE 
TO "authenticated" 
USING (true);

-- Políticas para personal_ac
CREATE POLICY "Permitir insertar personal_ac a usuarios autenticados" 
ON "public"."personal_ac" 
FOR INSERT 
TO "authenticated" 
WITH CHECK (true);

CREATE POLICY "Permitir actualizar personal_ac a usuarios autenticados completo" 
ON "public"."personal_ac" 
FOR UPDATE 
TO "authenticated" 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Permitir eliminar personal_ac a usuarios autenticados" 
ON "public"."personal_ac" 
FOR DELETE 
TO "authenticated" 
USING (true);
