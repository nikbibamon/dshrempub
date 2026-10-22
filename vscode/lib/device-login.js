'use strict';
const { ServiceError } = require('./client');

// A Copy action closes a native VS Code notification. Reopen the same challenge,
// rather than making the user start a second authorization request.
async function approveDevice(vscode, device, { check = () => {}, L = en => en } = {}) {
  const approval = new URL(device.verification_uri);
  approval.searchParams.set('code', device.user_code);
  const open = L('Open browser', 'Открыть браузер');
  const copy = L('Copy code', 'Скопировать код');
  for (;;) {
    check();
    const pick = await vscode.window.showInformationMessage(`Tvijo: ${device.user_code}`, {
      modal: true,
      detail: L('Open the browser to approve sign-in. The code is already filled in. Copy code keeps this sign-in window available.', 'Откройте браузер и подтвердите вход: код уже подставлен. После копирования кода окно входа останется доступным.')
    }, open, copy);
    check();
    if (pick === copy) { await vscode.env.clipboard.writeText(device.user_code); continue; }
    if (pick !== open) throw new ServiceError('interrupted', L('Sign-in cancelled.', 'Вход отменён.'));
    const opened = await vscode.env.openExternal(vscode.Uri.parse(approval.toString()));
    check();
    if (opened === false) throw new ServiceError('browser_unavailable', L('The approval page could not be opened. Check your browser and try sign-in again.', 'Не удалось открыть страницу подтверждения. Проверьте браузер и повторите вход.'));
    return;
  }
}
module.exports = { approveDevice };
