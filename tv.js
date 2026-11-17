// =====================================================================
// Modo TV: quadro do setor para um monitor na manutenção (#tv)
// Tela cheia, sem menu. Alterna Alumínio → PPS → Fornos a cada 10 s,
// mostra a preventiva de hoje (ou a próxima) do setor, as próximas da
// fábrica, atrasadas, assinaturas pendentes e o plano de ação.
// Os dados se atualizam sozinhos (o sistema recarrega a cada 2 min).
// =====================================================================
import { SETORES, porCodigo, MESES } from './dados.js';
import { itens, hoje, aguardando, ST } from './situacao.js';
import { acoes } from './store.js';
import { esc, ic, semana, dataBR } from './ui.js';

const ORDEM = ['al', 'pps', 'fornos'];
const TROCA = 10000;
let timerTroca = null, timerRelogio = null, travaTela = null, ativo = 0;

const curto = (iso) => `${semana(iso)} ${iso.slice(8)}/${iso.slice(5, 7)}`;
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function sairTV() {
  clearInterval(timerTroca); clearInterval(timerRelogio); timerTroca = timerRelogio = null;
  try { travaTela?.release(); } catch (e) { /* sem trava */ } travaTela = null;
  document.body.classList.remove('modo-tv');
}

export function telaTV(app) {
  sairTV();
  document.body.classList.add('modo-tv');
  // mantém a tela do monitor ligada, quando o navegador permite
  try { navigator.wakeLock?.request('screen').then((t) => { travaTela = t; }).catch(() => {}); } catch (e) { /* sem suporte */ }
  const desenhar = () => {
    const lista = itens(), h = hoje(), s = ORDEM[ativo % 3];
    const doSetor = lista.filter((i) => i.setor === s && i.st !== 'concluida' && !aguardando(i.st) && i.st !== 'atrasada');
    const alvo = doSetor[0];
    const ehHoje = alvo && alvo.data === h;
    const prox = lista.filter((i) => i.data >= h && i.st !== 'concluida' && !aguardando(i.st)).slice(0, 6);
    const atrasadas = lista.filter((i) => i.st === 'atrasada');
    const assinar = lista.filter((i) => aguardando(i.st));
    const abertas = acoes().filter((a) => a.status !== 'fechada').sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9'))).slice(0, 3);
    const m = alvo && porCodigo[alvo.codigo];
    app.innerHTML = `<div class="tv">
      <header class="tv-top">
        <div class="tv-marca"><span class="tv-gp">GP</span><div><div class="tv-tit">Preventivas · Manutenção Injeção</div><div class="tv-data">${esc(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></div></div>
        <div class="tv-abas">${ORDEM.map((x, k) => `<span class="${k === ativo % 3 ? 'on' : ''}">${SETORES[x].curto}</span>`).join('')}</div>
        <div class="tv-hora" data-hora>${hora()}</div>
      </header>
      <div class="tv-tempo"><i></i></div>
      <main class="tv-corpo">
        <section class="tv-hoje ${ehHoje ? 'e-hoje' : ''}">
          <div class="tv-eyebrow">${ehHoje ? '<span class="pulso pulso-g"></span>Hoje' : alvo && alvo.dias < 0 ? 'Pendente' : 'Próxima'} · ${esc(SETORES[s].curto)}</div>
          ${alvo ? `<div><div class="tv-cod">${esc(alvo.codigo)}</div><div class="tv-mod">${esc(m.equipamento)} · ${esc(m.modelo)}</div></div>
            <div class="tv-rodape"><span class="${alvo.dias < 0 ? 'tv-atraso' : ''}">${ehHoje ? 'Programada para hoje' : alvo.dias < 0 ? `Passou da data (${esc(curto(alvo.data))}) · fazer ainda este mês` : `${esc(curto(alvo.data))} · ${alvo.dias === 1 ? 'amanhã' : `em ${alvo.dias} dias`}`}</span><span>Janela de ${MESES[+alvo.ciclo.slice(5) - 1]} até ${dataBR(alvo.janelaFim).slice(0, 5)}</span></div>`
            : '<div class="tv-cod tv-ok">Tudo em dia</div><div class="tv-mod">Nenhuma preventiva em aberto neste setor.</div>'}
        </section>
        <aside class="tv-lado">
          <div class="tv-card"><div><div class="tv-rot">Atrasadas</div><div class="tv-sub">todos os setores</div></div><b style="color:${atrasadas.length ? ST.atrasada.cor : ST.concluida.cor}">${atrasadas.length}</b></div>
          <div class="tv-card"><div><div class="tv-rot">Para assinar</div><div class="tv-sub">${assinar.length ? esc(assinar.slice(0, 2).map((i) => `${i.codigo} · ${i.st === 'ag_sup' ? 'supervisor' : 'gerente'}`).join(' · ')) : 'nenhuma pendente'}</div></div><b style="color:${ST.ag_ger.cor}">${assinar.length}</b></div>
          <div class="tv-card tv-lista"><div class="tv-rot">Próximas</div>
            ${prox.length ? prox.map((i) => `<div class="tv-li"><span>${esc(curto(i.data))}</span><b>${esc(i.codigo)}</b><small>${esc(SETORES[i.setor].curto)}</small></div>`).join('') : '<div class="tv-sub">Nada programado.</div>'}
          </div>
        </aside>
      </main>
      <footer class="tv-pe">
        <span class="tv-pe-tit">Plano de ação</span>
        ${abertas.length ? abertas.map((a) => `<span>${esc(a.codigo)} · ${esc(a.acao || a.item || '')}${a.prazo ? ` · prazo ${dataBR(a.prazo).slice(0, 5)}` : ''}</span>`).join('') : '<span>Nenhuma ação aberta.</span>'}
        <a href="#painel" class="tv-sair">${ic('voltar')} Sair do modo TV</a>
        <button type="button" class="tv-cheia" data-cheia>${ic('tela')} Tela cheia</button>
      </footer>
    </div>`;
    app.querySelector('[data-cheia]').onclick = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); };
  };
  desenhar();
  timerTroca = setInterval(() => { ativo++; desenhar(); }, TROCA);
  timerRelogio = setInterval(() => { const e = app.querySelector('[data-hora]'); if (e) e.textContent = hora(); }, 15000);
}
