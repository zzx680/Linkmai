/** Incremental UTF-8 decoding without relying on TextDecoder in the WeChat runtime. */
export class ChatStreamDecoder {
  private pending: number[] = []

  decode(chunk: ArrayBuffer): string {
    const bytes = [...this.pending, ...new Uint8Array(chunk)]
    let end = bytes.length
    let start = end - 1
    while (start >= 0 && (bytes[start] & 0xc0) === 0x80) start--
    if (start >= 0) {
      const lead = bytes[start]
      const length = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4
      if (end - start < length) end = start
    }
    this.pending = bytes.slice(end)
    return decodeURIComponent(bytes.slice(0, end).map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''))
  }

  finish() {
    if (this.pending.length) throw new Error('Incomplete UTF-8 response')
  }
}

/** SSE event names live in the event field, independently of the JSON payload. */
export function createChatEventParser(consume: (type: string, data: string) => void) {
  let buffer = ''
  let event = ''
  let data: string[] = []
  return (chunk: string) => {
    buffer += chunk
    if (buffer.length > 1_000_000) throw new Error('Chat event too large')
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
      if (!line) {
        const type = event
        const payload = data.join('\n')
        event = ''
        data = []
        if (payload) consume(type || 'message', payload)
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''))
      }
    }
  }
}
