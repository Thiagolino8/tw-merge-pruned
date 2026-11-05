# tw-merge-pruned

Gera um merge de classes Tailwind a partir das classes literais do projeto. O navegador recebe o runtime e as regras necessárias ao consumidor. A coleta usa o parser Oxc; o pacote não depende de `typescript` nem de `tailwind-merge`.

O pacote prioriza o tamanho do runtime e a compatibilidade com o projeto consumidor original. Pode ser usado em outros projetos TypeScript, com Tailwind CSS 4 e classes completas presentes nas fontes. Não oferece toda a cobertura universal de `tailwind-merge`.

## Instalação

Requer Node.js >=24.2. Use o gerenciador do projeto:

```sh
npm install --save-dev tw-merge-pruned
```

## Vite

```ts
import { defineConfig } from "vite";
import { tailwindMergePlugin } from "tw-merge-pruned/vite";

export default defineConfig({ plugins: [tailwindMergePlugin()] });
```

O plugin usa o `root` resolvido pelo Vite, lê `src` e gera:

- `src/lib/tailwind-merge.ts`: runtime com `twMerge`.
- `src/lib/tailwind-merge-data.ts`: tabela do consumidor.

Importe o módulo gerado na aplicação:

```ts
import { twMerge } from "./lib/tailwind-merge";

twMerge("p-2 text-sm", condition && "p-4");
```

A função aceita strings, `false`, `null` e `undefined`. Objetos, arrays e números não fazem parte do contrato.

O runtime gerado usa imports com extensão `.ts`. Para checar tipos com `tsc` em um projeto Vite, configure:

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

Se o TypeScript também emitir JavaScript, use `rewriteRelativeImportExtensions` para converter essas extensões na saída.

Adicione os dois arquivos gerados e o cache ao `.gitignore`, ajustando os caminhos se configurar outro `output`:

```gitignore
src/lib/tailwind-merge.ts
src/lib/tailwind-merge-data.ts
.cache/tw-merge-pruned.json
```

Exclua a tabela dos formatadores, linters e fontes do Tailwind: ela contém dados compactados, não classes a gerar no CSS. Em `src/index.css`, com Tailwind CSS 4:

```css
@source not "./lib/tailwind-merge-data.ts";
```

O plugin regenera as regras quando arquivos são adicionados, editados ou removidos. Mudanças de regras podem provocar recarga completa no servidor de desenvolvimento. Erros de sintaxe interrompem a geração e preservam a tabela anterior até a fonte ser corrigida.

## Outros builds e ferramentas

```sh
npx tw-merge-pruned --root . --source-dir src --output src/lib/tailwind-merge.ts
```

Execute antes do type-check e de ferramentas que importem o módulo gerado. No Vite, a geração ocorre no início do build. Para uso programático:

```ts
import { createGenerator } from "tw-merge-pruned";

const generator = createGenerator({ root: process.cwd() });
generator.generateMergeData();
```

`root`, `sourceDir` e `output` são opcionais. Os caminhos são resolvidos a partir de `root`; `output` deve terminar em `.ts`. A tabela é criada ao lado dele, com o sufixo `-data.ts`. As fontes podem ser `.ts`, `.tsx`, `.js` ou `.jsx`; declarações, arquivos `.gen.ts` e os próprios módulos gerados são ignorados.

## Compatibilidade

Desde a versão 0.2.0, o gerador usa um perfil local de regras, sem instalar ou executar `tailwind-merge`. O perfil cobre as famílias usadas pelo consumidor original, com conflitos direcionais, variantes, valores arbitrários e `!important` inicial e final. As regras de compatibilidade foram derivadas de `tailwind-merge@3.7.0`, sob MIT, e são mantidas em `src/rules.mjs`. O parser e a classificação ficam em `src/classify.mjs` e `src/validators.mjs`.

O inventário seleciona quais dessas regras entram na saída. Ele não descobre a semântica de uma família nova: ampliar a cobertura exige atualizar o perfil e publicar outra versão. Outros projetos podem usar o pacote dentro dessa cobertura. O cache em `.cache/tw-merge-pruned.json` é descartável.

Classes desconhecidas são preservadas. O inventário considera strings e partes literais de templates, sem avaliar expressões. Monte classes com nomes completos (`condition ? "w-4" : "w-8"`); nomes parciais como `` `w-${size}` `` não garantem cobertura. Configurações personalizadas de `tailwind-merge`, prefixos globais e sintaxes de outras versões do Tailwind não fazem parte do contrato validado.

As verificações do pacote usam projetos temporários para validar coleta, cache, integração Vite, CLI e tipos. Os tipos são checados com `tsrs`, instalado apenas no desenvolvimento do pacote. Não exigem um pacote de referência.

## Desenvolvimento e publicação

```sh
bun install --frozen-lockfile
node --run check
npm pack
```

`npm pack` executa testes e checagem de tipos. O pacote inclui somente os arquivos de `src`, o manifesto, este README e a licença. Inclui o perfil de famílias suportadas; a tabela selecionada a partir das fontes de cada consumidor é gerada localmente.

O CI valida o pacote em Node 24 e 26. Um push da tag `v<versão>` publica no npm o artefato validado, depois que as duas verificações passam. A tag deve corresponder à versão de `package.json`. Reexecutar uma publicação só aceita uma versão existente se o conteúdo for idêntico.

A publicação usa OIDC, sem token npm nos secrets do GitHub. No npm, configure o trusted publisher de `tw-merge-pruned` para o usuário `Thiagolino8`, repositório `tw-merge-pruned` e workflow `ci.yml`, com permissão para `npm publish`. O campo `repository.url` do manifesto deve apontar para esse mesmo repositório.

## Licença

MIT. Consulte [LICENSE](./LICENSE). O aviso de copyright do `tailwind-merge` está preservado no mesmo arquivo.
