'use strict';

const LOCALE = 'tvijo.organizationSetupLocale';
const OFFERED = 'tvijo.organizationSetupOffered';
const COMMAND = 'tvijo.organizationSetup';
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'uk', label: 'Українська' },
];
const COPY = {
  en: { language: 'Choose the setup language', start: 'Set up organization access', offer: 'Connect Tvijo to your company workspace.',
    organization: 'Choose an organization', project: 'Choose a project', check: 'Check connection',
    noAccess: 'Ask your organization administrator for an invitation, or check whether your access was revoked.',
    noProjects: 'No projects are available in this organization.', unavailable: 'Organization setup is unavailable on this gateway.',
    failed: 'Could not verify the connection. Check the service address and your sign-in.', changed: 'The signed-in account changed. Start setup again.',
    connected: 'Connected to DSHREM', progress: 'Approve sign-in in your browser', signedIn: 'Signed in. VS Code stores the session securely.',
    admin: 'Administrator', member: 'Member' },
  ru: { language: 'Выберите язык настройки', start: 'Настроить доступ к организации', offer: 'Подключите Tvijo к рабочему пространству компании.',
    organization: 'Выберите организацию', project: 'Выберите проект', check: 'Проверить подключение',
    noAccess: 'Запросите приглашение у администратора организации или уточните, действует ли ваш доступ.',
    noProjects: 'В этой организации нет доступных проектов.', unavailable: 'На этом шлюзе настройка организации недоступна.',
    failed: 'Не удалось проверить подключение. Проверьте адрес сервиса и вход.', changed: 'Аккаунт изменился. Начните настройку заново.',
    connected: 'Подключение к DSHREM проверено', progress: 'Подтвердите вход в браузере', signedIn: 'Вход выполнен. Сессия хранится в защищённом хранилище VS Code.',
    admin: 'Администратор', member: 'Участник' },
  uk: { language: 'Виберіть мову налаштування', start: 'Налаштувати доступ до організації', offer: 'Підключіть Tvijo до робочого простору компанії.',
    organization: 'Виберіть організацію', project: 'Виберіть проєкт', check: 'Перевірити підключення',
    noAccess: 'Попросіть адміністратора організації надіслати запрошення або перевірити, чи діє ваш доступ.',
    noProjects: 'У цій організації немає доступних проєктів.', unavailable: 'На цьому шлюзі налаштування організації недоступне.',
    failed: 'Не вдалося перевірити підключення. Перевірте адресу сервісу та вхід.', changed: 'Обліковий запис змінився. Почніть налаштування знову.',
    connected: 'Підключення до DSHREM перевірено', progress: 'Підтвердьте вхід у браузері', signedIn: 'Вхід виконано. Сеанс збережено в захищеному сховищі VS Code.',
    admin: 'Адміністратор', member: 'Учасник' },
};

function locale(value) {
  const language = typeof value === 'string' ? value.toLowerCase().split('-')[0] : '';
  return Object.hasOwn(COPY, language) ? language : 'en';
}

function options(rows, text, roles = false) {
  if (!Array.isArray(rows)) throw new TypeError('Expected a list of projects or organizations');
  return rows.map(row => {
    if (typeof row?.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id)
        || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200) {
      throw new TypeError('Invalid project or organization');
    }
    const role = row.role === 'admin' || row.role === 'member' ? text[row.role] : undefined;
    return { id: row.id, label: row.name, ...(roles && role && { description: role }) };
  });
}

async function run({ window, globalState, language, readSession, signIn, createClient, stillCurrent }) {
  const preferred = locale(globalState.get(LOCALE) || language);
  const languages = [...LANGUAGES].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
  const selection = await window.showQuickPick(languages, { placeHolder: COPY[preferred].language });
  if (!selection) return;
  const lang = selection.id;
  await globalState.update(LOCALE, lang);
  const text = COPY[lang];
  let stage = 'sign-in';
  try {
    if (!await readSession()) await signIn(lang);
    const session = await readSession();
    if (!session) return;
    const api = createClient({ base: session.api_base });
    const request = async path => {
      if (!await stillCurrent(session)) throw Object.assign(new Error(), { code: 'account_changed' });
      const result = await api.request(path, { token: session.access_token, timeoutMs: 8000 });
      if (!await stillCurrent(session)) throw Object.assign(new Error(), { code: 'account_changed' });
      return result;
    };
    stage = 'organizations';
    const organizations = options((await request('/organizations')).organizations, text, true);
    if (!organizations.length) return window.showWarningMessage(text.noAccess);
    const organization = await window.showQuickPick(organizations, { placeHolder: text.organization });
    if (!organization) return;

    stage = 'project';
    const path = '/organizations/' + encodeURIComponent(organization.id);
    const index = await request(path + '/projects');
    if (index?.organization?.id !== organization.id) throw new Error('Wrong organization');
    const projects = options(index.projects, text);
    if (!projects.length) return window.showWarningMessage(text.noProjects);
    const project = await window.showQuickPick(projects, { placeHolder: text.project });
    if (!project) return;
    const scope = `${organization.label} · ${project.label}`;
    if (await window.showInformationMessage(scope, text.check) !== text.check) return;

    stage = 'connection';
    const result = await request(path + '/connection?project_id=' + encodeURIComponent(project.id));
    if (result?.connected !== true || result.organization?.id !== organization.id || result.project?.id !== project.id) {
      throw new Error('Unverified connection');
    }
    await window.showInformationMessage(`${text.connected} · ${scope}`);
  } catch (error) {
    if (error?.code === 'interrupted') return;
    const message = error?.code === 'account_changed' ? text.changed : error?.status === 404
      ? (stage === 'organizations' ? text.unavailable : text.noAccess) : text.failed;
    await window.showWarningMessage(message);
  }
}

module.exports = { COMMAND, COPY, LOCALE, OFFERED, locale, run };
