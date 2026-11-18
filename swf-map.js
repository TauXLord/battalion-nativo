export async function replaceBinaryTags(buffer, replacements) {
  const file = new Uint8Array(buffer)
  const format = String.fromCharCode(...file.subarray(0, 3))
  if (!['CWS', 'FWS'].includes(format)) throw Error('Formato SWF incompatível.')
  const stream = new Blob([file.subarray(8)]).stream()
  const body = new Uint8Array(format === 'CWS'
    ? await new Response(stream.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
    : buffer.slice(8))
  const data = new DataView(body.buffer)
  let pos = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4
  let previous = 0
  const chunks = []
  const found = new Set()
  const utf8 = new TextEncoder()
  while (pos < body.length) {
    const start = pos
    const packed = data.getUint16(pos, true)
    const kind = packed >> 6
    let length = packed & 63
    pos += 2
    if (length === 63) {
      length = data.getUint32(pos, true)
      pos += 4
    }
    const end = pos + length
    if (end > body.length) throw Error('O SWF de origem está incompleto.')
    const id = kind === 87 && length >= 6 ? data.getUint16(pos, true) : -1
    if (replacements.has(id)) {
      const xml = utf8.encode(replacements.get(id))
      const tag = new Uint8Array(12)
      const header = new DataView(tag.buffer)
      header.setUint16(0, (87 << 6) | 63, true)
      header.setUint32(2, 6 + xml.length, true)
      tag.set(body.subarray(pos, pos + 6), 6)
      chunks.push(body.subarray(previous, start), tag, xml)
      found.add(id)
      previous = end
    }
    pos = end
  }
  if (found.size !== replacements.size) throw Error('Os mapas de origem não correspondem a esta edição.')
  chunks.push(body.subarray(previous))
  const length = chunks.reduce((total, chunk) => total + chunk.length, 8)
  const result = new Uint8Array(length)
  result.set(file.subarray(0, 8))
  result[0] = 70
  new DataView(result.buffer).setUint32(4, length, true)
  let offset = 8
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
