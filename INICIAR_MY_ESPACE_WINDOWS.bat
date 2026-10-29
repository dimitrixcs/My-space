@echo off
setlocal
cd /d "%~dp0"
title My espace - Orbital Edition

echo.
echo  MY ESPACE - ORBITAL EDITION
echo  Preparando o aplicativo...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org/ e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao foi encontrado. Reinstale o Node.js usando o instalador oficial.
  pause
  exit /b 1
)

if not exist "node_modules\vite" (
  echo Instalando as dependencias. A primeira execucao precisa de internet...
  call npm install
  if errorlevel 1 (
    echo.
    echo A instalacao falhou. Verifique a conexao e tente novamente.
    pause
    exit /b 1
  )
)

echo.
echo O navegador sera aberto em http://localhost:5173
echo Mantenha esta janela aberta enquanto usa o aplicativo.
echo Para encerrar o servidor, pressione Ctrl+C nesta janela.
echo.
call npm run dev -- --host 127.0.0.1 --open
pause
