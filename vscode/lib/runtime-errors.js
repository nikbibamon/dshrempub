'use strict';

// Only fixed host diagnostics enter the webview; subprocess stderr stays private.
const COPY = Object.freeze({
  orchestration_setup: [
    'DSH Harness is not set up on this project host. Run Tvijo: Orchestration doctor, or turn off DSH Harness in settings to use only the selected Agent model (ds41f by default).',
    'DSH Harness не настроен на хосте проекта. Запустите Tvijo: Orchestration doctor или выключите DSH Harness в настройках для работы только выбранной модели агента (по умолчанию ds41f).'
  ],
  orchestration_runtime: [
    'The orchestration controller is unavailable, refused the request or returned an invalid response. Run Tvijo: Orchestration doctor. A previously submitted task may still exist; inspect its status before retrying.',
    'Контроллер оркестрации недоступен, отклонил запрос или вернул неверный ответ. Запустите Tvijo: Orchestration doctor. Ранее отправленная задача могла сохраниться; проверьте её статус перед повтором.'
  ],
  orchestration_team_options: [
    'This host runtime does not support the selected team options, or a selected subscription worker is unavailable. Run Tvijo: Orchestration doctor and choose a supported team. For ds41f alone, turn off DSH Harness. No worker or paid route was substituted.',
    'Хост не поддерживает выбранные настройки команды либо выбранный исполнитель по подписке недоступен. Запустите Tvijo: Orchestration doctor и выберите поддерживаемую команду. Для одного ds41f выключите DSH Harness. Исполнитель и платный маршрут не подменялись.'
  ],
  orchestration_preferences: [
    'DSH team settings are invalid. Team roles must be an integer from 3 to 6 (at least 4 for Sol + Astra + Claude). For one Agent model, turn off DSH Harness; the team role count does not control single-model mode.',
    'Некорректные настройки команды DSH. Число ролей — целое от 3 до 6 (минимум 4 для Sol + Astra + Claude). Для одной модели агента выключите DSH Harness; число ролей команды не управляет режимом одной модели.'
  ],
  orchestration_pending: [
    'This project has a durable orchestration task. Use Tvijo: Orchestration status, Resume or Stop before submitting another task. Its saved work and original limits are preserved.',
    'У проекта есть сохранённая задача оркестрации. Перед новой задачей используйте Tvijo: Orchestration status, Resume или Stop. Её работа и исходные лимиты сохранены.'
  ]
});

function notice(code, locale = 'en') {
  return Object.hasOwn(COPY, code) ? COPY[code][locale === 'ru' ? 1 : 0] : null;
}
function failure(code, message) {
  if (!Object.hasOwn(COPY, code)) throw new TypeError('Unknown runtime diagnostic.');
  const error = new Error(message || COPY[code][0]);
  error.code = code;
  return error;
}
module.exports = {notice, failure};
