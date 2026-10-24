# Tvijo DSHREM — de uma tarefa a um resultado verificado

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

A Tvijo reúne um espaço de trabalho no navegador, uma extensão para VS Code e ferramentas de terminal em torno de um fluxo de desenvolvimento compartilhado. Descreva a tarefa, escolha o host de execução e as permissões, inspecione as alterações e conserve as evidências usadas para aceitar o resultado. Este guia apresenta o produto; o README técnico do repositório e a referência de comandos continuam sendo a fonte autoritativa para a CLI.

## Comece pelo seu espaço de trabalho preferido

Abra o [DSHREM](https://dsh.tvijo.com/), obtenha a [extensão para VS Code e as instruções de terminal](https://dsh.tvijo.com/download) ou leia [configurações explicadas](https://dsh.tvijo.com/knowledge/settings-explained). Entre pelo fluxo de conta compatível do serviço. Nunca cole chaves de API de provedores em um prompt compartilhado, em uma issue pública ou em um repositório.

A CLI do Node.js requer Node 22 ou mais recente. A partir de uma cópia local do repositório:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

O comando também está disponível como `dshrem`. Esta CLI de chat remoto exibe ferramentas sugeridas sem executá-las. A edição local e a execução de comandos pertencem ao Agent do VS Code ou a um runtime de host configurado explicitamente; eles têm permissões separadas. Consulte a [ajuda da CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Entenda as escolhas

**Evidência primeiro** separa fatos comprovados de suposições. **Planejar e verificar** pede um plano curto e confere o resultado em relação ao pedido. **Revisar a resposta** questiona um rascunho; é uma autorrevisão, a menos que um revisor separado seja atribuído explicitamente. Nenhum desses métodos garante correção ou menor uso de tokens.

Presets de tarefa adicionam instruções e checklists reutilizáveis. Eles não criam memória adicional para o modelo. Uma coleção de contexto maior ainda precisa caber nos limites de requisição do serviço e do modelo. Os caminhos avançados de controller, Python e estado referem-se ao host da extensão selecionado; no Remote SSH, esse é o servidor remoto.

## Trabalhe em equipe quando isso ajudar

Uma equipe AGENTROY atribui responsabilidades distintas a um coordenador, implementadores e revisores. As políticas do host podem solicitar DSHREM ds41f e ferramentas Codex ou Claude vinculadas à conta, com revisão arquitetural opcional. A disponibilidade depende do runtime instalado, do acesso à conta e da política escolhida. Uma assinatura ausente não deve se tornar silenciosamente uma chamada paga à API.

Três a seis papéis são escolhas de organização, não uma fórmula de qualidade. Os revisores precisam da versão exata do artefato e da evidência de testes. Uma verificação séria que falha bloqueia a aceitação mesmo quando os modelos concordam. Leia [equipes de agentes e custos visíveis](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Retome sem esconder incertezas

Uma sessão tmux destacada no lado do servidor pode continuar depois que um laptop ou celular se desconectar. Trabalho em um computador local desligado não pode. Falha do servidor, pressão de memória e perda de armazenamento ainda exigem recuperação. Reconecte-se ao ID da tarefa salvo e inspecione seu último evento confirmado antes de iniciar mais trabalho. Não repita às cegas uma requisição cobrável cujo resultado é desconhecido. Veja [desconexões e recuperação](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Mantenha custos e dados visíveis

Revise o orçamento aceito, o limite da tarefa, o valor reservado e o recibo de uso. Uma margem de serviço de 8% transformaria USD1.00 de uso de provedor em USD1.08 antes de encargos divulgados separadamente; este é um exemplo, não uma oferta de preço. Cotas de assinatura, encargos de provedor e recursos de servidor são limites diferentes. Orçamento extra exige uma escolha explícita.

Os arquivos de credenciais da CLI local usam permissões apenas para o proprietário. Essas permissões não são criptografia nem backup. O upload de conhecimento é explícito; arquivos privados nunca devem entrar em um link de handoff público. [Handoffs de prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) explicam como copiar uma tarefa revisada para outra ferramenta.

O pacote deste repositório está atualmente marcado como `UNLICENSED`; a publicação não concede direitos de reuso. Consulte os metadados atuais do pacote e o aviso de licenciamento antes de redistribuir. As traduções são guias introdutórios, gerados com DSHREM e verificados quanto à consistência estrutural; o inglês é a referência para discrepâncias técnicas.
