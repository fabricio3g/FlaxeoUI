/**
 * Full option inventory from `sd-cli --help`: every flag with its type, choices, default and
 * description. This is what lets a new stable-diffusion.cpp flag show up in the UI without
 * code changes (see sdOptionCatalog.ts for the labelled, grouped subset and the deny list).
 *
 * Pure (text in, data out) so the server probe, the renderer and the tests share it.
 */

export type SdOptionType = 'bool' | 'int' | 'float' | 'string' | 'enum'

export interface SdOption {
  /** Long flag, e.g. `--cfg-scale` */
  flag: string
  /** Short forms, e.g. `-H` */
  aliases: string[]
  type: SdOptionType
  choices?: string[]
  defaultValue?: string
  description: string
  /** Help section without " Options", e.g. "Generation" */
  section: string
  /** "can be used multiple times" */
  repeatable: boolean
}

export interface SdHelp {
  versionLine?: string
  options: SdOption[]
}

const OPTION_LINE =
  /^\s{1,4}(?:(-[A-Za-z]),\s+)?(--?[A-Za-z][\w-]*)(?:\s+<(string|int|float)>)?(?:\s{2,}(.*))?$/
const SECTION_LINE = /^([A-Z][\w ]*?) Options:\s*$/
/** Description text starts at a fixed column; continuation lines are indented past it. */
const CONTINUATION = /^\s{12,}(\S.*)$/

/** Value-taking options without a `<type>` tag ("--scheduler", "--seed", "--sigmas"). */
const VALUE_HINT =
  /\b(one of|format|comma-separated|key=value|seed|path to|directory|e\.g\.|examples?|policy|method|mask|multiple times)\b/i

function choicesFrom(description: string): string[] | undefined {
  const match = description.match(/(?:must be )?one of(?: the following)?\s*\[([^\]]+)\]/i)
  if (!match) return undefined
  const choices = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^[\w.+-]+$/.test(part))
  return choices.length ? choices : undefined
}

function defaultFrom(description: string): string | undefined {
  const match = description.match(/\bdefault(?::|\s+is|s\s+to)?\s+([^)]*?)(?:\)|\.(?:\s|$)|,|;|$)/i)
  const value = match?.[1]?.trim().replace(/^"(.*)"$/, '$1')
  return value ? value : undefined
}

function typeOf(
  tag: string | undefined,
  description: string,
  choices?: string[],
  defaultValue?: string
): SdOptionType {
  if (tag === 'int' || tag === 'float' || tag === 'string') return tag
  if (choices) return 'enum'
  if (defaultValue && !/\s/.test(defaultValue) && !/^(true|false)$/i.test(defaultValue))
    return 'string'
  return VALUE_HINT.test(description) ? 'string' : 'bool'
}

export function parseSdHelp(helpText: string): SdHelp {
  const options: SdOption[] = []
  let section = ''
  let versionLine: string | undefined
  let current: { option: SdOption; tag?: string; text: string[] } | null = null

  const finish = (): void => {
    if (!current) return
    const description = current.text.join(' ').replace(/\s+/g, ' ').trim()
    const choices = choicesFrom(description)
    const option = current.option
    option.description = description
    option.choices = choices
    option.defaultValue = defaultFrom(description)
    option.type = typeOf(current.tag, description, choices, option.defaultValue)
    option.repeatable = /(?:can be (?:used|specified) multiple times)/i.test(description)
    options.push(option)
    current = null
  }

  for (const raw of helpText.split(/\r?\n/)) {
    if (raw.startsWith('#')) continue
    if (!versionLine && /stable-diffusion\.cpp/i.test(raw)) versionLine = raw.trim()
    const sectionMatch = raw.match(SECTION_LINE)
    if (sectionMatch) {
      finish()
      section = sectionMatch[1].trim()
      continue
    }
    const optionMatch = raw.match(OPTION_LINE)
    if (optionMatch && section) {
      finish()
      const [, short, long, tag, text] = optionMatch
      current = {
        option: {
          flag: long,
          aliases: short ? [short] : [],
          type: 'bool',
          description: '',
          section,
          repeatable: false
        },
        tag,
        text: text ? [text] : []
      }
      continue
    }
    const continuation = raw.match(CONTINUATION)
    if (continuation && current) {
      current.text.push(continuation[1])
      continue
    }
    if (!raw.trim()) finish()
  }
  finish()
  return { versionLine, options }
}

/** Every spelling of every flag (long + short), for "is this flag supported" checks. */
export function helpFlagNames(help: SdHelp): Set<string> {
  const names = new Set<string>()
  for (const option of help.options) {
    names.add(option.flag)
    for (const alias of option.aliases) names.add(alias)
  }
  return names
}

export function findOption(help: SdHelp, flag: string): SdOption | undefined {
  return help.options.find((option) => option.flag === flag || option.aliases.includes(flag))
}
