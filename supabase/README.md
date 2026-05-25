# Supabase Configuration & Migrations

Este proyecto utiliza Supabase CLI para el control de versiones de la base de datos (migraciones).

## Entornos del Proyecto
* **QA/Desarrollo Remoto**:
  * Ref Proyecto: `inatvoknxfzcobnmrjpk` (definido en `.env`)
* **Producción**:
  * (Si se agrega en el futuro, se configurará un `.env.production` con su respectiva referencia de proyecto).

## Flujo de Despliegue Seguro
1. El agente/desarrollador crea una migración: `supabase db migration new nombre_de_migracion`.
2. Las pruebas se realizan primero de manera local o en el entorno de QA (`push-db.bat`).
3. Para pasar a Producción, se vincula el CLI temporalmente al ID de producción (`supabase link --project-ref <PROD_ID>`) y se ejecuta `supabase db push`.
