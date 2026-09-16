import type { Lang } from './pt';

/**
 * packages/core is UI-agnostic by design (see README) but predates i18n, so it
 * still throws fixed Portuguese strings — refactoring every call site to an
 * error-code contract just for this would be a much bigger, riskier change
 * than the app actually needs. Instead, the renderer pattern-matches the
 * known, finite set of core/provider error messages at the presentation
 * boundary. Anything unrecognized (a raw megajs/googleapis error, for
 * instance) is left exactly as-is rather than guessed at.
 */
type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [/^Já existe uma conta com o apelido "(.+)" — escolha outro nome\.$/, (m) => `An account with the nickname "${m[1]}" already exists — choose another name.`],
  [/^Esta conta ainda guarda (\d+) arquivo\(s\)\. Exclua os arquivos antes de remover a conta\.$/, (m) => `This account still holds ${m[1]} file(s). Delete the files before removing the account.`],
  [/^Conta não encontrada: (.+)$/, (m) => `Account not found: ${m[1]}`],
  [/^Conta não encontrada$/, () => 'Account not found'],
  [/^Item não encontrado$/, () => 'Item not found'],
  [/^não é um arquivo$/, () => 'not a file'],
  [/^Item não é um arquivo$/, () => 'Item is not a file'],
  [/^Aguarde o upload terminar$/, () => 'Wait for the upload to finish'],
  [/^Arquivo não está mais na nuvem — reconcilie a conta$/, () => 'File is no longer in the cloud — reconcile the account'],
  [/^Arquivo sem partes — metadados corrompidos$/, () => 'File has no parts — corrupted metadata'],
  [/^Download terminou mas o arquivo não está no cache$/, () => 'Download finished but the file is not in the cache'],
  [/^Transferência desapareceu$/, () => 'Transfer disappeared'],
  [/^Transferência falhou$/, () => 'Transfer failed'],
  [/^Transferência cancelada$/, () => 'Transfer canceled'],
  [/^Conta precisa ser reconectada — veja o painel de contas$/, () => 'Account needs to be reconnected — see the accounts panel'],
  [/^Transferência excedeu o tempo limite$/, () => 'Transfer timed out'],
  [/^waitForIdle: (\d+) jobs pendentes$/, (m) => `waitForIdle: ${m[1]} jobs pending`],
  [/^Parte sem referência remota — arquivo ainda subindo\?$/, () => 'Part has no remote reference — file still uploading?'],
  [/^Integridade falhou: hash (.+) ≠ esperado (.+)$/, (m) => `Integrity check failed: hash ${m[1]} ≠ expected ${m[2]}`],
  [/^Google Drive requer OAuth \(client ID\/secret\)$/, () => 'Google Drive requires OAuth (client ID/secret)'],
  [/^Google não retornou refresh_token — remova o acesso do app em myaccount\.google\.com\/permissions e tente de novo$/, () => 'Google did not return a refresh_token — remove the app’s access at myaccount.google.com/permissions and try again'],
  [/^token sem o escopo necessário — reautorize a conta$/, () => 'token missing the required scope — reauthorize the account'],
  [/^O Mega limitou temporariamente os logins deste IP \(muitas tentativas seguidas\)\. Aguarde alguns minutos e tente de novo\.$/, () => 'Mega has temporarily rate-limited logins from this IP (too many attempts in a row). Wait a few minutes and try again.'],
  [/^Mega: objeto não encontrado: (.+)$/, (m) => `Mega: object not found: ${m[1]}`],
  [/^Mega requer e-mail e senha$/, () => 'Mega requires an e-mail and password'],
  [/^Provider desconhecido: (.+)$/, (m) => `Unknown provider: ${m[1]}`],
  [/^OAuth negado: sem código na resposta$/, () => 'OAuth denied: no code in the response'],
  [/^OAuth negado: (.+)$/, (m) => `OAuth denied: ${m[1]}`],
  [/^Acesso inválido ou expirado para "(.+?)"(?: — (.+))?$/, (m) => `Invalid or expired access for "${m[1]}"${m[2] ? ` — ${translateOne(m[2])}` : ''}`],
];

function translateOne(message: string): string {
  for (const [re, fn] of RULES) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}

/** `uploadFiles` joins one failure per file as `"<filename>: <reason>"` lines. */
function translateLine(line: string): string {
  const direct = translateOne(line);
  if (direct !== line) return direct;
  const sep = line.indexOf(': ');
  if (sep === -1) return line;
  const prefix = line.slice(0, sep);
  const rest = line.slice(sep + 2);
  const translatedRest = translateOne(rest);
  return translatedRest === rest ? line : `${prefix}: ${translatedRest}`;
}

export function translateCoreError(message: string, lang: Lang): string {
  if (lang === 'pt') return message;
  return message.split('\n').map(translateLine).join('\n');
}
