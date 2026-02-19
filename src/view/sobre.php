<?php include 'resources/header.php'; ?>

<style>
  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .sobre-main {
    flex: 1;
    padding: 4rem 0;
  }
  
  .sobre-hero {
    background: linear-gradient(135deg, rgba(26, 35, 126, 0.9) 0%, rgba(106, 27, 154, 0.9) 100%);
    padding: 3rem 0;
    margin-bottom: 3rem;
    border-radius: 15px;
    color: white;
    text-align: center;
  }
  
  .sobre-hero h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .sobre-hero p {
    font-size: 1.2rem;
    opacity: 0.95;
  }
  
  .sobre-card {
    background: white;
    border-radius: 15px;
    padding: 2.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    margin-bottom: 2rem;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  
  .sobre-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 40px rgba(106, 27, 154, 0.3);
  }
  
  .sobre-card h3 {
    color: #1a237e;
    font-weight: 600;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    font-size: 1.5rem;
  }
  
  .sobre-card h3 i {
    margin-right: 1rem;
    color: #6a1b9a;
    font-size: 2rem;
  }
  
  .sobre-card p {
    color: #555;
    line-height: 1.8;
    font-size: 1.05rem;
  }
  
  .skills-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-top: 2rem;
  }
  
  .skill-item {
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    padding: 1.5rem;
    border-radius: 10px;
    text-align: center;
    color: white;
    transition: transform 0.3s ease;
  }
  
  .skill-item:hover {
    transform: scale(1.05);
  }
  
  .skill-item i {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .skill-item h4 {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  
  .skill-item p {
    font-size: 0.9rem;
    opacity: 0.9;
    color: white;
  }
  
  .profile-section {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }
  
  .profile-icon {
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    color: white;
    box-shadow: 0 10px 25px rgba(106, 27, 154, 0.4);
    flex-shrink: 0;
  }
  
  .profile-text h2 {
    color: #1a237e;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }
  
  .profile-text .subtitle {
    color: #6a1b9a;
    font-size: 1.2rem;
    font-weight: 500;
  }
  
  @media (max-width: 768px) {
    .sobre-hero h1 {
      font-size: 2rem;
    }
    
    .profile-section {
      flex-direction: column;
      text-align: center;
    }
    
    .skills-container {
      grid-template-columns: 1fr;
    }
  }
</style>

<main class="sobre-main">
  <div class="container">
    <div class="sobre-hero">
      <h1><i class="bi bi-person-badge-fill me-3"></i>Sobre Mim</h1>
      <p>Desenvolvedor Full Stack | Criando soluções tecnológicas inovadoras</p>
    </div>
    
    <div class="sobre-card">
      <div class="profile-section">
        <div class="profile-icon">
          <i class="bi bi-code-slash"></i>
        </div>
        <div class="profile-text">
          <h2>Otávio Silva</h2>
          <p class="subtitle">Desenvolvedor Full Stack</p>
        </div>
      </div>
      
      <p>
        Sou um desenvolvedor Full Stack apaixonado por tecnologia e inovação. 
        Trabalho como desenvolvedor na <strong>GazinTech</strong>, onde contribuo para projetos 
        de alta qualidade e impacto. Minha especialidade é criar <strong>sistemas personalizados</strong> 
        que atendem às necessidades específicas de cada cliente.
      </p>
      <p>
        Com experiência em desenvolvimento web completo, desde o front-end até o back-end, 
        busco sempre entregar soluções robustas, seguras e escaláveis. Meu foco está em 
        compreender profundamente os desafios dos clientes e transformá-los em soluções 
        tecnológicas eficientes e elegantes.
      </p>
    </div>
    
    <div class="sobre-card">
      <h3>
        <i class="bi bi-briefcase-fill"></i>
        Experiência Profissional
      </h3>
      <p>
        <strong>GazinTech</strong> - Desenvolvedor Full Stack<br>
        Desenvolvo e mantenho sistemas complexos, trabalhando com as melhores práticas 
        de desenvolvimento e metodologias ágeis. Minha atuação abrange desde a concepção 
        até a implementação e manutenção de projetos.
      </p>
    </div>
    
    <div class="sobre-card">
      <h3>
        <i class="bi bi-tools"></i>
        Habilidades Técnicas
      </h3>
      
      <div class="skills-container">
        <div class="skill-item">
          <i class="bi bi-code-square"></i>
          <h4>Front-End</h4>
          <p>HTML, CSS, JavaScript, Bootstrap, React</p>
        </div>
        
        <div class="skill-item">
          <i class="bi bi-server"></i>
          <h4>Back-End</h4>
          <p>PHP, Node.js, APIs RESTful</p>
        </div>
        
        <div class="skill-item">
          <i class="bi bi-database-fill"></i>
          <h4>Banco de Dados</h4>
          <p>MySQL, PostgreSQL, MongoDB</p>
        </div>
        
        <div class="skill-item">
          <i class="bi bi-gear-fill"></i>
          <h4>DevOps</h4>
          <p>Docker, Git, CI/CD</p>
        </div>
      </div>
    </div>
    
    <div class="sobre-card">
      <h3>
        <i class="bi bi-rocket-takeoff-fill"></i>
        Minha Missão
      </h3>
      <p>
        Meu objetivo é criar <strong>sistemas personalizados</strong> que realmente fazem a diferença 
        para meus clientes. Acredito que cada projeto é único e merece uma abordagem personalizada, 
        sempre priorizando:
      </p>
      <ul style="color: #555; line-height: 2; font-size: 1.05rem; margin-top: 1rem;">
        <li><strong>Segurança:</strong> Proteção de dados e implementação de melhores práticas</li>
        <li><strong>Funcionalidade:</strong> Sistemas eficientes que atendem às necessidades reais</li>
        <li><strong>Usabilidade:</strong> Interfaces intuitivas e experiência do usuário de qualidade</li>
        <li><strong>Escalabilidade:</strong> Soluções preparadas para crescer com seu negócio</li>
      </ul>
    </div>
  </div>
</main>

<?php include 'resources/footer.php'; ?>
