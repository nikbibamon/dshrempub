'use strict';
const NOTICES=Object.freeze({
 scope_uri:{en:'Choose a local folder: use the folder chip below the input or Explorer → Work in Tvijo.',ru:'Выберите локальную папку: чип под вводом или Explorer → Work in Tvijo.',action:'chooseFolder'},
 scope_system:{en:'Choose a project folder through the folder chip below the input.',ru:'Выберите папку проекта через чип под вводом.',action:'chooseFolder'},
 scope_missing:{en:'This folder moved or is unavailable. Choose it again through the folder chip.',ru:'Папка перемещена или недоступна. Выберите её снова через чип под вводом.',action:'chooseFolder'},
 scope_directory:{en:'Select a directory in Explorer, then Work in Tvijo.',ru:'Выберите каталог в Explorer, затем Work in Tvijo.',action:'chooseFolder'},
 scope_outside:{en:'This folder points outside its open workspace. Add it as a workspace folder to work there.',ru:'Папка ссылается за пределы открытой рабочей области. Добавьте её как папку рабочей области.',action:'addWorkspaceFolder'},
 scope_owner:{en:'The owning workspace changed. Choose the folder again through the folder chip.',ru:'Рабочая область изменилась. Выберите папку снова через чип под вводом.',action:'chooseFolder'},
 no_workspace:{en:'Open a folder in VS Code, then choose it with the folder chip below the input.',ru:'Откройте папку в VS Code и выберите её через чип под вводом.',action:'chooseFolder'}
});
function scopeError(code,uri){return Object.assign(new Error(code),{code,scopeUri:uri});}
function notice(code,locale='en'){const n=NOTICES[code];return n?{text:n[locale==='ru'?'ru':'en'],action:n.action}:null;}
module.exports={NOTICES,notice,scopeError};
