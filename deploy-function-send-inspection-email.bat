@echo off
setlocal

echo =====================================
echo   DEPLOY FUNCTION send-inspection-email
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
echo [2/3] Verificando carpeta de la funcion...
if not exist "supabase\functions\send-inspection-email" (
    echo.
    echo ERROR: no existe la carpeta supabase\functions\send-inspection-email
    pause
    exit /b 1
)

echo.
set /p confirm=Desplegar la funcion send-inspection-email? Escribi Y para continuar: 

if /I not "%confirm%"=="Y" (
    echo.
    echo Operacion cancelada.
    pause
    exit /b 0
)

echo.
echo [3/3] Desplegando funcion...
supabase functions deploy send-inspection-email
if errorlevel 1 (
    echo.
    echo ERROR: fallo el deploy de la funcion.
    pause
    exit /b 1
)

echo.
echo =====================================
echo   Funcion desplegada correctamente
echo =====================================
pause