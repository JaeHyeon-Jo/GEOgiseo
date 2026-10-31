// `cap copy`는 packageClassList를 npm 플러그인만으로 매번 덮어쓴다.
// iOS 프로젝트에 직접 추가한 로컬 Swift 플러그인은 항상 사라지므로,
// copy 직후 이 스크립트로 다시 채워 넣는다. (idempotent)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = resolve(__dirname, '../ios/App/App/capacitor.config.json');

// 로컬(비-npm) Swift 플러그인 클래스명 — @objc(...) 이름과 일치해야 한다.
const LOCAL_PLUGINS = ['VaultAccessPlugin', 'NativeMapPlugin', 'WatchBridgePlugin'];

const cfg = JSON.parse(readFileSync(CONFIG, 'utf-8'));
const list = Array.isArray(cfg.packageClassList) ? cfg.packageClassList : [];
let added = 0;
for (const name of LOCAL_PLUGINS) {
  if (!list.includes(name)) { list.push(name); added += 1; }
}
cfg.packageClassList = list;
writeFileSync(CONFIG, JSON.stringify(cfg, null, '\t') + '\n');
console.log(`patch-ios-plugins: packageClassList → [${list.join(', ')}]${added ? ` (+${added})` : ' (변경 없음)'}`);
