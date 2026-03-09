# 🚀 ИНСТРУКЦИЯ ДЛЯ СЕРВЕРА UBUNTU

## В SSH терминале выполните эти команды:

### 1️⃣ Перейдите в папку проекта или клонируйте его

```bash
# Если проект уже есть:
cd /root/Axentis-market

# Если проекта нет:
git clone https://github.com/azamjon1330/Axentis-market.git
cd Axentis-market
```

### 2️⃣ Обновите код с GitHub

```bash
git pull origin main
```

### 3️⃣ Запустите автоматическое исправление

```bash
# Дайте права на выполнение скрипта
chmod +x fix-server.sh

# Запустите исправление
bash fix-server.sh
```

**ИЛИ вручную:**

```bash
# Обновите код
git pull origin main

# Остановите старые контейнеры
docker-compose down

# Соберите и запустите заново
docker-compose up -d --build

# Проверьте статус
docker-compose ps

# Посмотрите логи
docker-compose logs -f
```

### 4️⃣ Проверка работы

После запуска откройте в браузере:
- **Frontend:** http://109.123.253.238
- **Backend API:** http://109.123.253.238:3000

### 5️⃣ Диагностика проблем (если что-то не работает)

```bash
# Запустите скрипт проверки
chmod +x check-server.sh
bash check-server.sh
```

---

## 🔧 Если Docker не установлен

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка
docker --version
docker-compose --version
```

---

## 📋 Полезные команды

```bash
# Просмотр логов
docker-compose logs -f               # Все логи
docker-compose logs backend -f       # Только backend
docker-compose logs frontend -f      # Только frontend

# Перезапуск
docker-compose restart               # Перезапуск всех
docker-compose restart backend       # Только backend

# Остановка
docker-compose down                  # Остановить все

# Полная очистка и пересборка
docker-compose down -v               # Удалить volumes
docker-compose up -d --build --force-recreate
```

---

## ✅ После исправления

API запросы будут работать:
- ✅ `POST /api/notifications/send`
- ✅ `POST /api/company-messages/send-all`

Все будет через Docker на портах:
- Frontend: 80 (nginx)
- Backend: 3000

nginx автоматически проксирует `/api` → `backend:3000/api`
