// Idioma do jogo (pt ou en). A interface foi escrita em português e o conteúdo original
// (campanhas, unidades e terreno) em inglês, então cada idioma tem um dicionário só com o que falta:
//   traducao-en.json: textos da interface em português -> inglês
//   traducao-pt.json: textos originais em inglês -> português
const key = 'battalion-nativo-idioma'
let lang = 'pt'
let dictionary = {}
try {
  const saved = localStorage.getItem(key)
  lang = saved === 'en' || saved === 'pt' ? saved : (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en'
} catch {}

export const language = () => lang
export function setLanguage(value) {
  try { localStorage.setItem(key,value === 'en' ? 'en' : 'pt') } catch {}
}

export async function loadLanguage() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  try {
    const response = await fetch(lang === 'en' ? '/traducao-en.json' : '/traducao-pt.json')
    if (response.ok) dictionary = await response.json()
  } catch {}
}

const clean = text => String(text).replace(/\s+/g,' ').trim()

// t('Seu turno.') ou t('{n} equipes',{n:2}). Textos sem tradução voltam como estão.
export function t(text,values) {
  if (text == null) return text
  let result = dictionary[text] ?? dictionary[clean(text)] ?? text
  if (values) result = result.replace(/\{(\w+)\}/g,(match,name)=>name in values ? values[name] : match)
  return result
}

// Traduz o HTML estático: nós de texto e os atributos aria-label, title e placeholder.
export function translatePage(root = document.body) {
  const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    const text = clean(node.nodeValue)
    if (!text || !(text in dictionary)) continue
    const [, before, , after] = node.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/)
    node.nodeValue = before + dictionary[text] + after
  }
  for (const element of root.querySelectorAll('[aria-label],[title],[placeholder]')) {
    for (const name of ['aria-label','title','placeholder']) {
      const value = element.getAttribute(name)
      if (value && clean(value) in dictionary) element.setAttribute(name,dictionary[clean(value)])
    }
  }
  if (document.title in dictionary) document.title = dictionary[document.title]
}
