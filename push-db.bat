@echo off
setlocal

echo =====================================
echo       DEPLOY DE MIGRACIONES DB
echo =====================================
echo.

cd /d "C:\Antigravity\Pagina Arquimedes"

echo [1/3] Linkeando proyecto remoto...
supabase link --project-ref inatvoknxfzcobnmrjpk
if errorlevel 1 (
    echo.
    echo ERROR: fallo el link al proyecto remoto.
    pause
    exit /b 1
)

echo.
echo [2/3] Mostrando migraciones pendientes...
supabase db push --dry-run
if errorlevel 1 (
    echo.
    echo ERROR: fallo el dry-run de migraciones.
    pause
    exit /b 1
)

echo.
set /p confirm=Ejecutar migraciones en este proyecto? Escribi Y para continuar: 

if /I not "%confirm%"=="Y" (
    echo.
    echo Operacion cancelada.
    pause
    exit /b 0
)

echo.
echo [3/3] Ejecutando migraciones...
supabase db push
if errorlevel 1 (
    echo.
    echo ERROR: fallo el db push.
    pause
    exit /b 1
)

echo.
echo =====================================
echo   Migraciones aplicadas correctamente
echo =====================================
pause