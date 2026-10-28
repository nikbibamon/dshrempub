'use strict';

const crypto = require('node:crypto');
const {PALETTES,PALETTE_CSS}=require('./theme-palette');
const {OCR_LANGUAGES}=require('./settings-controls');
const {FULL_ACCESS_LIMITS}=require('./full-access');
const {ENUM_LABELS,HELP_OVERRIDES}=require('./settings-copy');
const SETTINGS_HELP = Object.freeze(Object.fromEntries([
  ["agentReview.codexModel", "Account Codex reviewer model; default gpt-6-astra, always --sandbox read-only.", "Модель ревьюера Codex по подписке; по умолчанию gpt-6-astra, всегда --sandbox read-only."],
  ["agentReview.claudeEnabled", "Allow supplied-evidence Claude subscription reviews in ExtraFullAccess. Off by default. Project policy can still pause Claude. No API fallback or recursive delegation.", "Разрешить рекомендательное ревью переданных материалов через подписку Claude в ExtraFullAccess. По умолчанию выключено. Правила проекта могут приостановить Claude. Без API-подмены и рекурсивных вызовов."],
  ["commitIdentity", "Git uses your configured name and email. Private uses a stable random local ID; Tvijo uses generic attribution. New automatic commits only. No email is hashed or uploaded; IDs are not registered on the website.", "Git использует ваши имя и email. Приватный режим — постоянный случайный локальный ID; Tvijo — общая подпись. Только новые автокоммиты. Email не хешируется и не отправляется; ID не зарегистрирован на сайте."],
  ["colorTheme", "Choose accent colors for chat and settings. The six palettes work with both light and dark appearance. This does not change the rest of VS Code.", "Выберите цвет чата и настроек. Шесть палитр работают со светлым и тёмным оформлением. Остальной интерфейс VS Code не меняется."],
  ["orchestration.enabled", "Opt in to DSH Harness on the selected Linux local/Remote SSH project host. Existing engine remains the default. Requires explicit host setup; never installs packages or shares the operator subscription with website accounts.", "Включает DSH Harness на выбранном Linux-хосте локально или через Remote SSH. Требует настройки; подписка оператора не доступна пользователям сайта."],
  ['orchestration.agentCount',...HELP_OVERRIDES['orchestration.agentCount']],
  ['orchestration.reportFormat',...HELP_OVERRIDES['orchestration.reportFormat']],
  ["orchestration.profile", "Fixed ds41f coordinator using the existing AIOS metered route. Chat model choices do not override this engine.", "Фиксированный координатор ds41f. Модель чата не меняет этот движок."],
  ["orchestration.workerPolicy", "Subscription Codex GPT-6.1 Sol; optionally GPT-6 Astra/high for complex advice. Claude requires a separately verified native provider and quota. No paid API fallback.", "Подписочный Codex Sol; Astra для сложного совета. Claude требует проверки SDK и квоты. Без API fallback."],
  ["orchestration.controllerPath", "Advanced override. Normally discovered from the private host manifest created by explicit setup; no path entry is needed. Run Orchestration doctor.", "Дополнительная ручная настройка. Обычно путь определяется автоматически после явной настройки хоста. Выполните Orchestration doctor."],
  ["orchestration.pythonPath", "Advanced override for the Python executable. Normally discovered from the trusted host setup. No shell arguments.", "Python с зависимостями AIOS на этом хосте. Без shell-аргументов."],
  ["orchestration.statePath", "Advanced override for private durable state (0700) on the data volume. Normally discovered automatically after host setup.", "Приватный каталог 0700 на диске данных для очереди и квитанций."],
  ['pack', 'Choose a server skill pack by ID. Empty selects automatically from root markers, then engineer when available. Use `none` to disable pack instructions. Instructions stay in memory; explicit model choices take priority.', 'Выбирает серверный пакет навыков по ID. Пустое значение включает выбор по файлам в корне, затем engineer при наличии. Значение `none` отключает инструкции пакета. Инструкции хранятся в памяти; выбранная пользователем модель имеет приоритет.'],
  ['service', 'Selects the managed shared-project service. Use when choosing a shared workflow; the server reserves an immutable quote. Shared projects use this service instead of chat model/mode.', 'Выбирает сервис общего проекта. Используйте для общего рабочего процесса: сервер резервирует неизменяемую котировку. В общем проекте сервис заменяет модель и режим чата.'],
  ['model', 'Requests a model for ordinary chat and Quick Edit. Use to choose a route; unavailable routes are refused. Shared-project chat uses service quotes instead. Local Agent/Plan uses agentModel.', 'Запрашивает модель для обычного чата и Quick Edit. Выбирайте маршрут; недоступные маршруты отклоняются. Чат общего проекта использует котировку сервиса. Локальный Agent/Plan использует agentModel.'],
  ['agentMode', 'Changes ordinary chat routing: single, auto or council. Use council for a bounded review; it shares one service task ceiling. Local Agent/Plan always requests single mode per step.', 'Меняет маршрутизацию обычного чата: single, auto или council. Council нужен для ограниченного обзора с общим потолком задачи сервиса. Локальный Agent/Plan всегда запрашивает single на каждом шаге.'],
  ['reasoningMethod', 'Selects the requested reasoning workflow for chat, Quick Edit and Agent steps. Use to choose evidence-first, plan-check or peer-review. This is no quality or savings guarantee.', 'Выбирает метод рассуждения для чата, Quick Edit и шагов Agent: evidence-first, plan-check или peer-review. Не гарантирует качество или экономию.'],
  ['workspaceContext', 'Controls bounded project context. Use off for less sharing or on for project questions. Ask remembers the consent choice; reselect Ask in the chat context control to reset it. Preview before sending; exclusions are not a guarantee against all sensitive text.', 'Управляет ограниченным контекстом проекта. Off уменьшает передачу, on полезен для вопросов о проекте. Ask запоминает согласие; повторно выберите Ask в чате для сброса. Проверяйте предпросмотр: исключения не гарантируют отсутствие всех чувствительных данных.'],
  ["workspaceContextMaxBytes", "Collect up to 200 KB by default; 1 MB is available for local preview. Requests select a smaller excerpt to fit service and account limits. Agent and Quick Edit use the same setting; larger values do not expand the server window.", "По умолчанию сбор до 200 КБ; для локального просмотра доступен 1 МБ. В запрос отправляется выдержка по лимитам сервиса и аккаунта. Agent и Quick Edit используют эту же настройку. Увеличение не расширяет окно сервера."],
  ["autoApply", "Enabled by default: apply Quick Edit after opening the diff, without another confirmation. Changes stay in the unsaved editor buffer. Agent file edits have their separate auto-apply setting.", "По умолчанию включено: Quick Edit применяет правку после открытия diff без повторного подтверждения. Изменения остаются в несохранённом буфере. Для правок Agent есть отдельная настройка."],
  ['agentModel', 'Requests one model for each local Agent or Plan step. Use a route that reliably returns tool JSON. Each step is a separate service task in single mode, regardless of chat model/agentMode; unavailable routes are refused.', 'Запрашивает одну модель на каждый шаг локального Agent или Plan. Выбирайте маршрут с надёжным JSON инструментов. Каждый шаг — отдельная задача сервиса в single независимо от model/agentMode чата; недоступный маршрут отклоняется.'],
  ["agentMaxSteps", "Default 60 tool steps. At the limit you can approve another 30, up to 200 total, within the same budget. Declining produces a bounded summary. DSH Harness uses its own host limits.", "По умолчанию 60 шагов. На пределе можно разрешить ещё 30, всего до 200, в том же бюджете. Отказ завершает работу кратким итогом. У DSH Harness свои ограничения хоста."],
  ["agentBudgetUsd", "Default $2 per local Agent task. At 80% usage the agent offers +$2, +$5 or +$10 for this run only. Nothing is added without your choice. Service/account limits still apply. DSH Harness keeps its original root budget.", "По умолчанию $2 на задачу Agent. При расходе 80% агент предложит +$2, +$5 или +$10 только на этот запуск. Без вашего выбора бюджет не растёт. Лимиты сервиса и аккаунта сохраняются. DSH Harness сохраняет исходный бюджет корневой задачи."],
  ['agentAutoRun', 'Skips per-command approval for literal allowlisted Agent commands. Plan refuses commands. Git transports also block fetch/clone in inherited environments. '+FULL_ACCESS_LIMITS.en, 'Пропускает подтверждение буквальных команд Agent из разрешённого списка. Plan запрещает команды. Унаследованный запрет транспортов Git также блокирует fetch/clone. '+FULL_ACCESS_LIMITS.ru],
  ['agentAutoApply', 'Skips per-file approval for local Agent edits. Use when you can review opened diffs. Auto saves eligible edits to disk before checks; Plan refuses writes.', 'Пропускает подтверждение каждого файла при правках Agent. Используйте, если проверяете открываемые diff. Авто сохраняет допустимые правки на диск до проверок; Plan запрещает запись.'],
  ['autoCommit','Commit Tvijo-owned saved edits locally after a successful Agent task. Hooks run; committed blobs determine index reconciliation and commits with hook-added paths are withdrawn by compare-and-swap, preserving disk and user index. Live cancellation interrupts Git hooks; an already-created commit is reported with Undo. Staged, mixed-authorship and quarantined rules files are skipped; HEAD/ref changes refuse auto-commit. Never pushes.','Коммитить собственные сохранённые правки Tvijo локально после успешной задачи Agent. Хуки выполняются; индекс сверяется с фактически закоммиченными версиями, коммит с лишними путями хука отзывается через compare-and-swap, диск и индекс пользователя сохранены. Отмена прерывает Git-хуки; уже созданный коммит показан с Undo. Staged-файлы, чужие правки и правила в карантине пропускаются; изменение HEAD/ссылок запрещает автокоммит. Никогда не push.'],
  ['bridge.enabled', "Accept messages from local tools on this host (for example Claude Code) through the inbox folder in the extension storage. Each message is queued in the chat like a typed one and runs with the current mode, including Full access. Off by default.", "Принимать сообщения от локальных инструментов этого хоста (например, Claude Code) через папку inbox в хранилище расширения. Каждое сообщение встаёт в очередь чата как набранное и выполняется в текущем режиме, включая полный доступ. По умолчанию выключено."],
  ['telegram.enabled', 'Enables the owner-only Telegram connector on this extension host after bot configuration. Use only on a host that should run your bot. It requires a separately stored bot token and owner ID.', 'Включает Telegram-коннектор владельца на этом хосте расширения после настройки бота. Только для хоста, где должен работать бот. Нужны отдельно сохранённый токен и ID владельца.'],
  ['telegram.ownerId', 'Legacy native value, not the active bot owner. Use Configure Telegram bot to set the owner for the signed-in account. The active owner is saved per account; changing this field alone does not transfer control. Bot tokens belong in SecretStorage.', 'Устаревшее поле настроек, не действующий владелец бота. Задайте владельца через «Настроить Telegram-бота» для текущего аккаунта. ID хранится отдельно для аккаунта; изменение этого поля не передаёт управление. Токен хранится в SecretStorage.'],
  ["ocrLanguages", "Choose installed Tesseract languages; English + Russian by default. Install missing language packs on the extension host. Screenshots provide extracted text to the selected model (ds41f by default), not pixels or visual layout.", "Выберите установленные языки Tesseract; по умолчанию английский + русский. Недостающие пакеты устанавливаются на хосте расширения. Модели (по умолчанию ds41f) передаётся текст скриншота, а не пиксели или макет."],
  ["apiBase", "Advanced: leave unchanged for Tvijo. Change only when your administrator supplies a trusted self-hosted endpoint. Changing the server switches account scope and requires signing in there.", "Для администратора: оставьте как есть при работе с Tvijo. Меняйте только по адресу доверенного собственного сервера. Смена сервера переключает аккаунт и потребует входа на нём."],
  ['telegram.allowedServices', 'Allows exact systemd .service names for owner inspection/restart. Use only for explicitly selected services on the connector host. Empty disables service control; restart requires a fresh 60-second Telegram confirmation.', 'Разрешает точные имена systemd .service для просмотра и перезапуска владельцем. Только явно выбранные службы хоста коннектора. Пустой список отключает управление; перезапуск требует свежего подтверждения Telegram на 60 секунд.']
].map(([key, en, ru]) => ['tvijo.' + key, Object.freeze({ en:HELP_OVERRIDES[key]?.[0]||en, ru:HELP_OVERRIDES[key]?.[1]||ru })])));

const GUIDE_ACTIONS = Object.freeze({ configExample:'tvijo.configExample', startBot:'tvijo.startBot', stopBot:'tvijo.stopBot', orchestrationSetup:'tvijo.orchestrationSetup', orchestrationRepair:'tvijo.orchestrationRepair', orchestrationDoctor:'tvijo.orchestrationDoctor', orchestrationStatus:'tvijo.orchestrationStatus', orchestrationResume:'tvijo.orchestrationResume', orchestrationStop:'tvijo.orchestrationStop', orchestrationOpenTmux:'tvijo.orchestrationOpenTmux', chooseProject: 'tvijo.chooseProject', chooseThread: 'tvijo.chooseThread', signIn: 'tvijo.signIn', terminal: 'tvijo.terminal', nativeSettings: 'workbench.action.openSettings', contextPreview: 'tvijo.contextPreview', configureAutoLint:'tvijo.configureAutoLint', disableAutoLint:'tvijo.disableAutoLint', connections: 'tvijo.connections', configureBot: 'tvijo.configureBot', dataPrivacy:'tvijo.dataPrivacy', resources:'tvijo.resources', product: 'https://tvijo.com', browser: 'https://dsh.tvijo.com', platform: 'https://platform.tvijo.com', knowledge:'https://dsh.tvijo.com/knowledge/settings-explained#article-top', teamsHelp:'https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs#article-top', recoveryHelp:'https://dsh.tvijo.com/knowledge/durable-work-and-recovery#article-top', choosePack:'tvijo.choosePack', chooseWorkflow:'tvijo.chooseWorkflow', orchestrationHelp:'https://dsh.tvijo.com/orchestration/setup', orchestrationReport:'tvijo.orchestrationReport' });
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function settingsHtml(webview, { locale = 'en', properties = {}, values = {}, runtime = {} } = {}) {
  const nonce = crypto.randomBytes(18).toString('base64');
  // Only configuration keys in the public guide can enter the webview. Never pass auth state.
  const publicValue = (key, value) => {
    if (key !== 'tvijo.apiBase' || typeof value !== 'string') return value;
    try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); } catch { return '[invalid endpoint]'; }
  };
  const rows = Object.keys(SETTINGS_HELP).map(key => ({ key, help: SETTINGS_HELP[key], default: publicValue(key, properties[key]?.default), value: publicValue(key, Object.hasOwn(values, key) ? values[key] : properties[key]?.default), scope: properties[key]?.scope || 'window', type: properties[key]?.type || '', options: properties[key]?.enum || null, minimum: properties[key]?.minimum, maximum: properties[key]?.maximum }));
  const data = safeJson({ locale: locale === 'ru' ? 'ru' : 'en', rows, runtime, enumLabels:ENUM_LABELS, palettes:PALETTES, languages:OCR_LANGUAGES });
  return `<!DOCTYPE html><html lang="${locale === 'ru' ? 'ru' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><title>Tvijo Settings &amp; how it works</title><style nonce="${nonce}">
${PALETTE_CSS}
body{--border:var(--vscode-panel-border,#354355);--accent:#60a5fa;font-family:var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);color:var(--vscode-foreground, #e8edf5);background:var(--vscode-editor-background, #101722);margin:0;padding:20px;box-sizing:border-box}main{max-width:1100px;margin:auto}h1{font-size:24px}h2{font-size:18px}p{line-height:1.6}header,.toolbar,.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}header{justify-content:space-between}button,input{font:inherit;border:1px solid var(--vscode-input-border, var(--vscode-panel-border, #354355));border-radius:6px;padding:8px 12px}button{background:var(--vscode-button-background, #275c9c);color:var(--vscode-button-foreground, #ffffff);cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder, #76b6ff);outline-offset:2px}input{color:var(--vscode-input-foreground, #e8edf5);background:var(--vscode-input-background, #182333);flex:1;min-width:120px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;margin:18px 0}.card,.intro{border:1px solid var(--vscode-panel-border, #354355);border-radius:10px;padding:16px;background:var(--vscode-editorWidget-background, #182333)}.key{font-family:var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);overflow-wrap:anywhere}.meta{font-size:12px;color:var(--vscode-descriptionForeground, #b4c1d3);white-space:pre-wrap;overflow-wrap:anywhere}.card h2{margin-top:0}#empty{padding:20px}[hidden]{display:none!important}@media(max-width:420px){body{padding:12px}.toolbar{align-items:stretch}.toolbar button{flex:1}h1{font-size:21px}}
.card input:not([type=checkbox]),.card select,.card textarea{box-sizing:border-box;width:100%;max-width:100%;font:inherit;color:inherit;background:var(--vscode-input-background,#101722);border:1px solid var(--border);border-radius:6px;padding:9px;margin:6px 0}.card input[type=checkbox]{flex:none;min-width:0;accent-color:var(--accent)}.card label{display:flex;align-items:center;gap:8px;margin:7px 0}.card button{margin:5px 5px 0 0}.card h2{font-size:15px}button{background:var(--palette-button,#275c9c);color:var(--palette-on,#fff)}.secondary{background:transparent;color:inherit}.state-note{color:var(--vscode-descriptionForeground,#b4c1d3)}#save-status{position:sticky;top:0;background:var(--vscode-editor-background,#101722);padding:10px;border-left:3px solid var(--accent);z-index:2}.language-options{max-height:160px;overflow:auto}.card[data-inactive=true]{border-style:dashed}
</style></head><body><main><header><h1 id="title"></h1><button id="language" type="button"></button></header><div id="palettes" class="palette-picker"></div><p id="save-status" role="status" aria-live="polite" hidden></p><details class="intro"><summary id="intro-title">How it works</summary><section aria-labelledby="mapTitle"><h2 id="mapTitle"></h2><div id="map"></div><div class="actions" id="actions"></div><p id="safety"></p></section></details><h2 id="settingsTitle"></h2><div class="toolbar"><input id="search" type="search"><button id="native" type="button"></button></div><p id="count" role="status" aria-live="polite"></p><div class="grid" id="cards"></div><details id="advanced"><summary id="advanced-title"></summary><div class="grid" id="advanced-cards"></div></details><p id="empty" hidden></p></main><script nonce="${nonce}">
const settingLabels={"model": ["Chat model", "Модель чата"], "agentModel": ["Agent model", "Модель агента"], "agentMaxSteps": ["Steps per task", "Шагов на задачу"], "agentBudgetUsd": ["Task budget, USD", "Бюджет задачи, USD"], "autoApply": ["Apply Quick Edit automatically", "Применять Quick Edit автоматически"], "agentAutoApply": ["Apply Agent edits automatically", "Применять правки агента автоматически"], "agentAutoRun": ["Run approved commands automatically", "Выполнять разрешённые команды автоматически"], "autoCommit": ["Local automatic commit", "Локальный автокоммит"], "commitIdentity": ["Commit author", "Автор коммита"], "workspaceContext": ["Project context", "Контекст проекта"], "workspaceContextMaxBytes": ["Local context collection, bytes", "Сбор локального контекста, байт"], "ocrLanguages": ["Screenshot languages (OCR)", "Языки скриншотов (OCR)"], "colorTheme": ["Accent colors", "Цвета оформления"], "apiBase": ["Advanced: service address", "Дополнительно: адрес сервиса"], "telegram.enabled": ["Telegram connection", "Подключение Telegram"], "telegram.ownerId": ["Telegram owner setup", "Настройка владельца Telegram"], "telegram.allowedServices": ["Telegram: allowed host services", "Telegram: разрешённые службы хоста"], "orchestration.enabled": ["DSH Harness engine", "Движок DSH Harness"], "orchestration.profile": ["Coordinator profile", "Профиль координатора"], "orchestration.workerPolicy": ["Subscription workers", "Исполнители по подписке"], "orchestration.controllerPath": ["Advanced: controller path", "Дополнительно: путь контроллера"], "orchestration.pythonPath": ["Advanced: Python path", "Дополнительно: путь Python"], "orchestration.statePath": ["Advanced: task storage", "Дополнительно: хранилище задач"], "pack": ["Project skill pack", "Навыки для проекта"], "service": ["Shared project service", "Сервис общего проекта"], "agentMode": ["Chat collaboration", "Совместная работа моделей в чате"], "reasoningMethod": ["How to approach the answer", "Как работать над ответом"], "orchestration.agentCount":["Team roles (3–6)","Ролей в команде (3–6)"], "orchestration.reportFormat":["Report appearance","Оформление отчёта"]};
const initial=${data};
const vscode=acquireVsCodeApi();
let locale=initial.locale,runtime=initial.runtime,lastRevision=0;
const rows=initial.rows,views=new Map(),edits=new Map();
const $=id=>document.getElementById(id);
const L=(en,ru)=>locale==='ru'?ru:en;
const advanced=new Set(['tvijo.apiBase','tvijo.orchestration.profile','tvijo.orchestration.controllerPath','tvijo.orchestration.pythonPath','tvijo.orchestration.statePath','tvijo.telegram.ownerId']);
const order=['model','reasoningMethod','agentMode','workspaceContext','orchestration.enabled','orchestration.workerPolicy','orchestration.agentCount','orchestration.reportFormat','agentModel','agentMaxSteps','agentBudgetUsd','agentAutoRun','agentAutoApply','autoApply','pack','service','ocrLanguages','colorTheme'];
rows.sort((a,b)=>(order.indexOf(a.key.slice(6))<0?99:order.indexOf(a.key.slice(6)))-(order.indexOf(b.key.slice(6))<0?99:order.indexOf(b.key.slice(6))));
for(const row of rows)edits.set(row.key,{version:0,requestId:0,dirty:false,pending:false,timer:null,error:'',revision:0});
function node(tag,text='',className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function action(id,label,parent){const b=node('button',label,'secondary');b.type='button';b.addEventListener('click',()=>vscode.postMessage({type:'guideAction',id}));parent.appendChild(b);return b;}
function label(row){return settingLabels[row.key.slice(6)]?.[locale==='ru'?1:0]||row.key;}
function enumLabel(row,value){if(row.key==='tvijo.pack')return value===''?L('Auto · from project files','Авто · по файлам проекта'):value==='none'?L('No pack','Без пакета'):value;
 return initial.enumLabels[value]?.[locale==='ru'?1:0]||initial.palettes[value]?.[locale==='ru'?1:0]||value;}
function format(value){return value===undefined?'—':JSON.stringify(value);}
function endpoint(value){try{const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.toString();}catch{return '[invalid endpoint]';}}
function publicValue(key,value){return key==='tvijo.apiBase'?endpoint(value):value;}
function optionsFor(row){
 if(row.key==='tvijo.pack')return [{id:'',name:L('Auto · from project files','Авто · по файлам проекта')},{id:'none',name:L('No pack','Без пакета')},...(runtime.packs||[])];
 if(row.key==='tvijo.service')return runtime.services||[];
 return row.options?.map(id=>({id,name:enumLabel(row,id)}))||null;
}
function localized(value){return typeof value==='string'?value:value?.[locale]||value?.en||'';}
function updateOptions(row,view){
 const items=optionsFor(row);if(!view.input||view.input.tagName!=='SELECT'||!items)return;
 const state=edits.get(row.key),current=(state.dirty||state.pending)&&view.optionsSignature!==undefined?view.input.value:row.value;
 if(row.key==='tvijo.service')view.input.disabled=!runtime.sharedProject||!runtime.services?.length;
 const sig=JSON.stringify([locale,items,current,row.key==='tvijo.orchestration.workerPolicy'?runtime.orchestration:null]);if(view.optionsSignature===sig)return;
 view.optionsSignature=sig;view.input.replaceChildren();
 for(const item of items){const name=localized(item.name||item.title)||enumLabel(row,item.id);const option=node('option',name+(item.title?' · '+item.id:'')+(item.category?' · '+localized(item.category):''));option.value=item.id;if(row.key==='tvijo.orchestration.workerPolicy'&&runtime.orchestration&&runtime.orchestration.policies?.find(p=>p.id===item.id)?.available!==true)option.disabled=true;view.input.appendChild(option);}
 if(!items.some(item=>item.id===current)){const option=node('option',String(current)+' · '+L('unavailable / not in loaded catalog','недоступно / нет в загруженном каталоге'));option.value=current;view.input.appendChild(option);}
 view.input.value=current;
}
function setInput(row,view){
 if(!view.input)return;
 if(row.key==='tvijo.ocrLanguages'){const selected=new Set(String(row.value).split('+'));for(const [code,checkbox] of view.choices)checkbox.checked=selected.has(code);return;}
 if(row.type==='boolean')view.input.checked=!!row.value;
 else {const value=row.type==='array'?(Array.isArray(row.value)?row.value.join('\\n'):''):String(row.value??'');if(view.input.value!==value)view.input.value=value;}
}
function readInput(row,view){
 if(row.key==='tvijo.ocrLanguages')return view.choices.filter(x=>x[1].checked).map(x=>x[0]).join('+');
 if(row.type==='boolean')return view.input.checked;
 if(row.type==='number')return view.input.value.trim()===''?NaN:Number(view.input.value);
 if(row.type==='array')return view.input.value.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
 return view.input.value;
}
function status(){
 const states=[...edits.values()],error=states.find(s=>s.error);
 $('save-status').hidden=false;
 $('save-status').textContent=error?error.error:edits.get('tvijo.apiBase')?.dirty?L('Server address waiting for your confirmation.','Адрес сервера ожидает вашего подтверждения.'):states.some(s=>s.pending||s.dirty)?L('Saving changes…','Сохраняем изменения…'):L('Changes save automatically on this extension host.','Изменения сохраняются автоматически на этом хосте расширения.');
}
function send(row){
 const state=edits.get(row.key),view=views.get(row.key);clearTimeout(state.timer);state.timer=null;
 if(!state.dirty)return;
 if(view.input?.checkValidity&&!view.input.checkValidity()||row.type==='number'&&!Number.isFinite(readInput(row,view))){state.error=L('Enter a valid value in the allowed range.','Введите допустимое значение в указанном диапазоне.');updateView(row);status();return;}
 const value=readInput(row,view);state.pending=true;state.dirty=false;state.sentVersion=state.version;state.requestId++;
 vscode.postMessage({type:'saveSetting',key:row.key,value,requestId:state.requestId});updateView(row);status();
}
function changed(row,immediate=false){
 const state=edits.get(row.key);state.version++;state.dirty=true;state.error='';clearTimeout(state.timer);
 if(row.key==='tvijo.apiBase'){updateView(row);status();return;}
 if(immediate)send(row);else state.timer=setTimeout(()=>send(row),450);
 updateView(row);status();
}
function save(key,value){const row=rows.find(r=>r.key===key),view=views.get(key);view.input.value=value;changed(row,true);}
function buildCards(){
 $('cards').replaceChildren();$('advanced-cards').replaceChildren();views.clear();
 for(const row of rows){
 const card=node('article','','card');card.setAttribute('data-key',row.key);const view={card};views.set(row.key,view);
 card.appendChild(node('h2',label(row)));card.appendChild(node('p',row.help[locale]));
 view.note=node('p','','state-note');card.appendChild(view.note);
 if(row.key==='tvijo.orchestration.profile'||row.key==='tvijo.telegram.ownerId'){
  view.fixed=node('p',row.key==='tvijo.orchestration.profile'?L('Fixed coordinator; set up the host explicitly.','Фиксированный координатор; настройте хост явно.'):L('Use Telegram setup to change the active owner.','Для смены действующего владельца используйте настройку Telegram.'));card.appendChild(view.fixed);
 }else if(row.key==='tvijo.ocrLanguages'){
  view.choices=[];view.input=node('div','','language-options');const selected=new Set(String(row.value).split('+'));
  for(const code of [...new Set([...Object.keys(initial.languages),...(runtime.ocr?.languages||[]),...selected])]){
   const text=node('label'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=selected.has(code);checkbox.setAttribute('aria-label',code);
   checkbox.addEventListener('change',()=>changed(row,true));text.appendChild(checkbox);const caption=node('span');text.appendChild(caption);view.choices.push([code,checkbox,caption]);view.input.appendChild(text);
  }card.appendChild(view.input);
 }else{
  view.input=node(optionsFor(row)?'select':row.type==='array'?'textarea':'input');view.input.setAttribute('aria-label',label(row));view.input.setAttribute('data-setting',row.key);
  if(row.type==='boolean')view.input.type='checkbox';
  else if(row.type==='number'){view.input.type='number';view.input.min=row.minimum;view.input.max=row.maximum;view.input.step=row.key==='tvijo.agentBudgetUsd'?'0.01':'1';}
  else if(view.input.tagName==='INPUT')view.input.type='text';
  updateOptions(row,view);setInput(row,view);
  const immediate=row.type==='boolean'||!!optionsFor(row);
  if(immediate)view.input.addEventListener('change',()=>changed(row,true));
  else {view.input.addEventListener('input',()=>changed(row));if(row.key!=='tvijo.apiBase'){view.input.addEventListener('change',()=>send(row));view.input.addEventListener('blur',()=>{send(row);if(!edits.get(row.key).pending&&!edits.get(row.key).dirty)setInput(row,view);});}}
  card.appendChild(view.input);
  if(row.key==='tvijo.apiBase'){const confirm=node('button',L('Change server…','Сменить сервер…'),'secondary');confirm.addEventListener('click',()=>send(row));card.appendChild(confirm);}
 }
 view.detail=node('p','','state-note');card.appendChild(view.detail);
 view.feedback=node('p','','state-note');view.feedback.setAttribute('role','status');card.appendChild(view.feedback);
 const tools=node('details');tools.appendChild(node('summary',L('More options','Ещё')));view.meta=node('p','','meta');tools.appendChild(view.meta);
 const native=node('button',L('Edit in VS Code','Изменить в VS Code'),'secondary');native.addEventListener('click',()=>vscode.postMessage({type:'openSetting',key:row.key}));if(row.key!=='tvijo.telegram.ownerId')tools.appendChild(native);card.appendChild(tools);
 if(row.key==='tvijo.orchestration.enabled'){
  const actions=node('details');actions.appendChild(node('summary',L('Set up, inspect or manage host tasks','Настройка, проверка и задачи хоста')));
  for(const [id,en,ru] of [['orchestrationSetup','Set up host','Настроить хост'],['orchestrationDoctor','Check setup','Проверить настройку'],['orchestrationStatus','Task status','Статус задачи'],['orchestrationResume','Resume','Продолжить'],['orchestrationStop','Stop','Остановить'],['orchestrationRepair','Repair queue','Очередь исправлений'],['orchestrationOpenTmux','Open tmux','Открыть tmux'],['orchestrationHelp','Setup instructions','Инструкция по настройке']])action(id,L(en,ru),actions);
  card.appendChild(actions);
 }
 if(['tvijo.reasoningMethod','tvijo.agentMode','tvijo.pack','tvijo.service'].includes(row.key))action('knowledge',L('Examples and full instructions','Примеры и подробная инструкция'),card);
 if(row.key==='tvijo.pack')action('choosePack',L('Choose from server packs','Выбрать пакет сервера'),card);
 if(row.key==='tvijo.service'){view.serviceAction=node('button','','secondary');view.serviceAction.addEventListener('click',()=>vscode.postMessage({type:'guideAction',id:runtime.sharedProject?'chooseWorkflow':'chooseProject'}));card.appendChild(view.serviceAction);}
 if(['tvijo.orchestration.workerPolicy','tvijo.orchestration.agentCount','tvijo.orchestration.reportFormat'].includes(row.key))action('teamsHelp',L('Team roles and costs','Роли команды и расходы'),card);
 if(row.key==='tvijo.orchestration.enabled')action('recoveryHelp',L('How work survives a disconnect','Как сохраняется работа при обрыве связи'),card);
 if(row.key==='tvijo.orchestration.reportFormat')action('orchestrationReport',L('Open completed HTML report','Открыть готовый HTML-отчёт'),card);
 if(row.key==='tvijo.orchestration.workerPolicy')action('orchestrationDoctor',L('Check installed workers','Проверить установленных исполнителей'),card);
 if(row.key==='tvijo.workspaceContext')action('contextPreview',L('Preview project context','Просмотр контекста проекта'),card);
 if(row.key==='tvijo.telegram.enabled'){
  action('configureBot',L('Set up Telegram','Настроить Telegram'),card);view.bot=node('button','','secondary');view.bot.addEventListener('click',()=>vscode.postMessage({type:'guideAction',id:runtime.telegram?.running?'stopBot':'startBot'}));card.appendChild(view.bot);
 }
 (advanced.has(row.key)?$('advanced-cards'):$('cards')).appendChild(card);
 }
 updateViews();filter();
}
function updateView(row){
 const view=views.get(row.key),state=edits.get(row.key);if(!view)return;
 const harness=!!rows.find(r=>r.key==='tvijo.orchestration.enabled')?.value;
 const inactive=(row.key==='tvijo.service'&&!runtime.sharedProject)||(row.key.startsWith('tvijo.orchestration.')&&row.key!=='tvijo.orchestration.enabled'&&!harness)||(harness&&['tvijo.agentModel','tvijo.agentMaxSteps','tvijo.agentAutoRun','tvijo.agentAutoApply'].includes(row.key));
 view.card.setAttribute('data-inactive',String(inactive));view.note.textContent=inactive?L('Saved for this engine; currently inactive.','Сохранено для этого движка; сейчас не применяется.'):'';view.note.hidden=!inactive;
 view.meta.textContent=L('Saved: ','Сохранено: ')+format(row.value)+'\\n'+L('Default: ','По умолчанию: ')+format(row.default)+'\\n'+row.key;
 view.feedback.textContent=state.error||(row.key==='tvijo.apiBase'&&state.dirty?L('Choose Change server to review and confirm.','Нажмите «Сменить сервер», чтобы проверить и подтвердить адрес.'):(state.pending||state.dirty)?L('Saving…','Сохранение…'):'');
 if(row.key==='tvijo.ocrLanguages'){
  for(const [code,checkbox,caption] of view.choices){const unavailable=runtime.ocr?.available===true&&!runtime.ocr.languages.includes(code);checkbox.disabled=unavailable&&!checkbox.checked;caption.textContent=(initial.languages[code]?.[locale==='ru'?1:0]||code)+' · '+code+(unavailable?L(' (not installed)',' (не установлен)'):'');}
  view.detail.textContent=runtime.ocr?.available?L('Installed languages on this extension host.','Установленные языки на этом хосте расширения.'):L('Tesseract is unavailable on this host. Setup is manual.','Tesseract недоступен на этом хосте. Установка выполняется вручную.');
 }else if(row.key==='tvijo.telegram.enabled'){
  view.detail.textContent=runtime.telegram?.running?L('Running','Запущен'):runtime.telegram?.configured?L('Configured · stopped','Настроен · остановлен'):L('Set up owner and token first.','Сначала настройте владельца и токен.');
  view.bot.textContent=runtime.telegram?.running?L('Stop bot','Остановить бота'):L('Start bot','Запустить бота');
 }else if(row.key==='tvijo.orchestration.workerPolicy'){
  const probe=runtime.orchestration,policy=probe?.policies?.find(p=>p.id===row.value);
  view.detail.textContent=!probe?L('Host readiness has not been checked. Use Check installed workers.','Готовность хоста ещё не проверена. Нажмите «Проверить установленных исполнителей».'):policy?.available?L('Host setup detected. Subscription quota is checked again when the worker starts; this is not a quota guarantee.','Настройка хоста обнаружена. Квота подписки проверяется снова при запуске исполнителя; её наличие не гарантируется.'):L('Selected workers are unavailable on this host. Set them up or choose an available policy.','Выбранные исполнители недоступны на этом хосте. Настройте их или выберите доступный состав.');
 }else if(row.key==='tvijo.pack'||row.key==='tvijo.service'){
  if(row.key==='tvijo.service')view.serviceAction.textContent=runtime.sharedProject?L('Choose shared workflow','Выбрать общий процесс'):L('Choose a shared project first','Сначала выбрать общий проект');
  const items=optionsFor(row),item=items?.find(i=>i.id===row.value);
  view.detail.textContent=item?[localized(item.category),localized(item.summary||item.description)].filter(Boolean).join(' · '):L('Saved ID is not in the loaded catalog. It is preserved.','Сохранённого ID нет в загруженном каталоге. Он сохранён.');
  if(!runtime[row.key==='tvijo.pack'?'packs':'services']?.length)view.detail.textContent+=L(' No server catalog loaded; no extra request is made.',' Каталог сервера не загружен; дополнительный запрос не выполняется.');
 }
 // Never replace an active editor, including during debounce or an in-flight save.
 if(!state.pending&&!state.dirty){updateOptions(row,view);setInput(row,view);}
}
function updateViews(){for(const row of rows)updateView(row);const palette=rows.find(r=>r.key==='tvijo.colorTheme')?.value||'blue';document.body.setAttribute('data-palette',palette);for(const b of $('palettes').children)b.setAttribute('aria-pressed',String(b.getAttribute('data-palette-choice')===palette));status();}
function filter(){const query=$('search').value.trim().toLocaleLowerCase();let count=0;for(const row of rows){const view=views.get(row.key);view.card.hidden=!!query&&![row.key,label(row),row.help.en,row.help.ru,format(row.value)].join(' ').toLocaleLowerCase().includes(query);if(!view.card.hidden)count++;}if(query&&rows.some(row=>advanced.has(row.key)&&!views.get(row.key).card.hidden))$('advanced').open=true;$('count').textContent=count+' / '+rows.length;$('empty').hidden=count!==0;}
function render(){
 document.documentElement.lang=locale;$('title').textContent=L('Make Tvijo work for you','Настройте Tvijo для себя');$('settingsTitle').textContent=L('Start with chat and project settings','Начните с чата и проекта');$('language').textContent=locale==='ru'?'English':'Русский';$('search').placeholder=L('Find a setting','Найти настройку');$('search').setAttribute('aria-label',$('search').placeholder);$('native').textContent=L('VS Code settings','Настройки VS Code');$('advanced-title').textContent=L('Advanced · server and host details','Дополнительно · сервер и хост');$('empty').textContent=L('No matching settings','Настройки не найдены');
 $('intro-title').textContent=L('Help and connections','Справка и подключения');$('mapTitle').textContent=L('Where things run','Где что работает');$('map').replaceChildren();
 for(const text of [L('Ordinary chat uses the chat model and answer routing. Agent Auto edits and checks the project through its own controls. DSH Harness runs persistent tasks on the configured local or Remote SSH host.','Обычный чат использует модель и маршрут ответа. Agent Auto правит и проверяет проект через отдельные настройки. DSH Harness выполняет постоянные задачи на настроенном локальном или Remote SSH хосте.'),L('Host paths belong to the extension host disk. Opening a terminal does not set up DSH or install packages. Account credit, task ceilings and the Agent loop budget are separate limits.','Пути относятся к диску хоста расширения. Открытие терминала не настраивает DSH и не устанавливает пакеты. Баланс аккаунта, потолок задачи и бюджет цикла Agent — отдельные ограничения.')])$('map').appendChild(node('p',text));
 $('safety').textContent=L('Review project context before sending. OCR sends extracted text, not screenshot pixels. Settings save automatically; a server change still asks for confirmation.','Проверяйте контекст проекта перед отправкой. OCR передаёт распознанный текст, а не пиксели скриншота. Настройки сохраняются автоматически; смена сервера требует подтверждения.');
 $('actions').replaceChildren();
 for(const [name,list] of [[L('Learn','Справка'),[['knowledge','Examples and knowledge','Примеры и база знаний'],['resources','Resources','Материалы'],['configExample','Configuration example','Пример настроек'],['product','Tvijo','Tvijo'],['browser','Browser service','Сервис в браузере']]], [L('Account and shared projects','Аккаунт и общие проекты'),[['signIn','Sign in','Войти'],['chooseProject','Choose project','Выбрать проект'],['chooseThread','Choose thread','Выбрать тред'],['platform','Account in browser','Аккаунт в браузере'],['connections','Connections','Подключения'],['dataPrivacy','Data and privacy','Данные и конфиденциальность']]], [L('Project tools','Инструменты проекта'),[['terminal','Open project terminal','Открыть терминал проекта'],['configureAutoLint','Approve syntax checks','Разрешить проверку синтаксиса'],['disableAutoLint','Disable syntax checks','Отключить проверку синтаксиса']]]]){const group=node('details');group.appendChild(node('summary',name));for(const [id,en,ru]of list)action(id,L(en,ru),group);$('actions').appendChild(group);}
 $('palettes').replaceChildren();for(const [key,p]of Object.entries(initial.palettes)){const b=node('button','','palette-swatch');b.type='button';b.title=p[locale==='ru'?1:0];b.setAttribute('aria-label',b.title);b.setAttribute('data-palette-choice',key);b.addEventListener('click',()=>save('tvijo.colorTheme',key));$('palettes').appendChild(b);}
 buildCards();
}
$('language').addEventListener('click',()=>{
 // Language switching is explicit; keep drafts and pending state across its rebuild.
 const drafts=new Map(rows.filter(row=>edits.get(row.key).dirty||edits.get(row.key).pending).map(row=>[row.key,readInput(row,views.get(row.key))]));
 locale=locale==='ru'?'en':'ru';vscode.postMessage({type:'locale',value:locale});render();for(const [key,value]of drafts){const row=rows.find(r=>r.key===key),view=views.get(key),saved=row.value;row.value=value;setInput(row,view);row.value=saved;}
});
$('search').addEventListener('input',filter);$('native').addEventListener('click',()=>vscode.postMessage({type:'guideAction',id:'nativeSettings'}));
window.addEventListener('message',event=>{
 const message=event.data;
 if(message?.type==='settingsSaved'){
  const row=rows.find(r=>r.key===message.key),state=edits.get(message.key);if(!row||message.requestId!==state.requestId||!state.pending)return;
  state.pending=false;if(message.revision>=state.revision&&Object.hasOwn(message,'value')){row.value=publicValue(row.key,message.value);state.revision=message.revision;}
  // A failure reverts only that request; text typed after it remains a new draft.
  if(state.version===state.sentVersion){state.dirty=false;state.error=message.error||'';setInput(row,views.get(row.key));}
  lastRevision=Math.max(lastRevision,message.revision||0);updateViews();return;
 }
 if(message?.type!=='settingsValues'||!Number.isSafeInteger(message.revision)||message.revision<=lastRevision||!message.values||typeof message.values!=='object')return;
 lastRevision=message.revision;if(message.runtime)runtime=message.runtime;
 for(const row of rows){const state=edits.get(row.key);if(message.revision>=state.revision&&Object.hasOwn(message.values,row.key)){row.value=publicValue(row.key,message.values[row.key]);state.revision=message.revision;}}
 updateViews();
});
render();
</script></body></html>`;
}
module.exports = { settingsHtml, SETTINGS_HELP, GUIDE_ACTIONS };
