// Tela de login: manutencao, supervisor ou gerente (o sistema completa com @vetore.com).
// Se veio de um QR code, avisa qual máquina vai abrir depois de entrar.
import { ic, esc } from './ui.js';

export default function renderLogin(app, { sb, dominio, maquina }, aoEntrar) {
  app.innerHTML = `
  <div class="login"><div class="login-box">
    <img src="logo-vetore.png" alt="Vetore" class="login-logo" />
    <h1 class="login-tit">Gestão de Preventivas</h1>
    <form class="bloco" novalidate>
      <h2>Entrar</h2>
      ${maquina ? `<p class="aviso">${ic('qr')}<span>Depois de entrar abre o formulário da <b>${esc(maquina.codigo)}</b>.</span></p>` : ''}
      <label class="lbl" for="usuario">Usuário</label>
      <input class="campo" id="usuario" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="manutencao, supervisor ou gerente" required />
      <label class="lbl" for="senha">Senha</label>
      <input class="campo" id="senha" name="senha" type="password" autocomplete="current-password" required />
      <div class="erros" data-erro hidden></div>
      <button class="btn btn-pri btn-grande" type="submit">Entrar</button>
    </form>
    <p class="login-pe">Vetore · Manutenção Injeção</p>
  </div></div>`;
  const form = app.querySelector('form'), erro = app.querySelector('[data-erro]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); erro.hidden = true;
    let u = form.usuario.value.trim().toLowerCase(); const senha = form.senha.value;
    if (!u || !senha) { erro.textContent = 'Preencha usuário e senha.'; erro.hidden = false; return; }
    if (!u.includes('@')) u = `${u}@${dominio}`;
    const bt = form.querySelector('button[type=submit]'); bt.disabled = true; bt.textContent = 'Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({ email: u, password: senha });
    if (error) {
      erro.textContent = /Invalid login/i.test(error.message) ? 'Usuário ou senha incorretos.' : /fetch|network/i.test(error.message) ? 'Sem conexão. Verifique a internet.' : error.message;
      erro.hidden = false; bt.disabled = false; bt.textContent = 'Entrar'; return;
    }
    aoEntrar(data.session);
  });
  if (window.matchMedia('(min-width: 901px)').matches) app.querySelector('#usuario').focus();
}
