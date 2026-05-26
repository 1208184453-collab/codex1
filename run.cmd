@echo off
setlocal

set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  set "NODE=node"
)

"%NODE%" "%ROOT%server.js"
endlocal
