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
