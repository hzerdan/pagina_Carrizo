# delete_storage_files.ps1
# Script para eliminar archivos de almacenamiento de Supabase utilizando un archivo CSV generado en el Paso 1.

[CmdletBinding()]
param (
    [string]$CsvPath = "files_to_delete.csv",
    [string]$SupabaseUrl = "https://inatvoknxfzcobnmrjpk.supabase.co",
    [string]$ServiceRoleKey = ""
)

# 1. Verificar si el archivo CSV existe
if (-not (Test-Path $CsvPath)) {
    Write-Host "ERROR: El archivo CSV '$CsvPath' no existe. Por favor, especifique la ruta correcta del archivo CSV." -ForegroundColor Red
    return
}

# 2. Solicitar la clave service_role si no se proporciona
if ([string]::IsNullOrEmpty($ServiceRoleKey)) {
    Write-Host "Por favor, ingrese su Supabase SERVICE_ROLE_KEY (se encuentra en settings -> API en el dashboard de Supabase):" -ForegroundColor Cyan
    $SecureInput = Read-Host -AsSecureString
    if ($SecureInput -is [System.Security.SecureString]) {
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureInput)
        try {
            $ServiceRoleKey = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR)
        }
        finally {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        }
    } else {
        $ServiceRoleKey = $SecureInput
    }
}

if ([string]::IsNullOrEmpty($ServiceRoleKey)) {
    Write-Host "ERROR: La clave service_role es obligatoria para realizar el borrado." -ForegroundColor Red
    return
}

# 2.5 Verificar conexión y listar buckets disponibles en el Storage de Supabase
Write-Host "Verificando conexión con Supabase Storage..." -ForegroundColor Cyan
$headers = @{
    "Authorization" = "Bearer $ServiceRoleKey"
    "apikey" = $ServiceRoleKey
}
try {
    $buckets = Invoke-RestMethod -Uri "$SupabaseUrl/storage/v1/bucket" -Method Get -Headers $headers
    $bucketNames = $buckets | ForEach-Object { $_.name }
    Write-Host "Conexión exitosa. Buckets encontrados en su proyecto: $($bucketNames -join ', ')" -ForegroundColor Green
}
catch {
    Write-Host "ERROR al intentar conectar con la API de Storage de Supabase: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Detalles del error de conexión: $responseBody" -ForegroundColor Red
    }
    Write-Host "Por favor, verifique que la clave copiada sea la correcta (Secret Key / Service Role Key) y que la URL sea la de su proyecto." -ForegroundColor Yellow
    return
}

# 3. Leer el CSV
Write-Host "Leyendo el archivo CSV: $CsvPath..." -ForegroundColor Green
$data = Import-Csv -Path $CsvPath

# Verificar si el CSV está vacío
if ($data.Count -eq 0) {
    Write-Host "El archivo CSV está vacío." -ForegroundColor Yellow
    return
}

# Verificar que las columnas requeridas existan
$firstRow = $data[0]
if (-not ($firstRow.PSObject.Properties.Name -contains "bucket_id") -or -not ($firstRow.PSObject.Properties.Name -contains "file_path")) {
    Write-Host "ERROR: El archivo CSV debe contener las columnas 'bucket_id' y 'file_path'." -ForegroundColor Red
    return
}

Write-Host "Total de archivos encontrados en el CSV: $($data.Count)" -ForegroundColor Green

# 4. Agrupar archivos por bucket_id
$grouped = $data | Group-Object -Property bucket_id

foreach ($group in $grouped) {
    $bucketId = $group.Name
    $files = $group.Group | Select-Object -ExpandProperty file_path
    
    Write-Host "`nProcesando bucket: '$bucketId' (Total: $($files.Count) archivos)" -ForegroundColor Cyan
    
    # La API de borrado masivo de Supabase tiene un límite de 1000 archivos por solicitud.
    $chunkSize = 1000
    for ($i = 0; $i -lt $files.Count; $i += $chunkSize) {
        # Obtener un lote de hasta 1000 archivos
        $chunk = $files[$i..($i + $chunkSize - 1)] | Where-Object { $_ -ne $null -and $_ -ne "" }
        
        Write-Host "Enviando lote de $($chunk.Count) archivos a la API de Supabase..." -ForegroundColor DarkGreen
        
        # URL del endpoint de eliminación del bucket (cambiado de remove/ a object/)
        $url = "$SupabaseUrl/storage/v1/object/$bucketId"
        
        # Crear cuerpo de la solicitud JSON
        $bodyObj = @{
            prefixes = $chunk
        }
        $bodyJson = ConvertTo-Json $bodyObj -Depth 5
        
        # Cabeceras de autenticación
        $headers = @{
            "Authorization" = "Bearer $ServiceRoleKey"
            "apikey" = $ServiceRoleKey
        }
        
        try {
            $response = Invoke-RestMethod -Uri $url -Method Delete -Headers $headers -Body $bodyJson -ContentType "application/json"
            # La respuesta contiene un listado de los objetos eliminados con éxito
            Write-Host "Lote procesado. Archivos eliminados exitosamente en este lote: $($response.Count)" -ForegroundColor Green
        }
        catch {
            Write-Host "Error al eliminar lote en el bucket '$bucketId': $_" -ForegroundColor Red
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "Detalles del error: $responseBody" -ForegroundColor Red
            }
        }
    }
}

Write-Host "`nProceso de borrado de almacenamiento finalizado." -ForegroundColor Green
