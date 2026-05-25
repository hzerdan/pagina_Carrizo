# Página Arquimedes - Panel de Operaciones y Logística

Este repositorio contiene la aplicación de control de operaciones, logística y gestión de FSM de la Página Arquimedes.

## 🛠️ Herramientas de Mantenimiento y Purga de Datos

Para mantener el rendimiento óptimo del proyecto, se ha desarrollado un flujo de limpieza y purga segura de datos transaccionales históricos.

### 📄 Guía Interactiva de Purga
Disponemos de un manual interactivo en formato HTML que autogenera y formatea los scripts en base a la fecha límite que usted elija:
* **[Guía Interactiva de Purga (purga_datos.html)](file:///c:/Antigravity/Pagina%20Arquimedes/purga_datos.html)** (Haga doble clic sobre el archivo para abrirlo en su navegador).

### ⚙️ Scripts de Limpieza de Almacenamiento (Supabase Storage)
Ubicados en la raíz del repositorio, permiten eliminar físicamente archivos masivos de los buckets en Supabase:
* **[delete_storage_files.ps1](file:///c:/Antigravity/Pagina%20Arquimedes/delete_storage_files.ps1)**: Script principal en PowerShell que maneja la paginación de a 1000 archivos y llama a la API de Supabase Storage.
* **[delete_storage_files.bat](file:///c:/Antigravity/Pagina%20Arquimedes/delete_storage_files.bat)**: Archivo ejecutable de Windows para arrastrar y soltar el archivo CSV (`files_to_delete.csv`) o hacer doble clic directamente.

---

## 🗄️ Base de Datos y Migraciones (Supabase)

Este proyecto utiliza **Supabase CLI** y **Supabase MCP** de manera coordinada para el desarrollo y control de la base de datos.

### 🤖 Coordinación de Herramientas (MCP vs. CLI)
* **Supabase MCP Server**: Utilizado por los asistentes de IA para **inspeccionar** el esquema, consultar tablas, relaciones, metadatos y realizar validaciones rápidas de datos sin alterar la estructura.
* **Supabase CLI**: Utilizado para **modificaciones estructurales** (DDL), creación de nuevas migraciones (`db migration new`), aplicación de cambios (`db push`), generación de tipos TypeScript y despliegue de Edge Functions.

### 🌐 Gestión de Entornos (QA, Producción y Local)
* **Entornos Remotos (QA y Producción)**: 
  Para operar de manera segura entre entornos, configura los archivos correspondientes en la raíz:
  * `.env.qa` o `.env.local` para el entorno de testing/QA (ej. proyecto `inatvoknxfzcobnmrjpk`).
  * `.env.production` para el entorno productivo con su respectiva referencia de proyecto (`SUPABASE_PROJECT`).
  * *Nota*: Siempre vincula el CLI al entorno correcto antes de empujar cambios usando `supabase link --project-ref <ID_DEL_PROYECTO>`.
* **⚠️ Desarrollo Local**:
  Si prefieres desarrollar de manera local (`supabase start` / `supabase db reset`), ten en cuenta que **es obligatorio tener Docker instalado y ejecutándose** en segundo plano. La base de datos local emulará por completo los buckets de storage, auth y base de datos de manera offline.

### Scripts y Despliegue
* **[push-db.bat](file:///c:/Antigravity/Pagina%20Arquimedes/push-db.bat)**: Script interactivo de Windows para verificar y aplicar migraciones pendientes al proyecto remoto de QA.
* **[supabase/README.md](file:///c:/Antigravity/Pagina%20Arquimedes/supabase/README.md)**: Guía de referencia técnica del flujo de desarrollo y control de entornos.

---

## Desarrollo local (React + TypeScript + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
