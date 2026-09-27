// inbox.mjs — raw/ 收件箱：本地文件上传写入 + URL 抓取转 Markdown
// 与审核门无关：raw/ 是用户输入区（不可变原始资料），由 server 直接落盘，不经 LLM/diff。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import TurndownService from 'turndown'

/* ————— 通用工具 ————— */

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'])

/** 清洗文件名：去掉路径分隔符与危险字符，保留扩展名 */
function sanitizeFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop() || 'untitled'
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim()
  return cleaned || 'untitled'
}

/** 标题 → kebab-case slug（保留中文，去标点，长度封顶） */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'clipped'
}

/** 避免覆盖：file.md → file-1.md → file-2.md … */
function uniquePath(dir, fileName) {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  let candidate = join(dir, fileName)
  let n = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem}-${n++}${ext}`)
  }
  return candidate
}

/* ————— 本地文件上传 ————— */

/**
 * 把 base64 文件写入 vault 的 raw/（图片写 raw/assets/）。
 * @param {string} vaultPath vault 根绝对路径
 * @param {{name:string, contentBase64:string}[]} files
 * @returns {{written: {path:string, bytes:number}[]}}
 */
export function saveUploadedFiles(vaultPath, files) {
  const rawDir = join(vaultPath, 'raw')
  const assetsDir = join(rawDir, 'assets')
  mkdirSync(rawDir, { recursive: true })
  const written = []
  for (const f of files) {
    const name = sanitizeFileName(f.name)
    const buf = Buffer.from(String(f.contentBase64 || ''), 'base64')
    const isImage = IMAGE_EXT.has(extname(name).toLowerCase())
    const destDir = isImage ? assetsDir : rawDir
    mkdirSync(destDir, { recursive: true })
    const dest = uniquePath(destDir, name)
    writeFileSync(dest, buf)
    written.push({ path: dest.replace(/\\/g, '/').slice(vaultPath.length + 1), bytes: buf.length })
  }
  return { written }
}

/* ————— URL 抓取剪藏 ————— */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  })
  // 丢弃 script/style/nav/footer 等噪声节点
  td.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header', 'aside', 'form', 'button'])
  return td
}

/** 从 HTML 提取标题：<title> / og:title / 首个 <h1> */
function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  if (og) return decodeEntities(og[1]).trim()
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (t && t[1].trim()) return decodeEntities(t[1].replace(/\s+/g, ' ')).trim()
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).trim()
  return ''
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** 从 HTML 提取正文容器：<article> / <main> / role=main，回退到 <body> */
function extractMainHtml(html) {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (article && article[1].trim().length > 200) return article[1]
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  if (main && main[1].trim().length > 200) return main[1]
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return body ? body[1] : html
}

/**
 * 抓取 URL，转 Markdown，写入 vault 的 raw/<slug>.md（带来源 frontmatter）。
 * @param {string} vaultPath vault 根绝对路径
 * @param {string} url 目标网址
 * @returns {Promise<{path:string, title:string, bytes:number}>}
 */
export async function clipUrl(vaultPath, url) {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) throw new Error(`仅支持 http(s) 网址：${target}`)

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 30000)
  let html
  try {
    const res = await fetch(target, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    })
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`)
    html = await res.text()
  } finally {
    clearTimeout(timer)
  }

  const title = extractTitle(html) || new URL(target).hostname
  const mainHtml = extractMainHtml(html)
  let markdown = makeTurndown().turndown(mainHtml).replace(/\n{3,}/g, '\n\n').trim()
  if (!markdown) throw new Error('正文为空（可能是需要 JS 渲染的页面或被反爬拦截）')

  // 去掉正文开头的 H1（与下面注入的标题重复）
  markdown = markdown.replace(/^#\s+[^\n]*\n+/, '').trim()

  const today = new Date().toISOString().slice(0, 10)
  const safeTitle = title.replace(/["\n]/g, "'").slice(0, 120)
  const doc = `---
source: ${target}
title: "${safeTitle}"
clipped: ${today}
tags: [clipped]
---

# ${title}

> 来源：${target}
> 剪藏时间：${today}

${markdown}
`

  const rawDir = join(vaultPath, 'raw')
  mkdirSync(rawDir, { recursive: true })
  const dest = uniquePath(rawDir, `${slugify(title)}.md`)
  writeFileSync(dest, doc, 'utf8')
  return {
    path: dest.replace(/\\/g, '/').slice(vaultPath.length + 1),
    title,
    bytes: Buffer.byteLength(doc, 'utf8'),
  }
}
