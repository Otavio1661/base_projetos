<?php include 'resources/header.php'; ?>

<style>
  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .contato-main {
    flex: 1;
    padding: 4rem 0;
  }
  
  .contato-hero {
    background: linear-gradient(135deg, rgba(26, 35, 126, 0.9) 0%, rgba(106, 27, 154, 0.9) 100%);
    padding: 3rem 0;
    margin-bottom: 3rem;
    border-radius: 15px;
    color: white;
    text-align: center;
  }
  
  .contato-hero h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .contato-hero p {
    font-size: 1.2rem;
    opacity: 0.95;
  }
  
  .contato-grid {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
  }
  
  .contato-info {
    background: white;
    border-radius: 15px;
    padding: 2.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    max-width: 800px;
    width: 100%;
  }
  
  .contato-info h3 {
    color: #1a237e;
    font-weight: 700;
    margin-bottom: 2rem;
    font-size: 1.5rem;
  }
  
  .info-item {
    display: flex;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #f8f9fa;
    border-radius: 10px;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  
  .info-item:hover {
    transform: translateX(5px);
    box-shadow: 0 5px 15px rgba(106, 27, 154, 0.2);
  }
  
  .info-icon {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    color: white;
    margin-right: 1.5rem;
    flex-shrink: 0;
    box-shadow: 0 5px 15px rgba(106, 27, 154, 0.3);
  }
  
  .info-content h4 {
    color: #1a237e;
    font-weight: 600;
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }
  
  .info-content p {
    color: #555;
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
  }
  
  .info-content a {
    color: #6a1b9a;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.3s ease;
  }
  
  .info-content a:hover {
    color: #4a148c;
    text-decoration: underline;
  }
  
  .contato-form {
    background: white;
    border-radius: 15px;
    padding: 2.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  }
  
  .contato-form h3 {
    color: #1a237e;
    font-weight: 700;
    margin-bottom: 2rem;
    font-size: 1.5rem;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .form-label {
    color: #1a237e;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: block;
    font-size: 0.95rem;
  }
  
  .form-control {
    width: 100%;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    padding: 0.85rem 1rem;
    font-size: 1rem;
    transition: all 0.3s ease;
    font-family: 'Poppins', sans-serif;
  }
  
  .form-control:focus {
    border-color: #6a1b9a;
    box-shadow: 0 0 0 0.2rem rgba(106, 27, 154, 0.15);
    outline: none;
  }
  
  textarea.form-control {
    resize: vertical;
    min-height: 150px;
  }
  
  .btn-enviar {
    width: 100%;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 1rem;
    border-radius: 10px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(106, 27, 154, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .btn-enviar:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(106, 27, 154, 0.4);
    background: linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%);
  }
  
  .btn-enviar:active {
    transform: translateY(0);
  }
  
  .social-links-contato {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    justify-content: center;
  }
  
  .social-link-contato {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #1a237e 0%, #6a1b9a 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    text-decoration: none;
    font-size: 1.5rem;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(106, 27, 154, 0.3);
  }
  
  .social-link-contato:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 20px rgba(106, 27, 154, 0.4);
    color: white;
  }
  
  @media (max-width: 992px) {
    .contato-grid {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    
    .contato-hero h1 {
      font-size: 2rem;
    }
  }
  
  @media (max-width: 576px) {
    .info-item {
      flex-direction: column;
      text-align: center;
    }
    
    .info-icon {
      margin-right: 0;
      margin-bottom: 1rem;
    }
  }
</style>

<main class="contato-main">
  <div class="container">
    <div class="contato-hero">
      <h1><i class="bi bi-envelope-at-fill me-3"></i>Entre em Contato</h1>
      <p>Vamos conversar sobre seu projeto!</p>
    </div>
    
    <div class="contato-grid">
      <div class="contato-info">
        <h3><i class="bi bi-info-circle-fill me-2" style="color: #6a1b9a;"></i>Informações de Contato</h3>
        
        <div class="info-item">
          <div class="info-icon">
            <i class="bi bi-whatsapp"></i>
          </div>
          <div class="info-content">
            <h4>WhatsApp</h4>
            <p>
              <a href="https://wa.me/5544997341687" target="_blank">
                +55 (44) 99734-1687
              </a>
            </p>
            <small style="color: #888;">Clique para conversar pelo WhatsApp</small>
          </div>
        </div>
        
        <div class="info-item">
          <div class="info-icon">
            <i class="bi bi-envelope-fill"></i>
          </div>
          <div class="info-content">
            <h4>E-mail</h4>
            <p>
              <a href="mailto:otavio.silva1661@gmail.com">
                otavio.silva1661@gmail.com
              </a>
            </p>
          </div>
        </div>
        
        <div class="info-item">
          <div class="info-icon">
            <i class="bi bi-briefcase-fill"></i>
          </div>
          <div class="info-content">
            <h4>Empresa</h4>
            <p>Desenvolvedor na GazinTech</p>
            <p>Especialista em Sistemas Personalizados</p>
          </div>
        </div>
        
        <div class="text-center mt-4">
          <p style="color: #1a237e; font-weight: 600; margin-bottom: 1rem;">Siga nas redes sociais:</p>
          <div class="social-links-contato">
            <a href="#" class="social-link-contato" title="LinkedIn">
              <i class="bi bi-linkedin"></i>
            </a>
            <a href="#" class="social-link-contato" title="GitHub">
              <i class="bi bi-github"></i>
            </a>
            <a href="#" class="social-link-contato" title="Instagram">
              <i class="bi bi-instagram"></i>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>


<?php include 'resources/footer.php'; ?>
