Photo Clusters (Expo + TypeScript + Expo Router)

Приложение на Expo, которое получает доступ к галерее устройства, кластеризует фотографии в “смысловые группы” и позволяет просматривать фото внутри кластера.
Главный акцент — осмысленная кластеризация, чтобы при открытии кластера было ощущение “да, это логично объединено”.

Демо-функционал
•	Запрашивает доступ к фото на устройстве
•	Показывает список кластеров (обложка + дата/время + количество фото)
•	Открытие кластера → сетка фото
Технологии
•	Expo SDK 54
•	React Native + TypeScript
•	Expo Router (stack-навигация)
•	expo-media-library для доступа к галерее
•	expo-image для быстрых превью
Важно про Android и Expo Go
На Android Expo Go ограничивает доступ к медиатеке для expo-media-library (в новых версиях Android разрешения сильно изменились). Поэтому полный функционал (реальные фото/полный доступ) корректно тестировать через Development Build (dev client), а не через Expo Go.
Если запускать через Expo Go — на Android возможны ошибки/отклонения в доступе к фото.
Установка и запуск
1) Установить зависимости
npm install
Рекомендуемая синхронизация версий пакетов под Expo:
npx expo install --fix
2) Запуск через Expo Go (если подходит)
npx expo start
Открой QR-код в Expo Go. На Android возможны ограничения по медиатеке (см. раздел выше). Если нужна 100% работа с галереей — используй dev build.
Запуск без Expo Go (Development Build) — рекомендуется для Android
Требования
•	Android Studio установлен (SDK + Platform Tools)
•	Java 17 (JDK 17)
•	Телефон: включить USB debugging
•	adb должен быть доступен

1) (Windows/cmd) Включить Java 17 в текущей сессии
set JAVA_HOME=C:\Program Files\Java\jdk-17.0.2

set PATH=%JAVA_HOME%\bin;%PATH%

java -version

2) Указать Android SDK (если нужно)
Обычно SDK лежит тут: %LOCALAPPDATA%\Android\Sdk
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk

set PATH=%ANDROID_HOME%\platform-tools;%PATH%

adb version

3) Prebuild + установка на телефон
npx expo prebuild --clean

npx expo run:android
После этого на телефоне появится установленное приложение Photo Clusters.

4) Запуск Metro через USB (стабильно, без проблем Wi‑Fi)
adb reverse tcp:8081 tcp:8081

npx expo start -c --dev-client --localhost
Открой установленное приложение на телефоне.
Принцип кластеризации
1) iOS: системные Moments (если доступны)
На iOS используется MediaLibrary.getMomentsAsync() — системные “моменты” Photos, которые уже агрегированы Apple по времени/локации и чаще всего выглядят наиболее “смыслово” для пользователя.
2) Android / fallback: кластеризация по времени (event sessions)
Алгоритм “сессий”:
1.	Берём фото из галереи и сортируем по времени съёмки (creationTime).
2.	Объединяем в один кластер, пока разрыв по времени между соседними фото не больше timeGapMinutes (по умолчанию 180 минут / 3 часа).
3.	Если разрыв больше — начинается новый кластер.
4.	Чтобы не было мусора из одиночных фото: кластеры меньшего размера (по умолчанию < 3 фото) склеиваются с предыдущим, если они относятся к тому же дню.
Почему это “смыслово”: большинство пользовательских фото делается сериями вокруг одного события (прогулка, поездка, встреча), а разрыв в несколько часов обычно означает смену события.
Параметры (можно менять)
•	timeGapMinutes (по умолчанию 180)
•	minClusterSize (по умолчанию 3)
Файл: src/cluster/timeClustering.ts
Структура проекта
•	app/ — роуты Expo Router (index.tsx — список кластеров; cluster/[id].tsx — экран кластера)
•	src/state/ClustersContext.tsx — загрузка фото, сбор кластеров, кэширование
•	src/cluster/timeClustering.ts — алгоритм кластеризации по времени
•	src/ui/ — UI-компоненты (ClusterCard, AssetGrid)
Разрешения
Android
Используются разрешения на чтение фото и доступ к EXIF location (если доступно):
•	READ_MEDIA_IMAGES
•	READ_MEDIA_VISUAL_USER_SELECTED (Android 14+ / выборочные фото)
•	ACCESS_MEDIA_LOCATION
Конфиг: app.json (через expo-media-library plugin).
нюансы / Troubleshooting
Expo Go не даёт доступ к галерее / getPermissionsAsync rejected
На Android это ограничение Expo Go → используй Development Build (см. выше).
SDK location not found / ANDROID_HOME
Создай android/local.properties:
sdk.dir=C:\\Users\\<username>\\AppData\\Local\\Android\\Sdk
Android Gradle plugin requires Java 17
Поставь JDK 17 и выставь JAVA_HOME на него.
Идеи для улучшения качества кластеров (следующие шаги)
5.	Время + гео: объединять фото, если разрыв по времени небольшой и расстояние между точками < N км (например 1–2 км).
6.	Кластеры по типу контента: отдельный кластер “Скриншоты”, “Документы”, “Фото товаров” (простые эвристики).
7.	Подписи локации: если есть координаты, показывать город/место в названии кластера.

