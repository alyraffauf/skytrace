// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const entrypointPath = fileURLToPath(new URL('../container/15-runtime-config.envsh', import.meta.url))
const template = readFileSync(new URL('../container/runtime-config.js.template', import.meta.url), 'utf8')
const variableNames = [
  'SKYTRACE_IGNORE_NO_UNAUTHENTICATED_VALUE',
  'MIN_LIST_BLOCKING_VALUE',
  'SKYTRACE_BLOCK_TARGET_DID_VALUE',
  'SKYTRACE_HIDDEN_DIDS_VALUE',
]

function runtimeConfig(blockTargetDid: string) {
  const output = execFileSync(
    'sh',
    [
      '-c',
      '. "$1"; printf "%s\\0" "$SKYTRACE_IGNORE_NO_UNAUTHENTICATED_VALUE" "$MIN_LIST_BLOCKING_VALUE" "$SKYTRACE_BLOCK_TARGET_DID_VALUE" "$SKYTRACE_HIDDEN_DIDS_VALUE"',
      'runtime-config-test',
      entrypointPath,
    ],
    {
      env: {
        ...process.env,
        SKYTRACE_BLOCK_TARGET_DID: blockTargetDid,
        SKYTRACE_IGNORE_NO_UNAUTHENTICATED: 'true',
        MIN_LIST_BLOCKING: '3',
        SKYTRACE_HIDDEN_DIDS: 'did:plc:hidden,did:web:example.com',
      },
      encoding: 'utf8',
    },
  )
  const values = output.split('\0')
  const variables = Object.fromEntries(variableNames.map((name, index) => [name, values[index]]))
  const source = template.replace(/\$\{([A-Z_]+)\}/g, (_match, name: string) => variables[name])
  const context = { window: {} as { __SKYTRACE_CONFIG__?: unknown } }
  runInNewContext(source, context)
  return context.window.__SKYTRACE_CONFIG__
}

it.each(['did:plc:example', 'did:web:example.com', 'did:web:example.com%3A8443:users:alice'])(
  'emits valid runtime JavaScript for block target %s',
  (did) => {
    expect(runtimeConfig(did)).toEqual({
      ignoreNoUnauthenticated: true,
      minListBlocking: 3,
      blockTargetDid: did,
      hiddenDids: ['did:plc:hidden', 'did:web:example.com'],
    })
  },
)

it.each([
  '',
  'not-a-did',
  ' did:plc:example',
  'did:plc:example\nnot-a-did',
  'not-a-did\ndid:plc:example',
  'did:plc:example\ndid:plc:other',
  'did:plc:example\n',
  'did:plc:example\r\n',
  'did:plc:example\r\nnot-a-did',
  'did:plc:example"',
  "did:plc:example'",
  'did:plc:example\n"}; window.injected = true; //',
])('disables an invalid block target %j while preserving the rest of runtime config', (did) => {
  expect(runtimeConfig(did)).toEqual({
    ignoreNoUnauthenticated: true,
    minListBlocking: 3,
    blockTargetDid: null,
    hiddenDids: ['did:plc:hidden', 'did:web:example.com'],
  })
})
