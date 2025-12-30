# Photo Clusters — Expo SDK 54 (совместимо с Expo Go SDK 54)

## Запуск

```bash
npm install
npx expo install --fix
npx expo start
```

Откройте проект в Expo Go.

## Что внутри
- Доступ к галерее через `expo-media-library`
- Кластеры:
  - iOS: Moments (`getMomentsAsync`) — обычно самые «логичные»
  - fallback / Android: собственная кластеризация по времени (событийные сессии)
- Просмотр кластера: список/грид фото

> В этой версии **нет ESLint**, чтобы `npm install` не падал из-за конфликтов peer-deps.
