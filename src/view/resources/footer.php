<footer class="footer-custom mt-5">
  <div class="container">
    <div class="row py-5">
      <div class="col-md-4 mb-4 mb-md-0">
        <h5 class="footer-title">
          <i class="bi bi-hexagon-fill me-2"></i>
          Dev.Otavio_Silva        </h5>
        <p class="footer-text">
          Solução completa para gerenciamento e controle. Tecnologia, inovação e segurança em um só lugar.
        </p>
        <div class="social-links">
          <a href="https://www.instagram.com/otavio.s.f?igsh=dGhrbnB0M2N0ZnU1" class="social-icon"><i class="bi bi-instagram"></i></a>
          <a href="https://www.linkedin.com/in/otavio-silva-desenvolvedor?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" class="social-icon"><i class="bi bi-linkedin"></i></a>
          <a href="https://github.com/Otavio1661" class="social-icon" target="_blank" rel="noopener noreferrer"><i class="bi bi-github"></i></a>
        </div>
      </div>
      
      <div class="col-md-4 mb-4 mb-md-0">
        <h5 class="footer-title">Links Rápidos</h5>
        <ul class="footer-links">
          <li><a href="/"><i class="bi bi-chevron-right"></i> Início</a></li>
          <li><a href="/sobre"><i class="bi bi-chevron-right"></i> Sobre </a></li>
          <li><a href="/servicos"><i class="bi bi-chevron-right"></i> Serviços</a></li>
          <li><a href="/contato"><i class="bi bi-chevron-right"></i> Contato</a></li>
        </ul>
      </div>
      
      <div class="col-md-4">
        <h5 class="footer-title">Contato</h5>
        <ul class="footer-contact">
          <li>
            <i class="bi bi-telephone-fill"></i>
            <span>(44) 99734-1687</span>
          </li>
          <li>
            <i class="bi bi-envelope-fill"></i>
            <span>otavio.silva1661@gmail.com</span>
          </li>
        </ul>
      </div>
    </div>
    
    <div class="footer-bottom">
      <div class="row">
        <div class="col-12 text-center">
          <p class="mb-0">
            &copy; <?php echo date('Y'); ?> MeuSistema. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  </div>
</footer>

<style>
  .footer-custom {
    background: linear-gradient(135deg, #1a237e 0%, #4a148c 50%, #6a1b9a 100%);
    color: white;
    margin-top: auto;
  }
  
  .footer-title {
    color: white;
    font-weight: 600;
    margin-bottom: 1.5rem;
    font-size: 1.2rem;
  }
  
  .footer-text {
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
  }
  
  .social-links {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  
  .social-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: white;
    text-decoration: none;
    transition: all 0.3s ease;
    font-size: 1.2rem;
  }
  
  .social-icon:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-3px);
    color: white;
  }
  
  .footer-links {
    list-style: none;
    padding: 0;
  }
  
  .footer-links li {
    margin-bottom: 0.8rem;
  }
  
  .footer-links a {
    color: rgba(255, 255, 255, 0.8);
    text-decoration: none;
    transition: all 0.3s ease;
    display: inline-flex;
    align-items: center;
  }
  
  .footer-links a:hover {
    color: white;
    padding-left: 5px;
  }
  
  .footer-links i {
    margin-right: 0.5rem;
    font-size: 0.8rem;
  }
  
  .footer-contact {
    list-style: none;
    padding: 0;
  }
  
  .footer-contact li {
    display: flex;
    align-items: flex-start;
    margin-bottom: 1rem;
    color: rgba(255, 255, 255, 0.8);
  }
  
  .footer-contact i {
    margin-right: 0.8rem;
    margin-top: 0.2rem;
    color: white;
  }
  
  .footer-bottom {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 1.5rem 0;
    margin-top: 2rem;
  }
  
  .footer-bottom p {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
  }
</style>

<!-- Bootstrap 5 JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

<!-- SweetAlert2 JS -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.all.min.js"></script>

</body>
</html>