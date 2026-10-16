/* ============================================================================
   Meu Consultório App — o que o navegador faz antes de falar com o servidor.

   O ponto importante deste arquivo é a função derivar(). A senha do dentista
   nunca sai daqui: o que viaja é o resultado de 600 mil voltas de PBKDF2 sobre
   ela. Duas razões.

   1. O plano gratuito do Cloudflare dá 10 ms de CPU por requisição. Fazer as
      600 mil voltas no servidor estouraria o limite e o login simplesmente não
      responderia. Aqui, roda no computador de quem está entrando.
   2. Quem tentar quebrar uma senha a partir de um vazamento do banco tem que
      rodar as mesmas 600 mil voltas por tentativa — o custo é o mesmo de um
      PBKDF2 no servidor. E ainda ganhamos que a senha em texto puro não existe
      em lugar nenhum do nosso lado: nem em memória, nem em log, nem no banco.

   O sal é o e-mail normalizado, e não um valor aleatório, porque o navegador
   precisa conseguir derivar antes de o servidor dizer qualquer coisa — inclusive
   antes de saber se a conta existe. É o mesmo desenho de gerenciadores de senha.
   ========================================================================== */

const MCA = (() => {
  const VOLTAS = 600000;
  const cod = new TextEncoder();

  function base64url(buffer) {
    const b = new Uint8Array(buffer);
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function derivar(senha, email) {
    const sal = 'mca|login|' + String(email).trim().toLowerCase();
    const chave = await crypto.subtle.importKey(
      'raw', cod.encode(senha), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: cod.encode(sal), iterations: VOLTAS, hash: 'SHA-256' },
      chave, 256
    );
    return base64url(bits);
  }

  /* Redefinir senha acontece a partir de um link, sem o e-mail digitado. O
     e-mail vai no próprio link para que o sal continue sendo o mesmo. */
  async function derivarComEmail(senha, email) { return derivar(senha, email); }

  async function chamar(caminho, corpo, metodo) {
    const r = await fetch(caminho, {
      method: metodo || (corpo ? 'POST' : 'GET'),
      headers: corpo ? { 'content-type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin',
    });
    let dados = {};
    try { dados = await r.json(); } catch { /* resposta sem corpo */ }
    return { ok: r.ok, status: r.status, dados };
  }

  /* --- CPF / CNPJ ---------------------------------------------------------
     A mesma checagem de dígito que o servidor faz, para o erro aparecer antes
     de a pessoa clicar. O servidor refaz tudo: isto aqui é só cortesia. */

  const digitos = (s) => String(s || '').replace(/\D+/g, '');

  function cpfValido(c) {
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (const [ate, pos] of [[9, 10], [10, 11]]) {
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(c[i]) * (pos - i);
      let d = (soma * 10) % 11;
      if (d === 10) d = 0;
      if (d !== Number(c[ate])) return false;
    }
    return true;
  }

  function cnpjValido(c) {
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const calc = (ate) => {
      const pesos = ate === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(c[i]) * pesos[i];
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
  }

  function documentoValido(s) {
    const d = digitos(s);
    if (d.length === 11) return cpfValido(d);
    if (d.length === 14) return cnpjValido(d);
    return false;
  }

  function mascaraDocumento(s) {
    const d = digitos(s).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }

  function mascaraTelefone(s) {
    const d = digitos(s).slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  /* --- força da senha -----------------------------------------------------
     Não é um medidor bonito: é um piso. Abaixo dele o botão não habilita,
     porque uma senha fraca aqui é a ficha de um paciente amanhã. */
  /* Esta função é o gêmeo de `exigenciasDaSenha` no programa de computador.
     As duas TÊM que dizer a mesma coisa: desde a 2.0.0 a senha é uma só, e uma
     regra aqui mais dura do que lá deixaria o dentista criar no programa uma
     senha que o site depois recusa — trancado para fora da própria conta.

     E a regra mora nos dois clientes, não no servidor, porque o servidor nunca
     vê a senha: o que chega nele é o resultado de 600 mil embaralhamentos.
     Isso é de propósito, e o preço é este — quem quiser burlar a exigência
     mexendo no próprio navegador consegue. Não é o risco que esta regra
     combate: ela existe para o dentista apressado não escolher "dentista123",
     e não para deter um atacante que já está do lado de dentro. */
  function forcaDaSenha(s) {
    s = String(s || '');
    const problemas = [];
    if (s.length < 10) problemas.push('pelo menos 10 caracteres');
    if (!/[a-zà-ÿ]/.test(s)) problemas.push('uma letra minúscula');
    if (!/[A-ZÀ-Ý]/.test(s)) problemas.push('uma letra maiúscula');
    if (!/\d/.test(s)) problemas.push('um número');
    if (!/[^A-Za-zÀ-ÿ0-9]/.test(s)) problemas.push('um caractere especial, como ! ? @ # $ ou -');
    const comuns = ['senha', 'password', '123456', 'dentista', 'consultorio', 'qwerty', 'abc123'];
    if (comuns.some((c) => s.toLowerCase().includes(c))) problemas.push('nada de "senha", "123456" e parecidos');
    return { boa: problemas.length === 0, problemas };
  }

  /* --- A SENHA ÚNICA ------------------------------------------------------
   *
   * A chave que abre as fichas quando a senha de entrada não basta: computador
   * novo, reinstalação, ou o backup baixado da nuvem.
   *
   * Ela nasce AQUI, no navegador do dentista, e é o único lugar do sistema
   * onde ela existe por inteiro. O que vai para o servidor é um sal e um
   * resumo — e resumo não abre nada, só responde "esse código é o seu?".
   *
   * O alfabeto tem 26 símbolos e não tem 0/O, 1/I/L, 5/S nem 8/B: é código
   * para ser copiado à mão, de um papel, por alguém apressado. Vinte símbolos
   * em quatro blocos dão ~94 bits — mais do que qualquer força bruta alcança,
   * e ainda assim curto o bastante para caber numa linha escrita à caneta.
   *
   * Por que não derivar de uma senha que ele escolha: porque senha escolhida
   * por gente tem a entropia de gente. Esta é a última porta que existe quando
   * tudo o mais se perdeu — ela precisa ser sorteada, não pensada.
   * ---------------------------------------------------------------------- */
  const ALFABETO_CHAVE = 'ACDEFGHJKMNPQRTUVWXY234679';

  function novaChaveUnica() {
    /* Sorteio sem viés: o resto de 256 por 26 não é zero, então os últimos
       valores do byte cairiam mais vezes em algumas letras. Descarta-se o
       excedente e sorteia-se de novo — custa nada e o sorteio fica limpo. */
    const teto = 256 - (256 % ALFABETO_CHAVE.length);
    const letras = [];
    while (letras.length < 20) {
      const b = crypto.getRandomValues(new Uint8Array(32));
      for (const x of b) {
        if (x >= teto) continue;
        letras.push(ALFABETO_CHAVE[x % ALFABETO_CHAVE.length]);
        if (letras.length === 20) break;
      }
    }
    return letras.join('').replace(/(.{5})(?=.)/g, '$1-');
  }

  function chaveUnicaValida(c) {
    return /^[ACDEFGHJKMNPQRTUVWXY234679]{5}(-[ACDEFGHJKMNPQRTUVWXY234679]{5}){3}$/
      .test(String(c || '').trim().toUpperCase());
  }

  /* O resumo que o servidor guarda. Mesmo formato do lado de lá:
     SHA-256 do sal, uma barra, e o código. */
  async function resumoDaChave(codigo, sal) {
    const bits = await crypto.subtle.digest('SHA-256', cod.encode(sal + '|' + codigo));
    return base64url(bits);
  }

  function novoSalDaChave() {
    return base64url(crypto.getRandomValues(new Uint8Array(16)));
  }

  /* --- utilidades de tela ------------------------------------------------- */

  function aviso(elemento, texto, tipo) {
    if (!elemento) return;
    elemento.textContent = texto || '';
    elemento.className = 'recado' + (texto ? ' ' + (tipo || 'erro') : '');
    elemento.hidden = !texto;
  }

  function ocupado(botao, sim, textoOcupado) {
    if (!botao) return;
    if (sim) {
      botao.dataset.texto = botao.dataset.texto || botao.textContent;
      botao.textContent = textoOcupado || 'Aguarde…';
      botao.disabled = true;
    } else {
      botao.textContent = botao.dataset.texto || botao.textContent;
      botao.disabled = false;
    }
  }

  return { derivar, derivarComEmail, chamar, digitos, documentoValido,
           mascaraDocumento, mascaraTelefone, forcaDaSenha, aviso, ocupado, VOLTAS,
           novaChaveUnica, chaveUnicaValida, resumoDaChave, novoSalDaChave };
})();
