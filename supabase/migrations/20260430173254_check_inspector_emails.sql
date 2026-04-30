-- Consulta para verificar los emails de los inspectores en la tabla personal_ac
-- Esto ayudará a confirmar si hay algún email harcodeado en la base de datos.

SELECT id, nombre_completo, email 
FROM public.personal_ac 
WHERE id IN (
  SELECT DISTINCT inspector_id 
  FROM public.inspecciones 
  WHERE inspector_id IS NOT NULL
);

-- Si deseas corregir el email de Hugo Zerdan (por ejemplo):
-- UPDATE public.personal_ac SET email = 'nuevo_email@ejemplo.com' WHERE nombre_completo = 'Hugo Zerdan';
