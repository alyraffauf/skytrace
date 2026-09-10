import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const favicon = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const outputDirectory = new URL('../public/icons/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })

for (const size of [180, 192, 512]) {
  const icon = new Resvg(favicon, { fitTo: { mode: 'width', value: size }, background: '#7c3aed' })
  const filename = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  await writeFile(new URL(filename, outputDirectory), icon.render().asPng())
}
