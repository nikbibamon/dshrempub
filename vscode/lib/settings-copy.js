'use strict';
// EN is the base; RU is the second language in both native settings and the guide.
const ENUM_LABELS = {
 light:['Light report','Светлый отчёт'],dark:['Dark report','Тёмный отчёт'],rainbow:['Rainbow report','Радужный отчёт'],both:['Both light and dark reports','Светлый и тёмный отчёты'],
 'evidence-first':['Start with evidence','Сначала факты'],
 'plan-check':['Plan, then check','План и проверка'],
 'peer-review':['Review from another role','Проверка с другой роли'],
 single:['One model per answer','Одна модель на ответ'],
 auto:['Let the service choose','Выбор сервиса'],
 council:['Bounded answer review','Ограниченный обзор ответа'],
 sol:['Sol · installed Codex subscription','Sol · установленный Codex по подписке'],
 'sol-astra':['Sol + Astra · installed subscriptions','Sol + Astra · установленные подписки'],
 'sol-astra-claude':['Sol + Astra + verified Claude subscription','Sol + Astra + проверенная подписка Claude'],
 'dsh-harness':['DSH Harness · fixed coordinator','DSH Harness · фиксированный координатор'],
 ask:['Ask first','Сначала спросить'],on:['On','Включено'],off:['Off','Выключено'],
 afterTask:['After a successful task','После успешной задачи'],
 git:['My Git name and email','Мои имя и email из Git'],private:['Private local ID','Приватный локальный ID'],tvijo:['Tvijo · generic author','Tvijo · общая подпись'],
 coding:['DSHREM Coding','DSHREM Coding'],ds41f:['DeepSeek Flash · ds41f','DeepSeek Flash · ds41f'],glm53f:['GLM Flash · glm53f','GLM Flash · glm53f'],devstral:['Devstral','Devstral'],haiku55:['Claude Haiku · service route','Claude Haiku · маршрут сервиса'],gpt61sol:['GPT-6.1 Sol · service route','GPT-6.1 Sol · маршрут сервиса'],luna:['Luna · service route','Luna · маршрут сервиса']
};
const HELP_OVERRIDES = {
 autoCommit:[
  'After a successful Agent task, make a local Git commit of Tvijo’s own saved edits. Use when you want a checkpoint after each task. Files with staged or mixed user edits and quarantined rules are skipped. Git hooks run; cancellation can interrupt them. If a commit already exists, its result offers Undo. Changes to Git history or unexpected hook-added files stop automatic committing. Nothing is pushed.',
  'После успешной задачи Agent создать локальный Git-коммит собственных сохранённых правок Tvijo. Полезно для контрольной точки после каждой задачи. Файлы с подготовленными или смешанными правками пользователя и правила в карантине пропускаются. Git-хуки выполняются; отмена может их прервать. Если коммит уже создан, в результате доступна отмена Undo. Изменение истории Git или лишние файлы от хука останавливают автокоммит. Ничего не отправляется через push.'
 ],
 'orchestration.agentCount':[
  'Choose 3–6 team roles including the fixed ds41f coordinator, not simultaneous workers. Worker slots run sequentially: Sol implements first, then read-only Sol reviewers, with optional Astra/Claude advice under the selected policy. For example, 3 means one coordinator and two worker roles. Sol + Astra + Claude needs at least 4. Requires a host runtime that advertises team options; unavailable selected workers stop without a paid API fallback.',
  'Выберите 3–6 ролей, включая фиксированного координатора ds41f; это не число одновременных исполнителей. Рабочие роли выполняются последовательно: Sol сначала реализует решение, затем Sol-рецензенты только читают, с советом Astra/Claude по выбранной политике. Например, 3 — координатор и две рабочие роли. Sol + Astra + Claude требует минимум 4. Нужен хост с поддержкой настроек команды; недоступные исполнители останавливают задачу без подмены на платный API.'
 ],
 'orchestration.reportFormat':[
  'Choose the host task report appearance: light, dark, rainbow, or both light and dark (default). This changes report output, not the six chat accent palettes, worker policy or task budget. For example, choose both to read the same report in either appearance. Requires a runtime that advertises team options.',
  'Выберите оформление отчёта задачи хоста: светлое, тёмное, радужное или светлое и тёмное вместе (по умолчанию). Меняет вывод отчёта, а не шесть палитр чата, политику исполнителей или бюджет задачи. Например, выберите оба варианта для чтения одного отчёта в разном оформлении. Нужен хост с поддержкой настроек команды.'
 ],
 reasoningMethod:[
  'Requests a workflow for chat, Quick Edit and Agent steps. Start with evidence: inspect supplied files, logs and tests before conclusions (for example, diagnose a failing test). Plan, then check: propose small steps, then verify their results (for example, fix a form). Review from another role: check the solution as a reviewer (for example, look for missed edge cases); this does not necessarily use another model, a paid model or a swarm. These are requests, with no quality or savings guarantee.',
  'Запрашивает порядок работы для чата, Quick Edit и шагов Agent. Сначала факты: изучить переданные файлы, логи и тесты до выводов (например, найти причину падения теста). План и проверка: наметить небольшие шаги, затем проверить результат (например, исправить форму). Проверка с другой роли: оценить решение глазами рецензента (например, найти упущенные случаи); отдельная модель, платная модель или рой для этого не обязательны. Это запрос, без гарантии качества или экономии.'
 ],
 agentMode:[
  'Routes ordinary chat answers. One model: one answer route. Let the service choose: automatic service routing. Bounded answer review: council collaboration within one task ceiling, useful for comparing a proposed fix. This does not disable Agent Auto, start persistent AGENTROY or run the host DSH loop. Local Agent/Plan uses single mode per step; persistent host tasks are controlled by DSH Harness separately.',
  'Выбирает маршрут ответа обычного чата. Одна модель: один маршрут ответа. Выбор сервиса: автоматическая маршрутизация сервиса. Ограниченный обзор ответа: council в пределах одной задачи, например для проверки исправления. Не отключает Agent Auto, не запускает постоянный AGENTROY или цикл DSH на хосте. Локальный Agent/Plan использует single на каждом шаге; постоянными задачами хоста отдельно управляет DSH Harness.'
 ],
 service:[
  'Service for shared projects only; unused outside a shared project. The default ID standard names a shared-project service, not a quality tier. For example, choose a service for a shared team thread; the server fixes its quote before reservation. Choices below come only from an already loaded server catalog. If none is loaded, use the existing service/workflow picker in chat.',
  'Сервис только для общих проектов; вне общего проекта не используется. ID standard по умолчанию — название сервиса общего проекта, а не уровень качества. Например, выберите сервис для общего треда команды; сервер фиксирует цену до резервирования. Здесь показан только уже загруженный каталог сервера. Если каталога нет, используйте выбор сервиса и процесса в чате.'
 ],
 pack:[
  'Adds project instructions from a server skill pack. Auto (empty value) checks root file markers, then engineer if available; No pack (none) disables pack instructions. For example, choose a loaded pack whose description matches your project. Only real loaded catalog IDs, categories when supplied, and descriptions are listed. An unavailable saved ID is preserved. Instructions stay in host memory; explicit model choices take priority.',
  'Добавляет инструкции для проекта из серверного пакета навыков. Авто (пустое значение) проверяет файлы-маркеры в корне, затем engineer при наличии; Без пакета (none) отключает инструкции. Например, выберите загруженный пакет с подходящим описанием. Показаны реальные ID загруженного каталога, категории при наличии и описания. Недоступный сохранённый ID сохраняется. Инструкции остаются в памяти хоста; явно выбранная модель имеет приоритет.'
 ],
 'orchestration.workerPolicy':[
  'Select only installed subscription workers: Sol; Sol + Astra for additional advice; or Sol + Astra + Claude after native Claude and quota verification. For example, keep Sol when only Codex is set up. An unavailable selected worker stops the task; there is no secret billable API fallback. This policy selects workers, not the fixed coordinator service route.',
  'Выбирайте только установленных исполнителей по подписке: Sol; Sol + Astra для дополнительного совета; Sol + Astra + Claude после проверки нативного Claude и квоты. Например, оставьте Sol, если настроен только Codex. Недоступный выбранный исполнитель останавливает задачу; скрытой подмены на платный API нет. Это выбор исполнителей, а не фиксированного маршрута координатора.'
 ],
 'orchestration.controllerPath':[
  'Advanced override: installed controller on the extension host disk (your computer locally, the remote machine in Remote SSH). Blank discovers the trusted host manifest after explicit setup. No background package installation. Use DSH doctor to check setup.',
  'Дополнительный путь установленного контроллера на диске хоста расширения (ваш компьютер локально, удалённая машина в Remote SSH). Пустое значение берётся из доверенного манифеста после явной настройки хоста. Фоновой установки пакетов нет. Проверяйте настройку через DSH doctor.'
 ],
 'orchestration.pythonPath':[
  'Advanced override: installed Python executable on the local or Remote SSH extension host disk, without shell arguments. Blank uses the trusted host manifest after explicit setup, then python3 if absent. No background package installation.',
  'Дополнительный путь установленного Python на диске локального или Remote SSH хоста расширения, без аргументов оболочки. Пустое значение берётся из доверенного манифеста после явной настройки, иначе используется python3. Фоновой установки пакетов нет.'
 ],
 'orchestration.statePath':[
  'Advanced override: durable queue and receipts on the extension host disk (local computer or Remote SSH machine). Private state uses 0700 owner-only access. Blank discovers the trusted host manifest after explicit setup. No background package installation.',
  'Дополнительный каталог очереди и квитанций на диске хоста расширения (локальный компьютер или машина Remote SSH). Приватное состояние использует 0700 — доступ только владельцу. Пустое значение берётся из доверенного манифеста после явной настройки. Фоновой установки пакетов нет.'
 ]
};
module.exports={ENUM_LABELS,HELP_OVERRIDES};
