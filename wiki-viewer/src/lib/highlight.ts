/**
 * 零依赖代码高亮：单条组合正则扫描，输出 <span class="tok-*"> 标记。
 * 覆盖 js/ts/json、python、shell/powershell、yaml 常见词法；其余语言仅做字符串/注释兜底。
 */

const FAMILY: Record<string, string> = {
  js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', json: 'js', jsonc: 'js', json5: 'js',
  py: 'py', python: 'py',
  sh: 'sh', bash: 'sh', zsh: 'sh', shell: 'sh', dockerfile: 'sh', hcl: 'sh', ini: 'sh', toml: 'sh',
  ps: 'ps', powershell: 'ps', ps1: 'ps',
  yml: 'yml', yaml: 'yml',
}

const KEYWORDS: Record<string, string> = {
  js: 'const let var function return if else for while class new import export from default async await try catch throw typeof instanceof null undefined true false this super yield switch case break continue do in of extends static delete void',
  py: 'def class import from return if elif else for while try except finally raise with as lambda None True False self in is not and or pass break continue global nonlocal async await yield del assert',
  sh: 'if then fi else elif for while do done case esac function echo exit return export local unset set source sudo cd npm npx node git curl',
  ps: 'if else elseif foreach for while do function param begin end try catch finally return Write-Host',
  yml: 'true false null yes no on off',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function tokenClass(t: string, kw: Set<string>): string | null {
  if (t.startsWith('/*') || t.startsWith('//') || t.startsWith('#')) return 'tok-c'
  if (/^["'`]/.test(t)) return 'tok-s'
  if (/^\d/.test(t)) return 'tok-n'
  if (kw.has(t)) return 'tok-k'
  return null
}

export function highlightText(src: string, langRaw: string): string {
  const fam = FAMILY[langRaw.toLowerCase()] ?? ''
  const kw = new Set((KEYWORDS[fam] ?? '').split(' ').filter(Boolean))

  const alts: string[] = ['\\/\\*[\\s\\S]*?\\*\\/'] // 块注释 /* … */（通用，无害）
  if (fam === 'js' || fam === '' || fam === 'ps') alts.push('\\/\\/[^\\n]*')
  if (fam !== 'js') alts.push('#[^\\n]*') // py/sh/yml/ini 等；未知语言也尝试 # 注释
  alts.push('"(?:[^"\\\\\\n]|\\\\.)*"', "'(?:[^'\\\\\\n]|\\\\.)*'", '`(?:[^`\\\\]|\\\\.)*`')
  alts.push('[A-Za-z_$][\\w$-]*', '\\b\\d[\\w.]*\\b')

  const re = new RegExp(alts.join('|'), 'g')
  let out = ''
  let last = 0
  for (const m of src.matchAll(re)) {
    const i = m.index!
    out += esc(src.slice(last, i))
    const cls = tokenClass(m[0], kw)
    out += cls ? `<span class="${cls}">${esc(m[0])}</span>` : esc(m[0])
    last = i + m[0].length
  }
  return out + esc(src.slice(last))
}

/** 处理容器内所有 <pre><code> 块；幂等（dataset.hl 防重复） */
export function highlightBlocks(root: HTMLElement) {
  for (const code of Array.from(root.querySelectorAll<HTMLElement>('pre code'))) {
    if (code.dataset.hl) continue
    code.dataset.hl = '1'
    const lang = Array.from(code.classList).find((c) => c.startsWith('language-'))?.slice(9) ?? ''
    code.innerHTML = highlightText(code.textContent ?? '', lang)
  }
}
