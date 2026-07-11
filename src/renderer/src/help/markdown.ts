/**
 * Minimal safe markdown → HTML for Help topics.
 * Supports: headings, paragraphs, lists, bold/italic, inline code, fenced code, links, tables-lite (pipes), hr.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text)
  // links [text](url) — only http(s) and relative #
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g,
    '<a href="$2" class="text-primary underline-offset-2 hover:underline" rel="noreferrer">$1</a>'
  )
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  return s
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let inCode = false
  let codeBuf: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = (): void => {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>')
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre class="overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        )
        codeBuf = []
        inCode = false
      } else {
        closeList()
        inCode = true
      }
      i++
      continue
    }

    if (inCode) {
      codeBuf.push(line)
      i++
      continue
    }

    if (/^---+$/.test(line.trim())) {
      closeList()
      out.push('<hr class="my-4 border-border/70" />')
      i++
      continue
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    if (h) {
      closeList()
      const level = h[1].length
      const cls =
        level === 1
          ? 'text-xl font-semibold tracking-tight text-foreground'
          : level === 2
            ? 'mt-6 text-base font-semibold text-foreground'
            : 'mt-4 text-sm font-semibold text-foreground'
      out.push(`<h${level} class="${cls}">${inlineFormat(h[2])}</h${level}>`)
      i++
      continue
    }

    const ul = /^[-*]\s+(.+)$/.exec(line)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul class="my-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">')
        listType = 'ul'
      }
      out.push(`<li class="leading-6 text-foreground/90">${inlineFormat(ul[1])}</li>`)
      i++
      continue
    }

    const ol = /^(\d+)\.\s+(.+)$/.exec(line)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol class="my-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">')
        listType = 'ol'
      }
      out.push(`<li class="leading-6 text-foreground/90">${inlineFormat(ol[2])}</li>`)
      i++
      continue
    }

    // table row (simple)
    if (line.includes('|') && line.trim().startsWith('|')) {
      closeList()
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i].trim()
        if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(row)) {
          i++
          continue // separator
        }
        const cells = row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
        rows.push(cells)
        i++
      }
      if (rows.length) {
        out.push('<div class="my-3 overflow-x-auto"><table class="w-full text-left text-sm">')
        rows.forEach((cells, ri) => {
          const tag = ri === 0 ? 'th' : 'td'
          const cellClass =
            ri === 0
              ? 'border-b border-border/70 px-2 py-1.5 font-medium text-foreground'
              : 'border-b border-border/40 px-2 py-1.5 text-muted-foreground'
          out.push(
            `<tr>${cells.map((c) => `<${tag} class="${cellClass}">${inlineFormat(c)}</${tag}>`).join('')}</tr>`
          )
        })
        out.push('</table></div>')
      }
      continue
    }

    if (!line.trim()) {
      closeList()
      i++
      continue
    }

    closeList()
    out.push(`<p class="my-2 text-sm leading-6 text-muted-foreground">${inlineFormat(line)}</p>`)
    i++
  }

  closeList()
  if (inCode && codeBuf.length) {
    out.push(
      `<pre class="overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
    )
  }

  return out.join('\n')
}
