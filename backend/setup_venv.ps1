Set-Location $PSScriptRoot
$py = $null
try { $py = (py -3.12 -c 'import sys; print(sys.executable)' 2>$null) } catch {}
if (-not $py) { try { $py = (py -3.11 -c 'import sys; print(sys.executable)' 2>$null) } catch {} }
if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }
if ($py) {
    & $py -m venv .venv
    & .venv\Scripts\pip install -r requirements.txt
} else {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
}
Write-Host "Done. Activate with: .venv\Scripts\activate"
