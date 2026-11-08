// Builds docs/index.html: the demo as ONE file with the library inlined (GitHub Pages ready, also works from file://).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const lib = readFileSync('dist/lwkripple.global.js', 'utf8')
if (lib.includes('</script')) throw new Error('library contains </script, cannot inline')
const src = readFileSync('demo/demo.src.html', 'utf8')
if (!src.includes('/*LIB*/')) throw new Error('demo/demo.src.html is missing the /*LIB*/ placeholder')
mkdirSync('docs', { recursive: true })
const out = src.replace('/*LIB*/', () => lib)
writeFileSync('docs/index.html', out)
writeFileSync('docs/.nojekyll', '')
console.log('docs/index.html'.padEnd(22), (out.length / 1024).toFixed(1) + ' KB (single file, library inlined)')
