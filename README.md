# GESTÃO DE PREVENTIVAS

Cronograma, formulário no celular e assinaturas das manutenções preventivas da injeção (alumínio, PPS e fornos) — Vetore.

Base: **FR.06.08.068** (cronograma, rev. 5) e **FR.06.08.002-A** (relatório de manutenção preventiva, rev. 5).

## Logins

| Usuário na tela | Perfil | O que faz |
|---|---|---|
| `manutencao` | Manutentor | Escaneia o QR da máquina, preenche OK / NOK / N.A., assina com o dedo. |
| `supervisor` | Supervisor da área | 2ª assinatura. Vê tudo, remarca datas, cuida dos feriados e das etiquetas QR. |
| `gerente` | Gerente de manutenção | 3ª assinatura (conclui). Vê tudo, remarca, feriados, etiquetas. |

Basta digitar o usuário; o sistema completa com `@vetore.com`.

## Como funciona

- **Cronograma:** a cada 3 meses por máquina (jan/abr/jul/out, fev/mai/ago/nov ou mar/jun/set/dez), de dez/2026 a dez/2027, só em dias úteis e com **no máximo uma máquina parada por dia**. O mês é a janela; o dia é sugerido pelo sistema.
- **Calendário:** uma aba por setor (Injeção de alumínio, PPS, Fornos), com visão de mês, semana, dia e ano. A gestão remarca arrastando a máquina (computador) ou em *Remarcar*. Se o dia já tem outra preventiva, aparece o aviso e a sugestão do dia livre mais próximo.
- **Feriados:** só os nacionais já vêm marcados. Em *Feriados* a gestão acrescenta Carnaval, emendas, férias coletivas ou marca que a fábrica trabalha num feriado. Só as preventivas daquele dia mudam (data sugerida, sem conflito).
- **Formulário:** o QR da máquina abre direto o formulário dela. Todo NOK pede o que foi encontrado e a ação (vira linha do plano de ação). O rascunho é salvo a cada resposta, inclusive no celular.
- **Assinaturas:** manutentor → supervisor da área → gerente de manutenção, nessa ordem. Depois da assinatura do manutentor o formulário trava. As regras valem no próprio banco.
- **Relatório e pasta:** o relatório sai em 2 folhas A4 iguais ao papel. Quando o gerente assina, o PDF é gerado e guardado na pasta do sistema (Supabase > Storage > `relatorios`, separado por máquina e ano). Em *Registros* qualquer um baixa o PDF (`VTIA 07 - 2026-12-02 - Preventiva.pdf`) ou imprime.
- **Layout 3D:** galpão da injeção de alumínio (mesma cena do Gestão de Fluidos), PPS e fornos, com a cor da situação de cada máquina.
- **App no celular:** botão *Instalar app* no topo (Android/Chrome). No iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*.

## Colocar no ar (uma vez)

1. **Supabase → SQL Editor:** rode `01_banco_de_dados.sql`. *(Já feito em 16/11/2026.)*
2. **Supabase → Authentication → Users → Add user:** crie `manutencao@vetore.com`, `supervisor@vetore.com` e `gerente@vetore.com` com senha, marcando *Auto Confirm User*.
3. **Supabase → SQL Editor:** rode `02_perfis.sql`. A conferência no fim deve listar os três e-mails.
4. **`config.js`:** já tem o Project URL e a *Publishable key* do projeto. Nunca coloque ali a secret key.
5. **Vercel:** *Add New → Project*, escolha este repositório, *Framework Preset: Other*, *Deploy*. Não precisa de build.
6. Entre como `gerente`, abra *Etiquetas QR* e imprima (Ctrl+P).

Toda alteração salva no GitHub é publicada pela Vercel em cerca de 1 minuto.

## Onde mudar cada coisa

| O quê | Arquivo |
|---|---|
| Máquinas, modelos, meses de cada uma, perguntas do formulário, feriados nacionais | `dados.js` |
| Posição das células no galpão 3D, em qual célula fica cada forno de espera (`FORNO_ESPERA`) | `planta.js`, `planta3d.js` |
| Posições do PPS e dos fornos no 3D separado | `cena3d.js` (`LAYOUTS`) |
| Folha A4 do relatório | `relatorio.js` e o fim de `app.css` |
| Regras de acesso e do fluxo de assinaturas | `01_banco_de_dados.sql` |

## Novidades (novembro/2026)

- **Plano de ação**: todo item NOK com ação vira um cartão com responsável e prazo; fecha com evidência (texto + foto).
- **Foto no NOK**: o manutentor tira a foto pelo celular; as fotos saem no PDF em "Anexo fotográfico".
- **Selo de autenticidade**: quando o gerente assina, o PDF ganha um QR + código. Quem lê o QR vê se o relatório é autêntico e sem alterações.
- **Histórico por máquina**: botão "Histórico" na ficha da máquina.
- **Indicadores**: cumprimento do cronograma, no prazo, atrasadas, NOK mais frequentes, tempo médio por máquina.
- **Avisos automáticos (Teams / e-mail)**: tela "Avisos". Envio todo dia útil às 06:30.
- **Revisão do formulário**: cada relatório guarda a revisão do FR.06.08.002 usada. Para criar a rev. 6, adicione `FORMULARIOS[6]` em `dados.js` e mude `REV_ATUAL`. Os relatórios antigos continuam saindo na rev. 5.
- **Cronograma FR.06.08.068 em Excel**: na aba Cronograma, botão Excel (gestão). Sai no mesmo formato da planilha, com PROGRAMADO (azul) e REALIZADO (verde).

### Banco e avisos
1. `03_melhorias.sql` – tabela de ações, fotos, selo e configuração dos avisos.
2. Publicar a função `supabase/functions/avisos` (sem verificação de JWT).
3. `04_avisos_agendamento.sql` – agenda o envio diário.
4. E-mail pelo Outlook: crie um fluxo no app Workflows do Teams (gatilho "Quando uma solicitação de webhook do Teams for recebida" → "Enviar um email (V2)" com Para/Assunto/Corpo = `triggerBody()?['para']`, `['assunto']`, `['html']`) e cole o endereço na tela Avisos. Os passos estão na própria tela.
