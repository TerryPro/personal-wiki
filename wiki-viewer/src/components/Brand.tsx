/** 顶/侧栏品牌区：两种模式左栏共用（logo + 标题 + 副标题） */
export default function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-[13px]">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="6" r="2.6" fill="hsl(42 52% 62%)" />
        <circle cx="5.5" cy="18" r="2.2" fill="hsl(202 48% 60%)" />
        <circle cx="20.5" cy="18" r="2.2" fill="hsl(272 34% 64%)" />
        <circle cx="13" cy="13.5" r="1.7" fill="hsl(28 62% 58%)" />
        <path d="M13 6 5.5 18M13 6l7.5 12M5.5 18h15M13 13.5 13 6M13 13.5 5.5 18M13 13.5l7.5 4.5" stroke="hsl(160 10% 42%)" strokeWidth="0.9" opacity="0.65" />
      </svg>
      <div className="min-w-0 leading-tight">
        <div className="text-[14px] font-semibold tracking-tight text-fg">LLM Wiki</div>
        <div className="truncate text-[11px] text-fg-muted">second-brain 知识库</div>
      </div>
    </div>
  )
}
