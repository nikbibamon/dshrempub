'use strict';

// Shared by hover, keyboard focus and the permission menu. Text is rendered as textContent.
const MODE_HELP = {
  chat: {
    en: 'Send a question with the context you attach or approve. Chat returns an answer. Use an Agent preset to change files or run project checks. The selected Tvijo service model uses your service allowance or credits.',
    ru: 'Отправляет вопрос с прикреплённым или разрешённым контекстом и возвращает ответ. Для изменения файлов и проверок проекта выберите режим агента. Выбранная сервисная модель Tvijo использует лимит или кредиты сервиса.'
  },
  manual: {
    en: 'The Agent can inspect the selected project. It asks you to approve edits and commands before applying them. Review each proposal in VS Code. Each model step uses the selected Tvijo service route.',
    ru: 'Агент изучает выбранный проект. Перед правкой и запуском команды запрашивает подтверждение в VS Code. Проверяйте каждое предложение. Шаги модели используют выбранный сервисный маршрут Tvijo.'
  },
  edit: {
    en: 'The Agent applies proposed edits automatically and asks before running commands. Check the diff before keeping the changes. Existing unsaved user buffers remain protected. Model steps use your Tvijo allowance or credits.',
    ru: 'Агент применяет предложенные правки автоматически и спрашивает перед запуском команд. Проверяйте diff перед принятием изменений. Несохранённые пользовательские буферы защищены. Шаги модели используют лимит или кредиты Tvijo.'
  },
  plan: {
    en: 'Inspect project files and build a plan before implementation. This mode provides read-only project tools. Choose an Agent preset when you want to apply the plan. Planning still uses the selected model and its allowance.',
    ru: 'Изучает файлы проекта и готовит план до реализации. Доступны инструменты чтения проекта. Для выполнения плана выберите режим агента. Планирование также использует выбранную модель и её лимит.'
  },
  auto: {
    en: 'The Agent saves eligible edits before checking files on disk. It can run commands allowed by the project policy; other commands request approval. Read the recorded checks and final diff to verify the result. Automatic mode and Automatic model routing are separate choices.',
    ru: 'Агент сохраняет допустимые правки до проверки файлов на диске. Команды, разрешённые правилами проекта, выполняются автоматически, остальные требуют подтверждения. Проверяйте зарегистрированные проверки и итоговый diff. Автоматический режим и автоматический выбор модели задаются отдельно.'
  },
  full: {
    en: 'Approve project editing and shell commands once for this project and account. Commands run with the extension host OS user’s rights. In Remote SSH this is the server user. Project policy, protected files and task budgets still apply. Revert revokes this grant. This permission is independent of your model credits.',
    ru: 'Один раз разрешает правки и shell-команды для этого проекта и аккаунта. Команды выполняются с правами пользователя ОС, от которого работает расширение. В Remote SSH это пользователь сервера. Действуют правила проекта, защита файлов и бюджет задачи. «Отменить» отзывает разрешение. Права режима задаются отдельно от баланса модели.'
  },
  extra: {
    en: 'Requires a trusted local or Remote SSH project, a non-root extension host user and explicit project approval. The host shell can affect files outside the project and includes bounded account CLI reviews. To enable it in Remote SSH, open the project through an ordinary server account and select this mode. Project policy and budgets still apply. Tvijo service credits are managed at dsh.tvijo.com/billing; payment does not change OS permissions.',
    ru: 'Нужны доверенный локальный или Remote SSH проект, обычный пользователь ОС хоста расширения и явное подтверждение для проекта. Shell может менять файлы вне проекта, доступны ограниченные CLI-ревью через аккаунты. Для включения в Remote SSH откройте проект через обычного пользователя сервера и выберите этот режим. Действуют правила проекта и бюджеты. Кредиты API Tvijo доступны на dsh.tvijo.com/billing, оплата не меняет права ОС.'
  },
  custom: {
    en: 'Uses the editing and command approval options already selected in extension settings. Review agentAutoApply and agentAutoRun there to see the current behavior.',
    ru: 'Использует выбранные в настройках расширения разрешения правок и команд. Текущее поведение задают параметры agentAutoApply и agentAutoRun.'
  },
  'account-reviews': {
    en: 'Allow the Tvijo Agent to request an advisory review of supplied evidence from installed Codex and explicitly enabled Claude Code account CLIs. Each CLI needs its own active subscription and login on this extension host. At most two fresh reviews per task, one per reviewer, up to 180 seconds each. Reviewers receive the supplied evidence and use read-only advice. The Tvijo coordinator keeps using its selected service model and credits. Revert or disable reviews to revoke access.',
    ru: 'Разрешает агенту Tvijo запрашивать консультативное ревью переданных материалов у установленного Codex и отдельно включённого Claude Code. Для каждого CLI нужны собственная действующая подписка и вход на хосте расширения. До двух новых ревью на задачу, по одному на ревьюера, до 180 секунд каждое. Ревьюеры получают переданные материалы и дают рекомендации в режиме чтения. Основной агент Tvijo продолжает использовать выбранную сервисную модель и кредиты. Доступ отзывается отключением ревью или разрешения режима.'
  },
  revoke: {
    en: 'Revoke the current project’s Full access or ExtraFullAccess grant, including account reviews. Later privileged operations require a new explicit approval.',
    ru: 'Отзывает разрешение полного доступа или ExtraFullAccess для текущего проекта, включая ревью через аккаунты. Следующие привилегированные операции потребуют нового подтверждения.'
  }
};

const CONTROL_HELP = {
  settings: ['Open chat settings. Switch between Chat, Context, Usage and Terminal from the top tabs. The close button returns to your conversation and preserves your draft.', 'Открывает настройки чата. Вверху доступны вкладки Чат, Контекст, Расходы и Терминал. Крестик возвращает к диалогу с сохранением черновика.'],
  'drawer-close': ['Return to the conversation. Your draft, messages and attached context stay available.', 'Возвращает к диалогу. Черновик, сообщения и прикреплённый контекст сохраняются.'],
  'drawer-back': ['Return to the chat settings overview. You can switch sections from the top tabs.', 'Возвращает на главный экран настроек чата. Разделы доступны во вкладках сверху.'],
  'tab-chat': ['Show the chat settings overview, account connection and project permissions.', 'Открывает главный экран настроек чата, подключение аккаунта и разрешения проекта.'],
  'tab-context': ['Inspect attached files and the project context summary before a question. You can remove attachments here.', 'Показывает прикреплённые файлы и сведения о контексте проекта перед вопросом. Здесь можно убрать вложения.'],
  'tab-usage': ['Load private service task receipts, model usage and the account allowance. Missing measurements appear as unknown.', 'Загружает личные квитанции сервисных задач, использование моделей и лимит аккаунта. Отсутствующие измерения показаны как неизвестные.'],
  'tab-terminal': ['Open your own terminal on the extension host in the selected project. In Remote SSH the terminal runs on the SSH server.', 'Открывает ваш терминал на хосте расширения в выбранном проекте. В Remote SSH терминал работает на SSH-сервере.'],
  'workspace-choice': ['Choose the exact project folder the Agent may inspect and work in. In a multi-folder workspace, check the selected path before sending.', 'Выбирает точную папку проекта для чтения и работы агента. В рабочей области из нескольких папок проверьте путь перед отправкой.'],
  plus: ['Add files, editor selections, Problems or terminal output. Conversation history, restore and export actions are also available here.', 'Добавляет файлы, выделение редактора, Проблемы или вывод терминала. Здесь также доступны история, восстановление и экспорт диалога.'],
  workflow: ['Choose the service model, collaboration method and context policy. The GPT-6.1 Sol service route uses Tvijo API credits. Subscription account reviews are enabled separately in the permission menu.', 'Выбирает сервисную модель, метод работы и правила контекста. Сервисный GPT-6.1 Sol использует кредиты API Tvijo. Ревью через подписки включаются отдельно в меню разрешений.'],
  send: ['Send in the selected mode. While a task is running, the next message is queued. Check the project and model before submitting.', 'Отправляет сообщение в выбранном режиме. Во время выполнения задачи следующее сообщение попадает в очередь. Проверьте проект и модель перед отправкой.'],
  cancel: ['Stop the active request. Changes already made remain available for review in the project diff and task receipt.', 'Останавливает текущий запрос. Выполненные изменения доступны для проверки в diff проекта и квитанции задачи.'],
  signin: ['Inspect the currently connected Tvijo account or sign in through browser approval. Account credentials are stored by VS Code.', 'Показывает подключённый аккаунт Tvijo или предлагает вход с подтверждением в браузере. Данные входа хранит VS Code.'],
  'composer-signin': ['Connect your Tvijo account through a browser approval. After sign-in, check the project and available allowance before sending.', 'Подключает аккаунт Tvijo через подтверждение в браузере. После входа проверьте проект и доступный лимит перед отправкой.'],
  lang: ['Switch the Tvijo panel and its help between English and Russian.', 'Переключает панель Tvijo и подсказки между английским и русским.'],
  theme: ['Cycle between system, light and dark appearance for the Tvijo panel.', 'Переключает системное, светлое и тёмное оформление панели Tvijo.'],
  engineering: ['Show recorded agent steps, checks and detailed task receipts. The conversation and draft are preserved when switching views.', 'Показывает зарегистрированные шаги агента, проверки и подробные квитанции задач. Переключение сохраняет диалог и черновик.'],
  'extension-settings': ['Open native VS Code settings for Tvijo, including agent permissions, context limits and optional Claude account reviews.', 'Открывает настройки Tvijo в VS Code, включая разрешения агента, лимиты контекста и отдельное включение ревью Claude.'],
  commands: ['Open all chat and project commands, including attaching context, history and restore.', 'Открывает команды чата и проекта, включая вложения, историю и восстановление.'],
  'agent-map-button': ['Show agents and execution steps observed in this task. Select a step to inspect its recorded result.', 'Показывает агентов и шаги, наблюдаемые в текущей задаче. Выберите шаг для просмотра зарегистрированного результата.'],
  'pack-picker': ['Choose a Tvijo workflow pack. Check its model and project permissions before starting a task.', 'Выбирает рабочий набор Tvijo. Перед задачей проверьте его модель и разрешения проекта.'],
  'product-guide': ['Open the Tvijo workspace guide and supported product workflows.', 'Открывает руководство по Tvijo и поддерживаемым рабочим сценариям.'],
  connections: ['Open connection and billing guidance for Tvijo service models, provider accounts and subscription CLI workers.', 'Открывает описание подключений и оплаты сервисных моделей Tvijo, аккаунтов провайдеров и CLI-воркеров по подписке.'],
  tasks: ['Inspect tasks recorded for your connected account and selected shared project.', 'Показывает зарегистрированные задачи подключённого аккаунта и выбранного общего проекта.'],
  'context-select': ['Choose which project folders and files can be included in automatic context. Review the preview before sharing.', 'Выбирает папки и файлы для автоматического контекста проекта. Перед передачей проверьте предпросмотр.'],
  'context-preview': ['Preview the bounded context collected locally. Check included paths, size and source dates before sending a question.', 'Показывает ограниченный контекст, собранный локально. Перед вопросом проверьте пути, размер и даты источников.'],
  'quick-edit': ['Request a focused edit for the current editor selection or file. Review the proposed changes through the editor workflow.', 'Запрашивает точечную правку выделения или текущего файла. Проверьте предложенные изменения в редакторе.'],
  'runtime-version': ['Show the loaded Tvijo version. Click to reload this VS Code window after saving your work so an installed update can activate.', 'Показывает загруженную версию Tvijo. После сохранения работы нажмите для перезагрузки окна VS Code и активации установленного обновления.'],
  'auto-commit': ['Toggle automatic commits for eligible saved agent changes. Review the exact changed paths and project policy before enabling.', 'Переключает автоматические коммиты допустимых сохранённых правок агента. Перед включением проверьте точные пути изменений и правила проекта.'],
  signout: ['Disconnect the current Tvijo account from this editor. Reconnect the intended account to access its server tasks.', 'Отключает текущий аккаунт Tvijo в редакторе. Для доступа к его серверным задачам снова подключите нужный аккаунт.'],
  attach: ['Choose a local file to attach to the next question. Its content is included with that request.', 'Выбирает локальный файл для следующего вопроса. Его содержимое передаётся вместе с запросом.'],
  'mention-file': ['Insert an @file reference in the question and resolve it to a file inside the selected project.', 'Вставляет ссылку @file в вопрос и находит соответствующий файл выбранного проекта.'],
  'attach-problems': ['Attach current VS Code diagnostics as evidence for the next question.', 'Прикрепляет текущие диагностические сообщения VS Code к следующему вопросу.'],
  'attach-terminal': ['Attach captured terminal output for the selected project. Review it for private data before sending.', 'Прикрепляет захваченный вывод терминала выбранного проекта. Перед отправкой проверьте личные данные.'],
  workspace: ['Choose a file from the open workspace as context for the next question.', 'Выбирает файл открытой рабочей области для контекста следующего вопроса.'],
  selection: ['Attach the current editor selection to the next question.', 'Прикрепляет текущее выделение редактора к следующему вопросу.'],
  path: ['Enter a file path inside the selected project to attach that file.', 'Принимает путь файла внутри выбранного проекта и прикрепляет этот файл.'],
  'clear-conversation': ['Start a new conversation. The current conversation is archived locally and remains available in history.', 'Начинает новый диалог. Текущий диалог сохраняется в локальном архиве и доступен в истории.'],
  'rewind-action': ['Review local conversation and file checkpoints. Restoring changed files requires confirmation.', 'Показывает локальные контрольные точки диалога и файлов. Восстановление изменённых файлов требует подтверждения.'],
  'export-conversation': ['Save the current conversation as Markdown for your own records.', 'Сохраняет текущий диалог в Markdown для вашего архива.'],
  'switch-model': ['Open the service model and method menu. Each route uses its declared account allowance and task budget.', 'Открывает выбор сервисной модели и метода. Каждый маршрут использует свой лимит аккаунта и бюджет задачи.'],
  'all-actions': ['Open the complete Tvijo command picker.', 'Открывает полный список команд Tvijo.'],
  'clear-context': ['Remove the attached context from the next question. Project source files stay on disk.', 'Убирает прикреплённый контекст из следующего вопроса. Исходные файлы проекта остаются на диске.']
};

const OPTION_HELP = {
  'agentMode:single': ['One selected service model handles the response. Its task receipt records actual usage.', 'Ответ готовит одна выбранная сервисная модель. Фактическое использование фиксирует квитанция задачи.'],
  'agentMode:auto': ['The service chooses a route for the task. Review the granted model in its receipt. Permission to edit files is controlled by the Agent preset.', 'Сервис выбирает маршрут под задачу. Фактическую модель смотрите в квитанции. Разрешение правок задаёт выбранный режим агента.'],
  'agentMode:council': ['The service combines its DeepSeek and GLM routes. Each call uses the task budget. Installed Codex and Claude subscription reviews have their own project permission.', 'Сервис объединяет маршруты DeepSeek и GLM. Каждый вызов использует бюджет задачи. Ревью установленных Codex и Claude по подписке включаются отдельным разрешением проекта.'],
  'reasoningMethod:evidence-first': ['Ground the response in the supplied project files and recorded observations. Check source dates when asking about current project status.', 'Ответ опирается на переданные файлы проекта и зарегистрированные наблюдения. Для текущего состояния проверяйте даты источников.'],
  'reasoningMethod:plan-check': ['Ask the model to plan the work and check the result. Execution rights still come from the selected Chat, Plan or Agent preset.', 'Модель планирует работу и проверяет результат. Права выполнения задаются выбранным режимом Чат, План или агента.'],
  'reasoningMethod:peer-review': ['Use the service review method for the response. Codex and Claude account reviews are configured separately in the permission menu.', 'Использует сервисный метод ревью ответа. Ревью через аккаунты Codex и Claude настраиваются отдельно в меню разрешений.'],
  'workspaceContext:ask': ['Ask for project context consent when required. A project Full access grant can authorize bounded automatic context. Explicit attachments are sent with your question.', 'При необходимости запрашивает согласие на контекст проекта. Разрешение полного доступа может включать ограниченный автоконтекст. Явные вложения передаются с вопросом.'],
  'workspaceContext:on': ['Collect bounded project context automatically. Inspect the preview to see included files, size and truncation. Explicit attachments can add more context.', 'Автоматически собирает ограниченный контекст проекта. Файлы, размер и сокращения видны в предпросмотре. Явные вложения дополняют контекст.'],
  'workspaceContext:off': ['Send the question and any explicit attachments while automatic project collection is off.', 'Передаёт вопрос и явные вложения при выключенном автоматическом сборе контекста проекта.'],
  'autoApply:false': ['Show a proposed coding edit for your review before applying it. Agent presets have their own edit and command settings.', 'Показывает предложенную правку для проверки перед применением. У режимов агента отдельные настройки правок и команд.'],
  'autoApply:true': ['Apply eligible coding edits automatically. Check the editor diff and saved files. Agent presets have their own edit and command settings.', 'Автоматически применяет допустимые правки. Проверяйте diff редактора и сохранённые файлы. У режимов агента отдельные настройки правок и команд.']
};

// Help for a menu item is placed outside the open menu: reading one choice must not hide the
// neighbouring ones. 0.10.33 put it above the hovered item, which covered the items above it.
// Pure, so the webview and the tests place help the same way.
function helpPlacement(anchor, menu, box, viewport, gap = 8) {
  const area = menu || anchor;
  const roomAbove = area.top - 2 * gap, roomBelow = viewport.height - area.bottom - 2 * gap;
  const left = Math.max(gap, Math.min(anchor.left, viewport.width - box.width - gap));
  if (box.height <= roomAbove) return {top: area.top - box.height - gap, left, maxHeight: null};
  if (box.height <= roomBelow) return {top: area.bottom + gap, left, maxHeight: null};
  const room = Math.max(roomAbove, roomBelow);
  // A long explanation scrolls in the free space instead of covering the menu.
  if (menu && room >= 96) return {top: roomAbove >= roomBelow ? gap : area.bottom + gap, left, maxHeight: room};
  const above = anchor.top - box.height - gap;
  const top = above >= gap ? above : anchor.bottom + gap;
  return {top: Math.max(gap, Math.min(top, viewport.height - box.height - gap)), left, maxHeight: null};
}

module.exports = { MODE_HELP, CONTROL_HELP, OPTION_HELP, helpPlacement };
