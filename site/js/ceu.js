/* O CÉU DA PÁGINA — as partículas, desenhadas num canvas só.
 *
 * POR QUE ISTO SAIU DO CSS
 * Eram 40 a 54 <span> por página, cada um com DUAS animações (andar e
 * balançar), mais três véus de luz de quase mil pixels com filter:blur(110px).
 * No Chrome de um computador bom, a placa de vídeo faz o blur e ninguém sente.
 * Fora dele — Firefox, Safari, notebook sem placa, navegador em economia de
 * energia — o blur é refeito a cada quadro, pelo processador. Medido nesta
 * máquina, com CPU 4x mais lenta e desenho por software: 5,8 quadros por
 * segundo. É o "fica extremamente travado".
 *
 * O QUE MUDOU
 *   – os véus perderam o filter:blur: a suavidade vem do próprio degradê, que
 *     é desenhado uma vez e só desliza (ver o CSS);
 *   – as partículas viraram UM canvas, redesenhado a no máximo 30 quadros por
 *     segundo — ninguém distingue 30 de 60 num ponto de três pixels subindo
 *     devagar, e o processador sente a diferença;
 *   – o próprio script mede quanto cada quadro está custando nesta máquina e,
 *     se estiver pesado, entra no MODO LEVE: menos partículas e os véus
 *     parados. Quem tem computador bom não perde nada; quem não tem, deixa de
 *     ter a página travando.
 *   – "reduzir movimento" no sistema continua valendo: nada se mexe.
 *
 * Cada ponto é um recorte pronto (desenhado uma vez, fora da tela) carimbado
 * várias vezes por quadro. Desenhar brilho com shadowBlur a cada quadro seria
 * trocar um blur caro por outro.
 */
(function(){
  "use strict";
  var raiz = document.documentElement;
  var reduzir = false;
  try{ reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}

  function escuro(){
    var t = raiz.getAttribute("data-theme");
    if(t === "dark") return true;
    if(t === "light") return false;
    try{ return matchMedia("(prefers-color-scheme: dark)").matches; }catch(e){ return false; }
  }

  function iniciar(){
    var campo = document.querySelector(".campo, .ceu");
    if(!campo) return;
    /* páginas antigas em cache ainda trazem os <span>: saem, para não haver
       dois sistemas de partícula rodando ao mesmo tempo */
    Array.prototype.forEach.call(campo.querySelectorAll(".po"), function(n){
      if(n.parentNode) n.parentNode.removeChild(n);
    });
    if(reduzir) return;

    var tela = document.createElement("canvas");
    tela.className = "ceu-tela";
    tela.setAttribute("aria-hidden", "true");
    campo.appendChild(tela);
    var ctx = tela.getContext("2d");
    if(!ctx) return;

    /* acima de 1,5 a diferença não se vê num ponto borrado, e o custo sobe ao
       quadrado — num monitor 4K, dpr 2 é quatro vezes mais pixel para nada */
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var L = 0, A = 0;
    function medir(){
      L = window.innerWidth; A = window.innerHeight;
      tela.width = Math.round(L * dpr); tela.height = Math.round(A * dpr);
      tela.style.width = L + "px"; tela.style.height = A + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    medir();
    var espera = null;
    window.addEventListener("resize", function(){
      clearTimeout(espera); espera = setTimeout(medir, 150);
    });

    /* ---- o carimbo de cada ponto ---- */
    /* 3.0: dois carimbos — o verde do Solo e o azul da Clínica, misturados */
    var carimbo = null, carimboAzul = null;
    var FRACAO_AZUL = document.body && document.body.classList.contains("pagina-clinica") ? 0.72 : 0.42;
    function fazerCarimbo(){
      var verde = getComputedStyle(raiz).getPropertyValue("--verde").trim() || "#0E6B5E";
      var azul = getComputedStyle(raiz).getPropertyValue("--azul").trim() || "#1E4E9C";
      carimbo = desenharCarimbo(escuro() ? "#43C0A7" : verde);
      carimboAzul = desenharCarimbo(escuro() ? "#7FA6E6" : azul);
    }
    function desenharCarimbo(cor){
      var t = 32, c = document.createElement("canvas");
      c.width = c.height = t;
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(t/2, t/2, 0, t/2, t/2, t/2);
      grad.addColorStop(0, cor);
      grad.addColorStop(escuro() ? 0.22 : 0.3, cor);
      /* no escuro o ponto brilha (era o drop-shadow); no claro, é ponto */
      grad.addColorStop(escuro() ? 0.5 : 0.42, escuro() ? hexAlfa(cor, 0.35) : hexAlfa(cor, 0));
      grad.addColorStop(1, hexAlfa(cor, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, t, t);
      return c;
    }
    function hexAlfa(cor, a){
      var m = /^#?([0-9a-f]{6})$/i.exec(cor.replace(/\s/g, ""));
      if(!m) return "rgba(14,107,94," + a + ")";
      var n = parseInt(m[1], 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    }
    fazerCarimbo();
    /* trocou o tema (botão da página ou do sistema): o ponto troca de cor */
    try{
      new MutationObserver(fazerCarimbo).observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
      var mq = matchMedia("(prefers-color-scheme: dark)");
      if(mq.addEventListener) mq.addEventListener("change", fazerCarimbo);
    }catch(e){}

    /* ---- as partículas: as mesmas três famílias de antes ---- */
    function aleat(a, b){ return a + Math.random() * (b - a); }
    function nascer(p, noMeio){
      var tipo = Math.random();
      p.r = aleat(1, 2.6);
      p.azul = Math.random() < FRACAO_AZUL;
      p.op = aleat(0.2, 0.7) * (escuro() ? 1 : 1.4);
      p.bal = aleat(14, 50); p.balT = aleat(3.5, 8); p.fase = Math.random() * 6.28;
      if(tipo < 0.55){                    /* sobe do rodapé */
        p.x = aleat(0, L); p.y = A + 20; p.vx = 0; p.vy = -A / aleat(14, 25);
      } else if(tipo < 0.78){             /* entra pela esquerda */
        p.x = -20; p.y = aleat(0.08, 0.9) * A; p.vx = L / aleat(20, 30); p.vy = -aleat(4, 9);
      } else {                            /* entra pela direita */
        p.x = L + 20; p.y = aleat(0.08, 0.9) * A; p.vx = -L / aleat(20, 30); p.vy = -aleat(4, 9);
      }
      if(noMeio){ p.x = aleat(0, L); p.y = aleat(0, A); }
      return p;
    }
    var quantas = L < 640 ? 26 : 44;
    var pts = [];
    for(var i = 0; i < quantas; i++) pts.push(nascer({}, true));

    /* ---- o laço, a 30 quadros por segundo, e medindo o próprio custo ---- */
    var INTERVALO = 1000 / 30;
    var anterior = 0, relogio = 0;
    var amostras = [], leve = false;
    function passo(agora){
      requestAnimationFrame(passo);
      if(!anterior){ anterior = agora; return; }
      var dt = agora - anterior;
      if(dt < INTERVALO - 2) return;
      anterior = agora;
      dt = Math.min(dt, 100) / 1000;       /* aba que voltou do fundo não teleporta ninguém */
      relogio += dt;

      var ini = performance.now();
      ctx.clearRect(0, 0, L, A);
      if(carimbo){
        for(var k = 0; k < pts.length; k++){
          var p = pts[k];
          p.x += p.vx * dt; p.y += p.vy * dt;
          if(p.y < -30 || p.x < -40 || p.x > L + 40) nascer(p, false);
          var bx = Math.sin(relogio * 6.28 / p.balT + p.fase) * p.bal * 0.5;
          var s = p.r * 6;                /* o carimbo tem brilho em volta do ponto */
          ctx.globalAlpha = Math.min(1, p.op);
          ctx.drawImage(p.azul && carimboAzul ? carimboAzul : carimbo, p.x + bx - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }

      /* O MODO LEVE, DECIDIDO PELA PRÓPRIA MÁQUINA.
         Depois de 2 segundos, se os quadros estão chegando muito espaçados
         (menos de ~20 por segundo em vez de 30) ou o próprio desenho está
         caro, a página se poupa: metade das partículas e os véus parados. */
      if(!leve){
        amostras.push({ intervalo: dt * 1000, custo: performance.now() - ini });
        if(amostras.length >= 60){
          var soma = 0, custo = 0;
          amostras.forEach(function(a){ soma += a.intervalo; custo += a.custo; });
          var medio = soma / amostras.length, caro = custo / amostras.length;
          if(medio > 50 || caro > 8){
            leve = true;
            raiz.classList.add("ceu-leve");
            pts.length = Math.max(12, Math.floor(pts.length / 2));
          }
          amostras = [];
        }
      }
    }
    requestAnimationFrame(passo);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
