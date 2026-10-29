#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
printf '\n  MY ESPACE - ORBITAL EDITION\n  Preparando o aplicativo...\n\n'

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm nao encontrados. Instale a versao LTS em https://nodejs.org/ e tente novamente."
  exit 1
fi

if [ ! -d node_modules/vite ]; then
  echo "Instalando as dependencias. A primeira execucao precisa de internet..."
  npm install
fi

echo "O navegador sera aberto em http://localhost:5173."
echo "Mantenha este terminal aberto. Para encerrar, pressione Ctrl+C."
npm run dev -- --host 127.0.0.1 --open
