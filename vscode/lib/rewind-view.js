'use strict';

// Display metadata only. Snapshot bytes never enter the webview.
function renderRewind(document, container, runs, locale, select, restore, chosen) {
  container.replaceChildren();
  const ru = locale === 'ru';
  const add = (tag, text, parent = container) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
  if (!runs.length) { add('p', ru ? 'Пока нет точек восстановления. Они появятся после правок Tvijo.' : 'No checkpoints yet. They appear after Tvijo edits a file.'); return; }
  const run = runs.find(item => item.id === chosen);
  if (!run) {
    add('p', ru ? 'Недавние запуски' : 'Recent runs');
    for (const item of runs) {
      const button = add('button', item.title); button.type = 'button'; button.className = 'rewind-run';
      add('small', new Date(item.time).toLocaleString(ru ? 'ru' : 'en') + ' · ' + item.steps.length + (ru ? ' шаг(а)' : ' steps'), button);
      button.addEventListener('click', () => select(item.id));
    }
    return;
  }
  const back = add('button', ru ? '← Все запуски' : '← All runs'); back.type = 'button'; back.addEventListener('click', () => select(null));
  add('h3', run.title);
  add('p', ru ? 'Восстановить файлы перед выбранным шагом. Последующие шаги этого запуска тоже отменятся.' : 'Restore files to before a step. Later steps in this run are undone too.');
  for (const step of run.steps) {
    const card = add('article', ''); card.className = 'rewind-step';
    add('strong', (ru ? 'Шаг ' : 'Step ') + step.step, card);
    add('small', new Date(step.time).toLocaleString(ru ? 'ru' : 'en') + ' · ' + step.model, card);
    add('p', step.files.join('\n'), card).className = 'rewind-files';
    const button = add('button', ru ? 'Восстановить до шага ' + step.step : 'Rewind to before step ' + step.step, card); button.type = 'button';
    button.addEventListener('click', () => restore(run.id, step.step));
  }
}
const REWIND_CSS = `
#rewind{flex:1;min-height:100px;overflow:auto;padding:12px;min-width:0}#rewind-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}#rewind h2{font-size:14px;margin:0}#rewind p,#rewind small{font-size:11px;color:var(--muted)}#rewind small{display:block;margin-top:5px}#rewind-list button{white-space:normal;overflow-wrap:anywhere;text-align:left}.rewind-run{display:block;width:100%;margin:8px 0;padding:10px;border:1px solid var(--border)}.rewind-step{border:1px solid var(--border);border-radius:7px;margin:10px 0;padding:12px;overflow-wrap:anywhere}.rewind-files{white-space:pre-wrap}#rewind-hint{line-height:1.5}#rewind-status{white-space:pre-wrap}#actions-menu{position:absolute;z-index:20;right:12px;top:58px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);box-shadow:0 4px 20px #0004}#actions-menu button{display:block;width:100%;text-align:left;padding:8px}
`;
module.exports = { renderRewind, REWIND_CSS };
