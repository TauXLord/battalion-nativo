// Versão da edição: arquivo válido e comparação de versões (para saber se precisa atualizar).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compareVersions } from '../nativo/versao.js'

test('versao.json tem versão no formato 1.2.3 e data',() => {
  const edition = JSON.parse(readFileSync(new URL('../nativo/versao.json',import.meta.url)))
  assert.match(edition.versao,/^\d+\.\d+\.\d+$/)
  assert.match(edition.data,/^\d{4}-\d{2}-\d{2}$/)
})

test('comparação de versões respeita os números (1.10 é mais nova que 1.9)',() => {
  assert.ok(compareVersions('1.0.0','1.0.1') < 0)
  assert.ok(compareVersions('1.10.0','1.9.9') > 0)
  assert.equal(compareVersions('2.0','2.0.0'),0)
})
