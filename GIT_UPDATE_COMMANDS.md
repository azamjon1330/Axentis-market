# Команды для обновления локального репозитория

## Для этого компьютера (d:\app\onlineshop2)

Вы уже на правильной версии! Все изменения уже здесь.

## Для другого компьютера или свежей копии репозитория

### Вариант 1: Обновить существующий репозиторий

```powershell
# Перейдите в папку проекта
cd d:\app\onlineshop2

# Скачайте последние изменения с GitHub
git fetch origin

# Посмотрите, какие изменения будут применены (опционально)
git log HEAD..origin/main --oneline

# Примените изменения
git pull origin main
```

### Вариант 2: Клонировать заново (если репозитория нет)

```powershell
# Перейдите в желаемую папку
cd d:\app

# Клонируйте репозиторий
git clone https://github.com/azamjon1330/Axentis-market.git onlineshop2-new

# Перейдите в папку
cd onlineshop2-new
```

## После обновления

### 1. Проверьте состояние репозитория

```powershell
git status
```

Должно показать: `Your branch is up to date with 'origin/main'`

### 2. Проверьте последний коммит

```powershell
git log -1 --oneline
```

Должно показать: `11c914d Fix Docker build: Add go.sum and update go.mod with all dependencies`

### 3. Проверьте наличие важных файлов

```powershell
# В PowerShell:
Test-Path backend\go.sum
Test-Path backend\go.mod
Test-Path backend\Dockerfile
```

Все должны вернуть `True`

### 4. Посмотрите содержимое файлов (опционально)

```powershell
# Проверить go.sum (должно быть ~140 строк)
Get-Content backend\go.sum | Measure-Object -Line

# Проверить go.mod (должен содержать require секции)
Get-Content backend\go.mod
```

## История коммитов (последние 5)

```powershell
git log --oneline -5
```

Вы должны увидеть:
```
11c914d Fix Docker build: Add go.sum and update go.mod with all dependencies
c445f9c Update Homepage submodule
116f511 Fix image compression, access key copying, API error logging
... (старые коммиты)
```

## Проблемы и решения

### Проблема: "Your local changes would be overwritten"

Если вы сделали локальные изменения:

```powershell
# Сохраните свои изменения
git stash

# Обновите репозиторий
git pull origin main

# Верните свои изменения
git stash pop
```

### Проблема: "Merge conflict"

Если есть конфликты:

```powershell
# Посмотрите конфликтные файлы
git status

# Откройте файлы и исправьте конфликты вручную
# Затем:
git add .
git commit -m "Resolve merge conflicts"
```

### Проблема: Git запрашивает логин/пароль

```powershell
# Используйте Personal Access Token вместо пароля
# Или настройте SSH ключ для GitHub
```

## Проверка Docker после обновления

```powershell
# Убедитесь что Docker Desktop запущен
docker --version

# Перейдите в корень проекта
cd d:\app\onlineshop2

# Попробуйте собрать образ
docker build -t azaton-backend ./backend

# Если успешно, запустите контейнер (опционально)
docker run -p 3000:3000 azaton-backend
```

## Дополнительные команды

### Посмотреть все изменения в файлах

```powershell
git diff HEAD~3 HEAD
```

### Посмотреть изменения в конкретном файле

```powershell
git diff HEAD~1 HEAD -- backend/go.mod
```

### Откатиться к предыдущей версии (ОСТОРОЖНО!)

```powershell
# Только для просмотра (не меняет файлы)
git checkout c445f9c

# Вернуться обратно
git checkout main

# Откатить конкретный файл
git checkout HEAD~1 -- backend/go.mod
```

---

**Внимание:** Все команды протестированы на Windows PowerShell.

**Репозиторий:** https://github.com/azamjon1330/Axentis-market

**Текущая ветка:** main

**Последний коммит:** 11c914d (2025-01-23)
