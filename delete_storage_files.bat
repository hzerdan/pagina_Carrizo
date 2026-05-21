@echo off
setlocal enabledelayedexpansion

:: Ruta predeterminada del archivo CSV
set "CSV_PATH=files_to_delete.csv"

:: Si se arrastra un archivo al .bat o se pasa como parámetro, usar ese
if "%~1" neq "" set "CSV_PATH=%~1"

echo ==============================================================
echo  Eliminador de Archivos de Supabase Storage
echo ==============================================================
echo Buscando archivo: %CSV_PATH%
echo.

if not exist "%CSV_PATH%" (
    echo [ERROR] No se encontro el archivo "%CSV_PATH%".
    echo Por favor coloca el archivo CSV en esta misma carpeta con el nombre "files_to_delete.csv"
    echo o arrastra el archivo CSV directamente sobre este archivo .bat.
    echo.
    pause
    exit /b 1
)

:: Lanzar PowerShell con política de ejecución bypass
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0delete_storage_files.ps1" -CsvPath "%CSV_PATH%"

echo.
echo Presione cualquier tecla para salir.
pause >nul
