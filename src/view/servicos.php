<?php include 'resources/header.php'; ?>

<style>
  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .servicos-main {
    flex: 1;
    padding: 4rem 0;
  }
  
  .servicos-hero {
    background: linear-gradient(135deg, rgba(26, 35, 126, 0.9) 0%, rgba(106, 27, 154, 0.9) 100%);
    padding: 3rem 0;
    margin-bottom: 3rem;
    border-radius: 15px;
    color: white;
    text-align: center;
  }
  
  .servicos-hero h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .servicos-hero p {
    font-size: 1.2rem;
    opacity: 0.95;
  }
  
  .servico-card {
    background: white;
    border-radius: 15px;
    padding: 2.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    margin-bottom: 2rem;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    border-left: 5px solid #6a1b9a;
  }
  
  .servico-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 40px rgba(106, 27, 154, 0.3);
  }
  
  .servico-header {
    display: flex;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .servico-icon {
    width: 70px;
    height: 70px;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border-radius: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    color: white;
    margin-right: 1.5rem;
    box-shadow: 0 5px 15px rgba(106, 27, 154, 0.3);
  }
  
  .servico-header h3 {
    color: #1a237e;
    font-weight: 700;
    margin: 0;
    font-size: 1.5rem;
  }
  
  .servico-card p {
    color: #555;
    line-height: 1.8;
    font-size: 1.05rem;
    margin-bottom: 1.5rem;
  }
  
  .servico-features {
    list-style: none;
    padding: 0;
    margin-top: 1.5rem;
  }
  
  .servico-features li {
    padding: 0.8rem 0;
    color: #555;
    display: flex;
    align-items: center;
    font-size: 1rem;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .servico-features li:last-child {
    border-bottom: none;
  }
  
  .servico-features li i {
    color: #6a1b9a;
    margin-right: 1rem;
    font-size: 1.2rem;
  }
  
  .destaque-box {
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    color: white;
    padding: 2.5rem;
    border-radius: 15px;
    text-align: center;
    margin-top: 3rem;
    box-shadow: 0 10px 30px rgba(106, 27, 154, 0.4);
  }
  
  .destaque-box h2 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  
  .destaque-box p {
    font-size: 1.1rem;
    margin-bottom: 2rem;
    color: rgba(255, 255, 255, 0.95);
  }
  
  .btn-destaque {
    background: white;
    color: #6a1b9a;
    padding: 1rem 2.5rem;
    border-radius: 50px;
    text-decoration: none;
    font-weight: 600;
    display: inline-block;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
  }
  
  .btn-destaque:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    color: #4a148c;
  }
  
  .diferenciais-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
  }
  
  .diferencial-item {
    text-align: center;
    padding: 2rem;
    background: white;
    border-radius: 15px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease;
  }
  
  .diferencial-item:hover {
    transform: scale(1.05);
  }
  
  .diferencial-item i {
    font-size: 3rem;
    color: #6a1b9a;
    margin-bottom: 1rem;
  }
  
  .diferencial-item h4 {
    color: #1a237e;
    font-weight: 600;
    margin-bottom: 0.8rem;
  }
  
  .diferencial-item p {
    color: #666;
    font-size: 0.95rem;
    line-height: 1.6;
  }
  
  @media (max-width: 768px) {
    .servicos-hero h1 {
      font-size: 2rem;
    }
    
    .servico-header {
      flex-direction: column;
      text-align: center;
    }
    
    .servico-icon {
      margin-right: 0;
      margin-bottom: 1rem;
    }
  }
</style>

<main class="servicos-main">
  <div class="container">
    <div class="servicos-hero">
      <h1><i class="bi bi-gear-wide-connected me-3"></i>Nossos Serviços</h1>
      <p>Soluções tecnológicas personalizadas para o seu negócio</p>
    </div>
    
    <div class="servico-card">
      <div class="servico-header">
        <div class="servico-icon">
          <i class="bi bi-laptop-fill"></i>
        </div>
        <h3>Desenvolvimento de Sistemas Personalizados</h3>
      </div>
      
      <p>
        Criamos <strong>sistemas sob medida</strong> para atender às necessidades específicas do seu negócio. 
        Cada projeto é desenvolvido do zero, com foco total nas suas demandas, processos e objetivos. 
        Não trabalhamos com soluções genéricas - cada sistema é único e pensado especialmente para você.
      </p>
      
      <ul class="servico-features">
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Análise completa das necessidades do seu negócio
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Desenvolvimento personalizado do zero
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Interface intuitiva e fácil de usar
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Adaptação total ao seu fluxo de trabalho
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Suporte e manutenção contínua
        </li>
      </ul>
    </div>
    
    <div class="servico-card">
      <div class="servico-header">
        <div class="servico-icon">
          <i class="bi bi-shield-lock-fill"></i>
        </div>
        <h3>Alta Segurança</h3>
      </div>
      
      <p>
        A segurança dos seus dados é nossa prioridade máxima. Implementamos as melhores práticas 
        e tecnologias mais avançadas para garantir que suas informações estejam sempre protegidas 
        contra ameaças e vulnerabilidades.
      </p>
      
      <ul class="servico-features">
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Criptografia de dados sensíveis
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Autenticação e autorização robustas
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Proteção contra ataques e invasões
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Backups automáticos e recuperação de dados
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Conformidade com LGPD e boas práticas
        </li>
      </ul>
    </div>
    
    <div class="servico-card">
      <div class="servico-header">
        <div class="servico-icon">
          <i class="bi bi-lightning-charge-fill"></i>
        </div>
        <h3>Alta Funcionalidade e Performance</h3>
      </div>
      
      <p>
        Desenvolvemos sistemas otimizados para oferecer <strong>máximo desempenho</strong> e 
        <strong>funcionalidades avançadas</strong>. Cada recurso é cuidadosamente implementado 
        para agregar valor real ao seu negócio.
      </p>
      
      <ul class="servico-features">
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Código otimizado para alta performance
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Funcionalidades desenvolvidas sob medida
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Integração com outras plataformas e APIs
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Relatórios e dashboards personalizados
        </li>
        <li>
          <i class="bi bi-check-circle-fill"></i>
          Escalabilidade para crescimento futuro
        </li>
      </ul>
    </div>
    
    <h2 class="text-center mt-5 mb-4" style="color: #1a237e; font-weight: 700;">
      <i class="bi bi-star-fill me-2" style="color: #6a1b9a;"></i>
      Nossos Diferenciais
    </h2>
    
    <div class="diferenciais-grid">
      <div class="diferencial-item">
        <i class="bi bi-person-heart"></i>
        <h4>Atendimento Personalizado</h4>
        <p>Acompanhamento próximo em todas as etapas do projeto</p>
      </div>
      
      <div class="diferencial-item">
        <i class="bi bi-graph-up-arrow"></i>
        <h4>Escalabilidade</h4>
        <p>Sistemas preparados para crescer junto com seu negócio</p>
      </div>
      
      <div class="diferencial-item">
        <i class="bi bi-award-fill"></i>
        <h4>Qualidade Garantida</h4>
        <p>Código limpo, testado e seguindo as melhores práticas</p>
      </div>
      
      <div class="diferencial-item">
        <i class="bi bi-headset"></i>
        <h4>Suporte Contínuo</h4>
        <p>Sempre disponível para dúvidas e melhorias</p>
      </div>
    </div>
    
    <div class="destaque-box">
      <h2><i class="bi bi-chat-dots-fill me-2"></i>Pronto para começar seu projeto?</h2>
      <p>Entre em contato e vamos transformar suas ideias em realidade!</p>
      <a href="/contato" class="btn-destaque">
        <i class="bi bi-envelope-fill me-2"></i>
        Fale Conosco
      </a>
    </div>
  </div>
</main>

<?php include 'resources/footer.php'; ?>
