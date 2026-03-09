# Решение проблемы 500 ошибок API на сервере

## Проблема
Получаете ошибки:
- POST http://109.123.253.238:5173/api/notifications/send 500 (Internal Server Error)
- POST http://109.123.253.238:5173/api/company-messages/send-all 500 (Internal Server Error)

## Причина
Фронтенд работает на порту 5173 (Vite dev server), но пытается обратиться к API через тот же порт.
Backend работает на порту 3000.

## Решение 1: Использовать Docker Compose (РЕКОМЕНДУЕТСЯ)

На сервере выполните:

```bash
cd /path/to/Axentis-market
git pull origin main
docker-compose down
docker-compose up -d --build
```

После этого:
- Frontend будет доступен на http://109.123.253.238:80
- Backend на http://109.123.253.238:3000
- Nginx автоматически проксирует /api на backend

## Решение 2: Если запускаете frontend напрямую через npm

На сервере создайте файл `.env.local`:

```bash
cat > .env.local << EOF
VITE_API_URL=http://109.123.253.238:3000/api
VITE_SOCKET_URL=http://109.123.253.238:3000
EOF
```

Затем перезапустите frontend:

```bash
npm run dev
```

## Проверка

После применения решения:
1. Откройте http://109.123.253.238 (или :5173 если через npm)
2. Откройте DevTools → Network
3. Попробуйте отправить уведомление
4. Проверьте что запрос идет на правильный URL

### Правильные URL:
- Через Docker: `http://109.123.253.238/api/notifications/send`
- Через npm dev: `http://109.123.253.238:3000/api/notifications/send`

## Файлы обновлены

Я создал:
- `.env.production` - для production сборки
- `SERVER_FIX_GUIDE.md` - эта инструкция

Закоммитьте изменения:

```bash
git add .env.production SERVER_FIX_GUIDE.md
git commit -m "Add production env config and server fix guide"
git push origin main
```
