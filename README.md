# Agenda de gravações — Ideais Agência

Frontend (React + Vite + Tailwind v4) do agente de lembretes no WhatsApp.
Banco, bot e WhatsApp rodam no Supabase (projeto ideais-bot).

## Rodar local
    npm install
    npm run dev          # http://localhost:5173

## Publicar na Vercel
Importe o repositório na Vercel. Framework: Vite (detectado sozinho).
O arquivo .env já tem a URL e a chave pública do Supabase; não é preciso configurar variáveis.

## Usuários
Crie no Supabase: Authentication → Users → Add user → Create new user (marque Auto Confirm User).
