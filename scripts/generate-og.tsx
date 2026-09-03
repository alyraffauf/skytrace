/** @jsxImportSource satori/jsx */

import { Resvg } from '@resvg/resvg-js'
import { readFile, writeFile } from 'node:fs/promises'
import satori from 'satori'

const WIDTH = 1200
const HEIGHT = 630
const interSemiBold = await readFile(new URL('./assets/inter-semibold.woff', import.meta.url))

const svg = await satori(
  <div
    style={{
      alignItems: 'center',
      background: '#faf9ff',
      color: '#18181b',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter',
      height: '100%',
      justifyContent: 'center',
      width: '100%',
    }}
  >
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        height: 182,
        justifyContent: 'center',
        width: 182,
      }}
    >
      <svg
        width="178"
        height="178"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#7c3aed"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M16 14v6" />
        <path d="M8 14v6" />
        <path d="M12 16v6" />
      </svg>
    </div>

    <div
      style={{
        display: 'flex',
        fontSize: 88,
        fontWeight: 600,
        letterSpacing: -3.08,
        lineHeight: 1,
        marginTop: 42,
      }}
    >
      SkyTrace
    </div>
  </div>,
  {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Inter', data: interSemiBold, weight: 600, style: 'normal' }],
  },
)

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: WIDTH },
}).render()

await writeFile(new URL('../public/og.png', import.meta.url), png.asPng())

console.log(`Generated public/og.png (${png.width}×${png.height})`)
