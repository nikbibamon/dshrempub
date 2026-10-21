'use strict';

const RESOURCES = Object.freeze([
  { group: 'Learn / Knowledge base', groupRu: 'Обучение / База знаний', label: 'Learn', labelRu: 'Обучение', url: 'https://tvijo.com/en/learn' },
  { group: 'Learn / Knowledge base', groupRu: 'Обучение / База знаний', label: 'Knowledge base', labelRu: 'База знаний', url: 'https://tvijo.com/en/kb' },
  { group: 'Learn / Knowledge base', groupRu: 'Обучение / База знаний', label: 'Agent skills: Axes', labelRu: 'Навыки агента: Axes', url: 'https://tvijo.com/en/agent-skills/axes' },
  { group: 'Policies', groupRu: 'Правила', label: 'Privacy', labelRu: 'Конфиденциальность', url: 'https://tvijo.com/en/privacy' },
  { group: 'Policies', groupRu: 'Правила', label: 'Terms', labelRu: 'Условия', url: 'https://tvijo.com/en/terms' },
  { group: 'Version', groupRu: 'Версия', label: 'Changelog', labelRu: 'Журнал изменений', url: 'https://tvijo.com/en/changelog' }
]);

function choices(locale = 'en') {
  return RESOURCES.map(item => ({
    label: (locale === 'ru' ? item.labelRu : item.label),
    description: locale === 'ru' ? item.groupRu : item.group,
    url: item.url
  }));
}

module.exports = { RESOURCES, choices };
