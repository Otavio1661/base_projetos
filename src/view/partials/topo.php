<style>
  #navegacao {
    display: block;
    position: absolute;
    top: 60px;
    left: 0;
    right: 0;
    gap: 15px;
    background-color: #555;
    z-index: 1000;
    padding: 10px;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s;
  }

  #navegacao.show {
    max-height: 200px;
    /* ajuste conforme necessário */
    opacity: 1;
  }

  #navegacao a {
    color: white;
    text-decoration: none;
    text-align: center;
    padding: 5px 10px;
  }

  #navegacao a:hover {
    text-decoration: underline;
    background-color: #444;
  }
</style>

<header class="py-3 mb-2" style="width: 100%; height: auto; min-height: 60px; background-color: #555; color: white;">
  <div class="container">
    <div class="row align-items-center">
      <h1 class="h2 col mb-0" id="titulo">Meu Framework</h1>
      <div class="col-auto ms-auto gap-3" id="navegacaoToggle">
        <button class="btn btn-link text-white"><i class="fa-solid fa-bars" style="font-size: 20px;" onclick="toggleNavegacao()"></i></button>
      </div>
      <div class="col-auto ms-auto gap-3" id="navegacaoTotal">
        <a class="nav-link" href="<?php echo $navlogin ? '/home#sobre' : '#sobre' ?>">Sobre</a>
        <a class="nav-link" href="<?php echo $navlogin ? '/home#estrutura' : '#estrutura' ?>">Estrutura</a>
        <a class="nav-link" href="<?php echo $navlogin ? '/home#instalar' : '#instalar'; ?>">Instalar</a>
        <a class="nav-link" href="<?php echo $navlogin ? '/home#documentação' : '#documentação'; ?>">Documentação</a>
        <a class="nav-link" href="<?php echo $navlogin ? '/home#exemplos' : '#exemplos'; ?>">Exemplos</a>
      </div>
    </div>
  </div>
</header>

<div class="col-auto ms-auto gap-3" id="navegacao">
  <a class="nav-link" href="<?php echo $navlogin ? '/home#sobre' : '#sobre' ?>">Sobre</a>
  <a class="nav-link" href="<?php echo $navlogin ? '/home#estrutura' : '#estrutura' ?>">Estrutura</a>
  <a class="nav-link" href="<?php echo $navlogin ? '/home#instalar' : '#instalar'; ?>">Instalar</a>
  <a class="nav-link" href="<?php echo $navlogin ? '/home#documentação' : '#documentação'; ?>">Documentação</a>
  <a class="nav-link" href="<?php echo $navlogin ? '/home#exemplos' : '#exemplos'; ?>">Exemplos</a>
</div>

<script>
  // Exibe a navegação completa em telas maiores
  function ajustarNavegacao() {
    const navTotal = document.getElementById('navegacaoTotal');
    const nav = document.getElementById('navegacaoToggle');
    if (window.innerWidth >= 768) { // ponto de corte para telas maiores
      navTotal.style.display = 'flex';
      nav.style.display = 'none';
    } else {
      navTotal.style.display = 'none';
      nav.style.display = 'block';
    }
  }

  function ajustarTitulo() {
    const titulo = document.getElementById('titulo');
    if (window.innerWidth >= 270) { // ponto de corte para telas maiores
      titulo.style.fontSize = '24px';
    } else {
      titulo.style.fontSize = '18px';
    }
  }

  // Ajusta a navegação ao carregar a página e ao redimensionar a janela
  window.addEventListener('load', ajustarNavegacao);
  window.addEventListener('load', ajustarTitulo);
  window.addEventListener('resize', ajustarNavegacao);
  window.addEventListener('resize', ajustarTitulo);
</script>


<script>
  function toggleNavegacao() {
    const nav = document.getElementById('navegacao');
    nav.classList.toggle('show');
  }

  // Fecha navegação ao clicar fora
  document.addEventListener('click', function(event) {
    const nav = document.getElementById('navegacao');
    const btn = document.querySelector('.fa-bars');
    if (!nav.contains(event.target) && !btn.contains(event.target)) {
      nav.classList.remove('show');
    }
  });

  // Fecha navegação ao clicar em um link
  document.querySelectorAll('#navegacao a').forEach(link => {
    link.addEventListener('click', function() {
      document.getElementById('navegacao').classList.remove('show');
    });
  });
</script>