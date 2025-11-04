<?php

namespace src\resources;

class alert {
    
    /**
     * Alerta de sucesso pequeno (canto superior direito)
     * @param string $message Mensagem a ser exibida
     * @param string $title Título do alerta (opcional)
     * @param int $duration Duração em milissegundos (padrão: 5000)
     * @return string
     */
    public static function successToast($message = "Operação realizada com sucesso!", $title = "Sucesso!", $duration = 5000) {
        $html = "
        <div class='alert-toast success' id='alert-toast-" . uniqid() . "'>
            <div class='alert-icon'>✓</div>
            <div class='alert-content'>
                <div class='alert-title'>{$title}</div>
                <div class='alert-message'>{$message}</div>
            </div>
            <button class='alert-close' onclick='this.parentElement.remove()'>×</button>
        </div>
        <script>
            setTimeout(function() {
                const toast = document.querySelector('.alert-toast.success');
                if(toast) {
                    toast.style.animation = 'slideOutRight 0.4s ease-out';
                    setTimeout(() => toast.remove(), 400);
                }
            }, {$duration});
        </script>
        ";
        
        return $html;
    }
    
    /**
     * Alerta de erro pequeno (canto superior direito)
     * @param string $message Mensagem a ser exibida
     * @param string $title Título do alerta (opcional)
     * @param int $duration Duração em milissegundos (padrão: 5000)
     * @return string
     */
    public static function errorToast($message = "Ocorreu um erro na operação!", $title = "Erro!", $duration = 5000) {
        $html = "
        <div class='alert-toast error' id='alert-toast-" . uniqid() . "'>
            <div class='alert-icon'>✕</div>
            <div class='alert-content'>
                <div class='alert-title'>{$title}</div>
                <div class='alert-message'>{$message}</div>
            </div>
            <button class='alert-close' onclick='this.parentElement.remove()'>×</button>
        </div>
        <script>
            setTimeout(function() {
                const toast = document.querySelector('.alert-toast.error');
                if(toast) {
                    toast.style.animation = 'slideOutRight 0.4s ease-out';
                    setTimeout(() => toast.remove(), 400);
                }
            }, {$duration});
        </script>
        ";
        
        return $html;
    }
    
    /**
     * Alerta de sucesso grande (modal centralizado)
     * @param string $message Mensagem a ser exibida
     * @param string $title Título do alerta (opcional)
     * @param string $btnText Texto do botão (opcional)
     * @return string
     */
    public static function successModal($message = "Sua operação foi concluída com sucesso!", $title = "Sucesso!", $btnText = "Entendi", $duration = ['#',false]) {
        $html = "
        <div class='alert-modal' id='alert-modal-" . uniqid() . "' onclick='if(event.target === this) this.remove()'>
            <div class='alert-modal-content success'>
                <div class='alert-modal-icon'>✓</div>
                <h2 class='alert-modal-title'>{$title}</h2>
                <p class='alert-modal-message'>{$message}</p>
                <div class='alert-modal-actions'>
                    <button class='btn-primary' onclick='this.closest(\".alert-modal\").remove()'>{$btnText}</button>
                </div>
            </div>
        </div>
        ";
        if ($duration[1] == true) {
            $durationValue = $duration[0];
            $html .= "
        <script>
            setTimeout(function() {
                const toast = document.querySelector('.alert-modal.errorModal');
                if(toast) {
                    toast.style.animation = 'fadeOut 0.4s ease-out';
                    setTimeout(() => toast.remove(), 400);
                }
            }, {$durationValue});
        </script>
        ";}
        
        return $html;
    }
    
    /**
     * Alerta de erro grande (modal centralizado)
     * @param string $message Mensagem a ser exibida
     * @param string $title Título do alerta (opcional)
     * @param string $btnText Texto do botão (opcional)
     * @return string
     */
    public static function errorModal($message = "Ocorreu um erro ao processar sua solicitação!", $title = "Erro!", $btnText = "Tentar novamente", $acao = ['#',false], $duration = ['#',false]) {
        $html = "
        <div class='alert-modal errorModal' id='alert-modal-" . uniqid() . "' onclick='if(event.target === this) this.remove()'>
            <div class='alert-modal-content error'>
                <div class='alert-modal-icon'>✕</div>
                <h2 class='alert-modal-title'>{$title}</h2>
                <p class='alert-modal-message'>{$message}</p>
                <div class='alert-modal-actions'>
                    <button class='btn-secondary' onclick='this.closest(\".alert-modal\").remove()'>Cancelar</button>";
                    if ($acao[1] == true) {
                        $html .= " <button class='btn-primary' onclick='{$acao[0]}'>{$btnText}</button>";
                    } else {
                        $html .= " <button class='btn-primary' onclick='this.closest(\".alert-modal\").remove()'>{$btnText}</button> ";
                    } $html .= "
                </div>
            </div>
        </div>";
        if ($duration[1] == true) {
            $durationValue = $duration[0];
            $html .= "
        <script>
            setTimeout(function() {
                const toast = document.querySelector('.alert-modal.errorModal');
                if(toast) {
                    toast.style.animation = 'fadeOut 0.4s ease-out';
                    setTimeout(() => toast.remove(), 400);
                }
            }, {$durationValue});
        </script>
        ";}
        
        return $html;
    }
    
    /**
     * Método legado mantido para compatibilidade
     */
    public function success() {
        return self::successToast();
    }

}