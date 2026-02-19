cd $PSScriptRoot
py -3.12 -m venv .venv 2>$null
if ($LASTEXITCODE -eq 0) { .venv\Scripts\pip install -r requirements.txt; exit 0 }
py -3.11 -m venv .venv 2>$null
if ($LASTEXITCODE -eq 0) { .venv\Scripts\pip install -r requirements.txt; exit 0 }
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
