// =====================================================================
// Exporta o cronograma no formato da planilha FR.06.08.068
// (3 abas: INJ PPS, INJ AL e FORNOS; linhas PROGRAMADO e REALIZADO)
//
// PROGRAMADO (azul) = mês da preventiva, com o dia programado escrito.
// REALIZADO (verde)  = mês em que o manutentor assinou, com o dia.
// Vermelho = o mês acabou sem a preventiva ("NÃO REALIZADA").
// =====================================================================
import { MAQUINAS, MESES } from './dados.js';
import { itens, hoje } from './situacao.js';
import { salvarArquivo } from './relatorio.js';

const ABAS = [
  { setor: 'pps', nome: 'PREVENTIVA - INJ PPS.', cod: 'FR.06.08.068 -C', setorTxt: 'INJEÇÃO - PPS' },
  { setor: 'al', nome: 'PREVENTIVA - INJ AL', cod: 'FR.06.08.068 -A', setorTxt: 'INJEÇÃO DE ALUMÍNIO' },
  { setor: 'fornos', nome: 'PREVENTIVA - FORNOS', cod: 'FR.06.08.068 -B', setorTxt: 'INJEÇÃO - FORNOS' },
];
const COR = { navy: 'FF17375E', cinzaRot: 'FFA6A6A6', cinzaMes: 'FFD9D9D9', cinzaCab: 'FF595959', azulClaro: 'FFDCE6F1', sep: 'FF808080', prog: 'FF0070C0', real: 'FF00B050', atraso: 'FFC00000', branco: 'FFFFFFFF', preto: 'FF000000' };
const carregar = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((ok, erro) => {
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  s.onload = () => ok(window.ExcelJS); s.onerror = () => erro(new Error('não carregou o gerador de Excel')); document.head.append(s);
});
const fundo = (c, argb) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };
const fino = { style: 'thin', color: { argb: COR.preto } }, medio = { style: 'medium', color: { argb: COR.preto } };
const bordas = (c, b = fino) => { c.border = { top: b, left: b, bottom: b, right: b }; };
const fonte = (c, sz, bold = false, cor = COR.preto) => { c.font = { name: 'Calibri', size: sz, bold, color: { argb: cor } }; };
const centro = (c, wrap = true) => { c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: wrap }; };

export async function exportarCronograma(ano) {
  const ExcelJS = await carregar();
  const lista = itens(), h = hoje();
  const wb = new ExcelJS.Workbook(); wb.creator = 'Gestão de Preventivas · Vetore'; wb.created = new Date();
  const logo = await fetch('/fr068-logo.png').then((r) => r.arrayBuffer()).then((b) => wb.addImage({ buffer: b, extension: 'png' })).catch(() => null);
  const dDoc = new Date(2023, 0, 9);

  ABAS.forEach((aba) => {
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: 'frozen', ySplit: 11, zoomScale: 40 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true } });
    ws.columns = [{ width: 2.7 }, { width: 40.7 }, { width: 45.7 }, { width: 30.7 }, { width: 24 }, ...Array(12).fill({ width: 29 })];
    [30, 30, 14, 30, 88, 88, 25, 55, 15, 50, 50].forEach((ht, i) => { ws.getRow(i + 1).height = ht; });
    // cabeçalho do documento
    ws.mergeCells('A1:B2'); ws.mergeCells('C1:N2'); ws.mergeCells('O1:O2');
    if (logo != null) ws.addImage(logo, { tl: { col: 0.15, row: 0.15 }, ext: { width: 296, height: 77 } });
    const t = ws.getCell('C1'); t.value = 'CRONOGRAMA - MANUTENÇÃO PREVENTIVA'; fundo(t, COR.navy); fonte(t, 36, true, COR.branco); centro(t);
    const cod = ws.getCell('O1'); cod.value = aba.cod; fundo(cod, COR.navy); fonte(cod, 16, true, COR.branco); centro(cod);
    [['P1', 'DATA'], ['Q1', 'REV']].forEach(([a, v]) => { const c = ws.getCell(a); c.value = v; fundo(c, COR.navy); fonte(c, 18, true, COR.branco); centro(c); bordas(c, medio); });
    const pd = ws.getCell('P2'); pd.value = dDoc; pd.numFmt = 'dd/mm/yyyy'; fonte(pd, 18); centro(pd); bordas(pd, medio);
    const pr = ws.getCell('Q2'); pr.value = '5'; fonte(pr, 18); centro(pr); bordas(pr, medio);
    ['A1', 'C1', 'O1'].forEach((a) => bordas(ws.getCell(a), medio));
    const primeira = lista.filter((i) => i.setor === aba.setor && i.ciclo.startsWith(String(ano))).map((i) => i.data).sort()[0];
    const info = [
      ['B5', 'RESPONSÁVEL EM ACOMPANHAR:', true], ['C5', 'DANILO CORREA\nGERENTE DE MANUTENÇÃO'], ['D5', 'INICIO:', true], ['E5', primeira ? new Date(primeira + 'T12:00') : ''],
      ['F5', 'SETOR:', true], ['G5', aba.setorTxt], ['H5', 'CADA QUANTO TEMPO?', true], ['I5', '03 Meses'],
      ['B6', 'RESPONSÁVEL A \nREALIZAR:', true], ['C6', 'MANUTENÇÃO INTERNA DA VETORE'], ['D6', 'ANO DO CALENDÁRIO:', true], ['E6', ano],
      ['F6', 'DATA DE ATUALIZAÇÃO:', true], ['G6', new Date(h + 'T12:00')], ['H6', 'REVISÃO DA ATUALIZAÇÃO:', true], ['I6', 5],
    ];
    info.forEach(([a, v, rot]) => { const c = ws.getCell(a); c.value = v; fonte(c, 20, !!rot); centro(c); bordas(c, medio); if (rot) fundo(c, COR.cinzaRot); if (v instanceof Date) c.numFmt = 'dd/mm/yyyy'; });
    ws.mergeCells('F8:Q8'); const dp = ws.getCell('F8'); dp.value = `DATA PROGRAMADA: ${ano}`; fundo(dp, COR.cinzaMes); fonte(dp, 28, true); centro(dp); bordas(dp);
    // cabeçalho da tabela
    ['B', 'C', 'D', ...'FGHIJKLMNOPQ'].forEach((col) => ws.mergeCells(`${col}10:${col}11`));
    const cab = { B: 'EQUIPAMENTO', C: 'MODELO', D: 'NOME INTERNO' };
    Object.entries(cab).forEach(([col, v]) => { const c = ws.getCell(col + '10'); c.value = v; fundo(c, COR.cinzaCab); fonte(c, 22, true, COR.branco); centro(c); bordas(c); });
    [['E10', 'PRAZO INICIAL'], ['E11', 'PRAZO FINAL']].forEach(([a, v]) => { const c = ws.getCell(a); c.value = v; fundo(c, COR.cinzaCab); fonte(c, 22, true, COR.branco); centro(c); bordas(c); });
    'FGHIJKLMNOPQ'.split('').forEach((col, i) => { const c = ws.getCell(col + '10'); c.value = MESES[i].toUpperCase(); fundo(c, COR.cinzaMes); fonte(c, 22, true); centro(c); bordas(c); });
    // máquinas
    let r = 12;
    MAQUINAS.filter((m) => m.setor === aba.setor).forEach((m) => {
      ws.getRow(r).height = 30; ws.getRow(r + 1).height = 30;
      [['B', m.equipamento.toUpperCase()], ['C', m.modelo.toUpperCase()], ['D', m.codigo]].forEach(([col, v]) => {
        ws.mergeCells(`${col}${r}:${col}${r + 1}`); const c = ws.getCell(col + r); c.value = v; fundo(c, COR.azulClaro); fonte(c, 20); centro(c); bordas(c);
      });
      [['E', r, 'PROGRAMADO'], ['E', r + 1, 'REALIZADO']].forEach(([col, row, v]) => { const c = ws.getCell(col + row); c.value = v; fundo(c, COR.azulClaro); fonte(c, 20); centro(c); bordas(c); });
      'FGHIJKLMNOPQ'.split('').forEach((col) => { [r, r + 1].forEach((row) => { const c = ws.getCell(col + row); bordas(c); centro(c, false); }); });
      lista.filter((i) => i.codigo === m.codigo).forEach((i) => {
        if (i.ciclo.startsWith(String(ano))) {
          const c = ws.getCell('FGHIJKLMNOPQ'[+i.ciclo.slice(5) - 1] + r); c.value = `${i.data.slice(8)}/${i.data.slice(5, 7)}`; fundo(c, COR.prog); fonte(c, 18, true, COR.branco);
        }
        const feito = i.reg && (i.st === 'concluida' || i.st === 'ag_sup' || i.st === 'ag_ger');
        if (feito) {
          const d = new Date(i.reg.fim).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
          if (d.startsWith(String(ano))) { const c = ws.getCell('FGHIJKLMNOPQ'[+d.slice(5, 7) - 1] + (r + 1)); c.value = `${d.slice(8)}/${d.slice(5, 7)}${i.st === 'concluida' ? '' : ' *'}`; fundo(c, COR.real); fonte(c, 18, true, COR.branco); }
        } else if (i.st === 'atrasada' && i.ciclo.startsWith(String(ano))) {
          const c = ws.getCell('FGHIJKLMNOPQ'[+i.ciclo.slice(5) - 1] + (r + 1)); c.value = 'NÃO REALIZADA'; fundo(c, COR.atraso); fonte(c, 14, true, COR.branco);
        }
      });
      r += 2;
      ws.getRow(r).height = 9.75; ws.mergeCells(`B${r}:Q${r}`); fundo(ws.getCell(`B${r}`), COR.sep);
      r += 1;
    });
    // legenda
    r += 1;
    [[COR.prog, 'PROGRAMADO · dia programado (dd/mm)'], [COR.real, 'REALIZADO · dia em que foi feita (* = aguardando assinaturas)'], [COR.atraso, 'NÃO REALIZADA no mês programado']].forEach(([cor, txt]) => {
      const a = ws.getCell('B' + r); fundo(a, cor); bordas(a); const b = ws.getCell('C' + r); b.value = txt; fonte(b, 16); ws.getRow(r).height = 26; r += 1;
    });
    const g = ws.getCell('B' + (r + 1)); g.value = `Gerado pelo sistema Gestão de Preventivas em ${h.split('-').reverse().join('/')}. As cores vêm dos relatórios assinados no sistema.`; fonte(g, 14, false, 'FF595959');
  });
  const buf = await wb.xlsx.writeBuffer();
  const nome = `FR.06.08.068 - Cronograma Manutenção Preventiva ${ano}.xlsx`;
  await salvarArquivo(nome, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return nome;
}
