// diff.mjs — 零依赖行级 unified diff（LCS），用于暂存区审核门展示
// 文件规模小（wiki 页数百行内），O(n*m) 动态规划可接受

/**
 * 生成 unified diff 文本（context 行默认 3）
 * @param {string} oldStr 原内容（新文件传 ''）
 * @param {string} newStr 新内容
 * @param {string} oldLabel a/ 路径标签
 * @param {string} newLabel b/ 路径标签
 * @returns {string} 无差异时返回 ''
 */
export function unifiedDiff(oldStr, newStr, oldLabel, newLabel, context = 3) {
  const a = oldStr.split('\n')
  const b = newStr.split('\n')
  if (oldStr === newStr) return ''

  // LCS 动态规划
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  // 回溯生成操作序列：' ' 上下文 / '-' 删除 / '+' 新增
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', line: a[i], ai: i, bj: j })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: '-', line: a[i], ai: i })
      i++
    } else {
      ops.push({ t: '+', line: b[j], bj: j })
      j++
    }
  }
  while (i < n) ops.push({ t: '-', line: a[i], ai: i++ })
  while (j < m) ops.push({ t: '+', line: b[j], bj: j++ })

  // 按 context 分组 hunk（相邻变更点间距 ≤ 2*context+1 时合并）
  const changed = ops.map((o, idx) => ({ o, idx })).filter(({ o }) => o.t !== ' ')
  if (!changed.length) return ''
  const hunks = []
  let cur = null
  for (const { idx } of changed) {
    const start = Math.max(0, idx - context)
    const end = Math.min(ops.length - 1, idx + context)
    if (cur && start <= cur.end + 1) cur.end = Math.max(cur.end, end)
    else {
      cur = { start, end }
      hunks.push(cur)
    }
  }

  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`]
  for (const h of hunks) {
    const slice = ops.slice(h.start, h.end + 1)
    const oldStart = (slice.find((o) => o.t !== '+')?.ai ?? n) + 1
    const newStart = (slice.find((o) => o.t !== '-')?.bj ?? m) + 1
    const oldCount = slice.filter((o) => o.t !== '+').length
    const newCount = slice.filter((o) => o.t !== '-').length
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)
    for (const o of slice) out.push(`${o.t}${o.line}`)
  }
  return out.join('\n') + '\n'
}
